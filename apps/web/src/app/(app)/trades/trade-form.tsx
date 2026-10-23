"use client";

import { useActionState } from "react";
import { Button, Field, FormMessage, inputStyles } from "@/components/ui";
import type { ActionState } from "./actions";

export interface TradeFormValues {
  symbol: string;
  side: "buy" | "sell";
  lots: number | "";
  openTime: string;
  closeTime: string;
  entryPrice: number | "";
  exitPrice: number | "";
  stopLoss: number | "";
  takeProfit: number | "";
  commission: number | "";
  swap: number | "";
  netPnl: number | "";
}

export const emptyTrade: TradeFormValues = {
  symbol: "", side: "buy", lots: "", openTime: "", closeTime: "", entryPrice: "", exitPrice: "",
  stopLoss: "", takeProfit: "", commission: "", swap: "", netPnl: "",
};

interface Props {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  values: TradeFormValues;
  submitLabel: string;
  timeZone: string;
}

export function TradeForm({ action, values, submitLabel, timeZone }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const err = (k: string) => state?.fieldErrors?.[k];
  const numberInput = (name: keyof TradeFormValues, step = "any", required = false) => (
    <input name={name} type="number" step={step} inputMode="decimal" defaultValue={values[name]} required={required} className={`${inputStyles} tabular`} />
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Symbol" error={err("symbol")}>
          <input name="symbol" defaultValue={values.symbol} required placeholder="NAS100, EURUSD, MNQ…" className={`${inputStyles} uppercase`} />
        </Field>
        <Field label="Direction" error={err("side")}>
          <select name="side" defaultValue={values.side} className={inputStyles}>
            <option value="buy">Long (buy)</option>
            <option value="sell">Short (sell)</option>
          </select>
        </Field>
        <Field label="Size" hint="Lots, or contracts for futures" error={err("lots")}>{numberInput("lots", "0.01", true)}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Opened (${timeZone})`} error={err("openTime")}>
          <input name="openTime" type="datetime-local" defaultValue={values.openTime} required className={inputStyles} />
        </Field>
        <Field label="Closed" hint="Leave empty while the trade is open" error={err("closeTime")}>
          <input name="closeTime" type="datetime-local" defaultValue={values.closeTime} className={inputStyles} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Entry price" error={err("entryPrice")}>{numberInput("entryPrice", "any", true)}</Field>
        <Field label="Exit price" error={err("exitPrice")}>{numberInput("exitPrice")}</Field>
        <Field label="Stop loss" error={err("stopLoss")}>{numberInput("stopLoss")}</Field>
        <Field label="Take profit" error={err("takeProfit")}>{numberInput("takeProfit")}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Net P&L" hint="From your statement. Left empty, it is calculated for futures and USD-priced instruments." error={err("netPnl")}>{numberInput("netPnl")}</Field>
        <Field label="Commission" error={err("commission")}>{numberInput("commission")}</Field>
        <Field label="Swap" error={err("swap")}>{numberInput("swap")}</Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
