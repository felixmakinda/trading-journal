import { describe, expect, it, vi } from "vitest";
import { CTraderSession, WEEK_MS, toDeal } from "./api";
import { CTraderError, type SocketLike } from "./client";
import { authorizeUrl, exchangeCode } from "./oauth";
import { PayloadType, type Envelope, type ProtoDeal } from "./protocol";

type Handler = (env: Envelope) => Envelope | Envelope[] | null;

/** In-memory cTrader server: answers each request through `handler`. */
function fakeSocket(handler: Handler) {
  const sent: Envelope[] = [];
  const listeners: Record<string, ((e: { data?: unknown }) => void)[]> = {};
  const socket: SocketLike = {
    readyState: 1,
    send(data) {
      const env = JSON.parse(data) as Envelope;
      sent.push(env);
      if (env.payloadType === PayloadType.HEARTBEAT_EVENT) return;
      const reply = handler(env);
      const replies = Array.isArray(reply) ? reply : reply ? [reply] : [];
      for (const r of replies) {
        queueMicrotask(() =>
          listeners.message?.forEach((l) => l({ data: JSON.stringify({ clientMsgId: env.clientMsgId, ...r }) })),
        );
      }
    },
    close() {},
    addEventListener(type, listener) {
      (listeners[type] ??= []).push(listener);
      if (type === "open") queueMicrotask(() => listener({}));
    },
  };
  return { socket, sent };
}

const deal = (id: number, ts: number, extra: Partial<ProtoDeal> = {}): ProtoDeal => ({
  dealId: id,
  orderId: id,
  positionId: 7,
  volume: 10_000_000,
  filledVolume: 10_000_000,
  symbolId: 1,
  createTimestamp: ts,
  executionTimestamp: ts,
  executionPrice: 1.1,
  tradeSide: 1,
  dealStatus: 2,
  commission: -350,
  moneyDigits: 2,
  ...extra,
});

describe("toDeal", () => {
  it("converts cents and moneyDigits, and keeps close details", () => {
    const d = toDeal(
      deal(1, Date.UTC(2026, 9, 1), {
        tradeSide: 2,
        moneyDigits: 8,
        commission: -350_000_000,
        closePositionDetail: {
          entryPrice: 1.09, grossProfit: 100_000_000_000, swap: -120_000_000, commission: 0, balance: 0, closedVolume: 10_000_000, moneyDigits: 8,
        },
      }),
      "EURUSD",
    );
    expect(d).toEqual({
      dealId: "1", positionId: "7", symbol: "EURUSD", side: "sell", volume: 100_000, price: 1.1,
      time: "2026-10-01T00:00:00.000Z", commission: -3.5,
      close: { entryPrice: 1.09, grossProfit: 1000, swap: -1.2, closedVolume: 100_000 },
    });
  });

  it("drops rejected deals", () => {
    expect(toDeal(deal(1, 0, { dealStatus: 4 }), "X")).toBeNull();
  });
});

describe("CTraderSession", () => {
  const app = { clientId: "id", clientSecret: "secret" };

  it("authenticates the app, then walks deal history week by week", async () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const to = new Date(from.getTime() + 2.5 * WEEK_MS);
    const { socket, sent } = fakeSocket((env) => {
      if (env.payloadType === PayloadType.APPLICATION_AUTH_REQ) return { payloadType: PayloadType.APPLICATION_AUTH_RES, payload: {} };
      if (env.payloadType === PayloadType.DEAL_LIST_REQ) {
        const p = env.payload as { fromTimestamp: number };
        return { payloadType: PayloadType.DEAL_LIST_RES, payload: { deal: [deal(p.fromTimestamp, p.fromTimestamp + 1)], hasMore: false } };
      }
      return null;
    });
    const session = new CTraderSession(app, "demo", { socketFactory: () => socket, historicalDelayMs: 0 });
    await session.open();
    const deals = await session.rawDeals(42, from, to);
    session.close();

    expect(sent[0]).toMatchObject({ payloadType: 2100, payload: { clientId: "id", clientSecret: "secret" } });
    const windows = sent.filter((e) => e.payloadType === PayloadType.DEAL_LIST_REQ).map((e) => e.payload);
    expect(windows).toHaveLength(3);
    expect(windows[2]).toMatchObject({ ctidTraderAccountId: 42, toTimestamp: to.getTime() });
    expect(deals).toHaveLength(3);
  });

  it("splits a window that has more rows than one page", async () => {
    let calls = 0;
    const { socket } = fakeSocket((env) => {
      if (env.payloadType === PayloadType.APPLICATION_AUTH_REQ) return { payloadType: PayloadType.APPLICATION_AUTH_RES, payload: {} };
      const p = env.payload as { fromTimestamp: number };
      calls += 1;
      return { payloadType: PayloadType.DEAL_LIST_RES, payload: { deal: [deal(calls, p.fromTimestamp)], hasMore: calls === 1 } };
    });
    const session = new CTraderSession(app, "demo", { socketFactory: () => socket, historicalDelayMs: 0 });
    await session.open();
    const deals = await session.rawDeals(1, new Date(0), new Date(WEEK_MS));
    expect(calls).toBe(3);
    expect(deals.map((d) => d.dealId)).toEqual([2, 3]);
  });

  it("surfaces cTrader errors with their code", async () => {
    const { socket } = fakeSocket(() => ({
      payloadType: PayloadType.ERROR_RES,
      payload: { errorCode: "CH_CLIENT_AUTH_FAILURE", description: "bad secret" },
    }));
    const session = new CTraderSession(app, "live", { socketFactory: () => socket });
    await expect(session.open()).rejects.toThrow(CTraderError);
  });
});

describe("oauth", () => {
  it("always requests the read-only scope", () => {
    const url = new URL(authorizeUrl({ clientId: "abc", redirectUri: "https://x.test/cb" }, "s1"));
    expect(url.searchParams.get("scope")).toBe("accounts");
    expect(url.searchParams.get("state")).toBe("s1");
  });

  it("exchanges a code and reports API errors", async () => {
    const ok = vi.fn(async () => Response.json({ accessToken: "a", refreshToken: "r", expiresIn: 60, errorCode: null }));
    const tokens = await exchangeCode({ clientId: "c", clientSecret: "s", redirectUri: "https://x.test/cb" }, "code", ok);
    expect(tokens.accessToken).toBe("a");
    const calledUrl = new URL(String((ok.mock.calls[0] as unknown[])[0]));
    expect(calledUrl.searchParams.get("grant_type")).toBe("authorization_code");

    const bad = vi.fn(async () => Response.json({ errorCode: "ACCESS_DENIED", description: "nope" }));
    await expect(exchangeCode({ clientId: "c", clientSecret: "s", redirectUri: "r" }, "x", bad)).rejects.toThrow("ACCESS_DENIED");
  });
});
