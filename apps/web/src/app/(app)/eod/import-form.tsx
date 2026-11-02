"use client";

import { useActionState } from "react";
import { Button, FormMessage } from "@/components/ui";
import { importEodBackup } from "./actions";

export function ImportForm() {
  const [state, action, pending] = useActionState(importEodBackup, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input
        name="file"
        type="file"
        accept=".json,application/json"
        required
        aria-label="EOD Journal backup file"
        className="text-sm text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
      />
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Importing…" : "Import"}</Button>
      <FormMessage state={state} />
    </form>
  );
}
