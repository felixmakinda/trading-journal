import { toCsv } from "@tj/core";
import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { listTrades } from "@/lib/data/trades";

const COLUMNS = [
  "id", "source", "symbol", "side", "status", "lots", "volume", "openTime", "closeTime",
  "entryPrice", "exitPrice", "stopLoss", "takeProfit", "grossPnl", "commission", "swap",
  "netPnl", "pips", "rMultiple", "setup", "tags", "rating", "emotionBefore", "emotionAfter",
  "followedPlan", "chartUrl", "notes",
];

/** Full data export (ADR 004): the trader can take everything with them at any time. */
export async function GET(request: NextRequest) {
  const { supabase } = await requireUser();
  const trades = await listTrades(supabase);
  const stamp = new Date().toISOString().slice(0, 10);

  if (request.nextUrl.searchParams.get("format") === "json") {
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), trades }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="trades-${stamp}.json"`,
      },
    });
  }

  const rows = trades.map((t) => ({ ...t, tags: t.tags?.join("|") ?? "" }));
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="trades-${stamp}.csv"`,
    },
  });
}
