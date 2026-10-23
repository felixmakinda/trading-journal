import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import type { Database } from "./database.types";

/** Per-request client acting as the signed-in user. RLS applies. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(toSet) {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component: the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

/**
 * Service-role client that bypasses RLS. Only for server-side jobs that act
 * on behalf of a user we have already identified (sync, token storage).
 */
export function createServiceClient() {
  const env = serverEnv();
  return createAdminClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ServerClient = Awaited<ReturnType<typeof createClient>>;
export type ServiceClient = ReturnType<typeof createServiceClient>;
