-- Playbook models, and points instead of pips for everything that is not FX.

-- Playbook ----------------------------------------------------------------

-- A named setup with its own rules. Trades and plans link to a model through
-- their setup name (case-insensitive), so analytics by setup keep working.
create table public.playbook_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 5000),
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  target_r numeric check (target_r is null or target_r > 0),
  breakeven_r numeric check (breakeven_r is null or breakeven_r > 0),
  max_attempts smallint check (max_attempts is null or max_attempts between 1 and 10),
  entry_window_minutes int check (entry_window_minutes is null or entry_window_minutes between 1 and 1440),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index playbook_models_user_name on public.playbook_models (user_id, lower(name));
create trigger playbook_models_touch before update on public.playbook_models
  for each row execute function private.touch_updated_at();

alter table public.playbook_models enable row level security;
create policy "owner can manage" on public.playbook_models for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "require mfa when enrolled" on public.playbook_models as restrictive for all to authenticated
  using ((select private.mfa_satisfied())) with check ((select private.mfa_satisfied()));

-- Renaming a model renames it on the trades and plans that use it, in the
-- same transaction, so the link by name never breaks.
create or replace function private.rename_model_setup() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    update public.trades set setup = new.name
    where user_id = new.user_id and lower(setup) = lower(old.name);
    update public.trade_plans set setup = new.name
    where user_id = new.user_id and lower(setup) = lower(old.name);
  end if;
  return new;
end;
$$;

create trigger playbook_models_rename after update of name on public.playbook_models
  for each row execute function private.rename_model_setup();

-- Points ------------------------------------------------------------------

-- Matches packages/core instrumentSpec: only currency pairs count in pips.
-- Indices, metals, energy, crypto and futures count whole points of price.
update public.trades
set pip_size = 1,
    pips = case when exit_price is null then null
           else round((exit_price - entry_price) * (case when side = 'buy' then 1 else -1 end), 1) end
where upper(symbol) !~ '^(USD|EUR|GBP|JPY|CHF|CAD|AUD|NZD|SEK|NOK|DKK|SGD|HKD|ZAR|MXN|TRY|PLN|CZK|HUF|CNH|THB|ILS){2}$';

-- Demo data ---------------------------------------------------------------

-- Same as before, plus index and gold CFDs counted in points, and a few
-- fictional playbook models for the demo setups.
create or replace function private.load_demo_trades(p_email text) returns integer
language plpgsql set search_path = '' as $$
declare
  demo uuid;
  acct uuid;
  symbols text[] := array['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'NAS100', 'GER40'];
  setups text[] := array['London breakout', 'NY reversal', 'Trend pullback', 'Range fade', 'News spike'];
  emotions text[] := array['calm', 'confident', 'focused', 'anxious', 'frustrated', 'bored'];
  sym text;
  side text;
  pip numeric;
  contract numeric;
  entry numeric;
  stop_dist numeric;
  r numeric;
  exit_p numeric;
  lots numeric;
  opened timestamptz;
  held interval;
  gross numeric;
  comm numeric;
  sw numeric;
  usd_per_point numeric;
  i int;
  day_offset int;
begin
  select id into demo from auth.users where lower(email) = lower(p_email);
  if demo is null then
    raise exception 'No user with email %', p_email;
  end if;
  if exists (select 1 from public.trading_accounts where user_id = demo and platform = 'manual' and external_id = 'demo-1') then
    raise exception 'Demo trades are already loaded for %; remove them first', p_email;
  end if;

  perform setseed(0.42);

  -- Drawdown needs a starting balance; keep one the user already set.
  update public.profiles set rules = rules || '{"startingBalance": 10000}'::jsonb
  where user_id = demo and not (rules ? 'startingBalance');

  insert into public.trading_accounts (user_id, platform, external_id, trader_login, name, currency, is_live, balance)
  values (demo, 'manual', 'demo-1', '5012345', 'Razor (demo data)', 'USD', false, 10000)
  returning id into acct;

  insert into public.tags (user_id, name, color) values
    (demo, 'A+ setup', '#0f766e'), (demo, 'Moved stop', '#b45309'),
    (demo, 'Early exit', '#7c3aed'), (demo, 'News', '#be123c')
  on conflict do nothing;

  insert into public.playbook_models (user_id, name, description, checklist, target_r, breakeven_r, max_attempts, entry_window_minutes) values
    (demo, 'London breakout', 'Fictional demo model.', '["Range marked before the open", "Clean break with a full-bodied candle"]', 3, 1.5, 2, 60),
    (demo, 'NY reversal', 'Fictional demo model.', '["London move is stretched", "Clear rejection at a key level"]', 4, 1.5, 1, 45),
    (demo, 'Trend pullback', 'Fictional demo model.', '["Higher-timeframe trend agrees", "Pullback into value"]', 5, 2, 2, null)
  on conflict do nothing;

  for i in 1..140 loop
    sym := symbols[1 + floor(random() * array_length(symbols, 1))::int];
    side := case when random() < 0.55 then 'buy' else 'sell' end;
    case sym
      when 'XAUUSD' then
        pip := 1; contract := 100; usd_per_point := 100;
        entry := 2550 + random() * 150; stop_dist := 3 + floor(random() * 10);
        lots := round((0.1 + random() * 0.9)::numeric, 2);
      when 'NAS100' then
        pip := 1; contract := 1; usd_per_point := 1;
        entry := 19500 + random() * 1500; stop_dist := 15 + floor(random() * 45);
        lots := round((1 + random() * 9)::numeric, 1);
      when 'GER40' then
        pip := 1; contract := 1; usd_per_point := 1.08;
        entry := 22000 + random() * 2000; stop_dist := 10 + floor(random() * 30);
        lots := round((1 + random() * 9)::numeric, 1);
      else
        pip := case when sym like '%JPY' then 0.01 else 0.0001 end;
        contract := 100000;
        usd_per_point := case when sym like '%JPY' then 670 else 100000 end;
        entry := case sym when 'EURUSD' then 1.08 + random() * 0.04 when 'GBPUSD' then 1.26 + random() * 0.05 else 145 + random() * 8 end;
        stop_dist := (10 + floor(random() * 30)) * pip;
        lots := round((0.2 + random() * 1.3)::numeric, 2);
    end case;
    -- Fictional edge: ~45% winners averaging ~1.8R, a few breakevens.
    r := case when random() < 0.45 then 0.8 + random() * 2.2 when random() < 0.1 then 0 else -(0.6 + random() * 0.45) end;
    exit_p := entry + (case when side = 'buy' then 1 else -1 end) * r * stop_dist;
    day_offset := floor(random() * 90)::int;
    opened := date_trunc('day', now()) - make_interval(days => day_offset)
      + make_interval(hours => 4 + floor(random() * 14)::int, mins => floor(random() * 60)::int);
    if extract(isodow from opened) > 5 then opened := opened - make_interval(days => 2); end if;
    held := make_interval(mins => 5 + floor(random() * 300)::int);
    gross := round(((exit_p - entry) * (case when side = 'buy' then 1 else -1 end) * lots * usd_per_point)::numeric, 2);
    comm := case when contract = 100000 then round(-lots * 7, 2) else 0 end;
    sw := case when held > interval '4 hours' then round((-random() * 3)::numeric, 2) else 0 end;

    insert into public.trades (
      user_id, account_id, source, external_position_id, symbol, side, status, volume, lots,
      open_time, close_time, entry_price, exit_price, gross_pnl, commission, swap, net_pnl,
      pip_size, pips, stop_loss, r_multiple, setup, rating, emotion_before, emotion_after, followed_plan, notes
    ) values (
      demo, acct, 'manual', 'demo-' || i, sym, side, 'closed', lots * contract, lots,
      opened, opened + held, round(entry, 5), round(exit_p, 5), gross, comm, sw, gross + comm + sw,
      pip, round((exit_p - entry) * (case when side = 'buy' then 1 else -1 end) / pip, 1),
      round(entry - (case when side = 'buy' then 1 else -1 end) * stop_dist, 5), round(r, 2),
      setups[1 + floor(random() * array_length(setups, 1))::int],
      1 + floor(random() * 5)::int,
      emotions[1 + floor(random() * array_length(emotions, 1))::int],
      emotions[1 + floor(random() * array_length(emotions, 1))::int],
      random() < 0.75,
      case when random() < 0.3 then 'Fictional demo note: waited for the retest before entering.' end
    );
  end loop;

  -- The always-true reference to t.id makes Postgres pick a random tag per row
  -- instead of evaluating the subquery once.
  insert into public.trade_tags (trade_id, tag_id, user_id)
  select t.id, (select g.id from public.tags g where g.user_id = demo and g.name <> t.id::text order by random() limit 1), demo
  from public.trades t
  where t.account_id = acct and random() < 0.4;

  return 140;
end;
$$;

-- Also removes the demo playbook models, unless their description was edited.
create or replace function private.remove_demo_trades(p_email text) returns integer
language plpgsql set search_path = '' as $$
declare
  demo uuid;
  acct uuid;
  removed int;
begin
  select id into demo from auth.users where lower(email) = lower(p_email);
  if demo is null then
    raise exception 'No user with email %', p_email;
  end if;
  select id into acct from public.trading_accounts where user_id = demo and platform = 'manual' and external_id = 'demo-1';
  if acct is null then
    return 0;
  end if;

  -- trades.account_id is "on delete set null", so delete trades explicitly.
  delete from public.trades where account_id = acct;
  get diagnostics removed = row_count;
  delete from public.trading_accounts where id = acct;

  delete from public.tags g
  where g.user_id = demo and g.name in ('A+ setup', 'Moved stop', 'Early exit', 'News')
    and not exists (select 1 from public.trade_tags tt where tt.tag_id = g.id);

  delete from public.playbook_models
  where user_id = demo and description = 'Fictional demo model.'
    and name in ('London breakout', 'NY reversal', 'Trend pullback');

  return removed;
end;
$$;

revoke all on function private.load_demo_trades(text) from public, anon, authenticated;
revoke all on function private.remove_demo_trades(text) from public, anon, authenticated;
revoke all on function private.rename_model_setup() from public, anon, authenticated;
