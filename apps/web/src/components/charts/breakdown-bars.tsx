import type { GroupResult } from "@tj/core";
import { percent, signedMoney } from "@/lib/format";

interface Props {
  groups: GroupResult[];
  currency: string;
  label?: (key: string) => string;
  /** Keep the given order instead of sorting by P&L (e.g. weekdays). */
  order?: string[];
}

/**
 * Net P&L per group as diverging horizontal bars from a shared zero line.
 * Every bar is direct-labelled with its signed value; hover shows the detail.
 */
export function BreakdownBars({ groups, currency, label = (k) => k, order }: Props) {
  const rows = order
    ? order.flatMap((k) => groups.filter((g) => g.key === k))
    : groups;
  if (!rows.length) return <p className="text-sm text-muted">No closed trades in this range.</p>;
  const max = Math.max(...rows.map((g) => Math.abs(g.stats.netPnl)), 1);
  const hasNegative = rows.some((g) => g.stats.netPnl < 0);

  return (
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr><th>Group</th><th>Net P&amp;L</th><th>Trades</th><th>Win rate</th></tr>
      </thead>
      <tbody>
        {rows.map((g) => {
          const width = (Math.abs(g.stats.netPnl) / max) * (hasNegative ? 50 : 100);
          const positive = g.stats.netPnl >= 0;
          return (
            <tr key={g.key} className="group">
              <th scope="row" className="w-32 truncate py-1.5 pr-3 text-left font-normal text-ink-2">{label(g.key)}</th>
              <td className="relative py-1.5">
                <div className="relative h-5">
                  {hasNegative && <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--axis)]" />}
                  <div
                    className="absolute top-0.5 h-4"
                    style={{
                      width: `${Math.max(width, 0.5)}%`,
                      left: positive ? (hasNegative ? "50%" : "0") : `${50 - width}%`,
                      background: positive ? "var(--gain)" : "var(--loss)",
                      borderRadius: positive ? "0 4px 4px 0" : "4px 0 0 4px",
                    }}
                  />
                  <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm group-hover:block">
                    {label(g.key)}: {g.stats.trades} trades · win rate {percent(g.stats.winRate, 0)} · PF {g.stats.profitFactor ?? "–"}
                  </div>
                </div>
              </td>
              <td className="tabular w-24 py-1.5 pl-3 text-right font-medium">{signedMoney(g.stats.netPnl, currency)}</td>
              <td className="tabular hidden w-28 py-1.5 pl-3 text-right text-xs text-muted sm:table-cell">
                {g.stats.trades} · {percent(g.stats.winRate, 0)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
