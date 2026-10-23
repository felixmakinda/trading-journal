import { instrumentSpec } from "./instruments";
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

/** Rounded to hundredths: a 0.01 lot of a $1-per-point index is 0.01 units, not 0. */
export function lotsToUnits(lots: number, lotSize = STANDARD_LOT): number {
  return Math.round(lots * lotSize * 100) / 100;
}

/** Size of one pip (FX) or point (everything else) in price terms. */
export function pipSize(symbol: string, pipPosition?: number | null): number {
  return instrumentSpec(symbol, pipPosition).pipSize;
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
