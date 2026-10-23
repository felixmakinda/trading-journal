import { exchangeCode } from "@tj/ctrader";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";
import { saveTokens, syncConnection } from "@/lib/data/sync";
import { ctraderApp, serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import { STATE_COOKIE } from "../connect/route";

export const maxDuration = 60;

function back(status: string) {
  return Response.redirect(new URL(`/settings?ctrader=${status}`, serverEnv().APP_URL), 302);
}

export async function GET(request: NextRequest) {
  const { user } = await requireUser();
  const app = ctraderApp();
  if (!app) return back("not-configured");

  const cookieStore = await cookies();
  const expected = cookieStore.get(STATE_COOKIE)?.value ?? "";
  cookieStore.delete({ name: STATE_COOKIE, path: "/api/ctrader" });
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const code = request.nextUrl.searchParams.get("code");
  if (!expected || !safeEqual(state, expected)) return back("invalid-state");
  if (!code) return back("denied");

  const db = createServiceClient();
  let connectionId: string;
  try {
    const tokens = await exchangeCode(app, code);
    const { data: connection, error } = await db
      .from("broker_connections")
      .upsert({ user_id: user.id, provider: "ctrader", status: "active", last_error: null }, { onConflict: "user_id,provider" })
      .select("id")
      .single();
    if (error || !connection) throw new Error(error?.message ?? "no connection");
    connectionId = connection.id;
    await saveTokens(db, connectionId, tokens);
    await db.from("audit_log").insert({ user_id: user.id, action: "ctrader.connected", details: {} });
  } catch {
    return back("error");
  }

  try {
    await syncConnection(db, { id: connectionId, user_id: user.id }, "connect");
  } catch {
    // Connected, but the first sync failed; Settings shows the error and a retry button.
    return back("sync-error");
  }
  return back("connected");
}
