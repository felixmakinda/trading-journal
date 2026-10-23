import { round2 } from "./forex";
import type { Rules } from "./rules";
import { DEFAULT_TIMEZONE, localParts } from "./time";
import { isClosed, type Trade } from "./types";

export type LimitStatus = "ok" | "warning" | "breached";

export interface LimitUsage {
  /** Loss counted against the limit, as a positive number. */
  used: number;
  limit: number;
  percentUsed: number;
  status: LimitStatus;
}

export interface PropFirmStatus {
  balance: number;
  daily: LimitUsage;
  overall: LimitUsage;
  target: { amount: number; progress: number; reached: boolean };
}

function usage(used: number, limit: number, warnAt: number): LimitUsage {
  const percentUsed = limit > 0 ? round2((Math.max(0, used) / limit) * 100) : 0;
  return {
    used: round2(Math.max(0, used)),
    limit: round2(limit),
    percentUsed,
    status: percentUsed >= 100 ? "breached" : percentUsed >= warnAt ? "warning" : "ok",
  };
}

/**
 * Evaluates prop-firm style limits on closed P&L. The daily limit is a
 * percentage of the day's starting balance; the max loss is a percentage of
 * the initial account size. Floating P&L on open trades is not included.
 */
export function evaluatePropFirm(
  all: Trade[],
  rules: Rules["propFirm"],
  now: Date = new Date(),
  timeZone = DEFAULT_TIMEZONE,
): PropFirmStatus {
  const today = localParts(now.toISOString(), timeZone).day;
  const closed = all.filter(isClosed);
  let beforeToday = 0;
  let todayPnl = 0;
  for (const t of closed) {
    if (localParts(t.closeTime, timeZone).day === today) todayPnl += t.netPnl;
    else if (localParts(t.closeTime, timeZone).day < today) beforeToday += t.netPnl;
  }
  const dayStart = rules.accountSize + beforeToday;
  const balance = dayStart + todayPnl;
  const target = (rules.accountSize * rules.profitTargetPercent) / 100;
  const profit = balance - rules.accountSize;

  return {
    balance: round2(balance),
    daily: usage(-todayPnl, (dayStart * rules.dailyLossPercent) / 100, rules.warnAtPercent),
    overall: usage(-profit, (rules.accountSize * rules.maxLossPercent) / 100, rules.warnAtPercent),
    target: {
      amount: round2(target),
      progress: target > 0 ? round2(Math.max(0, (profit / target) * 100)) : 0,
      reached: target > 0 && profit >= target,
    },
  };
}
