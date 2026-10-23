"use client";

import { useActionState } from "react";
import { Button, FormMessage } from "@/components/ui";
import type { ActionState } from "../actions";

export function UploadForm({ action }: { action: (state: ActionState, form: FormData) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input
        name="file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        required
        className="text-sm text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
      />
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
      <FormMessage state={state} />
    </form>
  );
}
