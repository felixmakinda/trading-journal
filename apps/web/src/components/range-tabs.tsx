import Link from "next/link";
import { RANGES, withParams, type RangeKey, type SearchParams } from "@/lib/range";
import { cx } from "./ui";

export function RangeTabs({ path, params, current }: { path: string; params: SearchParams; current: RangeKey }) {
  return (
    <nav aria-label="Date range" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={withParams(path, params, { range: r.key })}
          aria-current={r.key === current ? "true" : undefined}
          className={cx(
            "rounded-md px-2.5 py-1 text-xs font-medium",
            r.key === current ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink",
          )}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
