import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { computeStats, findModel, modelResult, type PlaybookModel } from "@tj/core";
import { Badge, Button, Card, EmptyState, PageHeader, Pnl, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listModels } from "@/lib/data/playbook";
import { distinctValues, getProfile, listTrades, type JournalTrade } from "@/lib/data/trades";
import { percent, signed } from "@/lib/format";
import { param, type SearchParams } from "@/lib/range";
import { createModel, deleteModel, setModelArchived, updateModel } from "./actions";
import { ModelForm } from "./model-form";

export const metadata: Metadata = { title: "Playbook" };

export default function PlaybookPage({ searchParams }: PageProps<"/playbook">) {
  return (
    <>
      <PageHeader
        title="Playbook"
        description="Your setups and their rules. Each trade is measured against the rules of its setup."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Playbook searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Playbook({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ currency }, models, trades] = await Promise.all([getProfile(supabase, user.id), listModels(supabase), listTrades(supabase)]);
  const active = models.filter((m) => !m.archived);
  const archived = models.filter((m) => m.archived);
  const unlisted = distinctValues(trades).setups.filter((s) => !findModel(s, models));
  const tradesOf = (m: PlaybookModel) => trades.filter((t) => findModel(t.setup, [m]));

  return (
    <div className="space-y-4">
      {active.length === 0 && (
        <EmptyState title="No setups in your playbook yet">
          Add the setups you trade, with their target, break-even and entry rules, to see how each one performs against its plan.
        </EmptyState>
      )}
      {active.map((m) => (
        <ModelCard key={m.id} model={m} trades={tradesOf(m)} currency={currency} />
      ))}

      <Card title="Add a setup">
        {unlisted.length > 0 && (
          <p className="mb-4 text-sm text-ink-2">
            Setups on your trades that are not in the playbook yet:{" "}
            {unlisted.map((s, i) => (
              <span key={s}>
                {i > 0 && ", "}
                <Link href={`/playbook?name=${encodeURIComponent(s)}#new`} className="font-medium text-ink underline-offset-2 hover:underline">{s}</Link>
              </span>
            ))}
          </p>
        )}
        <div id="new">
          <ModelForm key={param(params, "name") ?? ""} action={createModel} values={{ name: param(params, "name") ?? "" }} submitLabel="Add to playbook" />
        </div>
      </Card>

      {archived.length > 0 && (
        <details className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold text-ink-2">Archived ({archived.length})</summary>
          <ul className="mt-3 space-y-2">
            {archived.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{m.name} <span className="text-muted">· {tradesOf(m).length} trades</span></span>
                <form action={setModelArchived.bind(null, m.id, false)}>
                  <Button variant="secondary">Restore</Button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ModelCard({ model: m, trades, currency }: { model: PlaybookModel; trades: JournalTrade[]; currency: string }) {
  const stats = computeStats(trades);
  const result = modelResult(m, trades);
  const rules = [
    m.targetR !== null && `Target ${m.targetR}R`,
    m.breakevenR !== null && `Break-even at ${m.breakevenR}R`,
    m.maxAttempts !== null && `${m.maxAttempts} ${m.maxAttempts === 1 ? "attempt" : "attempts"} max`,
    m.entryWindowMinutes !== null && `Within ${m.entryWindowMinutes} min of the open`,
  ].filter((r): r is string => Boolean(r));

  return (
    <Card
      title={<span className="text-base text-ink">{m.name}</span>}
      actions={
        <Link href={`/trades?setup=${encodeURIComponent(m.name)}`} className="text-sm text-ink-2 hover:text-ink">
          {trades.length} {trades.length === 1 ? "trade" : "trades"} →
        </Link>
      }
    >
      {rules.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {rules.map((r) => <Badge key={r} tone="accent">{r}</Badge>)}
        </div>
      )}

      {stats.trades > 0 && (
        <dl className="tabular mb-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
          <div><dt className="text-xs text-muted">Net P&amp;L</dt><dd className="font-medium"><Pnl value={stats.netPnl} currency={currency} /></dd></div>
          <div><dt className="text-xs text-muted">Win rate</dt><dd className="font-medium">{percent(stats.winRate, 0)}</dd></div>
          <div><dt className="text-xs text-muted">Average R</dt><dd className="font-medium">{result.avgR === null ? "–" : signed(result.avgR, 2, "R")}</dd></div>
          <div>
            <dt className="text-xs text-muted">Reached target</dt>
            <dd className="font-medium">{m.targetR === null || result.measured === 0 ? "–" : `${result.targetHits} of ${result.measured}`}</dd>
          </div>
          <div><dt className="text-xs text-muted">Closed trades</dt><dd className="font-medium">{stats.trades}</dd></div>
        </dl>
      )}

      {m.checklist.length > 0 && (
        <ul className="mb-3 list-inside list-disc text-sm text-ink-2">
          {m.checklist.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
      {m.description && <p className="mb-3 max-w-3xl text-sm whitespace-pre-line">{m.description}</p>}

      <details className="border-t border-line pt-3">
        <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">Edit</summary>
        <div className="mt-3 space-y-4">
          <ModelForm action={updateModel.bind(null, m.id)} values={m} submitLabel="Save setup" />
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <form action={setModelArchived.bind(null, m.id, true)}>
              <Button variant="secondary">Archive</Button>
            </form>
            <form action={deleteModel.bind(null, m.id)}>
              <Button variant="danger">Delete</Button>
            </form>
          </div>
          <p className="text-xs text-muted">Deleting removes the rules only. Trades keep their setup name.</p>
        </div>
      </details>
    </Card>
  );
}
