-- End-of-day review: the day (daily_journal), a section per market looked
-- at (eod_sessions), and the plays that presented in each, taken or not
-- (eod_plays). Screenshots reuse attachments and the private bucket.

alter table public.daily_journal
  add column grade text check (grade in ('A', 'B', 'C', 'D', 'F')),
  add column lesson text check (char_length(lesson) <= 2000),
  -- Markets reviewed that day, in the order they were filled in.
  add column markets text[] not null default '{}',
  add column created_at timestamptz not null default now();

comment on column public.daily_journal.notes is 'How the day went overall.';

create table public.eod_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  day date not null,
  market text not null check (market ~ '^[A-Z0-9._!-]{1,20}$'),
  went text check (char_length(went) <= 5000),
  did text check (char_length(did) <= 5000),
  should_have text check (char_length(should_have) <= 5000),
  chart_url text check (chart_url is null or chart_url like 'https://%'),
  no_trade boolean not null default false,
  no_setup boolean not null default false,
  -- [{ "setup": "...", "side": "buy" | "sell" }]: setups that were there.
  setups_seen jsonb not null default '[]'::jsonb check (jsonb_typeof(setups_seen) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day, market),
  -- Lets child rows reference (id, user_id), so a row can only hang off its owner's session.
  unique (id, user_id),
  foreign key (user_id, day) references public.daily_journal (user_id, day) on delete cascade
);

create trigger eod_sessions_touch before update on public.eod_sessions
  for each row execute function private.touch_updated_at();

alter table public.trades add constraint trades_id_user unique (id, user_id);

create table public.eod_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  position smallint not null default 0,
  presented_at time,
  setup text check (char_length(setup) <= 80),
  side text not null check (side in ('buy', 'sell')),
  outcome text not null check (outcome in ('taken', 'missed', 'skipped')),
  detail text check (char_length(detail) <= 2000),
  chart_url text check (chart_url is null or chart_url like 'https://%'),
  -- Reserved for linking a taken play to its journal trade.
  trade_id uuid,
  created_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.eod_sessions (id, user_id) on delete cascade,
  foreign key (trade_id, user_id) references public.trades (id, user_id) on delete set null (trade_id)
);

create index eod_plays_session on public.eod_plays (session_id, position);

-- An attachment belongs to exactly one trade or one end-of-day section.
alter table public.attachments
  alter column trade_id drop not null,
  add column eod_session_id uuid,
  add constraint attachments_eod_session_owner foreign key (eod_session_id, user_id)
    references public.eod_sessions (id, user_id) on delete cascade,
  add constraint attachments_one_owner check (num_nonnulls(trade_id, eod_session_id) = 1);

create index attachments_eod_session on public.attachments (eod_session_id) where eod_session_id is not null;

do $$
declare t text;
begin
  foreach t in array array['eod_sessions', 'eod_plays'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner can manage" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "require mfa when enrolled" on public.%I as restrictive for all to authenticated
         using ((select private.mfa_satisfied())) with check ((select private.mfa_satisfied()))', t);
  end loop;
end $$;
