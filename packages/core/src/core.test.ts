import { describe, expect, it } from "vitest";
import {
  computeStats,
  dailyResults,
  detectFlags,
  equityCurve,
  escapeCell,
  evaluatePropFirm,
  groupStats,
  guessMapping,
  journalFieldsSchema,
  localParts,
  mapRows,
  parseDate,
  parseRules,
  pipSize,
  pipsMoved,
  readCsv,
  reconstructTrades,
  rMultiple,
  sessionOf,
  checklistFor,
  estimateGrossPnl,
  findModel,
  instrumentSpec,
  lotsToUnits,
  modelInputSchema,
  modelResult,
  targetPrice,
  toCsv,
  type Deal,
  type Trade,
} from "./index";

let seq = 0;
function trade(partial: Partial<Trade> & { netPnl: number; closeTime?: string | null }): Trade {
  seq += 1;
  const openTime = partial.openTime ?? "2026-10-01T08:00:00.000Z";
  return {
    id: partial.id ?? `t${seq}`,
    symbol: "EURUSD",
    side: "buy",
    status: partial.closeTime === null ? "open" : "closed",
    volume: 100_000,
    openTime,
    closeTime: partial.closeTime === undefined ? "2026-10-01T09:00:00.000Z" : partial.closeTime,
    entryPrice: 1.1,
    exitPrice: partial.closeTime === null ? null : 1.101,
    stopLoss: 1.099,
    takeProfit: null,
    grossPnl: partial.netPnl,
    commission: 0,
    swap: 0,
    ...partial,
  };
}

describe("forex helpers", () => {
  it("uses broker pip position when known, conventions otherwise", () => {
    expect(pipSize("EURUSD")).toBe(0.0001);
    expect(pipSize("USDJPY")).toBe(0.01);
    expect(pipSize("XAUUSD", 2)).toBe(1);
    expect(pipSize("US30", 0)).toBe(1);
    expect(pipSize("EURUSD", 4)).toBeCloseTo(0.0001);
  });

  it("measures pips and R in the trade's direction", () => {
    expect(pipsMoved("buy", 1.1, 1.1025, 0.0001)).toBe(25);
    expect(pipsMoved("sell", 1.1, 1.1025, 0.0001)).toBe(-25);
    expect(rMultiple("buy", 1.1, 1.103, 1.099)).toBe(3);
    expect(rMultiple("sell", 150, 151, 150.5)).toBe(-2);
    expect(rMultiple("buy", 1.1, 1.103, null)).toBeNull();
  });
});

describe("instrumentSpec", () => {
  it("counts FX in pips and lots, and only fixes the point value for USD-quoted pairs", () => {
    expect(instrumentSpec("GBPUSD")).toMatchObject({ assetClass: "forex", moveUnit: "pips", sizeUnit: "lots", pointValue: 100_000 });
    expect(instrumentSpec("EURJPY").pointValue).toBeNull();
  });

  it("counts index, metal and energy CFDs in points", () => {
    expect(instrumentSpec("NAS100")).toMatchObject({ assetClass: "index", moveUnit: "points", pipSize: 1, pointValue: 1 });
    expect(instrumentSpec("GER40")).toMatchObject({ assetClass: "index", pointValue: null });
    expect(instrumentSpec("XAUUSD")).toMatchObject({ assetClass: "metal", moveUnit: "points", contractSize: 100, pointValue: 100 });
    expect(instrumentSpec("SpotCrude").assetClass).toBe("energy");
  });

  it("recognises futures by root, contract month and feed spelling", () => {
    for (const s of ["ES", "ESZ6", "ESZ2026", "ES1!", "CME_MINI:ES1!", "ES=F"]) {
      expect(instrumentSpec(s)).toMatchObject({ assetClass: "future", sizeUnit: "contracts", pointValue: 50 });
    }
    expect(instrumentSpec("MNQZ6").pointValue).toBe(2);
    expect(instrumentSpec("NQ1!").pointValue).toBe(20);
    expect(instrumentSpec("GC").pointValue).toBe(100);
  });

  it("estimates P&L from points, size and point value", () => {
    expect(estimateGrossPnl(instrumentSpec("NQ"), "buy", 20_000, 20_010, 2)).toBe(400);
    expect(estimateGrossPnl(instrumentSpec("XAUUSD"), "sell", 2600, 2590, 0.5)).toBe(500);
    expect(estimateGrossPnl(instrumentSpec("GER40"), "buy", 1, 2, 1)).toBeNull();
    expect(lotsToUnits(0.01, instrumentSpec("NAS100").contractSize)).toBe(0.01);
  });
});

describe("playbook", () => {
  const model = {
    id: "m1", name: ".382 VB", description: null, checklist: ["Clean M5 structure"],
    targetR: 4, breakevenR: 1.5, maxAttempts: 2, entryWindowMinutes: 45, archived: false,
  };

  it("matches setups to models by name, ignoring case and spaces", () => {
    expect(findModel(" .382 vb ", [model])?.id).toBe("m1");
    expect(findModel("FTB", [model])).toBeNull();
    expect(checklistFor(".382 VB", [model], parseRules({}))).toEqual(["Clean M5 structure"]);
    expect(checklistFor("FTB", [model], parseRules({}))).toEqual(parseRules({}).checklist);
  });

  it("prices targets in R and counts target hits", () => {
    expect(targetPrice(100, 98, 4)).toBe(108);
    expect(targetPrice(100, 102, 4)).toBe(92);
    expect(targetPrice(100, 100, 4)).toBeNull();
    const r = modelResult(model, [
      { status: "closed", rMultiple: 3.97 },
      { status: "closed", rMultiple: -1 },
      { status: "closed", rMultiple: null },
      { status: "open", rMultiple: null },
    ]);
    expect(r).toEqual({ trades: 4, measured: 2, targetHits: 1, avgR: 1.485 });
  });

  it("validates model input from forms", () => {
    const parsed = modelInputSchema.parse({ name: " FTB ", targetR: "4", breakevenR: "", maxAttempts: "2", entryWindowMinutes: "" });
    expect(parsed).toMatchObject({ name: "FTB", targetR: 4, breakevenR: null, maxAttempts: 2, entryWindowMinutes: null, checklist: [] });
    expect(modelInputSchema.safeParse({ name: "x", maxAttempts: "1.5" }).success).toBe(false);
  });
});

describe("reconstructTrades", () => {
  const base = { symbol: "EURUSD", commission: -3.5 };

  it("merges scale-ins and partial closes into one trade", () => {
    const deals: Deal[] = [
      { ...base, dealId: "1", positionId: "P", side: "buy", volume: 100_000, price: 1.1, time: "2026-10-01T08:00:00Z" },
      { ...base, dealId: "2", positionId: "P", side: "buy", volume: 100_000, price: 1.102, time: "2026-10-01T08:05:00Z" },
      {
        ...base, dealId: "3", positionId: "P", side: "sell", volume: 100_000, price: 1.105, time: "2026-10-01T09:00:00Z",
        close: { entryPrice: 1.101, grossProfit: 400, swap: 0, closedVolume: 100_000 },
      },
      {
        ...base, dealId: "4", positionId: "P", side: "sell", volume: 100_000, price: 1.107, time: "2026-10-01T10:00:00Z",
        close: { entryPrice: 1.101, grossProfit: 600, swap: -1.2, closedVolume: 100_000 },
      },
    ];
    const [t] = reconstructTrades(deals);
    expect(t).toMatchObject({
      side: "buy",
      status: "closed",
      volume: 200_000,
      grossPnl: 1000,
      swap: -1.2,
      commission: -14,
      netPnl: 984.8,
      openTime: "2026-10-01T08:00:00Z",
      closeTime: "2026-10-01T10:00:00Z",
    });
    expect(t!.entryPrice).toBeCloseTo(1.101);
    expect(t!.exitPrice).toBeCloseTo(1.106);
  });

  it("keeps a partially closed position open, and ignores duplicate deals", () => {
    const open: Deal = { ...base, dealId: "1", positionId: "Q", side: "sell", volume: 200_000, price: 1.2, time: "2026-10-02T08:00:00Z" };
    const partial: Deal = {
      ...base, dealId: "2", positionId: "Q", side: "buy", volume: 100_000, price: 1.19, time: "2026-10-02T09:00:00Z",
      close: { entryPrice: 1.2, grossProfit: 1000, swap: 0, closedVolume: 100_000 },
    };
    const [t] = reconstructTrades([open, partial, partial]);
    expect(t).toMatchObject({ side: "sell", status: "open", closeTime: null, grossPnl: 1000, commission: -7 });
  });
});

describe("computeStats", () => {
  it("returns empty-safe stats", () => {
    const s = computeStats([]);
    expect(s.trades).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.profitFactor).toBeNull();
  });

  it("computes win rate, profit factor, streaks and drawdown on closed trades only", () => {
    const trades = [
      trade({ netPnl: 100, closeTime: "2026-10-01T10:00:00Z" }),
      trade({ netPnl: -50, closeTime: "2026-10-01T11:00:00Z" }),
      trade({ netPnl: -30, closeTime: "2026-10-01T12:00:00Z" }),
      trade({ netPnl: 200, closeTime: "2026-10-01T13:00:00Z" }),
      trade({ netPnl: 0.2, closeTime: "2026-10-01T14:00:00Z" }),
      trade({ netPnl: 999, closeTime: null }),
    ];
    const s = computeStats(trades);
    expect(s).toMatchObject({
      trades: 5, wins: 2, losses: 2, breakeven: 1, winRate: 50,
      netPnl: 220.2, profitFactor: 3.75, avgWin: 150, avgLoss: -40,
      maxLossStreak: 2, maxDrawdown: 80, largestLoss: -50,
    });
    expect(s.payoffRatio).toBe(3.75);
  });

  it("builds an equity curve with drawdown from the peak", () => {
    const curve = equityCurve(
      [trade({ netPnl: 100, closeTime: "2026-10-01T10:00:00Z" }), trade({ netPnl: -40, closeTime: "2026-10-01T11:00:00Z" })],
      1000,
    );
    expect(curve.map((p) => [p.equity, p.drawdown])).toEqual([[1100, 0], [1060, -40]]);
  });
});

describe("time and grouping", () => {
  it("classifies sessions by UTC hour", () => {
    expect(sessionOf("2026-10-01T02:00:00Z")).toBe("asia");
    expect(sessionOf("2026-10-01T08:00:00Z")).toBe("london");
    expect(sessionOf("2026-10-01T13:00:00Z")).toBe("overlap");
    expect(sessionOf("2026-10-01T18:00:00Z")).toBe("newyork");
  });

  it("buckets days in Nairobi time", () => {
    expect(localParts("2026-10-01T22:30:00Z")).toMatchObject({ day: "2026-10-02", hour: 1, weekday: "Fri" });
    const days = dailyResults([trade({ netPnl: 10, closeTime: "2026-10-01T22:30:00Z" })]);
    expect(days.get("2026-10-02")?.netPnl).toBe(10);
  });

  it("groups by key, including multi-key tags", () => {
    const groups = groupStats(
      [trade({ netPnl: 10, tags: ["a", "b"] }), trade({ netPnl: -5, tags: ["b"] })],
      (t) => t.tags,
    );
    expect(groups.find((g) => g.key === "b")?.stats.netPnl).toBe(5);
    expect(groups.find((g) => g.key === "a")?.stats.trades).toBe(1);
  });
});

describe("detectFlags", () => {
  const rules = parseRules({ maxTradesPerDay: 2 });

  it("flags revenge, tilt, overtrading and missing stops", () => {
    const l1 = trade({ id: "l1", netPnl: -50, openTime: "2026-10-01T06:00:00Z", closeTime: "2026-10-01T06:30:00Z" });
    const l2 = trade({ id: "l2", netPnl: -50, openTime: "2026-10-01T06:40:00Z", closeTime: "2026-10-01T07:00:00Z" });
    const l3 = trade({ id: "l3", netPnl: -50, openTime: "2026-10-01T07:05:00Z", closeTime: "2026-10-01T07:20:00Z", stopLoss: null });
    const r = trade({ id: "r", netPnl: 10, openTime: "2026-10-01T07:30:00Z", volume: 300_000 });
    const flags = detectFlags([l1, l2, l3, r], rules);
    expect(flags.get("r")?.map((f) => f.kind)).toEqual(["revenge", "tilt", "overtrading"]);
    expect(flags.get("l3")?.map((f) => f.kind)).toEqual(["overtrading", "no_stop"]);
    expect(flags.has("l1")).toBe(false);
  });
});

describe("evaluatePropFirm", () => {
  it("measures today's loss against the day-start balance", () => {
    const rules = parseRules({ propFirm: { enabled: true, accountSize: 10_000, dailyLossPercent: 5, maxLossPercent: 10 } }).propFirm;
    const status = evaluatePropFirm(
      [
        trade({ netPnl: 1000, closeTime: "2026-10-01T10:00:00Z" }),
        trade({ netPnl: -440, closeTime: "2026-10-02T10:00:00Z" }),
      ],
      rules,
      new Date("2026-10-02T12:00:00Z"),
    );
    expect(status.balance).toBe(10_560);
    expect(status.daily).toMatchObject({ used: 440, limit: 550, percentUsed: 80, status: "warning" });
    expect(status.overall).toMatchObject({ used: 0, status: "ok" });
  });
});

describe("journalFieldsSchema", () => {
  it("treats empty form fields as not set", () => {
    const parsed = journalFieldsSchema.parse({
      setup: "", notes: "", rating: "", emotionBefore: "", emotionAfter: "",
      followedPlan: "", stopLoss: "", takeProfit: "", chartUrl: "",
    });
    expect(parsed).toMatchObject({ setup: null, rating: null, followedPlan: null, stopLoss: null, chartUrl: null });
  });

  it("parses filled fields and rejects non-https chart links", () => {
    expect(journalFieldsSchema.parse({ rating: "4", followedPlan: "no", stopLoss: "1.0835" })).toMatchObject({
      rating: 4, followedPlan: false, stopLoss: 1.0835,
    });
    expect(journalFieldsSchema.safeParse({ chartUrl: "http://www.tradingview.com/x/a/" }).success).toBe(false);
    expect(journalFieldsSchema.safeParse({ rating: "9" }).success).toBe(false);
  });
});

describe("CSV import and export", () => {
  it("guesses columns and maps rows, reporting bad rows by line number", () => {
    const { headers, rows } = readCsv(
      "﻿Symbol,Type,Volume,Open Time,Open Price,Close Time,Close Price,Profit\n" +
        "eurusd,Buy,0.5,2026.10.01 08:00,1.1000,2026.10.01 09:00,1.1020,100\n" +
        "GBPUSD,hold,1,2026.10.01 08:00,1.3,,,\n",
    );
    const mapping = guessMapping(headers);
    expect(mapping).toMatchObject({ symbol: "Symbol", side: "Type", lots: "Volume", netPnl: "Profit" });
    const { trades, errors } = mapRows(rows, mapping);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ symbol: "EURUSD", side: "buy", lots: 0.5, netPnl: 100, closeTime: "2026-10-01T09:00:00.000Z" });
    expect(errors).toEqual([{ row: 3, message: 'Unknown side "hold"' }]);
  });

  it("parses common broker date formats as UTC", () => {
    expect(parseDate("2026.10.01 08:00")).toBe("2026-10-01T08:00:00Z");
    expect(parseDate("2026-10-01T08:00:00+03:00")).toBe("2026-10-01T05:00:00.000Z");
    expect(parseDate("nope")).toBeNull();
  });

  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    expect(escapeCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(escapeCell("-12.5")).toBe("-12.5");
    expect(toCsv([{ a: "@SUM(1)", b: 2 }], ["a", "b"])).toBe("a,b\r\n'@SUM(1),2");
  });
});
