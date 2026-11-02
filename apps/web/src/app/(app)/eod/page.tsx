import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PLAY_OUTCOME_LABELS, averageGrade, dailyResults, localParts, summarizePlays, type DayResult } from "@tj/core";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Pnl, Skeleton, StatTile, cx, inputStyles } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listEodDays, type EodDayRecord, type EodSection } from "@/lib/data/eod";
import { getProfile, listTrades } from "@/lib/data/trades";
import { param, withParams, type SearchParams } from "@/lib/range";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "End of day" };

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Same diverging steps as the P&L calendar, so a good day reads the same everywhere.
const GRADE_TONE: Record<string, string> = {
  A: "bg-[var(--gain-3)] text-white",
  B: "bg-[var(--gain-1)] text-ink",
  C: "bg-[var(--neutral)] text-ink",
  D: "bg-[var(--loss-1)] text-ink",
  F: "bg-[var(--loss-3)] text-white",
};

export default function EodPage({ searchParams }: PageProps<"/eod">) {
  return (
    <Suspense fallback={<Skeleton className="h-[600px]" />}>
      <Eod searchParams={searchParams} />
    </Suspense>
  );
}

async function Eod({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  const today = localParts(new Date().toISOString(), profile.timezone).day;
  const monthParam = param(params, "month");
  const month = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : today.slice(0, 7);
  const market = param(params, "market");

  const [y, m] = month.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const [days, trades] = await Promise.all([
    listEodDays(supabase, { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` }),
    listTrades(supabase),
  ]);
  const results = dailyResults(trades, profile.timezone);

  const shown = market ? days.filter((d) => d.markets.includes(market) || d.sections.some((s) => s.market === market)) : days;
  const sectionsOf = (d: EodDayRecord) => (market ? d.sections.filter((s) => s.market === market) : d.sections);
  const plays = summarizePlays(shown.flatMap((d) => sectionsOf(d).flatMap((s) => s.plays)));
  const avg = averageGrade(shown.map((d) => d.grade));
  const marketChoices = [...new Set([...profile.rules.eodMarkets, ...days.flatMap((d) => d.markets)])];
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));

  return (
    <>
      <PageHeader
        title="End of day"
        description="Review each market you looked at: what was there, what you took, what you missed, and why."
        actions={<ButtonLink href={`/eod/${today}`}>Fill in today</ButtonLink>}
      />
      <div className="space-y-4">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Link href={withParams("/eod", params, { month: shift(-1) })} className="rounded-md px-2 py-1 text-ink-2 hover:bg-surface-2" aria-label="Previous month">‹</Link>
              <h2 className="min-w-36 text-center text-sm font-semibold">{monthLabel}</h2>
              <Link href={withParams("/eod", params, { month: shift(1) })} className="rounded-md px-2 py-1 text-ink-2 hover:bg-surface-2" aria-label="Next month">›</Link>
            </div>
            <form className="flex items-center gap-2">
              <input type="hidden" name="month" value={month} />
              <label className="text-xs text-ink-2" htmlFor="eod-market">Market</label>
              <select id="eod-market" name="market" defaultValue={market ?? ""} className={`${inputStyles} w-32 py-1.5`}>
                <option value="">All</option>
                {marketChoices.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2">Apply</button>
            </form>
          </div>
          <GradeCalendar month={month} lead={(new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7} lastDay={lastDay} days={shown} results={results} today={today} />
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatTile label="Days reviewed" value={shown.length} />
          <StatTile label="Average grade" value={avg === null ? "–" : avg.toFixed(1)} hint="A = 4, F = 0" />
          <StatTile label="Plays taken" value={plays.taken} />
          <StatTile label="Missed" value={plays.missed} />
          <StatTile label="Skipped on purpose" value={plays.skipped} />
        </div>

        {plays.bySetup.length > 0 && (
          <Card title="Plays by setup">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-medium">Setup</th>
                  <th className="text-right font-medium">{PLAY_OUTCOME_LABELS.taken}</th>
                  <th className="text-right font-medium">{PLAY_OUTCOME_LABELS.missed}</th>
                  <th className="text-right font-medium">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {plays.bySetup.map((s) => (
                  <tr key={s.setup} className="border-t border-line">
                    <td className="py-1.5">{s.setup}</td>
                    <td className="text-right">{s.taken}</td>
                    <td className={cx("text-right", s.missed > 0 && "font-semibold")}>{s.missed}</td>
                    <td className="text-right">{s.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {shown.length === 0 ? (
          <EmptyState title={`No reviews in ${monthLabel}${market ? ` for ${market}` : ""}`}>
            Pick a day on the calendar, or <Link href={`/eod/${today}`} className="underline">fill in today</Link>.
          </EmptyState>
        ) : (
          shown.map((d) => (
            <DayCard key={d.day} day={d} sections={sectionsOf(d)} result={results.get(d.day)} currency={profile.currency} />
          ))
        )}

        <details className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold text-ink-2">Import from the EOD Journal app</summary>
          <p className="mt-2 mb-3 text-sm text-ink-2">
            In the EOD Journal, open Backup and download the data backup (JSON), then choose that file here. Days you already have here are left as they are.
          </p>
          <ImportForm />
        </details>
      </div>
    </>
  );
}

function GradeCalendar({ month, lead, lastDay, days, results, today }: {
  month: string; lead: number; lastDay: number; days: EodDayRecord[]; results: Map<string, DayResult>; today: string;
}) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: lastDay }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <div className="grid grid-cols-7 gap-1 text-sm">
      {WEEK.map((w) => <div key={w} className="pb-1 text-center text-xs text-muted">{w}</div>)}
      {cells.map((day, i) => {
        if (!day) return <div key={`lead-${i}`} />;
        const review = byDay.get(day);
        const pnl = results.get(day);
        return (
          <Link
            key={day}
            href={`/eod/${day}`}
            title={review ? `Reviewed${review.grade ? `, grade ${review.grade}` : ""}` : "Fill in this day"}
            className={cx(
              "flex h-14 flex-col items-center justify-center rounded-lg border text-xs sm:h-16",
              review ? "border-accent/40" : "border-line text-muted hover:bg-surface-2",
              day === today && "ring-2 ring-accent",
            )}
          >
            <span>{Number(day.slice(8))}</span>
            {review?.grade && <span className={cx("mt-0.5 rounded px-1.5 text-xs font-semibold", GRADE_TONE[review.grade])}>{review.grade}</span>}
            {review && !review.grade && <span className="mt-0.5 text-[10px] text-ink-2">draft</span>}
            {pnl && !review && <span className="mt-0.5 h-1 w-1 rounded-full bg-ink-2" aria-label="Trades this day" />}
          </Link>
        );
      })}
    </div>
  );
}

function DayCard({ day: d, sections, result, currency }: { day: EodDayRecord; sections: EodSection[]; result?: DayResult; currency: string }) {
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d.day}T00:00:00Z`));
  return (
    <section id={d.day} className="scroll-mt-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cx("flex h-9 w-9 items-center justify-center rounded-lg text-base font-semibold", d.grade ? GRADE_TONE[d.grade] : "border border-dashed border-line text-muted")}>
          {d.grade ?? "–"}
        </span>
        <h2 className="font-semibold">{date}</h2>
        <span className="text-sm text-ink-2">{d.markets.join(", ")}</span>
        {result && (
          <Link href={`/trades?day=${d.day}`} className="text-sm hover:underline">
            {result.trades} {result.trades === 1 ? "trade" : "trades"} · <Pnl value={result.netPnl} currency={currency} />
          </Link>
        )}
        <Link href={`/eod/${d.day}`} className="ml-auto text-sm text-ink-2 hover:text-ink">Edit →</Link>
      </div>
      {d.summary && <p className="mt-3 max-w-3xl text-sm whitespace-pre-line">{d.summary}</p>}
      {d.lesson && <p className="mt-2 text-sm text-ink-2"><strong className="text-ink">Carry forward:</strong> {d.lesson}</p>}

      <div className="mt-3 space-y-3">
        {sections.map((s) => (
          <div key={s.id} className="border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="mr-1 text-sm font-semibold">{s.market}</h3>
              {s.noSetup && <Badge>No clean setup</Badge>}
              {s.setupsSeen.map((x) => <Badge key={`${x.setup}-${x.side}`} tone="accent">{x.setup} · {x.side === "buy" ? "Long" : "Short"}</Badge>)}
            </div>
            <div className="mt-2 space-y-1 text-sm">
              {s.noTrade ? (
                <p className="text-ink-2">No trade presented.</p>
              ) : (
                s.plays.map((p, i) => (
                  <p key={i}>
                    <Badge tone={p.outcome === "missed" ? "warning" : p.outcome === "taken" ? "accent" : "neutral"}>{PLAY_OUTCOME_LABELS[p.outcome]}</Badge>{" "}
                    <span className="tabular text-ink-2">{p.presentedAt ?? "–"}</span> {p.setup ?? "No setup"} {p.side === "buy" ? "long" : "short"}
                    {p.detail && <span className="text-ink-2"> · {p.detail}</span>}
                    {p.chartUrl && <> · <a href={p.chartUrl} target="_blank" rel="noopener noreferrer" className="underline">chart</a></>}
                  </p>
                ))
              )}
              {s.went && <p><span className="text-muted">Session:</span> {s.went}</p>}
              {s.did && <p><span className="text-muted">Did:</span> {s.did}</p>}
              {s.shouldHave && <p><span className="text-muted">Should have:</span> {s.shouldHave}</p>}
              {s.chartUrl && <p><a href={s.chartUrl} target="_blank" rel="noopener noreferrer" className="underline">TradingView chart</a></p>}
            </div>
            {s.images.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {s.images.map((img, i) => (
                  <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                    <img src={img.url} alt={`${s.market} chart ${i + 1}`} loading="lazy" className="aspect-video w-full rounded-md border border-line object-cover" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

