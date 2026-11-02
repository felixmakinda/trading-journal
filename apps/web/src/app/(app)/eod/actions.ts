"use server";

import { daySchema, eodDaySchema, eodMarketSchema, marketSchema, parseEodBackup, type EodMarket } from "@tj/core";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { checkImage } from "@/lib/images";
import type { ServerClient } from "@/lib/supabase/server";

export type ActionState = { ok?: boolean; message?: string; fieldErrors?: Record<string, string> } | null;

const marketsSchema = z.array(marketSchema).max(20);
const uuid = z.string().uuid();

function firstIssue(error: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".") || "form"] ??= issue.message;
  return { message: error.issues[0]?.message ?? "Please check the form.", fieldErrors };
}

/** Creates the day if needed and records which markets it covers, in order. */
async function upsertDay(supabase: ServerClient, userId: string, day: string, markets: string[]) {
  const { error } = await supabase.from("daily_journal").upsert({ user_id: userId, day, markets }, { onConflict: "user_id,day" });
  if (error) throw new Error(error.message);
}

const sessionColumns = (m: EodMarket) => ({
  went: m.went,
  did: m.did,
  should_have: m.shouldHave,
  chart_url: m.chartUrl,
  no_trade: m.noTrade,
  no_setup: m.noSetup,
  setups_seen: m.setupsSeen,
});

async function replacePlays(supabase: ServerClient, userId: string, sessionId: string, plays: EodMarket["plays"]) {
  await supabase.from("eod_plays").delete().eq("session_id", sessionId);
  if (!plays.length) return;
  const { error } = await supabase.from("eod_plays").insert(
    plays.map((p, position) => ({
      user_id: userId,
      session_id: sessionId,
      position,
      presented_at: p.presentedAt,
      setup: p.setup,
      side: p.side,
      outcome: p.outcome,
      detail: p.detail,
      chart_url: p.chartUrl,
    })),
  );
  if (error) throw new Error(error.message);
}

/** Saves one market's section. Called as the trader moves to the next market, so nothing typed is lost. */
export async function saveEodMarket(day: string, markets: string[], market: string, input: unknown): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const d = daySchema.safeParse(day);
  const ms = marketsSchema.safeParse(markets);
  const m = marketSchema.safeParse(market);
  if (!d.success || !ms.success || !m.success) return { message: "Unknown day or market." };
  const parsed = eodMarketSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  try {
    await upsertDay(supabase, user.id, d.data, ms.data);
    const { data: session, error } = await supabase
      .from("eod_sessions")
      .upsert({ user_id: user.id, day: d.data, market: m.data, ...sessionColumns(parsed.data) }, { onConflict: "user_id,day,market" })
      .select("id")
      .single();
    if (error || !session) throw new Error(error?.message);
    await replacePlays(supabase, user.id, session.id, parsed.data.plays);
  } catch {
    return { message: `Could not save ${m.data}.` };
  }
  return { ok: true, message: `${m.data} saved.` };
}

async function removeSessionFiles(supabase: ServerClient, sessionIds: string[]) {
  if (!sessionIds.length) return;
  const { data } = await supabase.from("attachments").select("storage_path").in("eod_session_id", sessionIds);
  if (data?.length) await supabase.storage.from("attachments").remove(data.map((a) => a.storage_path));
}

/** Final step: grade and summary. Markets that were unticked lose their section. */
export async function saveEodDay(day: string, input: unknown): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const d = daySchema.safeParse(day);
  if (!d.success) return { message: "Unknown day." };
  const parsed = eodDaySchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const { markets, grade, summary, lesson } = parsed.data;

  const { error } = await supabase
    .from("daily_journal")
    .upsert({ user_id: user.id, day: d.data, markets, grade, notes: summary, lesson }, { onConflict: "user_id,day" });
  if (error) return { message: "Could not save the day." };

  const { data: stale } = await supabase
    .from("eod_sessions")
    .select("id, market")
    .eq("day", d.data);
  const dropped = (stale ?? []).filter((s) => !markets.includes(s.market)).map((s) => s.id);
  if (dropped.length) {
    await removeSessionFiles(supabase, dropped);
    await supabase.from("eod_sessions").delete().in("id", dropped);
  }
  refresh();
  return { ok: true, message: "Day saved." };
}

export type UploadResult = { ok: true; image: { id: string; url: string } } | { ok: false; message: string };

/** Adds a chart screenshot to a market's section, creating the section if it has not been saved yet. */
export async function uploadEodChart(day: string, markets: string[], market: string, form: FormData): Promise<UploadResult> {
  const { supabase, user } = await requireUser();
  const d = daySchema.safeParse(day);
  const ms = marketsSchema.safeParse(markets);
  const m = marketSchema.safeParse(market);
  if (!d.success || !ms.success || !m.success) return { ok: false, message: "Unknown day or market." };
  const image = await checkImage(form.get("file"));
  if ("error" in image) return { ok: false, message: image.error };

  let sessionId: string;
  try {
    await upsertDay(supabase, user.id, d.data, ms.data);
    const { data: existing } = await supabase.from("eod_sessions").select("id").eq("day", d.data).eq("market", m.data).maybeSingle();
    if (existing) sessionId = existing.id;
    else {
      const { data: created, error } = await supabase
        .from("eod_sessions")
        .insert({ user_id: user.id, day: d.data, market: m.data })
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message);
      sessionId = created.id;
    }
  } catch {
    return { ok: false, message: "Upload failed." };
  }

  const path = `${user.id}/eod/${sessionId}/${crypto.randomUUID()}.${image.ext}`;
  const { error: uploadError } = await supabase.storage.from("attachments").upload(path, image.file, { contentType: image.file.type });
  if (uploadError) return { ok: false, message: "Upload failed." };
  const { data: row, error } = await supabase
    .from("attachments")
    .insert({ user_id: user.id, eod_session_id: sessionId, storage_path: path, mime_type: image.file.type, size_bytes: image.file.size })
    .select("id")
    .single();
  if (error || !row) {
    await supabase.storage.from("attachments").remove([path]);
    return { ok: false, message: "Upload failed." };
  }
  const { data: signed } = await supabase.storage.from("attachments").createSignedUrl(path, 3600);
  return { ok: true, image: { id: row.id, url: signed?.signedUrl ?? "" } };
}

export async function deleteEodChart(attachmentId: string): Promise<void> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(attachmentId).success) return;
  const { data } = await supabase
    .from("attachments")
    .delete()
    .eq("id", attachmentId)
    .not("eod_session_id", "is", null)
    .select("storage_path")
    .maybeSingle();
  if (data) await supabase.storage.from("attachments").remove([data.storage_path]);
}

/** Deletes the day with every section, play and screenshot in it. */
export async function deleteEodDay(day: string): Promise<void> {
  const { supabase } = await requireUser();
  const d = daySchema.safeParse(day);
  if (!d.success) return;
  const { data: sessions } = await supabase.from("eod_sessions").select("id").eq("day", d.data);
  await removeSessionFiles(supabase, (sessions ?? []).map((s) => s.id));
  await supabase.from("daily_journal").delete().eq("day", d.data);
  redirect(`/eod?month=${d.data.slice(0, 7)}`);
}

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/** Imports a backup from the standalone EOD Journal app. Days already in the journal are left alone. */
export async function importEodBackup(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose the backup file first." };
  if (file.size > MAX_BACKUP_BYTES) {
    return { message: "That backup is over 5 MB, so it probably has screenshots inside. Export it again from the newer EOD Journal (Backup → Download), which keeps them out." };
  }

  let parsed: ReturnType<typeof parseEodBackup>;
  try {
    parsed = parseEodBackup(JSON.parse(await file.text()));
  } catch {
    return { message: "That is not an EOD Journal backup (expected a JSON list of days)." };
  }

  const { data: existing } = await supabase.from("daily_journal").select("day");
  const taken = new Set((existing ?? []).map((r) => r.day));
  let imported = 0;
  let already = 0;
  let failed = 0;
  let images = 0;
  let missingImages = 0;

  for (const d of parsed.days) {
    if (taken.has(d.day)) {
      already += 1;
      continue;
    }
    const { error } = await supabase.from("daily_journal").insert({
      user_id: user.id,
      day: d.day,
      grade: d.grade,
      notes: d.summary,
      lesson: d.lesson,
      markets: d.markets.map((m) => m.market),
    });
    if (error) {
      failed += 1;
      continue;
    }
    imported += 1;

    for (const m of d.markets) {
      const { data: session } = await supabase
        .from("eod_sessions")
        .insert({ user_id: user.id, day: d.day, market: m.market, ...sessionColumns(m) })
        .select("id")
        .single();
      if (!session) continue;
      await replacePlays(supabase, user.id, session.id, m.plays).catch(() => undefined);

      for (const src of m.images) {
        // Screenshots stored in the other app's cloud cannot be fetched from here; embedded ones can.
        const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(src);
        if (!match) {
          missingImages += 1;
          continue;
        }
        const image = await checkImage(new File([Buffer.from(match[2]!, "base64")], "chart", { type: match[1] }));
        if ("error" in image) {
          missingImages += 1;
          continue;
        }
        const path = `${user.id}/eod/${session.id}/${crypto.randomUUID()}.${image.ext}`;
        const { error: uploadError } = await supabase.storage.from("attachments").upload(path, image.file, { contentType: image.file.type });
        if (uploadError) {
          missingImages += 1;
          continue;
        }
        await supabase
          .from("attachments")
          .insert({ user_id: user.id, eod_session_id: session.id, storage_path: path, mime_type: image.file.type, size_bytes: image.file.size });
        images += 1;
      }
    }
  }

  refresh();
  const parts = [
    `Imported ${imported} ${imported === 1 ? "day" : "days"}`,
    images && `${images} screenshots`,
    already && `${already} already in the journal`,
    (parsed.skipped || failed) && `${parsed.skipped + failed} could not be read or saved`,
  ].filter(Boolean);
  const note = missingImages
    ? ` ${missingImages} screenshots were stored in the other app's cloud and could not be copied; add them again from its Review page if you need them.`
    : "";
  return { ok: true, message: `${parts.join(", ")}.${note}` };
}
