import { outcome } from "./stats";
import type { Rules } from "./rules";
import { DEFAULT_TIMEZONE, localParts } from "./time";
import { isClosed, type Trade } from "./types";

export type FlagKind = "revenge" | "tilt" | "overtrading" | "no_stop";

export interface Flag {
  kind: FlagKind;
  message: string;
}

export const FLAG_LABELS: Record<FlagKind, string> = {
  revenge: "Revenge trade",
  tilt: "Tilt",
  overtrading: "Overtrading",
  no_stop: "No stop loss",
};

const minutesBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;

/**
 * Flags behaviour patterns per trade, keyed by trade id.
 * Looks only at what happened before each trade was opened, so flags never
 * depend on the trade's own result.
 */
export function detectFlags(
  all: Trade[],
  rules: Rules,
  timeZone = DEFAULT_TIMEZONE,
): Map<string, Flag[]> {
  const trades = [...all].sort((a, b) => a.openTime.localeCompare(b.openTime));
  const closed = trades.filter(isClosed).sort((a, b) => a.closeTime.localeCompare(b.closeTime));
  const flags = new Map<string, Flag[]>();
  const add = (id: string, flag: Flag) => flags.set(id, [...(flags.get(id) ?? []), flag]);
  const perDay = new Map<string, number>();

  for (const trade of trades) {
    const before = closed.filter((c) => c.id !== trade.id && c.closeTime <= trade.openTime);
    const last = before[before.length - 1];

    if (last && outcome(last.netPnl) === "loss") {
      const gap = minutesBetween(last.closeTime, trade.openTime);
      if (gap <= rules.revengeWindowMinutes && trade.volume >= last.volume * rules.revengeSizeMultiplier) {
        add(trade.id, {
          kind: "revenge",
          message: `Opened ${Math.round(gap)} min after a loss with ${(trade.volume / last.volume).toFixed(1)}x the size`,
        });
      }

      let streak = 0;
      for (let i = before.length - 1; i >= 0 && outcome(before[i]!.netPnl) === "loss"; i--) streak++;
      if (streak >= rules.tiltLossStreak && gap <= rules.tiltWindowMinutes) {
        add(trade.id, {
          kind: "tilt",
          message: `Opened ${Math.round(gap)} min after ${streak} losses in a row`,
        });
      }
    }

    const { day } = localParts(trade.openTime, timeZone);
    const count = (perDay.get(day) ?? 0) + 1;
    perDay.set(day, count);
    if (count > rules.maxTradesPerDay) {
      add(trade.id, {
        kind: "overtrading",
        message: `Trade ${count} of the day; your limit is ${rules.maxTradesPerDay}`,
      });
    }

    if (rules.requireStopLoss && trade.stopLoss === null) {
      add(trade.id, { kind: "no_stop", message: "No stop loss recorded" });
    }
  }
  return flags;
}
