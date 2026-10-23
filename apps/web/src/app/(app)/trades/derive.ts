import { lotsToUnits, pipSize, pipsMoved, round2, rMultiple, type TradeInput } from "@tj/core";

/** Broker columns derived from user-entered values. P&L is used as given when supplied. */
export function brokerColumns(input: TradeInput) {
  const volume = lotsToUnits(input.lots);
  const pip = pipSize(input.symbol);
  const closed = input.closeTime !== null && input.exitPrice !== null;
  const commission = input.commission === null ? 0 : -Math.abs(input.commission);
  const swap = input.swap ?? 0;
  // Without a P&L figure we can only estimate for USD-quoted pairs; ask for the broker's number otherwise.
  const estimatedGross =
    closed && input.symbol.endsWith("USD") ? (input.exitPrice! - input.entryPrice) * (input.side === "buy" ? 1 : -1) * volume : 0;
  const net = input.netPnl ?? round2(estimatedGross + commission + swap);
  return {
    symbol: input.symbol,
    side: input.side,
    status: closed ? ("closed" as const) : ("open" as const),
    volume,
    lots: input.lots,
    open_time: input.openTime,
    close_time: input.closeTime,
    entry_price: input.entryPrice,
    exit_price: input.exitPrice,
    gross_pnl: round2(net - commission - swap),
    commission,
    swap,
    net_pnl: net,
    pip_size: pip,
    pips: closed ? pipsMoved(input.side, input.entryPrice, input.exitPrice!, pip) : null,
    stop_loss: input.stopLoss,
    take_profit: input.takeProfit,
    r_multiple: closed ? rMultiple(input.side, input.entryPrice, input.exitPrice!, input.stopLoss) : null,
  };
}
