import type { Metadata } from "next";
import { Suspense } from "react";
import { SyncButton } from "@/components/sync-button";
import { Badge, Button, ButtonLink, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProfile, listTags } from "@/lib/data/trades";
import { ctraderApp } from "@/lib/env";
import { dateTime } from "@/lib/format";
import { param, type SearchParams } from "@/lib/range";
import { deleteTag, disconnectBroker } from "./actions";
import { MfaSetup, ProfileForm, RulesForm, TagForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

const CONNECT_MESSAGES: Record<string, string> = {
  connected: "cTrader connected and your trades are synced.",
  "sync-error": "cTrader connected, but the first sync failed. See the error below.",
  denied: "Access was not granted on the cTrader page.",
  "invalid-state": "The connection request expired. Please try again.",
  error: "Could not connect to cTrader. Please try again.",
  "not-configured": "The cTrader app credentials are not set on the server yet.",
};

export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Settings({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const [profile, tags, connection, runs, accounts, factors] = await Promise.all([
    getProfile(supabase, user.id),
    listTags(supabase),
    supabase.from("broker_connections").select("*").maybeSingle(),
    supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(5),
    supabase.from("trading_accounts").select("*").order("created_at"),
    supabase.auth.mfa.listFactors(),
  ]);
  const conn = connection.data && connection.data.status !== "revoked" ? connection.data : null;
  const notice = CONNECT_MESSAGES[param(params, "ctrader") ?? ""];
  const verifiedFactor = factors.data?.totp.find((f) => f.status === "verified")?.id ?? null;
  const configured = ctraderApp() !== null;

  return (
    <div className="space-y-4">
      {notice && <p role="status" className="rounded-lg bg-surface-2 px-4 py-3 text-sm">{notice}</p>}

      <Card title="Broker connection">
        <div className="space-y-4">
          <p className="text-sm text-ink-2">
            Pepperstone runs TradingView trading on your Razor account in cTrader. Connecting gives the journal
            <strong className="text-ink"> read-only</strong> access: it can see trades, but can never place, change or close one.
          </p>
          {conn ? (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {conn.status === "error" ? <Badge tone="critical">✕ Sync error</Badge> : <Badge tone="accent">✓ Connected</Badge>}
                <span className="text-ink-2">Last sync {dateTime(conn.last_synced_at, profile.timezone)} · automatic every 15 minutes</span>
              </div>
              {conn.last_error && <p className="text-sm text-loss-ink">{conn.last_error}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <SyncButton variant="primary" />
                <form action={disconnectBroker}>
                  <Button variant="danger">Disconnect</Button>
                </form>
              </div>
            </>
          ) : (
            <ButtonLink href="/api/ctrader/connect" prefetch={false} aria-disabled={!configured} className={configured ? "" : "pointer-events-none opacity-50"}>
              Connect cTrader
            </ButtonLink>
          )}
          {!conn && !configured && (
            <p className="text-xs text-muted">
              Available once the cTrader app credentials (CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET) are set on the server.
            </p>
          )}
          {(accounts.data?.length ?? 0) > 0 && (
            <ul className="space-y-1 text-sm">
              {accounts.data!.map((a) => (
                <li key={a.id} className="text-ink-2">
                  {a.name} · {a.broker} {a.platform} {a.trader_login ? `#${a.trader_login}` : ""} · {a.is_live ? "live" : "demo"} · {a.currency}
                </li>
              ))}
            </ul>
          )}
          {(runs.data?.length ?? 0) > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-2">Recent syncs</summary>
              <ul className="tabular mt-2 space-y-1 text-xs text-ink-2">
                {runs.data!.map((r) => (
                  <li key={r.id}>
                    {dateTime(r.started_at, profile.timezone)} · {r.trigger} · {r.status}
                    {r.status === "success" && ` · ${r.deals_fetched} deals, ${r.trades_upserted} trades`}
                    {r.error && ` · ${r.error}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Card>

      <Card title="Profile">
        <ProfileForm
          values={{ displayName: profile.displayName ?? "", timezone: profile.timezone, currency: profile.currency }}
          timezones={Intl.supportedValuesOf("timeZone")}
        />
      </Card>

      <Card title="Rules">
        <RulesForm rules={profile.rules} />
      </Card>

      <Card title="Tags">
        <div className="space-y-4">
          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center gap-1.5 rounded-full border border-line py-1 pr-1 pl-2.5 text-sm">
                  <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                  {t.name}
                  <form action={deleteTag}>
                    <input type="hidden" name="id" value={t.id} />
                    <button aria-label={`Delete tag ${t.name}`} className="rounded-full px-1.5 text-muted hover:bg-surface-2 hover:text-loss-ink">×</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <TagForm />
        </div>
      </Card>

      <Card title="Security">
        <MfaSetup enabledFactorId={verifiedFactor} />
      </Card>

      <Card title="Your data">
        <p className="mb-3 text-sm text-ink-2">Everything in the journal is yours. Download it at any time.</p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/api/export?format=csv" variant="secondary" prefetch={false}>Download CSV</ButtonLink>
          <ButtonLink href="/api/export?format=json" variant="secondary" prefetch={false}>Download JSON</ButtonLink>
        </div>
      </Card>
    </div>
  );
}
