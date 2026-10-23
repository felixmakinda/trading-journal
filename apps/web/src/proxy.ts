import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login"]);

/**
 * Refreshes the Supabase session cookie and routes by session presence:
 * no session -> /login; signed in on /login or / -> /dashboard.
 * The MFA decision lives in the Data Access Layer (lib/auth.ts) and in RLS,
 * where it is checked against verified data rather than the cookie.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(toSet) {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const res = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) res.cookies.set(cookie);
    return res;
  };

  if (!data?.claims) return PUBLIC_PATHS.has(path) ? response : redirect("/login");
  if (PUBLIC_PATHS.has(path) || path === "/") return redirect("/dashboard");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
