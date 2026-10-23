import { z } from "zod";

const optionalNumber = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    if (typeof v === "number") return v;
    const s = v.replace(/[,\s]/g, "");
    if (s === "") return null;
    const n = Number(s);
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: "custom", message: "Not a number" });
      return z.NEVER;
    }
    return n;
  })
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const isoDate = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid date")
  .transform((s) => new Date(s).toISOString());

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const sideSchema = z.enum(["buy", "sell"]);

/** Broker-side fields of a trade, used by manual entry and imports. */
export const tradeInputSchema = z
  .object({
    symbol: z.string().trim().min(1).max(30).transform((s) => s.toUpperCase()),
    side: sideSchema,
    lots: z.coerce.number().positive().max(1000),
    openTime: isoDate,
    closeTime: isoDate.nullable().optional().transform((v) => v ?? null),
    entryPrice: z.coerce.number().positive(),
    exitPrice: optionalNumber,
    stopLoss: optionalNumber,
    takeProfit: optionalNumber,
    grossPnl: optionalNumber,
    commission: optionalNumber,
    swap: optionalNumber,
    netPnl: optionalNumber,
  })
  .refine((t) => (t.closeTime === null) === (t.exitPrice === null), {
    message: "A closed trade needs both a close time and an exit price",
    path: ["exitPrice"],
  })
  .refine((t) => t.closeTime === null || t.closeTime >= t.openTime, {
    message: "Close time is before open time",
    path: ["closeTime"],
  });

export type TradeInput = z.infer<typeof tradeInputSchema>;

/** Journal-side fields: never overwritten by broker sync. */
export const journalFieldsSchema = z.object({
  setup: optionalText(80),
  notes: optionalText(10_000),
  rating: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
    z.number().int().min(1).max(5).nullable(),
  ),
  emotionBefore: optionalText(40),
  emotionAfter: optionalText(40),
  followedPlan: z
    .enum(["yes", "no", ""])
    .optional()
    .transform((v) => (v === "yes" ? true : v === "no" ? false : null)),
  stopLoss: optionalNumber,
  takeProfit: optionalNumber,
  chartUrl: z
    .string()
    .trim()
    .url()
    .refine((u) => u.startsWith("https://"), "Must be an https link")
    .max(500)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export type JournalFields = z.infer<typeof journalFieldsSchema>;

export const planInputSchema = z.object({
  symbol: z.string().trim().min(1).max(30).transform((s) => s.toUpperCase()),
  side: sideSchema,
  setup: optionalText(80),
  entryPrice: optionalNumber,
  stopLoss: optionalNumber,
  takeProfit: optionalNumber,
  riskPercent: optionalNumber,
  thesis: optionalText(5000),
  chartUrl: optionalText(500),
  checklist: z.array(z.object({ label: z.string().max(120), done: z.boolean() })).max(30).default([]),
});

export type PlanInput = z.infer<typeof planInputSchema>;

export const EMOTIONS = [
  "calm",
  "confident",
  "focused",
  "excited",
  "anxious",
  "fearful",
  "frustrated",
  "greedy",
  "bored",
  "tired",
] as const;
