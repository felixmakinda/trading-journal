"use server";

import { modelInputSchema } from "@tj/core";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export type ActionState = { ok?: boolean; message?: string; fieldErrors?: Record<string, string> } | null;

const uuid = z.string().uuid();

function parseModel(form: FormData) {
  return modelInputSchema.safeParse({
    ...Object.fromEntries(form),
    checklist: String(form.get("checklist") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  });
}

function columns(m: z.infer<typeof modelInputSchema>) {
  return {
    name: m.name,
    description: m.description,
    checklist: m.checklist,
    target_r: m.targetR,
    breakeven_r: m.breakevenR,
    max_attempts: m.maxAttempts,
    entry_window_minutes: m.entryWindowMinutes,
  };
}

function failure(error: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
  return { message: "Please fix the highlighted fields.", fieldErrors };
}

const DUPLICATE = { message: "A model with that name already exists.", fieldErrors: { name: "Already in your playbook" } };

export async function createModel(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const parsed = parseModel(form);
  if (!parsed.success) return failure(parsed.error);
  const { error } = await supabase.from("playbook_models").insert({ ...columns(parsed.data), user_id: user.id });
  if (error) return error.code === "23505" ? DUPLICATE : { message: "Could not save the model." };
  refresh();
  return { ok: true, message: `Added "${parsed.data.name}".` };
}

/** Renaming also renames the setup on its trades and plans (database trigger). */
export async function updateModel(modelId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(modelId).success) return { message: "Unknown model." };
  const parsed = parseModel(form);
  if (!parsed.success) return failure(parsed.error);
  const { error } = await supabase.from("playbook_models").update(columns(parsed.data)).eq("id", modelId);
  if (error) return error.code === "23505" ? DUPLICATE : { message: "Could not save the model." };
  refresh();
  return { ok: true, message: "Model saved." };
}

export async function setModelArchived(modelId: string, archived: boolean): Promise<void> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(modelId).success) return;
  await supabase.from("playbook_models").update({ archived }).eq("id", modelId);
  refresh();
}

/** Trades keep their setup name; they just stop having rules attached. */
export async function deleteModel(modelId: string): Promise<void> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(modelId).success) return;
  await supabase.from("playbook_models").delete().eq("id", modelId);
  refresh();
}
