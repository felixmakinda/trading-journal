import "server-only";
import type { EodMarket, Grade } from "@tj/core";
import type { ServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];

export interface EodImage {
  id: string;
  url: string;
}

/** One market's section of a day, ready for the form or the review list. */
export interface EodSection extends EodMarket {
  id: string;
  market: string;
  images: EodImage[];
}

export interface EodDayRecord {
  day: string;
  grade: Grade | null;
  summary: string | null;
  lesson: string | null;
  markets: string[];
  sections: EodSection[];
}

const SELECT = "day, grade, notes, lesson, markets, eod_sessions(*, eod_plays(*), attachments(id, storage_path))";

type Row = Pick<Tables["daily_journal"]["Row"], "day" | "grade" | "notes" | "lesson" | "markets"> & {
  eod_sessions: (Tables["eod_sessions"]["Row"] & {
    eod_plays: Tables["eod_plays"]["Row"][];
    attachments: { id: string; storage_path: string }[];
  })[];
};

/** Signed URLs last an hour: long enough to fill in a day without images expiring. */
async function toRecords(supabase: ServerClient, rows: Row[], signImages = true): Promise<EodDayRecord[]> {
  const paths = signImages ? rows.flatMap((r) => r.eod_sessions.flatMap((s) => s.attachments.map((a) => a.storage_path))) : [];
  const signed = paths.length ? ((await supabase.storage.from("attachments").createSignedUrls(paths, 3600)).data ?? []) : [];
  const urlOf = new Map(signed.map((s) => [s.path, s.signedUrl]));

  return rows.map((r) => {
    const order = (market: string) => {
      const i = r.markets.indexOf(market);
      return i === -1 ? r.markets.length : i;
    };
    return {
      day: r.day,
      grade: r.grade as Grade | null,
      summary: r.notes,
      lesson: r.lesson,
      markets: r.markets,
      sections: r.eod_sessions
        .sort((a, b) => order(a.market) - order(b.market) || a.market.localeCompare(b.market))
        .map((s) => ({
          id: s.id,
          market: s.market,
          went: s.went,
          did: s.did,
          shouldHave: s.should_have,
          chartUrl: s.chart_url,
          noTrade: s.no_trade,
          noSetup: s.no_setup,
          setupsSeen: Array.isArray(s.setups_seen) ? (s.setups_seen as EodMarket["setupsSeen"]) : [],
          plays: s.eod_plays
            .sort((a, b) => a.position - b.position)
            .map((p) => ({
              presentedAt: p.presented_at?.slice(0, 5) ?? null,
              setup: p.setup,
              side: p.side as "buy" | "sell",
              outcome: p.outcome as EodMarket["plays"][number]["outcome"],
              detail: p.detail,
              chartUrl: p.chart_url,
            })),
          images: s.attachments.flatMap((a) => (urlOf.get(a.storage_path) ? [{ id: a.id, url: urlOf.get(a.storage_path)! }] : [])),
        })),
    };
  });
}

export async function getEodDay(supabase: ServerClient, day: string): Promise<EodDayRecord | null> {
  const { data, error } = await supabase.from("daily_journal").select(SELECT).eq("day", day).maybeSingle();
  if (error) throw new Error(`Could not load the day: ${error.message}`);
  return data ? (await toRecords(supabase, [data as unknown as Row]))[0]! : null;
}

/**
 * Days between two YYYY-MM-DD dates (inclusive, either may be open), newest
 * first. Without `signImages`, sections come back without screenshots.
 */
export async function listEodDays(
  supabase: ServerClient,
  range: { from?: string; to?: string } = {},
  signImages = true,
): Promise<EodDayRecord[]> {
  let query = supabase.from("daily_journal").select(SELECT).order("day", { ascending: false });
  if (range.from) query = query.gte("day", range.from);
  if (range.to) query = query.lte("day", range.to);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load the end-of-day review: ${error.message}`);
  return toRecords(supabase, data as unknown as Row[], signImages);
}
