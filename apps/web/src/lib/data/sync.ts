import "server-only";
import {
  pipSize,
  pipsMoved,
  reconstructTrades,
  rMultiple,
  unitsToLots,
  type Deal,
} from "@tj/core";
import { CTraderSession, refreshTokens, toDeal, type ProtoDeal } from "@tj/ctrader";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { ctraderApp, serverEnv } from "@/lib/env";
import type { ServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

const FIRST_SYNC_LOOKBACK_DAYS = 365;
const OVERLAP_MS = 24 * 60 * 60 * 1000;
const REFRESH_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;

export type SyncTrigger = "cron" | "manual" | "connect";

export interface SyncResult {
  dealsFetched: number;
  tradesUpserted: number;
}

/** Stores freshly issued tokens, encrypted and bound to the connection id. */
export async function saveTokens(
  db: ServiceClient,
  connectionId: string,
  tokens: { accessToken: string; refreshToken: string; expiresAt: Date },
) {
  const key = serverEnv().TOKEN_ENCRYPTION_KEY;
  const { error } = await db.from("broker_secrets").upsert({
    connection_id: connectionId,
    access_token_enc: await encryptSecret(tokens.accessToken, key, `access:${connectionId}`),
    refresh_token_enc: await encryptSecret(tokens.refreshToken, key, `refresh:${connectionId}`),
    expires_at: tokens.expiresAt.toISOString(),
  });
  if (error) throw new Error(`Could not store broker tokens: ${error.message}`);
}

async function loadAccessToken(db: ServiceClient, connectionId: string): Promise<string> {
  const app = ctraderApp();
  if (!app) throw new Error("cTrader app credentials are not configured");
  const key = serverEnv().TOKEN_ENCRYPTION_KEY;
  const { data: secret, error } = await db
    .from("broker_secrets")
    .select("*")
    .eq("connection_id", connectionId)
    .single();
  if (error || !secret) throw new Error("No stored broker tokens; reconnect cTrader");

  const access = await decryptSecret(secret.access_token_enc, key, `access:${connectionId}`);
  if (Date.parse(secret.expires_at) - Date.now() > REFRESH_BEFORE_MS) return access;

  const refresh = await decryptSecret(secret.refresh_token_enc, key, `refresh:${connectionId}`);
  const tokens = await refreshTokens(app, refresh);
  await saveTokens(db, connectionId, tokens);
  return tokens.accessToken;
}

/** Runs one sync for a connection. Records the run and never throws past it. */
export async function syncConnection(
  db: ServiceClient,
  connection: { id: string; user_id: string },
  trigger: SyncTrigger,
): Promise<SyncResult> {
  const { data: run } = await db
    .from("sync_runs")
    .insert({ user_id: connection.user_id, connection_id: connection.id, trigger })
    .select("id")
    .single();

  try {
    const result = await pullTrades(db, connection);
    const now = new Date().toISOString();
    await Promise.all([
      db.from("sync_runs").update({
        status: "success",
        finished_at: now,
        deals_fetched: result.dealsFetched,
        trades_upserted: result.tradesUpserted,
      }).eq("id", run!.id),
      db.from("broker_connections").update({ status: "active", last_synced_at: now, last_error: null }).eq("id", connection.id),
    ]);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all([
      db.from("sync_runs").update({ status: "error", finished_at: new Date().toISOString(), error: message.slice(0, 500) }).eq("id", run!.id),
      db.from("broker_connections").update({ status: "error", last_error: message.slice(0, 500) }).eq("id", connection.id),
    ]);
    throw error;
  }
}

async function pullTrades(db: ServiceClient, connection: { id: string; user_id: string }): Promise<SyncResult> {
  const app = ctraderApp()!;
  const accessToken = await loadAccessToken(db, connection.id);
  let dealsFetched = 0;
  let tradesUpserted = 0;

  for (const env of ["live", "demo"] as const) {
    const session = new CTraderSession(app, env);
    try {
      await session.open();
      const accounts = (await session.listAccounts(accessToken)).filter((a) => Boolean(a.isLive) === (env === "live"));
      for (const account of accounts) {
        await session.authorizeAccount(account.ctidTraderAccountId, accessToken);
        const info = await session.accountInfo(account);

        const { data: acct, error: acctError } = await db
          .from("trading_accounts")
          .upsert(
            {
              user_id: connection.user_id,
              connection_id: connection.id,
              platform: "ctrader",
              external_id: String(info.ctidTraderAccountId),
              trader_login: info.traderLogin,
              currency: info.currency,
              is_live: info.isLive,
              balance: info.balance,
            },
            { onConflict: "user_id,platform,external_id" },
          )
          .select("id")
          .single();
        if (acctError || !acct) throw new Error(`Could not save account: ${acctError?.message}`);

        const { data: latest } = await db
          .from("executions")
          .select("executed_at")
          .eq("account_id", acct.id)
          .order("executed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const from = latest
          ? new Date(Date.parse(latest.executed_at) - OVERLAP_MS)
          : new Date(Math.max(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * OVERLAP_MS, Date.parse(info.registeredAt ?? "1970-01-01")));

        const raw = await session.rawDeals(info.ctidTraderAccountId, from, new Date());
        dealsFetched += raw.length;
        if (!raw.length) continue;

        const symbols = await ensureSymbols(db, session, connection.user_id, acct.id, info.ctidTraderAccountId, raw);
        tradesUpserted += await storeDeals(db, connection.user_id, acct.id, raw, symbols);
      }
    } finally {
      session.close();
    }
  }
  return { dealsFetched, tradesUpserted };
}

type SymbolRow = { name: string; pip_position: number | null; lot_size: number | null };

async function ensureSymbols(
  db: ServiceClient,
  session: CTraderSession,
  userId: string,
  accountId: string,
  ctidTraderAccountId: number,
  raw: ProtoDeal[],
): Promise<Map<number, SymbolRow>> {
  const ids = [...new Set(raw.map((d) => d.symbolId))];
  const { data: known } = await db
    .from("symbols")
    .select("external_symbol_id, name, pip_position, lot_size")
    .eq("account_id", accountId)
    .in("external_symbol_id", ids);
  const map = new Map<number, SymbolRow>((known ?? []).map((s) => [Number(s.external_symbol_id), s]));

  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) {
    const fetched = await session.symbols(ctidTraderAccountId, missing);
    const rows = fetched.map((s) => ({
      account_id: accountId,
      user_id: userId,
      external_symbol_id: s.symbolId,
      name: s.name,
      digits: s.digits,
      pip_position: s.pipPosition,
      lot_size: s.lotSize,
    }));
    await db.from("symbols").upsert(rows, { onConflict: "account_id,external_symbol_id" });
    for (const r of rows) map.set(r.external_symbol_id, r);
  }
  return map;
}

/**
 * Saves executions, then rebuilds every affected position from all of its
 * stored executions, so partial closes across syncs add up correctly.
 */
async function storeDeals(
  db: ServiceClient,
  userId: string,
  accountId: string,
  raw: ProtoDeal[],
  symbols: Map<number, SymbolRow>,
): Promise<number> {
  const deals = raw
    .map((d) => toDeal(d, symbols.get(d.symbolId)?.name ?? `SYMBOL_${d.symbolId}`))
    .filter((d): d is Deal => d !== null);
  if (!deals.length) return 0;

  const { error: execError } = await db.from("executions").upsert(
    deals.map((d) => ({
      user_id: userId,
      account_id: accountId,
      external_deal_id: d.dealId,
      external_position_id: d.positionId,
      symbol: d.symbol,
      side: d.side,
      volume: d.volume,
      price: d.price,
      executed_at: d.time,
      commission: d.commission,
      close_detail: (d.close ?? null) as Json,
    })),
    { onConflict: "account_id,external_deal_id" },
  );
  if (execError) throw new Error(`Could not save executions: ${execError.message}`);

  const positionIds = [...new Set(deals.map((d) => d.positionId))];
  const { data: stored } = await db
    .from("executions")
    .select("*")
    .eq("account_id", accountId)
    .in("external_position_id", positionIds);
  const allDeals: Deal[] = (stored ?? []).map((e) => ({
    dealId: e.external_deal_id,
    positionId: e.external_position_id,
    symbol: e.symbol,
    side: e.side as Deal["side"],
    volume: Number(e.volume),
    price: Number(e.price),
    time: e.executed_at,
    commission: Number(e.commission),
    ...(e.close_detail ? { close: e.close_detail as unknown as NonNullable<Deal["close"]> } : {}),
  }));

  const { data: existing } = await db
    .from("trades")
    .select("id, external_position_id, manually_edited, stop_loss")
    .eq("account_id", accountId)
    .in("external_position_id", positionIds);
  const byPosition = new Map((existing ?? []).map((t) => [t.external_position_id, t]));
  const pipBySymbol = new Map([...symbols.values()].map((s) => [s.name, s]));

  const rows = reconstructTrades(allDeals)
    .filter((t) => !byPosition.get(t.positionId)?.manually_edited)
    .map((t) => {
      const sym = pipBySymbol.get(t.symbol);
      const pip = pipSize(t.symbol, sym?.pip_position);
      const stop = byPosition.get(t.positionId)?.stop_loss ?? null;
      return {
        user_id: userId,
        account_id: accountId,
        source: "ctrader" as const,
        external_position_id: t.positionId,
        symbol: t.symbol,
        side: t.side,
        status: t.status,
        volume: t.volume,
        lots: unitsToLots(t.volume, sym?.lot_size ?? undefined),
        open_time: t.openTime,
        close_time: t.closeTime,
        entry_price: t.entryPrice,
        exit_price: t.exitPrice,
        gross_pnl: t.grossPnl,
        commission: t.commission,
        swap: t.swap,
        net_pnl: t.netPnl,
        pip_size: pip,
        pips: t.exitPrice === null ? null : pipsMoved(t.side, t.entryPrice, t.exitPrice, pip),
        r_multiple: t.exitPrice === null ? null : rMultiple(t.side, t.entryPrice, t.exitPrice, stop === null ? null : Number(stop)),
      };
    });
  if (!rows.length) return 0;

  // Upsert touches only broker columns, so journal fields survive every sync.
  const { data: saved, error } = await db
    .from("trades")
    .upsert(rows, { onConflict: "account_id,external_position_id" })
    .select("id, external_position_id");
  if (error) throw new Error(`Could not save trades: ${error.message}`);

  await Promise.all(
    (saved ?? []).map((t) =>
      db.from("executions").update({ trade_id: t.id }).eq("account_id", accountId).eq("external_position_id", t.external_position_id!),
    ),
  );
  return rows.length;
}
