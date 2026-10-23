import { round2, rMultiple } from "./forex";
import { DEFAULT_TIMEZONE, holdingMinutes, localParts } from "./time";
import { isClosed, type ClosedTrade, type Trade } from "./types";

/** Trades within this many account-currency units of zero count as breakeven. */
export const BREAKEVEN_EPSILON = 0.5;

export interface Stats {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  payoffRatio: number | null;
  expectancy: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  commission: number;
  swap: number;
  avgR: number | null;
  avgHoldMinutes: number | null;
  maxWinStreak: number;
  maxLossStreak: number;
  maxDrawdown: number;
}

export function outcome(netPnl: number): "win" | "loss" | "breakeven" {
  if (Math.abs(netPnl) < BREAKEVEN_EPSILON) return "breakeven";
  return netPnl > 0 ? "win" : "loss";
}

function byCloseTime(a: ClosedTrade, b: ClosedTrade) {
  return a.closeTime.localeCompare(b.closeTime);
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

export function computeStats(all: Trade[]): Stats {
  const trades = all.filter(isClosed).sort(byCloseTime);
  const wins = trades.filter((t) => outcome(t.netPnl) === "win");
  const losses = trades.filter((t) => outcome(t.netPnl) === "loss");
  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const netPnl = trades.reduce((s, t) => s + t.netPnl, 0);
  const decided = wins.length + losses.length;
  const avgWin = mean(wins.map((t) => t.netPnl));
  const avgLoss = mean(losses.map((t) => t.netPnl));

  let winStreak = 0;
  let lossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const t of trades) {
    const o = outcome(t.netPnl);
    winStreak = o === "win" ? winStreak + 1 : 0;
    lossStreak = o === "loss" ? lossStreak + 1 : 0;
    maxWinStreak = Math.max(maxWinStreak, winStreak);
    maxLossStreak = Math.max(maxLossStreak, lossStreak);
    equity += t.netPnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }

  const rs = trades
    .map((t) => rMultiple(t.side, t.entryPrice, t.exitPrice, t.stopLoss))
    .filter((r): r is number => r !== null);
  const holds = trades.map((t) => holdingMinutes(t.openTime, t.closeTime));
  const n = (v: number | null) => (v === null ? null : round2(v));

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: trades.length - decided,
    winRate: decided ? round2((wins.length / decided) * 100) : null,
    netPnl: round2(netPnl),
    grossProfit: round2(grossProfit),
    grossLoss: round2(grossLoss),
    profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : null,
    avgWin: n(avgWin),
    avgLoss: n(avgLoss),
    payoffRatio: avgWin !== null && avgLoss ? round2(avgWin / Math.abs(avgLoss)) : null,
    expectancy: trades.length ? round2(netPnl / trades.length) : null,
    largestWin: wins.length ? round2(Math.max(...wins.map((t) => t.netPnl))) : null,
    largestLoss: losses.length ? round2(Math.min(...losses.map((t) => t.netPnl))) : null,
    commission: round2(trades.reduce((s, t) => s + t.commission, 0)),
    swap: round2(trades.reduce((s, t) => s + t.swap, 0)),
    avgR: n(mean(rs)),
    avgHoldMinutes: holds.length ? Math.round(mean(holds)!) : null,
    maxWinStreak,
    maxLossStreak,
    maxDrawdown: round2(maxDrawdown),
  };
}

export interface EquityPoint {
  time: string;
  equity: number;
  drawdown: number;
}

export function equityCurve(all: Trade[], startingBalance = 0): EquityPoint[] {
  let equity = startingBalance;
  let peak = startingBalance;
  return all
    .filter(isClosed)
    .sort(byCloseTime)
    .map((t) => {
      equity += t.netPnl;
      peak = Math.max(peak, equity);
      return { time: t.closeTime, equity: round2(equity), drawdown: round2(equity - peak) };
    });
}

export interface DayResult {
  day: string;
  netPnl: number;
  trades: number;
  wins: number;
}

/** Net P&L per local calendar day, keyed by close time. */
export function dailyResults(all: Trade[], timeZone = DEFAULT_TIMEZONE): Map<string, DayResult> {
  const days = new Map<string, DayResult>();
  for (const t of all.filter(isClosed)) {
    const { day } = localParts(t.closeTime, timeZone);
    const d = days.get(day) ?? { day, netPnl: 0, trades: 0, wins: 0 };
    d.netPnl = round2(d.netPnl + t.netPnl);
    d.trades += 1;
    if (outcome(t.netPnl) === "win") d.wins += 1;
    days.set(day, d);
  }
  return days;
}

export interface GroupResult {
  key: string;
  stats: Stats;
}

/** Stats per group, e.g. by symbol, session or setup. A trade may belong to several groups. */
export function groupStats<T extends Trade>(
  all: T[],
  keyOf: (t: T & ClosedTrade) => string | string[] | null | undefined,
): GroupResult[] {
  const groups = new Map<string, Trade[]>();
  for (const t of all.filter((x): x is T & ClosedTrade => isClosed(x))) {
    const raw = keyOf(t);
    const keys = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const key of keys) {
      const list = groups.get(key) ?? [];
      list.push(t);
      groups.set(key, list);
    }
  }
  return [...groups]
    .map(([key, trades]) => ({ key, stats: computeStats(trades) }))
    .sort((a, b) => b.stats.netPnl - a.stats.netPnl);
}
