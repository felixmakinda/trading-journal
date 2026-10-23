import { direction, type Side } from "./types";

export const STANDARD_LOT = 100_000;

/** Rounds to cents, avoiding -0. */
export function round2(value: number): number {
  const r = Math.round((value + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
}

/** Converts an integer amount scaled by 10^digits (cTrader's moneyDigits) to a decimal. */
export function fromMoneyDigits(value: number, digits: number): number {
  return value / 10 ** digits;
}

export function unitsToLots(units: number, lotSize = STANDARD_LOT): number {
  return Math.round((units / lotSize) * 100) / 100;
}

export function lotsToUnits(lots: number, lotSize = STANDARD_LOT): number {
  return Math.round(lots * lotSize);
}

/**
 * Size of one pip in price terms. Prefer the broker's pipPosition when known
 * (cTrader reports it per symbol); otherwise fall back to FX conventions.
 */
export function pipSize(symbol: string, pipPosition?: number | null): number {
  if (pipPosition !== undefined && pipPosition !== null) return 10 ** -pipPosition;
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 0.01;
  if (s.startsWith("XAU")) return 0.1;
  if (s.startsWith("XAG")) return 0.01;
  if (/^[A-Z]{6}$/.test(s)) return 0.0001;
  return 1;
}

export function pipsMoved(side: Side, entry: number, exit: number, pip: number): number {
  return Math.round(((exit - entry) * direction(side) * 10) / pip) / 10;
}

/**
 * R multiple from price distances: how many "risk units" the trade made.
 * Uses the planned stop, so it ignores costs by design.
 */
export function rMultiple(
  side: Side,
  entry: number,
  exit: number,
  stopLoss: number | null | undefined,
): number | null {
  if (stopLoss === null || stopLoss === undefined) return null;
  const risk = Math.abs(entry - stopLoss);
  if (risk === 0) return null;
  return Math.round((((exit - entry) * direction(side)) / risk) * 100) / 100;
}
