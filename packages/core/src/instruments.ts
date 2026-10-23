import { direction, type Side } from "./types";

export type AssetClass = "forex" | "index" | "metal" | "energy" | "crypto" | "future" | "other";

export interface InstrumentSpec {
  assetClass: AssetClass;
  /** Unit that price moves are counted in: pips for FX, points for everything else. */
  moveUnit: "pips" | "points";
  /** Price distance of one move unit. */
  pipSize: number;
  sizeUnit: "lots" | "contracts";
  /** Units of the underlying in one lot or contract. */
  contractSize: number;
  /**
   * Profit in USD for a 1.0 price move on one lot or contract, when that is
   * fixed. Null when it depends on an exchange rate, so the broker's P&L is needed.
   */
  pointValue: number | null;
}

const CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "SGD", "HKD",
  "ZAR", "MXN", "TRY", "PLN", "CZK", "HUF", "CNH", "THB", "ILS",
]);

/** CME/COMEX/NYMEX/CBOT futures: USD per 1.0 price move per contract. */
const FUTURES: Record<string, number> = {
  ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5,
  GC: 100, MGC: 10, SI: 5000, SIL: 1000, HG: 25_000, PL: 50,
  CL: 1000, MCL: 100, NG: 10_000, QM: 500,
  ZB: 1000, ZN: 1000, ZF: 1000, ZT: 2000,
  "6E": 125_000, M6E: 12_500, "6B": 62_500, "6J": 12_500_000, "6A": 100_000, "6C": 100_000,
  BTC: 5, MBT: 0.1, ETH: 50, MET: 0.1,
};

// Longest roots first so MNQ is not read as NQ with a stray prefix.
const FUTURES_PATTERN = new RegExp(
  `^(${Object.keys(FUTURES).sort((a, b) => b.length - a.length).join("|")})(?:[FGHJKMNQUVXZ]\\d{1,4}|\\d!)?$`,
);

/** Index CFDs quoted in USD, where one lot is one contract of $1 per point. */
const USD_INDICES = new Set(["NAS100", "US100", "USTEC", "US30", "US500", "SPX500", "US2000", "DJ30"]);

const METALS: Record<string, { contractSize: number }> = {
  XAU: { contractSize: 100 },
  XAG: { contractSize: 5000 },
  XPT: { contractSize: 100 },
  XPD: { contractSize: 100 },
};

const ENERGY = /^(SPOTCRUDE|SPOTBRENT|NATGAS|USOIL|UKOIL|WTI|BRENT|XTIUSD|XBRUSD|XNGUSD)$/;
const CRYPTO = /^(BTC|ETH|LTC|XRP|SOL|ADA|DOGE|BCH|DOT|LINK)(USD|USDT)$/;

/** Strips exchange prefixes and feed suffixes: "CME_MINI:ES1!", "ES=F", "EURUSD.a". */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().split(":").pop()!.replace(/=F$/, "").replace(/\.[A-Z0-9]+$/, "");
}

const points = (assetClass: AssetClass, contractSize: number, pointValue: number | null): InstrumentSpec => ({
  assetClass,
  moveUnit: "points",
  pipSize: 1,
  sizeUnit: "lots",
  contractSize,
  pointValue,
});

/**
 * What a symbol is and how its moves, size and P&L are counted. For FX the
 * broker's pipPosition wins when known (cTrader reports it per symbol);
 * everything else is counted in whole points of price.
 */
export function instrumentSpec(symbol: string, pipPosition?: number | null): InstrumentSpec {
  const s = normalizeSymbol(symbol);

  const future = FUTURES_PATTERN.exec(s);
  if (future) {
    return { assetClass: "future", moveUnit: "points", pipSize: 1, sizeUnit: "contracts", contractSize: 1, pointValue: FUTURES[future[1]!]! };
  }

  const base = s.slice(0, 3);
  const quote = s.slice(3);
  if (s.length === 6 && CURRENCIES.has(base) && CURRENCIES.has(quote)) {
    const pip = pipPosition !== undefined && pipPosition !== null ? 10 ** -pipPosition : quote === "JPY" ? 0.01 : 0.0001;
    return {
      assetClass: "forex",
      moveUnit: "pips",
      pipSize: pip,
      sizeUnit: "lots",
      contractSize: 100_000,
      pointValue: quote === "USD" ? 100_000 : null,
    };
  }

  const metal = METALS[base];
  if (metal && s.length === 6 && CURRENCIES.has(quote)) {
    return points("metal", metal.contractSize, quote === "USD" ? metal.contractSize : null);
  }
  if (ENERGY.test(s)) return points("energy", 1, null);
  if (CRYPTO.test(s)) return points("crypto", 1, 1);
  if (USD_INDICES.has(s)) return points("index", 1, 1);
  if (/^[A-Z]{2,7}\d{2,4}$/.test(s)) return points("index", 1, null);
  return points("other", 1, null);
}

/** Gross P&L in USD from prices and size, or null when the instrument's point value is not fixed. */
export function estimateGrossPnl(spec: InstrumentSpec, side: Side, entry: number, exit: number, size: number): number | null {
  if (spec.pointValue === null) return null;
  return (exit - entry) * direction(side) * size * spec.pointValue;
}
