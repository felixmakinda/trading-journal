"use server";

import { MAX_IMPORT_ROWS, tradeInputSchema, type TradeInput } from "@tj/core";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { brokerColumns } from "../trades/derive";

export type ImportState = { ok?: boolean; message?: string } | null;

const key = (t: { symbol: string; side: string; open_time: string; entry_price: number; lots: number }) =>
  `${t.symbol}|${t.side}|${new Date(t.open_time).toISOString()}|${Number(t.entry_price)}|${Number(t.lots)}`;

/** The browser maps columns; the server re-validates every row and skips duplicates. */
export async function importTrades(_: ImportState, form: FormData): Promise<ImportState> {
  const { supabase, user } = await requireUser();
  let rows: unknown;
  try {
    rows = JSON.parse(String(form.get("trades") ?? "[]"));
  } catch {
    return { message: "Could not read the import." };
  }
  const list = z.array(z.unknown()).max(MAX_IMPORT_ROWS).safeParse(rows);
  if (!list.success) return { message: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` };

  const valid: TradeInput[] = [];
  let invalid = 0;
  for (const row of list.data) {
    const parsed = tradeInputSchema.safeParse(row);
    if (parsed.success) valid.push(parsed.data);
    else invalid++;
  }
  if (!valid.length) return { message: "No valid rows to import." };

  const times = valid.map((t) => t.openTime).sort();
  const { data: existing } = await supabase
    .from("trades")
    .select("symbol, side, open_time, entry_price, lots")
    .gte("open_time", times[0]!)
    .lte("open_time", times[times.length - 1]!);
  const seen = new Set((existing ?? []).map(key));

  const inserts = valid
    .map((t) => ({ ...brokerColumns(t), user_id: user.id, source: "import" as const }))
    .filter((t) => {
      const k = key(t);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  if (inserts.length) {
    const { error } = await supabase.from("trades").insert(inserts);
    if (error) return { message: `Import failed: ${error.message}` };
  }
  refresh();
  const skipped = valid.length - inserts.length;
  return {
    ok: true,
    message: `Imported ${inserts.length} trades.${skipped ? ` Skipped ${skipped} already in your journal.` : ""}${invalid ? ` ${invalid} invalid rows ignored.` : ""}`,
  };
}
