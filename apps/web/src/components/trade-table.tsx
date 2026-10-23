import Link from "next/link";
import { FLAG_LABELS, type Flag } from "@tj/core";
import type { JournalTrade } from "@/lib/data/trades";
import { dateTime, move, price, signed, size } from "@/lib/format";
import { Badge, Pnl, cx } from "./ui";

interface Props {
  trades: JournalTrade[];
  currency: string;
  timeZone: string;
  flags?: Map<string, Flag[]>;
  compact?: boolean;
}

export function TradeTable({ trades, currency, timeZone, flags, compact }: Props) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-4 py-2 font-medium sm:pl-0">Opened</th>
            <th className="px-2 py-2 font-medium">Symbol</th>
            <th className="px-2 py-2 font-medium">Side</th>
            <th className="px-2 py-2 text-right font-medium">Size</th>
            {!compact && <th className="px-2 py-2 text-right font-medium">Entry → Exit</th>}
            <th className="px-2 py-2 text-right font-medium">Move</th>
            <th className="px-2 py-2 text-right font-medium">R</th>
            <th className="px-2 py-2 text-right font-medium">Net P&amp;L</th>
            {!compact && <th className="px-2 py-2 font-medium">Setup / flags</th>}
          </tr>
        </thead>
        <tbody className="tabular">
          {trades.map((t) => {
            const tradeFlags = flags?.get(t.id) ?? [];
            return (
              <tr key={t.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="px-4 py-2 whitespace-nowrap text-ink-2 sm:pl-0">
                  <Link href={`/trades/${t.id}`} className="hover:underline">{dateTime(t.openTime, timeZone)}</Link>
                </td>
                <td className="px-2 py-2 font-medium">
                  <Link href={`/trades/${t.id}`} className="hover:underline">{t.symbol}</Link>
                </td>
                <td className="px-2 py-2">
                  <span className={cx("text-xs font-semibold uppercase", t.side === "buy" ? "text-gain-ink" : "text-loss-ink")}>
                    {t.side === "buy" ? "Long" : "Short"}
                  </span>
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">{size(t.symbol, t.lots)}</td>
                {!compact && (
                  <td className="px-2 py-2 text-right whitespace-nowrap text-ink-2">
                    {price(t.entryPrice)} → {t.status === "open" ? <Badge>open</Badge> : price(t.exitPrice)}
                  </td>
                )}
                <td className="px-2 py-2 text-right whitespace-nowrap text-ink-2">{move(t.symbol, t.pips)}</td>
                <td className="px-2 py-2 text-right text-ink-2">{t.rMultiple === null ? "–" : signed(t.rMultiple, 2, "R")}</td>
                <td className="px-2 py-2 text-right">
                  {t.status === "open" ? <span className="text-muted">–</span> : <Pnl value={t.netPnl} currency={currency} />}
                </td>
                {!compact && (
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {t.setup && <span className="text-xs text-ink-2">{t.setup}</span>}
                      {tradeFlags.map((f) => (
                        <Badge key={f.kind} tone={f.kind === "no_stop" ? "neutral" : "warning"} title={f.message}>
                          ⚑ {FLAG_LABELS[f.kind]}
                        </Badge>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
