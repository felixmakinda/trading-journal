import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { daySchema, findModel } from "@tj/core";
import { Button, PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getEodDay } from "@/lib/data/eod";
import { listModels } from "@/lib/data/playbook";
import { distinctValues, filterTrades, getProfile, listTrades } from "@/lib/data/trades";
import { signedMoney, size, toneOf } from "@/lib/format";
import { deleteEodDay } from "../actions";
import { EodWizard, type Section } from "./eod-wizard";

export const metadata: Metadata = { title: "End of day" };

const longDate = (day: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

export default function EodDayPage({ params }: PageProps<"/eod/[day]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[600px]" />}>
      <EodDay params={params} />
    </Suspense>
  );
}

async function EodDay({ params }: { params: Promise<{ day: string }> }) {
  const { day: raw } = await params;
  const parsed = daySchema.safeParse(raw);
  if (!parsed.success) notFound();
  const day = parsed.data;

  const { supabase, user } = await requireUser();
  const [profile, record, models, trades] = await Promise.all([
    getProfile(supabase, user.id),
    getEodDay(supabase, day),
    listModels(supabase),
    listTrades(supabase),
  ]);
  const active = models.filter((m) => !m.archived);
  const setups = [...active.map((m) => m.name), ...distinctValues(trades).setups.filter((s) => !findModel(s, active))];
  const dayTrades = filterTrades(trades, { day }, profile.timezone).map((t) => ({
    id: t.id,
    label: `${t.symbol} ${t.side === "buy" ? "long" : "short"} ${size(t.symbol, t.lots)}${t.setup ? ` · ${t.setup}` : ""}`,
    pnl: t.status === "open" ? "open" : signedMoney(t.netPnl, profile.currency),
    tone: t.status === "open" ? ("flat" as const) : toneOf(t.netPnl),
  }));
  const sections: Record<string, Section> = Object.fromEntries((record?.sections ?? []).map((s) => [s.market, s]));

  return (
    <>
      <div className="mb-2">
        <Link href={`/eod?month=${day.slice(0, 7)}`} className="text-sm text-ink-2 hover:text-ink">← End of day</Link>
      </div>
      <PageHeader title={longDate(day)} description="Fill each market you looked at, then grade the day." />
      <EodWizard
        key={day}
        day={day}
        available={profile.rules.eodMarkets}
        initial={{
          markets: record?.markets ?? [],
          grade: record?.grade ?? null,
          summary: record?.summary ?? null,
          lesson: record?.lesson ?? null,
          sections,
        }}
        setups={setups}
        dayTrades={dayTrades}
        saved={record !== null}
      />
      {record && (
        <details className="mt-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold text-ink-2">Delete this day</summary>
          <p className="mt-2 mb-3 text-sm text-ink-2">Removes every market section, play and screenshot for {longDate(day)}. Journal trades are not affected.</p>
          <form action={deleteEodDay.bind(null, day)}>
            <Button variant="danger">Delete the review</Button>
          </form>
        </details>
      )}
    </>
  );
}
