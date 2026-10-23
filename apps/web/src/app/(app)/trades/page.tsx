import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { computeStats, detectFlags } from "@tj/core";
import { TradeTable } from "@/components/trade-table";
import { ButtonLink, Card, EmptyState, PageHeader, Pnl, Skeleton, inputStyles } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { distinctValues, filterTrades, getProfile, listTags, listTrades } from "@/lib/data/trades";
import { percent } from "@/lib/format";
import { param, withParams, type SearchParams } from "@/lib/range";

export const metadata: Metadata = { title: "Trades" };

const PAGE_SIZE = 50;

export default function TradesPage({ searchParams }: PageProps<"/trades">) {
  return (
    <>
      <PageHeader
        title="Trades"
        actions={
          <>
            <ButtonLink href="/api/export?format=csv" variant="secondary" prefetch={false}>Export CSV</ButtonLink>
            <ButtonLink href="/trades/new">Add trade</ButtonLink>
          </>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Trades searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Trades({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const side = param(params, "side");
  const outcome = param(params, "outcome");
  const date = (key: string) => {
    const v = param(params, key);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  };
  const filters = {
    symbol: param(params, "symbol"),
    setup: param(params, "setup"),
    tag: param(params, "tag"),
    side: side === "buy" || side === "sell" ? side : undefined,
    outcome: outcome === "win" || outcome === "loss" ? outcome : undefined,
    from: date("from"),
    to: date("to"),
    day: date("day"),
  } as const;

  const [profile, all, tags] = await Promise.all([getProfile(supabase, user.id), listTrades(supabase), listTags(supabase)]);
  const { currency, timezone, rules } = profile;
  const filtered = filterTrades(all, filters, timezone);
  const { symbols, setups } = distinctValues(all);
  const flags = detectFlags(all, rules, timezone);
  const stats = computeStats(filtered);
  const page = Math.max(1, Number(param(params, "page") ?? 1) || 1);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const active = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2" aria-label="Filter trades">
        <Select name="symbol" label="Symbol" value={filters.symbol} options={symbols} />
        <Select name="side" label="Direction" value={filters.side} options={[["buy", "Long"], ["sell", "Short"]]} />
        <Select name="outcome" label="Result" value={filters.outcome} options={[["win", "Winners"], ["loss", "Losers"]]} />
        <Select name="setup" label="Setup" value={filters.setup} options={setups} />
        <Select name="tag" label="Tag" value={filters.tag} options={tags.map((t) => t.name)} />
        <label className="text-xs text-ink-2">
          From
          <input type="date" name="from" defaultValue={param(params, "from")} className={`${inputStyles} mt-1 w-36`} />
        </label>
        <label className="text-xs text-ink-2">
          To
          <input type="date" name="to" defaultValue={param(params, "to")} className={`${inputStyles} mt-1 w-36`} />
        </label>
        <button className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-[var(--grid)]">Apply</button>
        {active && <Link href="/trades" className="px-2 py-2 text-sm text-ink-2 hover:text-ink">Clear</Link>}
      </form>

      {filters.day && <p className="text-sm text-ink-2">Showing trades closed on {filters.day}.</p>}

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-2">
        <span>{filtered.length} trades</span>
        <span>Net <Pnl value={stats.netPnl} currency={currency} /></span>
        <span>Win rate {percent(stats.winRate)}</span>
        <span>Profit factor {stats.profitFactor ?? "–"}</span>
      </div>

      <Card>
        {visible.length ? (
          <TradeTable trades={visible} currency={currency} timeZone={timezone} flags={flags} />
        ) : (
          <EmptyState title={active ? "No trades match these filters" : "No trades yet"} />
        )}
      </Card>

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
          {page > 1 && <Link href={withParams("/trades", params, { page: String(page - 1) })} className="text-accent hover:underline">← Newer</Link>}
          <span className="text-ink-2">Page {page} of {pages}</span>
          {page < pages && <Link href={withParams("/trades", params, { page: String(page + 1) })} className="text-accent hover:underline">Older →</Link>}
        </nav>
      )}
    </div>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: (string | [string, string])[] }) {
  return (
    <label className="text-xs text-ink-2">
      {label}
      <select name={name} defaultValue={value ?? ""} className={`${inputStyles} mt-1 w-32`}>
        <option value="">All</option>
        {options.map((o) => {
          const [v, l] = Array.isArray(o) ? o : [o, o];
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </label>
  );
}
