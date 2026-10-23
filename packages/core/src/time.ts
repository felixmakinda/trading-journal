export const DEFAULT_TIMEZONE = "Africa/Nairobi";

export type Session = "asia" | "london" | "overlap" | "newyork" | "late";

export const SESSION_LABELS: Record<Session, string> = {
  asia: "Asia",
  london: "London",
  overlap: "London/NY overlap",
  newyork: "New York",
  late: "After hours",
};

/**
 * Trading session by UTC hour of entry. Boundaries are the common retail
 * approximations and ignore DST shifts of an hour either way.
 *   Asia 23:00-07:00, London 07:00-12:00, overlap 12:00-16:00,
 *   New York 16:00-21:00, after hours 21:00-23:00 (all UTC).
 */
export function sessionOf(iso: string): Session {
  const h = new Date(iso).getUTCHours();
  if (h >= 23 || h < 7) return "asia";
  if (h < 12) return "london";
  if (h < 16) return "overlap";
  if (h < 21) return "newyork";
  return "late";
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

export interface LocalParts {
  /** YYYY-MM-DD in the given zone. */
  day: string;
  hour: number;
  /** Mon, Tue, ... */
  weekday: string;
}

export function localParts(iso: string, timeZone = DEFAULT_TIMEZONE): LocalParts {
  const parts = formatter(timeZone).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    weekday: get("weekday"),
  };
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function holdingMinutes(openIso: string, closeIso: string): number {
  return Math.max(0, Math.round((Date.parse(closeIso) - Date.parse(openIso)) / 60_000));
}
