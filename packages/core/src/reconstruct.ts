import { round2 } from "./forex";
import type { Deal, Trade } from "./types";

export interface ReconstructedTrade extends Omit<Trade, "id" | "stopLoss" | "takeProfit"> {
  positionId: string;
  dealIds: string[];
}

function vwap(parts: { price: number; volume: number }[]): number {
  const volume = parts.reduce((sum, p) => sum + p.volume, 0);
  if (volume === 0) return 0;
  return parts.reduce((sum, p) => sum + p.price * p.volume, 0) / volume;
}

/**
 * Groups executions by position and rebuilds one trade per position.
 * Handles scaling in (several opening deals) and partial closes.
 * Pass every known deal of a position, not only new ones, or totals will be partial.
 */
export function reconstructTrades(deals: Deal[]): ReconstructedTrade[] {
  const byPosition = new Map<string, Deal[]>();
  for (const deal of deals) {
    const list = byPosition.get(deal.positionId) ?? [];
    list.push(deal);
    byPosition.set(deal.positionId, list);
  }

  const trades: ReconstructedTrade[] = [];
  for (const [positionId, list] of byPosition) {
    const unique = [...new Map(list.map((d) => [d.dealId, d])).values()].sort(
      (a, b) => a.time.localeCompare(b.time),
    );
    const opening = unique.filter((d) => !d.close);
    const closing = unique.filter((d) => d.close);
    const first = opening[0] ?? unique[0];
    if (!first) continue;

    // A position whose opening deal predates our history window still has
    // the entry price on its closing deals.
    const side = opening[0]?.side ?? (first.side === "buy" ? "sell" : "buy");
    const openVolume = opening.length
      ? opening.reduce((s, d) => s + d.volume, 0)
      : closing.reduce((s, d) => s + (d.close?.closedVolume ?? d.volume), 0);
    const entryPrice = opening.length
      ? vwap(opening)
      : vwap(closing.map((d) => ({ price: d.close!.entryPrice, volume: d.close!.closedVolume })));

    const closedVolume = closing.reduce((s, d) => s + d.close!.closedVolume, 0);
    const isClosed = closing.length > 0 && closedVolume >= openVolume;
    const exitPrice = closing.length
      ? vwap(closing.map((d) => ({ price: d.price, volume: d.close!.closedVolume })))
      : null;

    const grossPnl = closing.reduce((s, d) => s + d.close!.grossProfit, 0);
    const swap = closing.reduce((s, d) => s + d.close!.swap, 0);
    const commission = unique.reduce((s, d) => s + -Math.abs(d.commission), 0);

    trades.push({
      positionId,
      dealIds: unique.map((d) => d.dealId),
      symbol: first.symbol,
      side,
      status: isClosed ? "closed" : "open",
      volume: openVolume,
      openTime: (opening[0] ?? first).time,
      closeTime: isClosed ? closing[closing.length - 1]!.time : null,
      entryPrice,
      exitPrice,
      grossPnl: round2(grossPnl),
      commission: round2(commission),
      swap: round2(swap),
      netPnl: round2(grossPnl + swap + commission),
    });
  }
  return trades.sort((a, b) => a.openTime.localeCompare(b.openTime));
}
