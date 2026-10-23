"use client";

import { useActionState } from "react";
import { syncNow } from "@/app/(app)/settings/actions";
import { Button, FormMessage } from "./ui";

export function SyncButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const [state, action, pending] = useActionState(syncNow, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Syncing…" : "Sync now"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
