import { estimateGrossPnl, instrumentSpec, lotsToUnits, pipsMoved, round2, rMultiple, type TradeInput } from "@tj/core";

/** Broker columns derived from user-entered values. P&L is used as given when supplied. */
export function brokerColumns(input: TradeInput) {
  const spec = instrumentSpec(input.symbol);
  const volume = lotsToUnits(input.lots, spec.contractSize);
  const pip = spec.pipSize;
  const closed = input.closeTime !== null && input.exitPrice !== null;
  const commission = input.commission === null ? 0 : -Math.abs(input.commission);
  const swap = input.swap ?? 0;
  // Estimated only where a point has a fixed USD value (futures, USD-quoted
  // pairs and CFDs); otherwise the broker's P&L figure is needed.
  const estimatedGross = closed ? (estimateGrossPnl(spec, input.side, input.entryPrice, input.exitPrice!, input.lots) ?? 0) : 0;
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
