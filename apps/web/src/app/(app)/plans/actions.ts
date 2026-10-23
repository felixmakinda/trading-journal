"use server";

import { checklistFor, planInputSchema } from "@tj/core";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { listModels } from "@/lib/data/playbook";
import { getProfile } from "@/lib/data/trades";

export type ActionState = { ok?: boolean; message?: string; fieldErrors?: Record<string, string> } | null;

export async function createPlan(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const [{ rules }, models] = await Promise.all([getProfile(supabase, user.id), listModels(supabase)]);
  const checked = new Set(form.getAll("check").map(String));
  const raw = Object.fromEntries(form) as Record<string, string>;
  // Same list the form showed: the setup's own checklist, or the general one.
  const checklist = checklistFor(raw.setup, models, rules);
  const parsed = planInputSchema.safeParse({
    ...raw,
    checklist: checklist.map((label, i) => ({ label, done: checked.has(String(i)) })),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { message: "Please fix the highlighted fields.", fieldErrors };
  }
  const p = parsed.data;
  const { error } = await supabase.from("trade_plans").insert({
    user_id: user.id,
    symbol: p.symbol,
    side: p.side,
    setup: p.setup,
    entry_price: p.entryPrice,
    stop_loss: p.stopLoss,
    take_profit: p.takeProfit,
    risk_percent: p.riskPercent,
    thesis: p.thesis,
    chart_url: p.chartUrl,
    checklist: p.checklist,
  });
  if (error) return { message: "Could not save the plan." };
  redirect("/plans");
}

const statusSchema = z.enum(["planned", "taken", "skipped", "cancelled"]);

export async function setPlanStatus(planId: string, status: string): Promise<void> {
  const { supabase } = await requireUser();
  const s = statusSchema.safeParse(status);
  if (!s.success || !z.string().uuid().safeParse(planId).success) return;
  await supabase.from("trade_plans").update({ status: s.data }).eq("id", planId);
  refresh();
}
