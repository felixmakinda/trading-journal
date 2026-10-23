"use client";

import type { Rules } from "@tj/core";
import { useActionState, useState } from "react";
import { Button, Field, FormMessage, inputStyles } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { createTag, saveProfile, saveRules } from "./actions";

export function ProfileForm({ values, timezones }: { values: { displayName: string; timezone: string; currency: string }; timezones: string[] }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name"><input name="displayName" defaultValue={values.displayName} className={inputStyles} /></Field>
        <Field label="Time zone" hint="Used for calendar days, hours and sessions">
          <select name="timezone" defaultValue={values.timezone} className={inputStyles}>
            {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Field>
        <Field label="Account currency"><input name="currency" defaultValue={values.currency} maxLength={3} className={`${inputStyles} uppercase`} /></Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>Save profile</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RulesForm({ rules }: { rules: Rules }) {
  const [state, action, pending] = useActionState(saveRules, null);
  const [propEnabled, setPropEnabled] = useState(rules.propFirm.enabled);
  const n = (name: string, value: number, label: string, hint?: string, step = "1") => (
    <Field label={label} hint={hint}>
      <input name={name} type="number" step={step} defaultValue={value} required className={`${inputStyles} tabular`} />
    </Field>
  );
  return (
    <form action={action} className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Behaviour flags</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {n("revengeWindowMinutes", rules.revengeWindowMinutes, "Revenge window (min)", "A trade this soon after a loss…")}
          {n("revengeSizeMultiplier", rules.revengeSizeMultiplier, "…with this many times the size", undefined, "0.1")}
          {n("maxTradesPerDay", rules.maxTradesPerDay, "Max trades per day")}
          {n("tiltLossStreak", rules.tiltLossStreak, "Tilt: losses in a row")}
          {n("tiltWindowMinutes", rules.tiltWindowMinutes, "Tilt window (min)")}
          {n("startingBalance", rules.startingBalance, "Starting balance", "Base of the equity curve", "0.01")}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" name="requireStopLoss" defaultChecked={rules.requireStopLoss} className="h-4 w-4 accent-[var(--accent)]" />
          Flag trades without a stop loss
        </label>
      </div>

      <Field label="Pre-trade checklist" hint="One item per line. Shown when you plan a trade.">
        <textarea name="checklist" rows={5} defaultValue={rules.checklist.join("\n")} className={inputStyles} />
      </Field>

      <div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="propEnabled" checked={propEnabled} onChange={(e) => setPropEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Track prop-firm limits
        </label>
        <div className={propEnabled ? "mt-3 grid gap-4 sm:grid-cols-3" : "hidden"}>
          <Field label="Firm"><input name="propName" defaultValue={rules.propFirm.name} className={inputStyles} /></Field>
          {n("propAccountSize", rules.propFirm.accountSize, "Account size", undefined, "0.01")}
          {n("propDailyLoss", rules.propFirm.dailyLossPercent, "Daily loss limit %", "Of the day's starting balance", "0.1")}
          {n("propMaxLoss", rules.propFirm.maxLossPercent, "Max loss %", "Of the account size", "0.1")}
          {n("propTarget", rules.propFirm.profitTargetPercent, "Profit target %", undefined, "0.1")}
          {n("propWarnAt", rules.propFirm.warnAtPercent, "Warn at % of a limit")}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>Save rules</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function TagForm() {
  const [state, action, pending] = useActionState(createTag, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Field label="New tag"><input name="name" required maxLength={40} className={`${inputStyles} w-48`} /></Field>
      <Field label="Colour"><input name="color" type="color" defaultValue="#64748b" className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface" /></Field>
      <Button type="submit" variant="secondary" disabled={pending}>Add</Button>
      <FormMessage state={state} />
    </form>
  );
}

type Enrolment = { factorId: string; qr: string; secret: string };

/** TOTP two-factor setup. Runs in the browser against Supabase Auth with the user's own session. */
export function MfaSetup({ enabledFactorId }: { enabledFactorId: string | null }) {
  const [factorId, setFactorId] = useState(enabledFactorId);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createClient();

  async function start() {
    setBusy(true);
    setMessage(null);
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of existing?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${Date.now()}` });
    setBusy(false);
    if (error || !data) return setMessage("Could not start setup. Try again.");
    setEnrolment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify() {
    if (!enrolment) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolment.factorId, code: code.trim() });
    setBusy(false);
    if (error) return setMessage("That code did not work. Check the time on your phone and try again.");
    setFactorId(enrolment.factorId);
    setEnrolment(null);
    setMessage("Two-factor login is on. You will be asked for a code each time you sign in.");
  }

  async function disable() {
    if (!factorId || !confirm("Turn off two-factor login?")) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) return setMessage("Could not turn it off. Sign in again and retry.");
    setFactorId(null);
    setMessage("Two-factor login is off.");
  }

  if (factorId) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">✓ Two-factor login is on.</span>
        <Button variant="danger" onClick={disable} disabled={busy}>Turn off</Button>
        {message && <p className="w-full text-sm text-ink-2">{message}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {!enrolment ? (
        <>
          <p className="text-sm text-ink-2">Recommended: protect your journal with a code from an authenticator app (Google Authenticator, Authy, 1Password).</p>
          <Button onClick={start} disabled={busy}>Set up two-factor login</Button>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL SVG from Supabase */}
          <img src={enrolment.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-lg bg-white p-2" />
          <p className="text-xs text-muted">Can&apos;t scan? Enter this key: <code className="select-all">{enrolment.secret}</code></p>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" className={`${inputStyles} tabular w-32`} />
            <Button onClick={verify} disabled={busy || code.length !== 6}>Verify</Button>
          </div>
        </div>
      )}
      {message && <p className="text-sm text-ink-2">{message}</p>}
    </div>
  );
}
