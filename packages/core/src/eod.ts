import { z } from "zod";
import type { Side } from "./types";

/**
 * End-of-day review: one entry per day, with a section for each market
 * looked at. Each section records the setups that were there and the plays
 * that presented, including the ones that were missed or skipped on purpose.
 */

export const GRADES = ["A", "B", "C", "D", "F"] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_POINTS: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

export const PLAY_OUTCOMES = ["taken", "missed", "skipped"] as const;
export type PlayOutcome = (typeof PLAY_OUTCOMES)[number];
export const PLAY_OUTCOME_LABELS: Record<PlayOutcome, string> = {
  taken: "Taken",
  missed: "Missed",
  skipped: "Skipped on purpose",
};

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https:\/\/\S+$/.test(v), "Must be an https link");

export const marketSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9._!-]{1,20}$/, "Use a ticker like NQ or GER40");

export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)), "Not a valid date");

const sideSchema = z.enum(["buy", "sell"]);

export const eodPlaySchema = z.object({
  /** HH:MM, local time. */
  presentedAt: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Use HH:MM"),
  setup: text(80),
  side: sideSchema,
  outcome: z.enum(PLAY_OUTCOMES),
  detail: text(2000),
  chartUrl: httpsUrl,
});

export type EodPlay = z.infer<typeof eodPlaySchema>;

/** One market's section of the day, as the form submits it. */
export const eodMarketSchema = z
  .object({
    went: text(5000),
    did: text(5000),
    shouldHave: text(5000),
    chartUrl: httpsUrl,
    noTrade: z.boolean().default(false),
    noSetup: z.boolean().default(false),
    setupsSeen: z.array(z.object({ setup: z.string().trim().min(1).max(80), side: sideSchema })).max(50).default([]),
    plays: z.array(eodPlaySchema).max(20).default([]),
  })
  // A play with nothing written down is an untouched form row, not a play.
  .transform((m) => ({
    ...m,
    plays: m.noTrade ? [] : m.plays.filter((p) => p.presentedAt || p.detail || p.chartUrl),
  }));

export type EodMarket = z.infer<typeof eodMarketSchema>;

export const eodDaySchema = z.object({
  markets: z.array(marketSchema).max(20),
  grade: z.enum(GRADES, { message: "Choose a grade for the day" }),
  summary: text(10_000),
  lesson: text(2000),
});

export type EodDay = z.infer<typeof eodDaySchema>;

/** Average grade on the 4-point scale (A = 4), or null with no graded days. */
export function averageGrade(grades: (Grade | null)[]): number | null {
  const graded = grades.filter((g): g is Grade => g !== null);
  return graded.length ? graded.reduce((s, g) => s + GRADE_POINTS[g], 0) / graded.length : null;
}

export interface PlayCounts {
  taken: number;
  missed: number;
  skipped: number;
}

export interface PlaySummary extends PlayCounts {
  bySetup: (PlayCounts & { setup: string })[];
}

/** How many plays were taken, missed or skipped, overall and per setup (most plays first). */
export function summarizePlays(plays: Pick<EodPlay, "setup" | "outcome">[]): PlaySummary {
  const total: PlayCounts = { taken: 0, missed: 0, skipped: 0 };
  const bySetup = new Map<string, PlayCounts>();
  for (const p of plays) {
    total[p.outcome] += 1;
    const key = p.setup ?? "No setup";
    const counts = bySetup.get(key) ?? { taken: 0, missed: 0, skipped: 0 };
    counts[p.outcome] += 1;
    bySetup.set(key, counts);
  }
  const size = (c: PlayCounts) => c.taken + c.missed + c.skipped;
  return {
    ...total,
    bySetup: [...bySetup.entries()]
      .map(([setup, c]) => ({ setup, ...c }))
      .sort((a, b) => size(b) - size(a) || a.setup.localeCompare(b.setup)),
  };
}

// Backup import ------------------------------------------------------------

/** A day read from an EOD Journal backup file. */
export interface ImportedDay {
  day: string;
  grade: Grade | null;
  summary: string | null;
  lesson: string | null;
  markets: (EodMarket & { market: string; images: string[] })[];
}

const NO_CLEAN_SETUP = "no clean setup";
const OUTCOMES: Record<string, PlayOutcome> = { taken: "taken", missed: "missed", "skipped on purpose": "skipped" };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const toSide = (v: unknown): Side => (str(v).toLowerCase() === "short" ? "sell" : "buy");

const isHttps = (v: string) => /^https:\/\/\S+$/.test(v) && v.length <= 500;

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join("\n\n") || null;

/**
 * Reads the JSON backup of the standalone EOD Journal app (an array of days).
 * Lenient by design: unknown fields are ignored, bad days are skipped and
 * counted, and legacy fields (opps, m5/m1 links) are folded into the text.
 * `images` holds what the backup had for screenshots: data URLs, or storage
 * paths of the other app, which cannot be fetched from here.
 */
export function parseEodBackup(input: unknown): { days: ImportedDay[]; skipped: number } {
  if (!Array.isArray(input)) throw new Error("Expected a list of days");
  const days: ImportedDay[] = [];
  let skipped = 0;

  for (const raw of input) {
    const d = (raw ?? {}) as Record<string, unknown>;
    const day = daySchema.safeParse(d.date);
    const entries = (d.entries && typeof d.entries === "object" ? d.entries : null) as Record<string, Record<string, unknown>> | null;
    if (!day.success || !entries) {
      skipped += 1;
      continue;
    }

    const order = Array.isArray(d.assets) ? d.assets.map(str).filter(Boolean) : Object.keys(entries);
    const markets: ImportedDay["markets"] = [];
    for (const name of order) {
      const market = marketSchema.safeParse(name);
      const e = entries[name];
      if (!market.success || !e) continue;

      const tags = Array.isArray(e.setups) ? e.setups.map(str) : [];
      const setupsSeen = tags.flatMap((t) => {
        const [setup, dir] = t.split("|").map((s) => s.trim());
        return setup && t.toLowerCase() !== NO_CLEAN_SETUP ? [{ setup: setup.slice(0, 80), side: toSide(dir) }] : [];
      });
      // The first https chart link becomes the section's link; any others stay as text.
      const links = [["Chart", str(e.link)], ["m5 HA chart", str(e.m5link)], ["m1 chart", str(e.m1link)]].filter(([, u]) => u);
      const chartUrl = links.find(([, u]) => isHttps(u!))?.[1] ?? null;
      const linkNotes = links.filter(([, u]) => u !== chartUrl).map(([label, u]) => `${label}: ${u}`);
      const plays = (Array.isArray(e.trades) ? e.trades : []).map((t: Record<string, unknown>) => {
        const playLink = str(t.link);
        return {
          presentedAt: /^([01]\d|2[0-3]):[0-5]\d$/.test(str(t.time)) ? str(t.time) : null,
          setup: str(t.type).slice(0, 80) || null,
          side: toSide(t.dir),
          outcome: OUTCOMES[str(t.taken).toLowerCase()] ?? "taken",
          detail: join(str(t.detail), playLink && !isHttps(playLink) ? `Link: ${playLink}` : null)?.slice(0, 2000) ?? null,
          chartUrl: isHttps(playLink) ? playLink : null,
        };
      });

      const parsed = eodMarketSchema.safeParse({
        went: join(str(e.went), str(e.opps) && `Opportunities: ${str(e.opps)}`, ...linkNotes)?.slice(0, 5000),
        did: str(e.did).slice(0, 5000),
        shouldHave: str(e.should).slice(0, 5000),
        chartUrl,
        noTrade: e.notrade === true,
        noSetup: tags.some((t) => t.toLowerCase() === NO_CLEAN_SETUP),
        setupsSeen: setupsSeen.slice(0, 50),
        plays: plays.slice(0, 20),
      });
      if (!parsed.success) continue;
      const images = [...(Array.isArray(e.imgs) ? e.imgs : []), e.m5, e.m1].map(str).filter(Boolean);
      markets.push({ ...parsed.data, market: market.data, images });
    }

    const grade = GRADES.find((g) => g === str(d.grade)) ?? null;
    days.push({
      day: day.data,
      grade,
      summary: str(d.summary).slice(0, 10_000) || null,
      lesson: str(d.learn).slice(0, 2000) || null,
      markets,
    });
  }
  return { days, skipped };
}
