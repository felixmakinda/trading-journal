"use client";

import { EMOTIONS } from "@tj/core";
import { useActionState } from "react";
import { Button, Field, FormMessage, inputStyles } from "@/components/ui";
import type { ActionState } from "../actions";

interface Props {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  values: {
    setup: string | null;
    rating: number | null;
    emotionBefore: string | null;
    emotionAfter: string | null;
    followedPlan: boolean | null | undefined;
    stopLoss: number | null;
    takeProfit: number | null;
    chartUrl: string | null;
    notes: string | null;
    planId: string | null;
    tagIds: string[];
  };
  setups: string[];
  tags: { id: string; name: string; color: string }[];
  plans: { id: string; label: string }[];
}

export function JournalForm({ action, values, setups, tags, plans }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Setup" error={err("setup")}>
          <input name="setup" list="setups" defaultValue={values.setup ?? ""} placeholder="London breakout" className={inputStyles} />
          <datalist id="setups">{setups.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Followed the plan?">
          <select name="followedPlan" defaultValue={values.followedPlan === true ? "yes" : values.followedPlan === false ? "no" : ""} className={inputStyles}>
            <option value="">Not recorded</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        <Field label="Execution rating">
          <select name="rating" defaultValue={values.rating ?? ""} className={inputStyles}>
            <option value="">–</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}{"☆".repeat(5 - n)}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Feeling before">
          <select name="emotionBefore" defaultValue={values.emotionBefore ?? ""} className={inputStyles}>
            <option value="">–</option>
            {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Field>
        <Field label="Feeling after">
          <select name="emotionAfter" defaultValue={values.emotionAfter ?? ""} className={inputStyles}>
            <option value="">–</option>
            {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Field>
        <Field label="Stop loss" hint="Used for R multiple" error={err("stopLoss")}>
          <input name="stopLoss" type="number" step="any" defaultValue={values.stopLoss ?? ""} className={`${inputStyles} tabular`} />
        </Field>
        <Field label="Take profit" error={err("takeProfit")}>
          <input name="takeProfit" type="number" step="any" defaultValue={values.takeProfit ?? ""} className={`${inputStyles} tabular`} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="TradingView snapshot link" hint="Camera icon → Copy link. Shown inline below." error={err("chartUrl")}>
          <input name="chartUrl" type="url" defaultValue={values.chartUrl ?? ""} placeholder="https://www.tradingview.com/x/…" className={inputStyles} />
        </Field>
        <Field label="Linked plan">
          <select name="planId" defaultValue={values.planId ?? ""} className={inputStyles}>
            <option value="">None</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
      </div>
      {tags.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-ink-2">Tags</legend>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-sm has-checked:bg-surface-2">
                <input type="checkbox" name="tags" value={t.id} defaultChecked={values.tagIds.includes(t.id)} className="accent-[var(--accent)]" />
                <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field label="Notes" error={err("notes")}>
        <textarea name="notes" rows={5} defaultValue={values.notes ?? ""} placeholder="What did you see? What would you do differently?" className={inputStyles} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save journal"}</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
