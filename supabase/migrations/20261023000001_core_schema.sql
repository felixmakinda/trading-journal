-- Core journal schema. Plain Postgres apart from auth.users / auth.uid(),
-- which are isolated to foreign keys and RLS policies (ADR 004).

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Profiles ---------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'Africa/Nairobi',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create or replace function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.create_profile();

-- Broker connections -----------------------------------------------------

create table public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'ctrader' check (provider in ('ctrader')),
  status text not null default 'active' check (status in ('active', 'error', 'revoked')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create trigger broker_connections_touch before update on public.broker_connections
  for each row execute function private.touch_updated_at();

-- Encrypted OAuth tokens. RLS is on with no policies, so only the service
-- role (server-side sync) can read or write this table (ADR 007).
create table public.broker_secrets (
  connection_id uuid primary key references public.broker_connections (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create trigger broker_secrets_touch before update on public.broker_secrets
  for each row execute function private.touch_updated_at();

-- Trading accounts ---------------------------------------------------------

create table public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid references public.broker_connections (id) on delete set null,
  broker text not null default 'Pepperstone',
  platform text not null check (platform in ('ctrader', 'mt4', 'mt5', 'manual')),
  external_id text,
  trader_login text,
  name text not null default 'Main account',
  currency text not null default 'USD',
  is_live boolean not null default true,
  balance numeric(16, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, external_id)
);

create trigger trading_accounts_touch before update on public.trading_accounts
  for each row execute function private.touch_updated_at();

create table public.symbols (
  account_id uuid not null references public.trading_accounts (id) on delete cascade,
  external_symbol_id bigint not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  digits int,
  pip_position int,
  lot_size numeric,
  primary key (account_id, external_symbol_id)
);

-- Plans, trades, executions -----------------------------------------------

create table public.trade_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  setup text,
  entry_price numeric,
  stop_loss numeric,
  take_profit numeric,
  risk_percent numeric check (risk_percent is null or risk_percent between 0 and 100),
  thesis text check (char_length(thesis) <= 5000),
  chart_url text,
  checklist jsonb not null default '[]'::jsonb,
  status text not null default 'planned' check (status in ('planned', 'taken', 'skipped', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trade_plans_user_created on public.trade_plans (user_id, created_at desc);
create trigger trade_plans_touch before update on public.trade_plans
  for each row execute function private.touch_updated_at();

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.trading_accounts (id) on delete set null,
  source text not null check (source in ('ctrader', 'manual', 'import')),
  external_position_id text,

  -- Broker fields: written by sync unless manually_edited is true (ADR 006).
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  status text not null check (status in ('open', 'closed')),
  volume numeric not null check (volume > 0),
  lots numeric not null,
  open_time timestamptz not null,
  close_time timestamptz,
  entry_price numeric not null,
  exit_price numeric,
  gross_pnl numeric(16, 2) not null default 0,
  commission numeric(16, 2) not null default 0,
  swap numeric(16, 2) not null default 0,
  net_pnl numeric(16, 2) not null default 0,
  pip_size numeric,
  pips numeric,
  manually_edited boolean not null default false,

  -- Journal fields: only ever written by the user.
  stop_loss numeric,
  take_profit numeric,
  r_multiple numeric,
  setup text check (char_length(setup) <= 80),
  notes text check (char_length(notes) <= 10000),
  rating smallint check (rating between 1 and 5),
  emotion_before text,
  emotion_after text,
  followed_plan boolean,
  chart_url text check (chart_url is null or chart_url like 'https://%'),
  plan_id uuid references public.trade_plans (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, external_position_id),
  check ((status = 'closed') = (close_time is not null and exit_price is not null))
);

create index trades_user_close on public.trades (user_id, close_time desc nulls first);
create index trades_user_open on public.trades (user_id, open_time desc);
create index trades_user_symbol on public.trades (user_id, symbol);
create index trades_plan on public.trades (plan_id) where plan_id is not null;
create trigger trades_touch before update on public.trades
  for each row execute function private.touch_updated_at();

create table public.executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.trading_accounts (id) on delete cascade,
  trade_id uuid references public.trades (id) on delete cascade,
  external_deal_id text not null,
  external_position_id text not null,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  volume numeric not null,
  price numeric not null,
  executed_at timestamptz not null,
  commission numeric(16, 2) not null default 0,
  close_detail jsonb,
  unique (account_id, external_deal_id)
);

create index executions_position on public.executions (account_id, external_position_id);
create index executions_trade on public.executions (trade_id);

-- Tags, attachments, daily journal -------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create unique index tags_user_name on public.tags (user_id, lower(name));

create table public.trade_tags (
  trade_id uuid not null references public.trades (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (trade_id, tag_id)
);

create index trade_tags_tag on public.trade_tags (tag_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes int not null check (size_bytes between 1 and 5242880),
  created_at timestamptz not null default now()
);

create index attachments_trade on public.attachments (trade_id);

create table public.daily_journal (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  mood smallint check (mood between 1 and 5),
  sleep_hours numeric check (sleep_hours between 0 and 24),
  notes text check (char_length(notes) <= 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create trigger daily_journal_touch before update on public.daily_journal
  for each row execute function private.touch_updated_at();

-- Operations ---------------------------------------------------------------

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid references public.broker_connections (id) on delete cascade,
  trigger text not null check (trigger in ('cron', 'manual', 'connect')),
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  deals_fetched int not null default 0,
  trades_upserted int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index sync_runs_user_started on public.sync_runs (user_id, started_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_user_created on public.audit_log (user_id, created_at desc);

-- Row Level Security ---------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.broker_connections enable row level security;
alter table public.broker_secrets enable row level security;
alter table public.trading_accounts enable row level security;
alter table public.symbols enable row level security;
alter table public.trade_plans enable row level security;
alter table public.trades enable row level security;
alter table public.executions enable row level security;
alter table public.tags enable row level security;
alter table public.trade_tags enable row level security;
alter table public.attachments enable row level security;
alter table public.daily_journal enable row level security;
alter table public.sync_runs enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.broker_secrets from anon, authenticated;

-- Full ownership: the user reads and writes their own rows.
do $$
declare t text;
begin
  foreach t in array array['trade_plans', 'trades', 'tags', 'trade_tags', 'attachments', 'daily_journal'] loop
    execute format(
      'create policy "owner can manage" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

create policy "owner can read" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner can update" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Read-only to the user; written server-side by sync with the service role.
do $$
declare t text;
begin
  foreach t in array array['broker_connections', 'trading_accounts', 'symbols', 'executions', 'sync_runs', 'audit_log'] loop
    execute format(
      'create policy "owner can read" on public.%I for select to authenticated
         using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Users may rename their accounts and add manual ones.
create policy "owner can insert manual accounts" on public.trading_accounts for insert to authenticated
  with check (user_id = (select auth.uid()) and platform = 'manual');
create policy "owner can update accounts" on public.trading_accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
