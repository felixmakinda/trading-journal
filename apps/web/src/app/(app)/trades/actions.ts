"use server";

import { journalFieldsSchema, rMultiple, tradeInputSchema } from "@tj/core";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/data/trades";
import { fromLocalInput } from "@/lib/format";
import type { ServerClient } from "@/lib/supabase/server";
import { brokerColumns } from "./derive";

export type ActionState = { ok?: boolean; message?: string; fieldErrors?: Record<string, string> } | null;

const uuid = z.string().uuid();
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

async function parseTradeForm(supabase: ServerClient, userId: string, form: FormData) {
  const { timezone } = await getProfile(supabase, userId);
  const raw = Object.fromEntries(form) as Record<string, string>;
  return tradeInputSchema.safeParse({
    ...raw,
    openTime: fromLocalInput(raw.openTime ?? "", timezone) ?? raw.openTime,
    closeTime: raw.closeTime ? fromLocalInput(raw.closeTime, timezone) : null,
  });
}

function fieldErrors(error: z.ZodError): ActionState {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
  return { message: "Please fix the highlighted fields.", fieldErrors: errors };
}

export async function createTrade(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const parsed = await parseTradeForm(supabase, user.id, form);
  if (!parsed.success) return fieldErrors(parsed.error);
  const { data, error } = await supabase
    .from("trades")
    .insert({ ...brokerColumns(parsed.data), user_id: user.id, source: "manual" })
    .select("id")
    .single();
  if (error || !data) return { message: "Could not save the trade." };
  redirect(`/trades/${data.id}`);
}

/** Editing broker fields by hand marks the trade so future syncs leave it alone (ADR 006). */
export async function updateTrade(tradeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  if (!uuid.safeParse(tradeId).success) return { message: "Unknown trade." };
  const parsed = await parseTradeForm(supabase, user.id, form);
  if (!parsed.success) return fieldErrors(parsed.error);
  const { data: current } = await supabase.from("trades").select("source").eq("id", tradeId).single();
  const { error } = await supabase
    .from("trades")
    .update({ ...brokerColumns(parsed.data), manually_edited: current?.source === "ctrader" })
    .eq("id", tradeId);
  if (error) return { message: "Could not save the trade." };
  refresh();
  return { ok: true, message: "Trade updated." };
}

/** Lets the next sync overwrite manual edits with the broker's numbers again. */
export async function resetToBroker(tradeId: string): Promise<void> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(tradeId).success) return;
  await supabase.from("trades").update({ manually_edited: false }).eq("id", tradeId);
  refresh();
}

export async function saveJournal(tradeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  if (!uuid.safeParse(tradeId).success) return { message: "Unknown trade." };
  const parsed = journalFieldsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrors(parsed.error);
  const j = parsed.data;

  const { data: trade } = await supabase
    .from("trades")
    .select("side, entry_price, exit_price")
    .eq("id", tradeId)
    .single();
  if (!trade) return { message: "Unknown trade." };

  const tagIds = form.getAll("tags").map(String).filter((id) => uuid.safeParse(id).success);
  const planId = String(form.get("planId") ?? "");

  const { error } = await supabase
    .from("trades")
    .update({
      setup: j.setup,
      notes: j.notes,
      rating: j.rating,
      emotion_before: j.emotionBefore,
      emotion_after: j.emotionAfter,
      followed_plan: j.followedPlan,
      stop_loss: j.stopLoss,
      take_profit: j.takeProfit,
      chart_url: j.chartUrl,
      plan_id: uuid.safeParse(planId).success ? planId : null,
      r_multiple:
        trade.exit_price === null
          ? null
          : rMultiple(trade.side as "buy" | "sell", Number(trade.entry_price), Number(trade.exit_price), j.stopLoss),
    })
    .eq("id", tradeId);
  if (error) return { message: "Could not save the journal entry." };

  await supabase.from("trade_tags").delete().eq("trade_id", tradeId);
  if (tagIds.length) {
    await supabase.from("trade_tags").insert(tagIds.map((tag_id) => ({ trade_id: tradeId, tag_id, user_id: user.id })));
  }
  if (uuid.safeParse(planId).success) {
    await supabase.from("trade_plans").update({ status: "taken" }).eq("id", planId);
  }
  refresh();
  return { ok: true, message: "Journal saved." };
}

export async function deleteTrade(tradeId: string): Promise<void> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(tradeId).success) return;
  // Synced trades would come straight back on the next sync, so only manual/imported ones can be deleted.
  const { data: attachments } = await supabase.from("attachments").select("storage_path").eq("trade_id", tradeId);
  await supabase.from("trades").delete().eq("id", tradeId).neq("source", "ctrader");
  if (attachments?.length) await supabase.storage.from("attachments").remove(attachments.map((a) => a.storage_path));
  redirect("/trades");
}

export async function uploadAttachment(tradeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  if (!uuid.safeParse(tradeId).success) return { message: "Unknown trade." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose an image first." };
  if (file.size > MAX_UPLOAD_BYTES) return { message: "Images must be 5 MB or smaller." };
  const ext = ALLOWED_TYPES[file.type as keyof typeof ALLOWED_TYPES];
  if (!ext) return { message: "Use a PNG, JPEG or WebP image." };

  // Check the file really is the image type it claims to be.
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isWebp = String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP";
  if (!({ png: isPng, jpg: isJpeg, webp: isWebp })[ext]) return { message: "That file is not a valid image." };

  const path = `${user.id}/${tradeId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type });
  if (uploadError) return { message: "Upload failed." };
  const { error } = await supabase
    .from("attachments")
    .insert({ user_id: user.id, trade_id: tradeId, storage_path: path, mime_type: file.type, size_bytes: file.size });
  if (error) {
    await supabase.storage.from("attachments").remove([path]);
    return { message: "Upload failed." };
  }
  refresh();
  return { ok: true, message: "Screenshot added." };
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(attachmentId).success) return;
  const { data } = await supabase.from("attachments").delete().eq("id", attachmentId).select("storage_path").maybeSingle();
  if (data) await supabase.storage.from("attachments").remove([data.storage_path]);
  refresh();
}
