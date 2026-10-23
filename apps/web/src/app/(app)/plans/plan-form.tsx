"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormMessage, inputStyles } from "@/components/ui";
import { createPlan } from "./actions";

export function PlanForm({ checklist, setups }: { checklist: string[]; setups: string[] }) {
  const [state, action, pending] = useActionState(createPlan, null);
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [checked, setChecked] = useState(0);
  const err = (k: string) => state?.fieldErrors?.[k];

  const risk = Math.abs(Number(entry) - Number(stop));
  const reward = Math.abs(Number(target) - Number(entry));
  const rr = entry && stop && target && risk > 0 ? reward / risk : null;

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Symbol" error={err("symbol")}>
          <input name="symbol" required placeholder="EURUSD" className={`${inputStyles} uppercase`} />
        </Field>
        <Field label="Direction">
          <select name="side" className={inputStyles}>
            <option value="buy">Long (buy)</option>
            <option value="sell">Short (sell)</option>
          </select>
        </Field>
        <Field label="Setup" error={err("setup")}>
          <input name="setup" list="plan-setups" placeholder="Trend pullback" className={inputStyles} />
          <datalist id="plan-setups">{setups.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Entry" error={err("entryPrice")}>
          <input name="entryPrice" type="number" step="any" value={entry} onChange={(e) => setEntry(e.target.value)} className={`${inputStyles} tabular`} />
        </Field>
        <Field label="Stop loss" error={err("stopLoss")}>
          <input name="stopLoss" type="number" step="any" value={stop} onChange={(e) => setStop(e.target.value)} className={`${inputStyles} tabular`} />
        </Field>
        <Field label="Take profit" error={err("takeProfit")}>
          <input name="takeProfit" type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} className={`${inputStyles} tabular`} />
        </Field>
        <Field label="Risk % of account" error={err("riskPercent")}>
          <input name="riskPercent" type="number" step="0.05" min="0" max="100" placeholder="1" className={`${inputStyles} tabular`} />
        </Field>
      </div>
      <p className="tabular text-sm text-ink-2" aria-live="polite">
        Reward to risk: <strong className="text-ink">{rr === null ? "–" : `${rr.toFixed(2)} : 1`}</strong>
      </p>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-2">
          Checklist <span className="font-normal text-muted">({checked}/{checklist.length})</span>
        </legend>
        <div className="space-y-2">
          {checklist.map((item, i) => (
            <label key={item} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="check"
                value={i}
                onChange={(e) => setChecked((n) => n + (e.target.checked ? 1 : -1))}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {item}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Why this trade?" error={err("thesis")}>
        <textarea name="thesis" rows={4} placeholder="What you see, what invalidates it, where you get out." className={inputStyles} />
      </Field>
      <Field label="TradingView snapshot link" error={err("chartUrl")}>
        <input name="chartUrl" type="url" placeholder="https://www.tradingview.com/x/…" className={inputStyles} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save plan"}</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
