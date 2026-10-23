import Papa from "papaparse";
import { tradeInputSchema, type TradeInput } from "./schemas";

export const IMPORT_FIELDS = [
  "symbol",
  "side",
  "lots",
  "openTime",
  "closeTime",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "commission",
  "swap",
  "netPnl",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];
export const REQUIRED_IMPORT_FIELDS: ImportField[] = ["symbol", "side", "lots", "openTime", "entryPrice"];

/** Maps each journal field to a column header in the file. */
export type ColumnMapping = Partial<Record<ImportField, string>>;

/** Header aliases we recognise automatically, lowercased. */
const ALIASES: Record<ImportField, string[]> = {
  symbol: ["symbol", "pair", "instrument", "market"],
  side: ["side", "direction", "type", "action", "buy/sell"],
  lots: ["lots", "volume", "size", "qty", "quantity", "volume (lots)"],
  openTime: ["opentime", "open time", "open date", "entry time", "opening time", "time"],
  closeTime: ["closetime", "close time", "close date", "exit time", "closing time"],
  entryPrice: ["entryprice", "entry price", "open price", "entry", "opening price"],
  exitPrice: ["exitprice", "exit price", "close price", "exit", "closing price"],
  stopLoss: ["stoploss", "stop loss", "sl", "s/l"],
  takeProfit: ["takeprofit", "take profit", "tp", "t/p"],
  commission: ["commission", "commissions", "fee", "fees"],
  swap: ["swap", "swaps", "rollover"],
  netPnl: ["netpnl", "net pnl", "net p&l", "net profit", "profit", "p&l", "pnl"],
};

export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const field of IMPORT_FIELDS) {
    const match = headers.find(
      (h) => !used.has(h) && ALIASES[field].includes(h.trim().toLowerCase()),
    );
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }
  return mapping;
}

export function parseSide(value: string): "buy" | "sell" | null {
  const v = value.trim().toLowerCase();
  if (["buy", "long", "b"].includes(v)) return "buy";
  if (["sell", "short", "s"].includes(v)) return "sell";
  return null;
}

/** Accepts ISO strings and "YYYY-MM-DD HH:mm[:ss]" / "YYYY.MM.DD HH:mm" (treated as UTC). */
export function parseDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}Z`;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

export const MAX_IMPORT_ROWS = 5000;

export function readCsv(text: string): ParsedFile {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return {
    headers: result.meta.fields ?? [],
    rows: result.data.slice(0, MAX_IMPORT_ROWS),
  };
}

export interface ImportResult {
  trades: TradeInput[];
  errors: { row: number; message: string }[];
}

export function mapRows(rows: Record<string, string>[], mapping: ColumnMapping): ImportResult {
  const trades: TradeInput[] = [];
  const errors: ImportResult["errors"] = [];
  const missing = REQUIRED_IMPORT_FIELDS.filter((f) => !mapping[f]);
  if (missing.length) {
    return { trades, errors: [{ row: 0, message: `Map these columns first: ${missing.join(", ")}` }] };
  }

  rows.forEach((row, i) => {
    const cell = (f: ImportField) => {
      const header = mapping[f];
      const value = header ? row[header] : undefined;
      return value === undefined || value.trim() === "" ? null : value.trim();
    };
    const side = parseSide(cell("side") ?? "");
    const openTime = parseDate(cell("openTime") ?? "");
    const closeRaw = cell("closeTime");
    const closeTime = closeRaw ? parseDate(closeRaw) : null;
    if (!side) return errors.push({ row: i + 2, message: `Unknown side "${cell("side") ?? ""}"` });
    if (!openTime) return errors.push({ row: i + 2, message: "Invalid open time" });
    if (closeRaw && !closeTime) return errors.push({ row: i + 2, message: "Invalid close time" });

    const parsed = tradeInputSchema.safeParse({
      symbol: cell("symbol") ?? "",
      side,
      lots: cell("lots"),
      openTime,
      closeTime,
      entryPrice: cell("entryPrice"),
      exitPrice: cell("exitPrice"),
      stopLoss: cell("stopLoss"),
      takeProfit: cell("takeProfit"),
      commission: cell("commission"),
      swap: cell("swap"),
      netPnl: cell("netPnl"),
    });
    if (parsed.success) trades.push(parsed.data);
    else errors.push({ row: i + 2, message: parsed.error.issues.map((x) => x.message).join("; ") });
  });
  return { trades, errors };
}

/** Prefixes cells that a spreadsheet would execute as a formula. */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return Papa.unparse({
    fields: columns,
    data: rows.map((r) => columns.map((c) => escapeCell(r[c]))),
  });
}
