import "server-only";
import { z } from "zod";

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "Must be 32 bytes, base64 encoded");

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  APP_URL: z.string().url(),
  TOKEN_ENCRYPTION_KEY: base64Key,
  SYNC_SECRET: z.string().min(32),
  CTRADER_CLIENT_ID: z.string().optional(),
  CTRADER_CLIENT_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** Validated server environment. Read lazily so builds work without secrets. */
export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverSchema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid server environment: ${fields}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function ctraderApp() {
  const env = serverEnv();
  if (!env.CTRADER_CLIENT_ID || !env.CTRADER_CLIENT_SECRET) return null;
  return {
    clientId: env.CTRADER_CLIENT_ID,
    clientSecret: env.CTRADER_CLIENT_SECRET,
    redirectUri: new URL("/api/ctrader/callback", env.APP_URL).toString(),
  };
}
