import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Pnl, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/data/trades";
import { dateTime, price } from "@/lib/format";
import { setPlanStatus } from "./actions";

export const metadata: Metadata = { title: "Plans" };

export default function PlansPage() {
  return (
    <>
      <PageHeader
        title="Plans"
        description="Trades you planned before taking them, and how they turned out."
        actions={<ButtonLink href="/plans/new">Plan a trade</ButtonLink>}
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Plans />
      </Suspense>
    </>
  );
}

const STATUS_TONE = { planned: "accent", taken: "neutral", skipped: "neutral", cancelled: "neutral" } as const;

async function Plans() {
  const { supabase, user } = await requireUser();
  const [{ currency, timezone }, { data: plans }] = await Promise.all([
    getProfile(supabase, user.id),
    supabase
      .from("trade_plans")
      .select("*, trades(id, net_pnl, status)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (!plans?.length) {
    return <EmptyState title="No plans yet">Plans make it easy to see whether you trade your setups or improvise.</EmptyState>;
  }

  return (
    <div className="space-y-3">
      {plans.map((p) => {
        const checklist = (p.checklist as { label: string; done: boolean }[]) ?? [];
        const done = checklist.filter((c) => c.done).length;
        const linked = p.trades ?? [];
        const rr =
          p.entry_price !== null && p.stop_loss !== null && p.take_profit !== null && p.entry_price !== p.stop_loss
            ? Math.abs(p.take_profit - p.entry_price) / Math.abs(p.entry_price - p.stop_loss)
            : null;
        return (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.symbol}</span>
                  <span className="text-sm text-ink-2">{p.side === "buy" ? "Long" : "Short"}{p.setup ? ` · ${p.setup}` : ""}</span>
                  <Badge tone={STATUS_TONE[p.status as keyof typeof STATUS_TONE]}>{p.status}</Badge>
                </div>
                <div className="tabular mt-1 text-sm text-ink-2">
                  Entry {price(p.entry_price)} · Stop {price(p.stop_loss)} · Target {price(p.take_profit)}
                  {rr !== null && ` · ${rr.toFixed(2)}:1`}
                  {p.risk_percent !== null && ` · risk ${p.risk_percent}%`}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {dateTime(p.created_at, timezone)} · checklist {done}/{checklist.length}
                </div>
                {p.thesis && <p className="mt-2 max-w-2xl text-sm whitespace-pre-line">{p.thesis}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                {linked.map((t) => (
                  <Link key={t.id} href={`/trades/${t.id}`} className="text-sm hover:underline">
                    {t.status === "closed" ? <Pnl value={Number(t.net_pnl)} currency={currency} /> : "Open trade"} →
                  </Link>
                ))}
                {p.status === "planned" && (
                  <div className="flex gap-2">
                    <form action={setPlanStatus.bind(null, p.id, "skipped")}>
                      <button className="text-xs text-ink-2 hover:text-ink">Skipped it</button>
                    </form>
                    <form action={setPlanStatus.bind(null, p.id, "cancelled")}>
                      <button className="text-xs text-ink-2 hover:text-ink">Cancel</button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
