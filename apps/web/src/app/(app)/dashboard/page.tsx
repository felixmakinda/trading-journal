import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  FLAG_LABELS,
  computeStats,
  dailyResults,
  detectFlags,
  equityCurve,
  evaluatePropFirm,
  localParts,
  type LimitUsage,
} from "@tj/core";
import { EquityChart } from "@/components/charts/equity-chart";
import { PnlCalendar } from "@/components/charts/pnl-calendar";
import { RangeTabs } from "@/components/range-tabs";
import { SyncButton } from "@/components/sync-button";
import { TradeTable } from "@/components/trade-table";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Pnl, Skeleton, StatTile } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProfile, listTrades } from "@/lib/data/trades";
import { dateTime, duration, money, num, percent, signed, signedMoney } from "@/lib/format";
import { param, parseRange, rangeStart, withParams, type SearchParams } from "@/lib/range";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={<ButtonLink href="/plans/new" variant="primary">Plan a trade</ButtonLink>}
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

async function Dashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const [profile, all, connection] = await Promise.all([
    getProfile(supabase, user.id),
    listTrades(supabase),
    supabase.from("broker_connections").select("status, last_synced_at, last_error").maybeSingle(),
  ]);
  const { currency, timezone, rules } = profile;
  const range = parseRange(param(params, "range"));
  const start = rangeStart(range);
  const inRange = start ? all.filter((t) => t.openTime >= start) : all;
  const stats = computeStats(inRange);
  const flags = detectFlags(all, rules, timezone);
  const now = new Date();
  const month = param(params, "month") ?? localParts(now.toISOString(), timezone).day.slice(0, 7);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const recentFlags = all.filter((t) => t.openTime >= weekAgo && flags.has(t.id));
  const prop = rules.propFirm.enabled ? evaluatePropFirm(all, rules.propFirm, now, timezone) : null;

  if (!all.length) {
    return (
      <EmptyState title="No trades yet">
        Connect cTrader in <Link className="text-accent underline" href="/settings">Settings</Link> to pull your trades in
        automatically, <Link className="text-accent underline" href="/import">import a CSV</Link>, or{" "}
        <Link className="text-accent underline" href="/trades/new">add one by hand</Link>.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeTabs path="/dashboard" params={params} current={range} />
        <SyncStatus connection={connection.data} timeZone={timezone} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Net P&L" value={<Pnl value={stats.netPnl} currency={currency} />} hint={`${stats.trades} closed trades`} />
        <StatTile label="Win rate" value={percent(stats.winRate)} hint={`${stats.wins}W · ${stats.losses}L · ${stats.breakeven}BE`} />
        <StatTile label="Profit factor" value={num(stats.profitFactor)} hint={`Payoff ${num(stats.payoffRatio)}`} />
        <StatTile label="Expectancy" value={stats.expectancy === null ? "–" : signedMoney(stats.expectancy, currency)} hint="per trade" />
        <StatTile label="Average R" value={stats.avgR === null ? "–" : signed(stats.avgR, 2, "R")} hint={`Hold ${duration(stats.avgHoldMinutes)}`} />
        <StatTile label="Max drawdown" value={money(stats.maxDrawdown, currency)} hint={`Worst streak ${stats.maxLossStreak}L`} />
      </div>

      {prop && (
        <Card title={`Prop firm limits${rules.propFirm.name ? ` · ${rules.propFirm.name}` : ""}`}>
          <div className="grid gap-4 sm:grid-cols-3">
            <LimitMeter label="Today's loss" usage={prop.daily} currency={currency} />
            <LimitMeter label="Max loss" usage={prop.overall} currency={currency} />
            <div>
              <div className="flex justify-between text-sm"><span className="text-ink-2">Profit target</span><span className="tabular">{percent(prop.target.progress, 0)}</span></div>
              <Meter value={prop.target.progress} color="var(--gain)" />
              <div className="mt-1 text-xs text-muted">{prop.target.reached ? "✓ Target reached" : `Target ${money(prop.target.amount, currency)}`}</div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Equity curve" className="lg:col-span-3">
          <EquityChart points={equityCurve(inRange, rules.startingBalance)} currency={currency} timeZone={timezone} />
        </Card>
        <Card title="Calendar" className="lg:col-span-2">
          <PnlCalendar
            month={month}
            days={dailyResults(all, timezone)}
            currency={currency}
            monthHref={(m) => withParams("/dashboard", params, { month: m })}
            hrefForDay={(d) => `/trades?day=${d}`}
          />
        </Card>
      </div>

      {recentFlags.length > 0 && (
        <Card title="Behaviour flags this week">
          <ul className="space-y-2 text-sm">
            {recentFlags.slice(0, 6).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/trades/${t.id}`} className="font-medium hover:underline">{t.symbol}</Link>
                <span className="text-muted">{dateTime(t.openTime, timezone)}</span>
                {flags.get(t.id)!.map((f) => (
                  <Badge key={f.kind} tone="warning" title={f.message}>⚑ {FLAG_LABELS[f.kind]}</Badge>
                ))}
                <span className="text-ink-2">{flags.get(t.id)![0]!.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Recent trades" actions={<Link href="/trades" className="text-sm text-accent hover:underline">All trades →</Link>}>
        <TradeTable trades={all.slice(0, 8)} currency={currency} timeZone={timezone} flags={flags} compact />
      </Card>
    </div>
  );
}

function SyncStatus({ connection, timeZone }: { connection: { status: string; last_synced_at: string | null; last_error: string | null } | null; timeZone: string }) {
  if (!connection || connection.status === "revoked") {
    return <Link href="/settings" className="text-sm text-accent hover:underline">Connect cTrader for automatic sync →</Link>;
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-ink-2">
      {connection.status === "error" ? (
        <Badge tone="critical" title={connection.last_error ?? undefined}>✕ Last sync failed</Badge>
      ) : (
        <span>Synced {dateTime(connection.last_synced_at, timeZone)}</span>
      )}
      <SyncButton />
    </div>
  );
}

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color }} />
    </div>
  );
}

const statusStyle = {
  ok: { color: "var(--good)", icon: "✓", label: "Within limit" },
  warning: { color: "var(--warning)", icon: "!", label: "Approaching limit" },
  breached: { color: "var(--critical)", icon: "✕", label: "Limit breached" },
} as const;

function LimitMeter({ label, usage, currency }: { label: string; usage: LimitUsage; currency: string }) {
  const s = statusStyle[usage.status];
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="tabular">{money(usage.used, currency)} / {money(usage.limit, currency)}</span>
      </div>
      <Meter value={usage.percentUsed} color={s.color} />
      <div className="mt-1 text-xs text-ink-2">{s.icon} {s.label} ({percent(usage.percentUsed, 0)})</div>
    </div>
  );
}
