import { z } from "zod";

export const DEFAULT_CHECKLIST = [
  "Higher-timeframe trend agrees",
  "Clear invalidation level for the stop",
  "Risk is within my per-trade limit",
  "No high-impact news in the next 30 minutes",
  "This setup is in my playbook",
];

/** User-tunable thresholds. Stored as JSON on the profile and validated on every read. */
export const rulesSchema = z.object({
  checklist: z.array(z.string().trim().min(1).max(120)).max(20).default(DEFAULT_CHECKLIST),
  startingBalance: z.number().nonnegative().default(0),
  revengeWindowMinutes: z.number().int().min(1).max(1440).default(30),
  revengeSizeMultiplier: z.number().min(1).max(10).default(1.5),
  tiltLossStreak: z.number().int().min(2).max(20).default(3),
  tiltWindowMinutes: z.number().int().min(1).max(1440).default(20),
  maxTradesPerDay: z.number().int().min(1).max(200).default(6),
  requireStopLoss: z.boolean().default(true),
  propFirm: z
    .object({
      enabled: z.boolean().default(false),
      name: z.string().max(80).default(""),
      accountSize: z.number().positive().default(10_000),
      dailyLossPercent: z.number().min(0.1).max(100).default(5),
      maxLossPercent: z.number().min(0.1).max(100).default(10),
      profitTargetPercent: z.number().min(0).max(1000).default(10),
      warnAtPercent: z.number().min(1).max(100).default(70),
    })
    .default({
      enabled: false,
      name: "",
      accountSize: 10_000,
      dailyLossPercent: 5,
      maxLossPercent: 10,
      profitTargetPercent: 10,
      warnAtPercent: 70,
    }),
});

export type Rules = z.infer<typeof rulesSchema>;

export function parseRules(value: unknown): Rules {
  const parsed = rulesSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : rulesSchema.parse({});
}
