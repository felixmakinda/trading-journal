import { instrumentSpec } from "@tj/core";

const moneyCache = new Map<string, Intl.NumberFormat>();

function moneyFormat(currency: string) {
  let f = moneyCache.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    moneyCache.set(currency, f);
  }
  return f;
}

export function money(value: number, currency = "USD"): string {
  return moneyFormat(currency).format(value);
}

/** Always shows the sign, so gain and loss never rely on colour alone. */
export function signedMoney(value: number, currency = "USD"): string {
  const s = moneyFormat(currency).format(Math.abs(value));
  if (Math.abs(value) < 0.005) return s;
  return value > 0 ? `+${s}` : `−${s}`;
}

/** Short signed amount for tight spaces, e.g. +$1.3K. */
export function signedCompact(value: number, currency: string | null = "USD"): string {
  const f = new Intl.NumberFormat("en-US", {
    ...(currency ? { style: "currency", currency } : {}),
    notation: "compact",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  });
  const s = f.format(Math.abs(value));
  if (Math.abs(value) < 0.5) return s;
  return value > 0 ? `+${s}` : `−${s}`;
}

export function signed(value: number, digits = 1, suffix = ""): string {
  const s = Math.abs(value).toFixed(digits);
  if (Number(s) === 0) return `${s}${suffix}`;
  return `${value > 0 ? "+" : "−"}${s}${suffix}`;
}

export function percent(value: number | null, digits = 1): string {
  return value === null ? "–" : `${value.toFixed(digits)}%`;
}

export function num(value: number | null, digits = 2): string {
  return value === null ? "–" : value.toFixed(digits);
}

export function price(value: number | null): string {
  if (value === null) return "–";
  return value >= 100 ? value.toFixed(2) : value.toFixed(5);
}

/** Position size in the instrument's own unit: "0.50" lots, or "2 ct" for futures contracts. */
export function size(symbol: string, lots: number): string {
  return instrumentSpec(symbol).sizeUnit === "contracts" ? `${lots} ct` : lots.toFixed(2);
}

/** Signed price move in pips (FX) or points (everything else). */
export function move(symbol: string, pips: number | null): string {
  if (pips === null) return "–";
  return signed(pips, 1, instrumentSpec(symbol).moveUnit === "pips" ? " pips" : " pts");
}

export function dateTime(iso: string | null, timeZone: string): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function duration(minutes: number | null): string {
  if (minutes === null) return "–";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h}h ${minutes % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function toneOf(value: number): "gain" | "loss" | "flat" {
  if (Math.abs(value) < 0.005) return "flat";
  return value > 0 ? "gain" : "loss";
}

export const toneText = { gain: "text-gain-ink", loss: "text-loss-ink", flat: "text-ink-2" } as const;

/** Converts a value to the YYYY-MM-DDTHH:mm format of <input type="datetime-local"> in a time zone. */
export function toLocalInput(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Interprets a datetime-local value as wall time in `timeZone` and returns ISO UTC. */
export function fromLocalInput(value: string, timeZone: string): string | null {
  if (!value) return null;
  const asUtc = Date.parse(`${value}:00Z`);
  if (Number.isNaN(asUtc)) return null;
  // Offset of the zone at that instant, found by formatting the guess back.
  const guess = toLocalInput(new Date(asUtc).toISOString(), timeZone);
  const offset = Date.parse(`${guess}:00Z`) - asUtc;
  return new Date(asUtc - offset).toISOString();
}
