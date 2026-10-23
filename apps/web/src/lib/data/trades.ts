import "server-only";
import { DEFAULT_TIMEZONE, localParts, parseRules, type Rules, type Trade } from "@tj/core";
import type { ServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type TradeRow = Database["public"]["Tables"]["trades"]["Row"];

export interface TagRef {
  id: string;
  name: string;
  color: string;
}

export interface JournalTrade extends Trade {
  source: TradeRow["source"];
  lots: number;
  pips: number | null;
  rMultiple: number | null;
  rating: number | null;
  emotionBefore: string | null;
  emotionAfter: string | null;
  notes: string | null;
  chartUrl: string | null;
  planId: string | null;
  manuallyEdited: boolean;
  tagRefs: TagRef[];
}

export const TRADE_SELECT = "*, trade_tags(tags(id, name, color))";

type TradeRowWithTags = TradeRow & { trade_tags: { tags: TagRef | null }[] };

export function toJournalTrade(row: TradeRowWithTags): JournalTrade {
  const tagRefs = row.trade_tags.flatMap((t) => (t.tags ? [t.tags] : []));
  return {
    id: row.id,
    source: row.source,
    symbol: row.symbol,
    side: row.side as Trade["side"],
    status: row.status as Trade["status"],
    volume: Number(row.volume),
    lots: Number(row.lots),
    openTime: row.open_time,
    closeTime: row.close_time,
    entryPrice: Number(row.entry_price),
    exitPrice: row.exit_price === null ? null : Number(row.exit_price),
    stopLoss: row.stop_loss === null ? null : Number(row.stop_loss),
    takeProfit: row.take_profit === null ? null : Number(row.take_profit),
    grossPnl: Number(row.gross_pnl),
    commission: Number(row.commission),
    swap: Number(row.swap),
    netPnl: Number(row.net_pnl),
    pips: row.pips === null ? null : Number(row.pips),
    rMultiple: row.r_multiple === null ? null : Number(row.r_multiple),
    setup: row.setup,
    rating: row.rating,
    emotionBefore: row.emotion_before,
    emotionAfter: row.emotion_after,
    followedPlan: row.followed_plan,
    notes: row.notes,
    chartUrl: row.chart_url,
    planId: row.plan_id,
    manuallyEdited: row.manually_edited,
    tags: tagRefs.map((t) => t.name),
    tagRefs,
  };
}

export interface TradeFilters {
  /** YYYY-MM-DD, inclusive, by open time in the user's zone. */
  from?: string;
  to?: string;
  /** YYYY-MM-DD: trades closed (or opened, if still open) on this local day. */
  day?: string;
  symbol?: string;
  side?: "buy" | "sell";
  setup?: string;
  tag?: string;
  outcome?: "win" | "loss";
  status?: "open" | "closed";
}

/** All of the user's trades, newest first. Capped for safety; one trader rarely exceeds it. */
export async function listTrades(supabase: ServerClient, limit = 10_000) {
  const { data, error } = await supabase
    .from("trades")
    .select(TRADE_SELECT)
    .order("open_time", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load trades: ${error.message}`);
  return (data as unknown as TradeRowWithTags[]).map(toJournalTrade);
}

/** In-memory filtering: the full list is already loaded for stats and flags. */
export function filterTrades(trades: JournalTrade[], f: TradeFilters, timeZone: string): JournalTrade[] {
  return trades.filter((t) => {
    const openDay = localParts(t.openTime, timeZone).day;
    if (f.from && openDay < f.from) return false;
    if (f.to && openDay > f.to) return false;
    if (f.day && localParts(t.closeTime ?? t.openTime, timeZone).day !== f.day) return false;
    if (f.symbol && t.symbol !== f.symbol) return false;
    if (f.side && t.side !== f.side) return false;
    if (f.setup && t.setup?.toLowerCase() !== f.setup.toLowerCase()) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.tag && !t.tags?.includes(f.tag)) return false;
    if (f.outcome === "win" && !(t.status === "closed" && t.netPnl > 0)) return false;
    if (f.outcome === "loss" && !(t.status === "closed" && t.netPnl < 0)) return false;
    return true;
  });
}

export async function getTrade(supabase: ServerClient, id: string) {
  const { data, error } = await supabase
    .from("trades")
    .select(`${TRADE_SELECT}, executions(*), attachments(*)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load trade: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as TradeRowWithTags & {
    executions: Database["public"]["Tables"]["executions"]["Row"][];
    attachments: Database["public"]["Tables"]["attachments"]["Row"][];
  };
  return {
    trade: toJournalTrade(row),
    executions: row.executions.sort((a, b) => a.executed_at.localeCompare(b.executed_at)),
    attachments: row.attachments,
  };
}

export interface Profile {
  displayName: string | null;
  timezone: string;
  currency: string;
  rules: Rules;
}

export async function getProfile(supabase: ServerClient, userId: string): Promise<Profile> {
  const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  return {
    displayName: data?.display_name ?? null,
    timezone: data?.timezone ?? DEFAULT_TIMEZONE,
    currency: data?.currency ?? "USD",
    rules: parseRules(data?.rules),
  };
}

export async function listTags(supabase: ServerClient): Promise<TagRef[]> {
  const { data } = await supabase.from("tags").select("id, name, color").order("name");
  return data ?? [];
}

export function distinctValues(trades: JournalTrade[]) {
  const uniq = (xs: (string | null | undefined)[]) =>
    [...new Set(xs.filter((x): x is string => Boolean(x)))].sort();
  return {
    symbols: uniq(trades.map((t) => t.symbol)),
    setups: uniq(trades.map((t) => t.setup)),
  };
}
