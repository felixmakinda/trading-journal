"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type AuthState = { ok?: boolean; message?: string; email?: string } | null;

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  const email = String(form.get("email") ?? "").slice(0, 200);
  if (!parsed.success) return { message: "Enter your email and password.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  // One generic message for every failure, so the form does not reveal which accounts exist.
  if (error || !data.user) return { message: "Email or password is incorrect.", email };

  await createServiceClient().from("audit_log").insert({ user_id: data.user.id, action: "auth.login", details: {} });
  redirect("/dashboard");
}

export async function verifyMfa(_: AuthState, form: FormData): Promise<AuthState> {
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { message: "Enter the 6-digit code from your authenticator app." };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/dashboard");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { message: "That code did not work. Wait for a new one and try again." };
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
