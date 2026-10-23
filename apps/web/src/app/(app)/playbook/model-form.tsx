"use client";

import type { PlaybookModel } from "@tj/core";
import { useActionState } from "react";
import { Button, Field, FormMessage, inputStyles } from "@/components/ui";
import type { ActionState } from "./actions";

interface Props {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  values?: Partial<PlaybookModel>;
  submitLabel: string;
}

export function ModelForm({ action, values = {}, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const err = (k: string) => state?.fieldErrors?.[k];
  const numberInput = (name: keyof PlaybookModel, step: string, placeholder: string) => (
    <input
      name={name}
      type="number"
      step={step}
      min="0"
      inputMode="decimal"
      placeholder={placeholder}
      defaultValue={(values[name] as number | null | undefined) ?? ""}
      className={`${inputStyles} tabular`}
    />
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Name" hint="Trades and plans with this setup name use these rules" error={err("name")}>
        <input name="name" required maxLength={80} defaultValue={values.name ?? ""} placeholder=".382 continuation" className={inputStyles} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Target" hint="In R" error={err("targetR")}>{numberInput("targetR", "0.1", "4")}</Field>
        <Field label="Break-even at" hint="In R" error={err("breakevenR")}>{numberInput("breakevenR", "0.1", "1.5")}</Field>
        <Field label="Max attempts" hint="Per idea" error={err("maxAttempts")}>{numberInput("maxAttempts", "1", "2")}</Field>
        <Field label="Entry window" hint="Minutes after the open" error={err("entryWindowMinutes")}>{numberInput("entryWindowMinutes", "1", "45")}</Field>
      </div>
      <Field label="Checklist" hint="One item per line. Shown when you plan a trade with this setup." error={err("checklist")}>
        <textarea name="checklist" rows={4} defaultValue={values.checklist?.join("\n") ?? ""} placeholder={"Clean M5 structure\nPullback reached the level"} className={inputStyles} />
      </Field>
      <Field label="Rules and notes" hint="How you trade it: entry, stop, management, what to avoid" error={err("description")}>
        <textarea name="description" rows={5} defaultValue={values.description ?? ""} className={inputStyles} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
