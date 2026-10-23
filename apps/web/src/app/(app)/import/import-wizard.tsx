"use client";

import {
  IMPORT_FIELDS,
  REQUIRED_IMPORT_FIELDS,
  guessMapping,
  mapRows,
  readCsv,
  type ColumnMapping,
  type ImportField,
  type ParsedFile,
} from "@tj/core";
import { useActionState, useMemo, useState } from "react";
import { Button, Field, FormMessage, inputStyles } from "@/components/ui";
import { importTrades } from "./actions";

const LABELS: Record<ImportField, string> = {
  symbol: "Symbol", side: "Direction", lots: "Lots", openTime: "Open time", closeTime: "Close time",
  entryPrice: "Entry price", exitPrice: "Exit price", stopLoss: "Stop loss", takeProfit: "Take profit",
  commission: "Commission", swap: "Swap", netPnl: "Net P&L",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function ImportWizard() {
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [state, action, pending] = useActionState(importTrades, null);
  const result = useMemo(() => (file ? mapRows(file.rows, mapping) : null), [file, mapping]);

  async function onFile(input: HTMLInputElement) {
    const f = input.files?.[0];
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) return setFileError("Files must be 5 MB or smaller.");
    const parsed = readCsv(await f.text());
    if (!parsed.headers.length) return setFileError("That file has no header row.");
    setFile(parsed);
    setMapping(guessMapping(parsed.headers));
  }

  return (
    <div className="space-y-5">
      <Field label="CSV file" hint="One row per closed or open trade, with a header row." error={fileError ?? undefined}>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.currentTarget)}
          className="text-sm text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
      </Field>

      {file && (
        <>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-2">Match your columns</h3>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {IMPORT_FIELDS.map((f) => (
                <Field key={f} label={`${LABELS[f]}${REQUIRED_IMPORT_FIELDS.includes(f) ? " *" : ""}`}>
                  <select
                    value={mapping[f] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || undefined }))}
                    className={inputStyles}
                  >
                    <option value="">Not in file</option>
                    {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </Field>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Times without a zone are read as UTC. Commission is stored as a cost whatever its sign.</p>
          </div>

          {result && (
            <div className="rounded-lg bg-surface-2 p-3 text-sm">
              <p>
                <strong>{result.trades.length}</strong> of {file.rows.length} rows ready to import.
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-loss-ink">
                  {result.errors.slice(0, 50).map((e) => (
                    <li key={`${e.row}-${e.message}`}>{e.row ? `Row ${e.row}: ` : ""}{e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <form action={action} className="flex items-center gap-3">
            <input type="hidden" name="trades" value={JSON.stringify(result?.trades ?? [])} />
            <Button type="submit" disabled={pending || !result?.trades.length}>
              {pending ? "Importing…" : `Import ${result?.trades.length ?? 0} trades`}
            </Button>
            <FormMessage state={state} />
          </form>
        </>
      )}
    </div>
  );
}
