# Decisions

Architecture decision record for the trading journal. Each entry says what we chose, why, and what it rules out. Add new entries at the bottom; never rewrite an accepted one, supersede it instead.

| # | Decision | Status | Date |
|---|----------|--------|------|
| 001 | Single user, private app | Accepted | 2026-10-23 |
| 002 | Next.js + Tailwind, pnpm monorepo | Accepted | 2026-10-23 |
| 003 | All TypeScript, no FastAPI | Accepted (supersedes earlier FastAPI proposal) | 2026-10-23 |
| 004 | Supabase Postgres, portable SQL migrations | Accepted | 2026-10-23 |
| 005 | Vercel primary, Cloudflare later | Accepted | 2026-10-23 |
| 006 | Automatic cTrader sync, manual override | Accepted | 2026-10-23 |
| 007 | Security baseline | Accepted | 2026-10-23 |
| 008 | AI coach deferred, provider-agnostic | Accepted (deferred) | 2026-10-23 |
| 009 | CI/CD on GitHub Actions | Accepted | 2026-10-23 |
| 010 | No marketing home page; demo mode for portfolio | Accepted | 2026-10-23 |
| 011 | MFA enforced in the database; CSP without nonces | Accepted (refines 007) | 2026-10-23 |

---

## 001. Single user, private app

The journal is for one trader. There is no public sign-up, billing or tenant admin.

- Supabase sign-ups are disabled; the one account is created by invite.
- Every table still carries `user_id` with Row Level Security, because it costs nothing now and protects the data if a demo account is added (see 010).

## 002. Next.js + Tailwind, pnpm monorepo

- `apps/web`: Next.js (App Router) with Tailwind CSS.
- `packages/core`: pure, framework-free TypeScript domain logic (trade reconstruction, stats, sessions, behaviour flags, CSV import). Fully unit tested.
- `packages/ctrader`: cTrader Open API client (OAuth helpers and JSON-over-WebSocket protocol).
- Turborepo runs tasks; pnpm workspaces manage packages.

## 003. All TypeScript, no FastAPI

The proposal suggested a Python FastAPI service. We dropped it because the app deploys to Vercel/Cloudflare, which cannot host a long-running Python service, and a third host would add cost, cold starts and a second CI pipeline.

- cTrader's Open API accepts JSON over WebSocket, so no Python SDK is needed.
- Sync runs inside a Next.js route handler (`/api/sync`), triggered every 15 minutes by Supabase `pg_cron` + `pg_net`, authenticated with a shared secret. A "Sync now" button calls the same code.
- Stats and behaviour detection live in `packages/core`.

Trade-off: no Python on this portfolio piece. Python analysis can be added later as a notebook or offline job against the same database if needed.

## 004. Supabase Postgres, portable SQL migrations

- Supabase provides Postgres, Auth (with TOTP MFA), Storage (screenshots) and cron.
- Schema lives in `supabase/migrations/*.sql`, plain Postgres. Supabase-specific pieces (auth, storage, cron) are kept in clearly named migrations so the core schema can run on any Postgres.
- Free-tier projects pause after about a week idle; the 15-minute sync keeps it active.

## 005. Vercel primary, Cloudflare later

- GitHub is the source of truth. Vercel's Git integration deploys `main` to production and every PR to a preview URL.
- Code avoids Vercel-only APIs so a Cloudflare Workers deploy (via the OpenNext adapter) can be added later. Cloudflare Pages' old `next-on-pages` adapter is deprecated and will not be used.
- Vercel Hobby cron only runs daily, which is why scheduling lives in Supabase (003).

## 006. Automatic cTrader sync, manual override

Pepperstone only allows TradingView trading through a Razor account on cTrader, so cTrader is the source of trades.

- OAuth with scope `accounts` (view only). The app can never trade or withdraw.
- Sync fetches deals (`ProtoOADealListReq`) since the last sync, in 7-day windows, and rebuilds trades by `positionId` (partial closes are merged).
- Money is converted using `moneyDigits`; volumes arrive in cents.
- Journal fields (notes, tags, emotions, rating, setup, plan link, stop loss) are never touched by sync.
- Broker fields (prices, volume, P&L) can be edited by hand. Once edited, the trade is marked `manually_edited` and sync stops overwriting it.
- Manual trades and CSV imports are first-class sources for anything the sync misses.

## 007. Security baseline

- cTrader access and refresh tokens are encrypted with AES-256-GCM before storage, kept in a table with no client-facing RLS policies, and only read server-side with the service role.
- RLS on every user table; the browser only ever uses the anon key plus the user session.
- TOTP MFA required to reach the app once enrolled.
- Zod validation on every server action and route handler input.
- Strict security headers (CSP, frame-ancestors none, HSTS, no-sniff, referrer policy).
- Screenshot uploads limited by type and size; files are private and served via short-lived signed URLs.
- CSV exports escape formula-leading cells (`=`, `+`, `-`, `@`) against spreadsheet injection.
- Secrets live only in Vercel and Supabase environment settings; CI scans for leaked secrets.

## 008. AI coach deferred, provider-agnostic

Built after the core journal is in use. It will:

- receive computed statistics only, never raw credentials, balances or account numbers;
- support a free provider (Gemini Flash or Groq), a paid one (Claude) and a local one (Ollama) behind one interface;
- enforce a monthly spend cap and degrade gracefully when free-tier limits are hit.

## 009. CI/CD on GitHub Actions

On every PR: install, lint, typecheck, unit tests, build, migration check against a throwaway Supabase database, secret scan (gitleaks), and CodeQL. Dependabot keeps dependencies current. Merges to `main` deploy via Vercel and apply migrations with the Supabase CLI.

## 010. No marketing home page; demo mode for portfolio

- `/` sends logged-out visitors to `/login` and logged-in users to `/dashboard`.
- Portfolio visitors get a separate demo deployment seeded with fictional trades, plus a case study on the portfolio site. Real trades are never shown publicly.

## 011. MFA enforced in the database; CSP without nonces

Two refinements to 007 found while building:

- **MFA.** Supabase's session-based assurance check reads the enrolled factor list from the auth cookie, whose embedded user object is not signed. A password holder could edit it to skip the 2FA redirect. So:
  - the app decides from verified data only: the `aal` claim of the signature-checked JWT plus the factor list fetched from the auth server (`lib/auth.ts`);
  - restrictive RLS policies on every user table and the attachments bucket return nothing to an `aal1` session once a verified factor exists (migration `enforce_mfa`), so even direct API calls cannot skip it;
  - pgTAP tests in `supabase/tests` prove both isolation between users and the MFA rule.
- **CSP.** Next.js nonce-based CSP requires fully dynamic rendering and is incompatible with the prerendered static shell of Cache Components. We keep Cache Components and allow `'unsafe-inline'` scripts, but load no third-party scripts, render no user HTML, and lock down `connect-src`, `img-src`, `form-action`, `frame-ancestors` and `object-src`.

