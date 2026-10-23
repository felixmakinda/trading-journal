import { authorizeUrl } from "@tj/ctrader";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { ctraderApp } from "@/lib/env";

export const STATE_COOKIE = "ctrader_oauth_state";

/** Starts the read-only cTrader OAuth flow. */
export async function GET() {
  await requireUser();
  const app = ctraderApp();
  if (!app) return Response.json({ error: "cTrader is not configured" }, { status: 503 });

  const state = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/ctrader",
    maxAge: 600,
  });
  return Response.redirect(authorizeUrl(app, state), 302);
}
