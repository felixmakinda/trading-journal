export const RANGES = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
  { key: "ytd", label: "YTD", days: null },
  { key: "all", label: "All", days: null },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

export function parseRange(value: unknown, fallback: RangeKey = "90d"): RangeKey {
  return RANGES.some((r) => r.key === value) ? (value as RangeKey) : fallback;
}

/** Inclusive lower bound (ISO) for a range, or null for all time. */
export function rangeStart(range: RangeKey, now = new Date()): string | null {
  if (range === "all") return null;
  if (range === "ytd") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const days = RANGES.find((r) => r.key === range)!.days!;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v || undefined;
}

export function withParams(path: string, params: SearchParams, changes: Record<string, string | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (first) q.set(k, first);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
