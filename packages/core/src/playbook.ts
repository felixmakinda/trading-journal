import { z } from "zod";
import type { Rules } from "./rules";
import type { Trade } from "./types";

/**
 * A named setup with its own rules. Trades and plans link to a model through
 * their setup name (case-insensitive), so existing setups pick up a model as
 * soon as one with the same name is created.
 */
export interface PlaybookModel {
  id: string;
  name: string;
  description: string | null;
  checklist: string[];
  targetR: number | null;
  breakevenR: number | null;
  maxAttempts: number | null;
  /** Minutes after the session open during which the setup is valid. */
  entryWindowMinutes: number | null;
  archived: boolean;
}

const optionalPositive = (max: number, int = false) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
    (int ? z.number().int() : z.number()).positive().max(max).nullable(),
  );

export const modelInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  checklist: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  targetR: optionalPositive(100),
  breakevenR: optionalPositive(100),
  maxAttempts: optionalPositive(10, true),
  entryWindowMinutes: optionalPositive(1440, true),
});

export type ModelInput = z.infer<typeof modelInputSchema>;

export function findModel<M extends Pick<PlaybookModel, "name">>(setup: string | null | undefined, models: M[]): M | null {
  if (!setup) return null;
  const key = setup.trim().toLowerCase();
  return models.find((m) => m.name.toLowerCase() === key) ?? null;
}

/** The checklist for a setup: the model's own when it has one, otherwise the general one from Rules. */
export function checklistFor(setup: string | null | undefined, models: PlaybookModel[], rules: Rules): string[] {
  const model = findModel(setup, models);
  return model?.checklist.length ? model.checklist : rules.checklist;
}

/** Take-profit price that pays `targetR` times the risk between entry and stop. */
export function targetPrice(entry: number, stop: number, targetR: number): number | null {
  const risk = entry - stop;
  if (risk === 0) return null;
  return entry + risk * targetR;
}

export interface ModelResult {
  trades: number;
  /** Closed trades with an R multiple. */
  measured: number;
  /** Measured trades that reached the model's target R. */
  targetHits: number;
  /** Average R across measured trades. */
  avgR: number | null;
}

type Measurable = Pick<Trade, "status"> & { rMultiple: number | null };

/** How trades of one model did against its target. */
export function modelResult(model: Pick<PlaybookModel, "targetR">, trades: Measurable[]): ModelResult {
  const measured = trades.flatMap((t) => (t.status === "closed" && t.rMultiple !== null ? [t.rMultiple] : []));
  // Small tolerance: a 4R target closed a tick early still counts as reached.
  const targetHits = model.targetR === null ? 0 : measured.filter((r) => r >= model.targetR! - 0.05).length;
  return {
    trades: trades.length,
    measured: measured.length,
    targetHits,
    avgR: measured.length ? measured.reduce((s, r) => s + r, 0) / measured.length : null,
  };
}
