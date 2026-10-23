import { fromMoneyDigits, type Deal } from "@tj/core";
import { CTraderClient, CTraderError, type SocketFactory } from "./client";
import {
  DealStatus,
  ENDPOINTS,
  PayloadType,
  TradeSide,
  type ProtoAsset,
  type ProtoCtidTraderAccount,
  type ProtoDeal,
  type ProtoLightSymbol,
  type ProtoSymbol,
  type ProtoTrader,
} from "./protocol";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface AccountInfo {
  ctidTraderAccountId: number;
  isLive: boolean;
  traderLogin: string | null;
  balance: number;
  currency: string;
  registeredAt: string | null;
}

export interface SymbolInfo {
  symbolId: number;
  name: string;
  digits: number | null;
  pipPosition: number | null;
  lotSize: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** cTrader volumes are in cents of units. */
const units = (cents: number) => cents / 100;

export function toDeal(raw: ProtoDeal, symbolName: string): Deal | null {
  if (raw.dealStatus !== DealStatus.FILLED && raw.dealStatus !== DealStatus.PARTIALLY_FILLED) return null;
  const digits = raw.moneyDigits ?? 2;
  const close = raw.closePositionDetail;
  const closeDigits = close?.moneyDigits ?? digits;
  return {
    dealId: String(raw.dealId),
    positionId: String(raw.positionId),
    symbol: symbolName,
    side: raw.tradeSide === TradeSide.BUY ? "buy" : "sell",
    volume: units(raw.filledVolume || raw.volume),
    price: raw.executionPrice ?? 0,
    time: new Date(raw.executionTimestamp).toISOString(),
    commission: fromMoneyDigits(raw.commission ?? 0, digits),
    ...(close && {
      close: {
        entryPrice: close.entryPrice,
        grossProfit: fromMoneyDigits(close.grossProfit, closeDigits),
        swap: fromMoneyDigits(close.swap, closeDigits),
        closedVolume: units(close.closedVolume ?? raw.filledVolume),
      },
    }),
  };
}

/** High-level, read-only session against one cTrader environment. */
export class CTraderSession {
  private client: CTraderClient;
  private historicalDelayMs: number;

  constructor(
    private readonly app: { clientId: string; clientSecret: string },
    env: keyof typeof ENDPOINTS,
    options: { socketFactory?: SocketFactory; timeoutMs?: number; historicalDelayMs?: number } = {},
  ) {
    this.client = new CTraderClient(ENDPOINTS[env], options);
    this.historicalDelayMs = options.historicalDelayMs ?? 250;
  }

  async open(): Promise<void> {
    await this.client.connect();
    await this.client.request(PayloadType.APPLICATION_AUTH_REQ, PayloadType.APPLICATION_AUTH_RES, {
      clientId: this.app.clientId,
      clientSecret: this.app.clientSecret,
    });
  }

  close(): void {
    this.client.close();
  }

  async listAccounts(accessToken: string): Promise<ProtoCtidTraderAccount[]> {
    const res = await this.client.request<{ ctidTraderAccount?: ProtoCtidTraderAccount[] }>(
      PayloadType.GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ,
      PayloadType.GET_ACCOUNTS_BY_ACCESS_TOKEN_RES,
      { accessToken },
    );
    return res.ctidTraderAccount ?? [];
  }

  async authorizeAccount(ctidTraderAccountId: number, accessToken: string): Promise<void> {
    await this.client.request(PayloadType.ACCOUNT_AUTH_REQ, PayloadType.ACCOUNT_AUTH_RES, {
      ctidTraderAccountId,
      accessToken,
    });
  }

  async accountInfo(account: ProtoCtidTraderAccount): Promise<AccountInfo> {
    const id = account.ctidTraderAccountId;
    const { trader } = await this.client.request<{ trader: ProtoTrader }>(
      PayloadType.TRADER_REQ,
      PayloadType.TRADER_RES,
      { ctidTraderAccountId: id },
    );
    const { asset = [] } = await this.client.request<{ asset?: ProtoAsset[] }>(
      PayloadType.ASSET_LIST_REQ,
      PayloadType.ASSET_LIST_RES,
      { ctidTraderAccountId: id },
    );
    const currency = asset.find((a) => a.assetId === trader.depositAssetId);
    return {
      ctidTraderAccountId: id,
      isLive: Boolean(account.isLive),
      traderLogin: account.traderLogin ? String(account.traderLogin) : null,
      balance: fromMoneyDigits(trader.balance, trader.moneyDigits ?? 2),
      currency: currency?.displayName ?? currency?.name ?? "USD",
      registeredAt: trader.registrationTimestamp ? new Date(trader.registrationTimestamp).toISOString() : null,
    };
  }

  async symbols(ctidTraderAccountId: number, symbolIds: number[]): Promise<SymbolInfo[]> {
    if (!symbolIds.length) return [];
    const light = await this.client.request<{ symbol?: ProtoLightSymbol[]; archivedSymbol?: { symbolId: number; name: string }[] }>(
      PayloadType.SYMBOLS_LIST_REQ,
      PayloadType.SYMBOLS_LIST_RES,
      { ctidTraderAccountId, includeArchivedSymbols: true },
    );
    const names = new Map<number, string>();
    for (const s of light.symbol ?? []) if (s.symbolName) names.set(s.symbolId, s.symbolName);
    for (const s of light.archivedSymbol ?? []) names.set(s.symbolId, s.name);

    const full = await this.client.request<{ symbol?: ProtoSymbol[] }>(
      PayloadType.SYMBOL_BY_ID_REQ,
      PayloadType.SYMBOL_BY_ID_RES,
      { ctidTraderAccountId, symbolId: symbolIds },
    );
    const details = new Map((full.symbol ?? []).map((s) => [s.symbolId, s]));
    return symbolIds.map((symbolId) => {
      const d = details.get(symbolId);
      return {
        symbolId,
        name: names.get(symbolId) ?? `SYMBOL_${symbolId}`,
        digits: d?.digits ?? null,
        pipPosition: d?.pipPosition ?? null,
        lotSize: d?.lotSize ? units(d.lotSize) : null,
      };
    });
  }

  /**
   * Raw deals between two instants, walked in one-week windows. If a window
   * reports more rows than one page holds, it is split in half until each
   * part fits. Historical requests are rate limited by cTrader, so requests
   * are spaced out and a rate-limit error waits for the advised retry once.
   */
  async rawDeals(ctidTraderAccountId: number, from: Date, to: Date): Promise<ProtoDeal[]> {
    const deals: ProtoDeal[] = [];
    for (let start = from.getTime(); start < to.getTime(); start += WEEK_MS) {
      deals.push(...(await this.dealWindow(ctidTraderAccountId, start, Math.min(start + WEEK_MS, to.getTime()))));
    }
    return [...new Map(deals.map((d) => [d.dealId, d])).values()];
  }

  private async dealWindow(ctidTraderAccountId: number, from: number, to: number): Promise<ProtoDeal[]> {
    const page = await this.dealPage(ctidTraderAccountId, from, to);
    if (!page.hasMore || to - from <= 60_000) return page.deal ?? [];
    const mid = Math.floor((from + to) / 2);
    return [
      ...(await this.dealWindow(ctidTraderAccountId, from, mid)),
      ...(await this.dealWindow(ctidTraderAccountId, mid + 1, to)),
    ];
  }

  private async dealPage(ctidTraderAccountId: number, fromTimestamp: number, toTimestamp: number) {
    const call = () =>
      this.client.request<{ deal?: ProtoDeal[]; hasMore?: boolean }>(
        PayloadType.DEAL_LIST_REQ,
        PayloadType.DEAL_LIST_RES,
        { ctidTraderAccountId, fromTimestamp, toTimestamp, maxRows: 1000 },
      );
    await sleep(this.historicalDelayMs);
    try {
      return await call();
    } catch (error) {
      if (error instanceof CTraderError && error.retryAfterSeconds) {
        await sleep(error.retryAfterSeconds * 1000);
        return call();
      }
      throw error;
    }
  }
}
