import Link from "next/link";
import type { DayResult } from "@tj/core";
import { signedCompact, signedMoney } from "@/lib/format";
import { cx } from "../ui";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Diverging step: four per arm, scaled to the month's largest absolute day. */
function step(value: number, max: number): string {
  if (Math.abs(value) < 0.005 || max === 0) return "var(--neutral)";
  const level = Math.min(4, Math.max(1, Math.ceil((Math.abs(value) / max) * 4)));
  return `var(--${value > 0 ? "gain" : "loss"}-${level})`;
}

interface Props {
  /** YYYY-MM */
  month: string;
  days: Map<string, DayResult>;
  currency: string;
  hrefForDay?: (day: string) => string;
  monthHref: (month: string) => string;
}

export function PnlCalendar({ month, days, currency, hrefForDay, monthHref }: Props) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const monthDays = [...days.values()].filter((d) => d.day.startsWith(month));
  const max = Math.max(0, ...monthDays.map((d) => Math.abs(d.netPnl)));
  const total = monthDays.reduce((s, d) => s + d.netPnl, 0);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={monthHref(shift(-1))} className="rounded-md px-2 py-1 text-ink-2 hover:bg-surface-2" aria-label="Previous month">‹</Link>
          <span className="min-w-32 text-center text-sm font-medium">{label}</span>
          <Link href={monthHref(shift(1))} className="rounded-md px-2 py-1 text-ink-2 hover:bg-surface-2" aria-label="Next month">›</Link>
        </div>
        <span className="tabular text-sm text-ink-2">
          Month {signedMoney(total, currency)} · {monthDays.reduce((s, d) => s + d.trades, 0)} trades
        </span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-xs" role="grid" aria-label={`Daily P&L for ${label}`}>
        {WEEK.map((d) => (
          <div key={d} className="pb-1 text-center font-medium text-muted" role="columnheader">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} />;
          const r = days.get(day);
          const level = r ? Math.ceil((Math.abs(r.netPnl) / (max || 1)) * 4) : 0;
          const darkText = !r || level <= 2;
          const content = (
            <>
              <span className={cx("block text-[11px]", darkText ? "text-ink-2" : "text-on-strong opacity-85")}>{Number(day.slice(8))}</span>
              {r && (
                <span className={cx("tabular block truncate text-[10px] font-medium sm:text-xs", darkText ? "text-ink" : "text-on-strong")}>
                  <span className="sm:hidden">{signedCompact(r.netPnl, null)}</span>
                  <span className="hidden sm:inline">{signedCompact(r.netPnl, currency)}</span>
                </span>
              )}
            </>
          );
          const title = r ? `${day}: ${signedMoney(r.netPnl, currency)}, ${r.trades} trade${r.trades === 1 ? "" : "s"}, ${r.wins} win${r.wins === 1 ? "" : "s"}` : day;
          const className = "block h-14 rounded-md p-1.5 sm:h-16";
          return (
            <div key={day} role="gridcell" title={title}>
              {r && hrefForDay ? (
                <Link href={hrefForDay(day)} className={cx(className, "hover:ring-2 hover:ring-accent")} style={{ background: step(r.netPnl, max) }}>
                  {content}
                </Link>
              ) : (
                <div className={className} style={{ background: r ? step(r.netPnl, max) : "transparent" }}>{content}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
