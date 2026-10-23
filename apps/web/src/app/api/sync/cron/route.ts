import { safeEqual } from "@/lib/crypto";
import { syncConnection } from "@/lib/data/sync";
import { serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Called every 15 minutes by Supabase pg_cron (see the sync_schedule migration). */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!safeEqual(token, serverEnv().SYNC_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const { data: connections } = await db
    .from("broker_connections")
    .select("id, user_id")
    .neq("status", "revoked");

  const results = [];
  for (const connection of connections ?? []) {
    try {
      results.push({ id: connection.id, ok: true, ...(await syncConnection(db, connection, "cron")) });
    } catch (error) {
      results.push({ id: connection.id, ok: false, error: error instanceof Error ? error.message : "failed" });
    }
  }
  return Response.json({ results });
}
