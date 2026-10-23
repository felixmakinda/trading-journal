"use client";

import { useActionState } from "react";
import { Button, Field, FormMessage, inputStyles } from "@/components/ui";
import { login, verifyMfa } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        <input name="email" type="email" autoComplete="username" required defaultValue={state?.email} className={inputStyles} />
      </Field>
      <Field label="Password">
        <input name="password" type="password" autoComplete="current-password" required className={inputStyles} />
      </Field>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function MfaForm() {
  const [state, action, pending] = useActionState(verifyMfa, null);
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-ink-2">Enter the 6-digit code from your authenticator app.</p>
      <Field label="Code">
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          className={`${inputStyles} tabular text-center text-lg tracking-[0.4em]`}
        />
      </Field>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Verify"}
      </Button>
    </form>
  );
}
