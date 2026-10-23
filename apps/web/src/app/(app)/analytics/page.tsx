import type { Metadata } from "next";
import { Suspense } from "react";
import {
  FLAG_LABELS,
  SESSION_LABELS,
  WEEKDAYS,
  computeStats,
  detectFlags,
  groupStats,
  localParts,
  sessionOf,
  type FlagKind,
  type Session,
} from "@tj/core";
import { BreakdownBars } from "@/components/charts/breakdown-bars";
import { RangeTabs } from "@/components/range-tabs";
import { Card, EmptyState, PageHeader, Pnl, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProfile, listTrades } from "@/lib/data/trades";
import { duration, num, percent } from "@/lib/format";
import { param, parseRange, rangeStart, type SearchParams } from "@/lib/range";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  return (
    <>
      <PageHeader title="Analytics" description="Where your edge is, and where it leaks. All figures are net of commission and swap." />
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <Analytics searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Analytics({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ currency, timezone, rules }, all] = await Promise.all([getProfile(supabase, user.id), listTrades(supabase)]);
  const range = parseRange(param(params, "range"), "all");
  const start = rangeStart(range);
  const trades = start ? all.filter((t) => t.openTime >= start) : all;
  const closed = trades.filter((t) => t.status === "closed");

  if (!closed.length) {
    return (
      <div className="space-y-4">
        <RangeTabs path="/analytics" params={params} current={range} />
        <EmptyState title="No closed trades in this range" />
      </div>
    );
  }

  const flags = detectFlags(all, rules, timezone);
  const hour = (iso: string) => String(localParts(iso, timezone).hour).padStart(2, "0");
  const plan = (t: (typeof trades)[number]) =>
    t.followedPlan === true ? "Followed plan" : t.followedPlan === false ? "Broke plan" : null;

  const flagRows = (Object.keys(FLAG_LABELS) as FlagKind[]).map((kind) => {
    const flagged = closed.filter((t) => flags.get(t.id)?.some((f) => f.kind === kind));
    return { kind, stats: computeStats(flagged) };
  });
  const clean = computeStats(closed.filter((t) => !flags.has(t.id)));

  return (
    <div className="space-y-4">
      <RangeTabs path="/analytics" params={params} current={range} />

      <Card title="Behaviour: what each pattern cost">
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="tabular w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium sm:pl-0">Pattern</th>
                <th className="px-2 py-2 text-right font-medium">Trades</th>
                <th className="px-2 py-2 text-right font-medium">Win rate</th>
                <th className="px-2 py-2 text-right font-medium">Net P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {flagRows.map(({ kind, stats }) => (
                <tr key={kind} className="border-b border-line">
                  <td className="px-4 py-2 sm:pl-0">⚑ {FLAG_LABELS[kind]}</td>
                  <td className="px-2 py-2 text-right">{stats.trades}</td>
                  <td className="px-2 py-2 text-right">{percent(stats.winRate, 0)}</td>
                  <td className="px-2 py-2 text-right">{stats.trades ? <Pnl value={stats.netPnl} currency={currency} /> : "–"}</td>
                </tr>
              ))}
              <tr>
                <td className="px-4 py-2 font-medium sm:pl-0">✓ No flags</td>
                <td className="px-2 py-2 text-right">{clean.trades}</td>
                <td className="px-2 py-2 text-right">{percent(clean.winRate, 0)}</td>
                <td className="px-2 py-2 text-right"><Pnl value={clean.netPnl} currency={currency} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Thresholds (revenge window, tilt streak, daily trade limit) are set in Settings → Rules.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By session (entry time)">
          <BreakdownBars
            groups={groupStats(trades, (t) => sessionOf(t.openTime))}
            currency={currency}
            label={(k) => SESSION_LABELS[k as Session]}
            order={["asia", "london", "overlap", "newyork", "late"]}
          />
        </Card>
        <Card title="By symbol">
          <BreakdownBars groups={groupStats(trades, (t) => t.symbol).slice(0, 10)} currency={currency} />
        </Card>
        <Card title="By weekday">
          <BreakdownBars
            groups={groupStats(trades, (t) => localParts(t.openTime, timezone).weekday)}
            currency={currency}
            order={[...WEEKDAYS]}
          />
        </Card>
        <Card title={`By hour of entry (${timezone})`}>
          <BreakdownBars
            groups={groupStats(trades, (t) => hour(t.openTime))}
            currency={currency}
            label={(h) => `${h}:00`}
            order={Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))}
          />
        </Card>
        <Card title="By setup">
          <BreakdownBars groups={groupStats(trades, (t) => t.setup ?? "No setup")} currency={currency} />
        </Card>
        <Card title="By tag">
          <BreakdownBars groups={groupStats(trades, (t) => t.tags)} currency={currency} />
        </Card>
        <Card title="By feeling before the trade">
          <BreakdownBars groups={groupStats(trades, (t) => t.emotionBefore)} currency={currency} />
        </Card>
        <Card title="Plan discipline">
          <BreakdownBars groups={groupStats(trades, plan)} currency={currency} />
        </Card>
        <Card title="By direction">
          <BreakdownBars
            groups={groupStats(trades, (t) => (t.side === "buy" ? "Long" : "Short"))}
            currency={currency}
          />
        </Card>
        <Card title="Holding time">
          <HoldingTable trades={closed} currency={currency} />
        </Card>
      </div>
    </div>
  );
}

function HoldingTable({ trades, currency }: { trades: Awaited<ReturnType<typeof listTrades>>; currency: string }) {
  const buckets: [string, number][] = [["Under 15m", 15], ["15m to 1h", 60], ["1h to 4h", 240], ["4h to 1d", 1440], ["Over 1d", Infinity]];
  const minutes = (t: (typeof trades)[number]) => (Date.parse(t.closeTime!) - Date.parse(t.openTime)) / 60_000;
  let lower = 0;
  const rows = buckets.map(([label, upper]) => {
    const inBucket = trades.filter((t) => minutes(t) >= lower && minutes(t) < upper);
    lower = upper;
    return { label, stats: computeStats(inBucket) };
  });
  return (
    <table className="tabular w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-line last:border-0">
            <td className="py-1.5 text-ink-2">{r.label}</td>
            <td className="py-1.5 text-right text-xs text-muted">{r.stats.trades} · {percent(r.stats.winRate, 0)} · avg R {num(r.stats.avgR)}</td>
            <td className="py-1.5 text-right">{r.stats.trades ? <Pnl value={r.stats.netPnl} currency={currency} /> : "–"}</td>
          </tr>
        ))}
      </tbody>
      <caption className="caption-bottom pt-2 text-left text-xs text-muted">
        Average hold {duration(computeStats(trades).avgHoldMinutes)}
      </caption>
    </table>
  );
}
