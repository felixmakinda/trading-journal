const AUTHORIZE_URL = "https://id.ctrader.com/my/settings/openapi/grantingaccess/";
const TOKEN_URL = "https://openapi.ctrader.com/apps/token";

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/** Builds the consent URL. Scope is always "accounts" (view only): the journal never trades. */
export function authorizeUrl(app: Pick<AppCredentials, "clientId" | "redirectUri">, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("scope", "accounts");
  url.searchParams.set("product", "web");
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  errorCode?: string | null;
  description?: string | null;
}

async function requestTokens(params: Record<string, string>, fetchImpl: typeof fetch): Promise<Tokens> {
  const url = new URL(TOKEN_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetchImpl(url, { method: "POST", headers: { Accept: "application/json" } });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || body.errorCode || !body.accessToken || !body.refreshToken) {
    throw new Error(`cTrader token request failed: ${body.errorCode ?? res.status} ${body.description ?? ""}`.trim());
  }
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    expiresAt: new Date(Date.now() + (body.expiresIn ?? 2_628_000) * 1000),
  };
}

export function exchangeCode(app: AppCredentials, code: string, fetchImpl: typeof fetch = fetch): Promise<Tokens> {
  return requestTokens(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: app.redirectUri,
      client_id: app.clientId,
      client_secret: app.clientSecret,
    },
    fetchImpl,
  );
}

/** Refreshing invalidates the old token pair, so persist the result before using it. */
export function refreshTokens(
  app: Omit<AppCredentials, "redirectUri">,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Tokens> {
  return requestTokens(
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: app.clientId,
      client_secret: app.clientSecret,
    },
    fetchImpl,
  );
}
