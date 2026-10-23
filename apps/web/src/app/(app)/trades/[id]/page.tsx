import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FLAG_LABELS, SESSION_LABELS, detectFlags, findModel, holdingMinutes, sessionOf } from "@tj/core";
import { Badge, Button, Card, Pnl, Skeleton, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listModels } from "@/lib/data/playbook";
import { distinctValues, getProfile, getTrade, listTags, listTrades } from "@/lib/data/trades";
import { dateTime, duration, money, move, price, signed, signedMoney, size, toLocalInput } from "@/lib/format";
import { snapshotImage } from "@/lib/tradingview";
import { deleteAttachment, deleteTrade, resetToBroker, saveJournal, updateTrade, uploadAttachment } from "../actions";
import { TradeForm } from "../trade-form";
import { JournalForm } from "./journal-form";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Trade" };

export default function TradePage({ params }: PageProps<"/trades/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[600px]" />}>
      <TradeDetail params={params} />
    </Suspense>
  );
}

async function TradeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const [detail, profile, all, tags, plans, models] = await Promise.all([
    getTrade(supabase, id),
    getProfile(supabase, user.id),
    listTrades(supabase),
    listTags(supabase),
    supabase.from("trade_plans").select("id, symbol, side, setup, created_at").order("created_at", { ascending: false }).limit(30),
    listModels(supabase),
  ]);
  if (!detail) notFound();
  const { trade, executions, attachments } = detail;
  const { currency, timezone, rules } = profile;
  const flags = detectFlags(all, rules, timezone).get(trade.id) ?? [];
  const snapshot = snapshotImage(trade.chartUrl);
  const model = findModel(trade.setup, models);
  const activeModels = models.filter((m) => !m.archived);
  const setupNames = [...activeModels.map((m) => m.name), ...distinctValues(all).setups.filter((s) => !findModel(s, activeModels))];
  const signedUrls = attachments.length
    ? (await supabase.storage.from("attachments").createSignedUrls(attachments.map((a) => a.storage_path), 600)).data ?? []
    : [];

  const facts: [string, React.ReactNode][] = [
    ["Size", size(trade.symbol, trade.lots)],
    ["Entry", price(trade.entryPrice)],
    ["Exit", price(trade.exitPrice)],
    ["Move", move(trade.symbol, trade.pips)],
    ["R multiple", trade.rMultiple === null ? "Add a stop loss" : signed(trade.rMultiple, 2, "R")],
    ["Gross", signedMoney(trade.grossPnl, currency)],
    ["Commission", signedMoney(trade.commission, currency)],
    ["Swap", signedMoney(trade.swap, currency)],
    ["Opened", dateTime(trade.openTime, timezone)],
    ["Closed", dateTime(trade.closeTime, timezone)],
    ["Held", trade.closeTime ? duration(holdingMinutes(trade.openTime, trade.closeTime)) : "Open"],
    ["Session", SESSION_LABELS[sessionOf(trade.openTime)]],
  ];

  return (
    <div className="space-y-4">
      <div>
        <Link href="/trades" className="text-sm text-ink-2 hover:text-ink">← Trades</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{trade.symbol}</h1>
          <span className={cx("text-sm font-semibold uppercase", trade.side === "buy" ? "text-gain-ink" : "text-loss-ink")}>
            {trade.side === "buy" ? "Long" : "Short"}
          </span>
          {trade.status === "open" ? <Badge>Open</Badge> : <Pnl value={trade.netPnl} currency={currency} className="text-xl" />}
          <Badge>{trade.source === "ctrader" ? "Synced from cTrader" : trade.source === "import" ? "Imported" : "Manual"}</Badge>
          {trade.manuallyEdited && <Badge tone="warning" title="Sync will not overwrite your edits">Edited by hand</Badge>}
          {flags.map((f) => (
            <Badge key={f.kind} tone="warning" title={f.message}>⚑ {FLAG_LABELS[f.kind]}</Badge>
          ))}
        </div>
        {flags.length > 0 && <p className="mt-1 text-sm text-ink-2">{flags.map((f) => f.message).join(" · ")}</p>}
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4 lg:grid-cols-6">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="tabular mt-0.5 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {model && (
        <Card
          title={`Playbook · ${model.name}`}
          actions={<Link href="/playbook" className="text-sm text-ink-2 hover:text-ink">Rules →</Link>}
        >
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {model.targetR !== null && <Badge tone="accent">Target {model.targetR}R</Badge>}
            {model.breakevenR !== null && <Badge tone="accent">Break-even at {model.breakevenR}R</Badge>}
            {model.maxAttempts !== null && <Badge tone="accent">{model.maxAttempts} {model.maxAttempts === 1 ? "attempt" : "attempts"} max</Badge>}
            {model.entryWindowMinutes !== null && <Badge tone="accent">Within {model.entryWindowMinutes} min of the open</Badge>}
            {model.targetR !== null && trade.rMultiple !== null && trade.status === "closed" && (
              <span className="tabular ml-1 text-ink-2">
                {trade.rMultiple >= model.targetR - 0.05
                  ? "Reached the target."
                  : `Closed at ${signed(trade.rMultiple, 2, "R")} of the ${model.targetR}R target.`}
              </span>
            )}
          </div>
        </Card>
      )}

      {snapshot && (
        <Card title="Chart">
          {/* eslint-disable-next-line @next/next/no-img-element -- external TradingView snapshot, not optimisable */}
          <img src={snapshot} alt={`TradingView chart for ${trade.symbol}`} className="w-full rounded-lg" loading="lazy" />
        </Card>
      )}

      <Card title="Journal">
        <JournalForm
          action={saveJournal.bind(null, trade.id)}
          values={{
            setup: trade.setup ?? null,
            rating: trade.rating,
            emotionBefore: trade.emotionBefore,
            emotionAfter: trade.emotionAfter,
            followedPlan: trade.followedPlan,
            stopLoss: trade.stopLoss,
            takeProfit: trade.takeProfit,
            chartUrl: trade.chartUrl,
            notes: trade.notes,
            planId: trade.planId,
            tagIds: trade.tagRefs.map((t) => t.id),
          }}
          setups={setupNames}
          tags={tags}
          plans={(plans.data ?? []).map((p) => ({
            id: p.id,
            label: `${p.symbol} ${p.side === "buy" ? "long" : "short"}${p.setup ? ` · ${p.setup}` : ""} · ${dateTime(p.created_at, timezone)}`,
          }))}
        />
      </Card>

      <Card title="Screenshots">
        {signedUrls.length > 0 && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {attachments.map((a, i) => (
              <figure key={a.id} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={signedUrls[i]?.signedUrl ?? ""} alt="Trade screenshot" className="w-full rounded-lg border border-line" loading="lazy" />
                <form action={deleteAttachment.bind(null, a.id)}>
                  <button className="text-xs text-muted hover:text-loss-ink">Remove</button>
                </form>
              </figure>
            ))}
          </div>
        )}
        <UploadForm action={uploadAttachment.bind(null, trade.id)} />
      </Card>

      {executions.length > 0 && (
        <Card title="Executions">
          <table className="tabular w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-medium">Time</th><th className="font-medium">Side</th>
                <th className="text-right font-medium">Units</th><th className="text-right font-medium">Price</th>
                <th className="text-right font-medium">Commission</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="py-1.5">{dateTime(e.executed_at, timezone)}</td>
                  <td>{e.side} {e.close_detail ? "(close)" : "(open)"}</td>
                  <td className="text-right">{Number(e.volume).toLocaleString()}</td>
                  <td className="text-right">{price(Number(e.price))}</td>
                  <td className="text-right">{money(Number(e.commission), currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <details className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink-2">Edit broker figures</summary>
        <p className="mt-2 mb-4 text-sm text-ink-2">
          {trade.source === "ctrader"
            ? "Saving here marks the trade as edited by hand, and future syncs will leave it alone."
            : "Correct prices, size or P&L for this trade."}
        </p>
        <TradeForm
          action={updateTrade.bind(null, trade.id)}
          timeZone={timezone}
          submitLabel="Save changes"
          values={{
            symbol: trade.symbol, side: trade.side, lots: trade.lots,
            openTime: toLocalInput(trade.openTime, timezone), closeTime: toLocalInput(trade.closeTime, timezone),
            entryPrice: trade.entryPrice, exitPrice: trade.exitPrice ?? "", stopLoss: trade.stopLoss ?? "",
            takeProfit: trade.takeProfit ?? "", commission: Math.abs(trade.commission), swap: trade.swap, netPnl: trade.netPnl,
          }}
        />
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {trade.manuallyEdited && (
            <form action={resetToBroker.bind(null, trade.id)}>
              <Button variant="secondary">Use broker figures again</Button>
            </form>
          )}
          {trade.source !== "ctrader" && (
            <form action={deleteTrade.bind(null, trade.id)}>
              <Button variant="danger">Delete trade</Button>
            </form>
          )}
        </div>
      </details>
    </div>
  );
}
