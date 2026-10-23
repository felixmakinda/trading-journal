"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EquityPoint } from "@tj/core";
import { money, signedMoney } from "@/lib/format";

interface Props {
  points: EquityPoint[];
  currency: string;
  timeZone: string;
}

/** Single-series equity curve: no legend (the card title names it), crosshair tooltip on hover. */
export function EquityChart({ points, currency, timeZone }: Props) {
  const data = points.map((p) => ({ ...p, t: Date.parse(p.time) }));
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short" });
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  return (
    <div className="h-64 w-full lg:h-96" role="img" aria-label="Equity curve: account equity after each closed trade">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => day.format(t)}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v: number) => compact.format(v)}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={48}
            domain={["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
              if (!p) return null;
              return (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm">
                  <div className="text-muted">{day.format(p.t)}</div>
                  <div className="tabular mt-0.5 font-semibold text-ink">{money(p.equity, currency)}</div>
                  {p.drawdown < 0 && <div className="tabular text-ink-2">Drawdown {signedMoney(p.drawdown, currency)}</div>}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke="var(--gain)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="var(--gain)"
            fillOpacity={0.1}
            activeDot={{ r: 4, fill: "var(--gain)", stroke: "var(--surface)", strokeWidth: 2 }}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
