import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Data Access Layer entry point: resolves the signed-in user or redirects.
 * Every page, action and route handler that touches user data calls this.
 *
 * MFA is decided from verified sources only: the `aal` claim of the
 * signature-checked JWT, and the factor list fetched from the auth server.
 * (The cookie's embedded user object is unsigned, so it is never trusted.)
 * The database enforces the same rule with restrictive RLS policies.
 */
export async function requireUser() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");

  if (data.claims.aal !== "aal2") {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    if (factors?.totp.some((f) => f.status === "verified")) redirect("/login/mfa");
  }

  const user: SessionUser = { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
  return { supabase, user };
}
