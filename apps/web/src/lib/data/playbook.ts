import "server-only";
import type { PlaybookModel } from "@tj/core";
import type { ServerClient } from "@/lib/supabase/server";

/** The user's playbook models, active ones first, then by name. */
export async function listModels(supabase: ServerClient): Promise<PlaybookModel[]> {
  const { data, error } = await supabase.from("playbook_models").select("*").order("archived").order("name");
  if (error) throw new Error(`Could not load playbook: ${error.message}`);
  return data.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    checklist: Array.isArray(m.checklist) ? m.checklist.filter((c): c is string => typeof c === "string") : [],
    targetR: m.target_r === null ? null : Number(m.target_r),
    breakevenR: m.breakeven_r === null ? null : Number(m.breakeven_r),
    maxAttempts: m.max_attempts,
    entryWindowMinutes: m.entry_window_minutes,
    archived: m.archived,
  }));
}
