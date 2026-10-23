"use server";

import { rulesSchema } from "@tj/core";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { syncConnection } from "@/lib/data/sync";
import { createServiceClient } from "@/lib/supabase/server";

export type ActionState = { ok?: boolean; message?: string } | null;

const MIN_SYNC_GAP_MS = 60_000;

export async function syncNow(): Promise<ActionState> {
  const { user } = await requireUser();
  const db = createServiceClient();
  const { data: connection } = await db
    .from("broker_connections")
    .select("id, user_id")
    .eq("user_id", user.id)
    .neq("status", "revoked")
    .maybeSingle();
  if (!connection) return { message: "Connect cTrader in Settings first." };

  const { data: last } = await db
    .from("sync_runs")
    .select("started_at")
    .eq("connection_id", connection.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && Date.now() - Date.parse(last.started_at) < MIN_SYNC_GAP_MS) {
    return { message: "A sync ran less than a minute ago. Try again shortly." };
  }

  try {
    const r = await syncConnection(db, connection, "manual");
    refresh();
    return { ok: true, message: `Synced: ${r.dealsFetched} deals, ${r.tradesUpserted} trades updated.` };
  } catch (error) {
    refresh();
    return { message: `Sync failed: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

export async function disconnectBroker(): Promise<void> {
  const { user } = await requireUser();
  const db = createServiceClient();
  const { data: connection } = await db.from("broker_connections").select("id").eq("user_id", user.id).maybeSingle();
  if (connection) {
    await db.from("broker_secrets").delete().eq("connection_id", connection.id);
    await db.from("broker_connections").update({ status: "revoked" }).eq("id", connection.id);
    await db.from("audit_log").insert({ user_id: user.id, action: "ctrader.disconnected", details: {} });
  }
  refresh();
}

const TIMEZONES = Intl.supportedValuesOf("timeZone");

const profileSchema = z.object({
  displayName: z.string().trim().max(80),
  timezone: z.string().refine((tz) => TIMEZONES.includes(tz), "Unknown time zone"),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter code like USD"),
});

export async function saveProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: parsed.error.issues[0]!.message };
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName || null, timezone: parsed.data.timezone, currency: parsed.data.currency })
    .eq("user_id", user.id);
  if (error) return { message: "Could not save profile." };
  refresh();
  return { ok: true, message: "Profile saved." };
}

const numberField = (form: FormData, key: string) => Number(form.get(key));

export async function saveRules(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const parsed = rulesSchema.safeParse({
    checklist: String(form.get("checklist") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    startingBalance: numberField(form, "startingBalance"),
    revengeWindowMinutes: numberField(form, "revengeWindowMinutes"),
    revengeSizeMultiplier: numberField(form, "revengeSizeMultiplier"),
    tiltLossStreak: numberField(form, "tiltLossStreak"),
    tiltWindowMinutes: numberField(form, "tiltWindowMinutes"),
    maxTradesPerDay: numberField(form, "maxTradesPerDay"),
    requireStopLoss: form.get("requireStopLoss") === "on",
    propFirm: {
      enabled: form.get("propEnabled") === "on",
      name: String(form.get("propName") ?? ""),
      accountSize: numberField(form, "propAccountSize"),
      dailyLossPercent: numberField(form, "propDailyLoss"),
      maxLossPercent: numberField(form, "propMaxLoss"),
      profitTargetPercent: numberField(form, "propTarget"),
      warnAtPercent: numberField(form, "propWarnAt"),
    },
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return { message: `Check "${issue.path.join(".")}": ${issue.message}` };
  }
  const { error } = await supabase.from("profiles").update({ rules: parsed.data }).eq("user_id", user.id);
  if (error) return { message: "Could not save rules." };
  refresh();
  return { ok: true, message: "Rules saved." };
}

const tagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function createTag(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const parsed = tagSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Give the tag a name (up to 40 characters)." };
  const { error } = await supabase.from("tags").insert({ ...parsed.data, user_id: user.id });
  if (error) return { message: error.code === "23505" ? "That tag already exists." : "Could not add tag." };
  refresh();
  return { ok: true, message: `Added "${parsed.data.name}".` };
}

export async function deleteTag(form: FormData): Promise<void> {
  const { supabase } = await requireUser();
  const id = z.string().uuid().safeParse(form.get("id"));
  if (id.success) await supabase.from("tags").delete().eq("id", id.data);
  refresh();
}
