-- Fictional demo trades for an existing user, so a fresh deployment has
-- something to look at before real trades sync. Run from the SQL editor:
--   select private.load_demo_trades('you@example.com');
--   select private.remove_demo_trades('you@example.com');
-- Everything lands in its own "Razor (demo data)" account, so removing it
-- never touches real trades. The local seed uses the same generator.

create or replace function private.load_demo_trades(p_email text) returns integer
language plpgsql set search_path = '' as $$
declare
  demo uuid;
  acct uuid;
  symbols text[] := array['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'GBPJPY', 'AUDUSD'];
  setups text[] := array['London breakout', 'NY reversal', 'Trend pullback', 'Range fade', 'News spike'];
  emotions text[] := array['calm', 'confident', 'focused', 'anxious', 'frustrated', 'bored'];
  sym text;
  side text;
  pip numeric;
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
  pnl_per_pip numeric;
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

  for i in 1..140 loop
    sym := symbols[1 + floor(random() * array_length(symbols, 1))::int];
    side := case when random() < 0.55 then 'buy' else 'sell' end;
    pip := case when sym like '%JPY' then 0.01 when sym = 'XAUUSD' then 0.1 else 0.0001 end;
    entry := case sym
      when 'EURUSD' then 1.08 + random() * 0.04 when 'GBPUSD' then 1.26 + random() * 0.05
      when 'USDJPY' then 145 + random() * 8 when 'XAUUSD' then 2550 + random() * 150
      when 'GBPJPY' then 188 + random() * 8 else 0.64 + random() * 0.04 end;
    stop_dist := (10 + floor(random() * 30)) * pip;
    -- Fictional edge: ~45% winners averaging ~1.8R, a few breakevens.
    r := case when random() < 0.45 then 0.8 + random() * 2.2 when random() < 0.1 then 0 else -(0.6 + random() * 0.45) end;
    exit_p := entry + (case when side = 'buy' then 1 else -1 end) * r * stop_dist;
    lots := round((0.2 + random() * 1.3)::numeric, 2);
    day_offset := floor(random() * 90)::int;
    opened := date_trunc('day', now()) - make_interval(days => day_offset)
      + make_interval(hours => 4 + floor(random() * 14)::int, mins => floor(random() * 60)::int);
    if extract(isodow from opened) > 5 then opened := opened - make_interval(days => 2); end if;
    held := make_interval(mins => 5 + floor(random() * 300)::int);
    pnl_per_pip := lots * case when sym like '%JPY' then 6.7 else 10 end;
    gross := round(((exit_p - entry) * (case when side = 'buy' then 1 else -1 end) / pip * pnl_per_pip)::numeric, 2);
    comm := round(-lots * 7, 2);
    sw := case when held > interval '4 hours' then round((-random() * 3)::numeric, 2) else 0 end;

    insert into public.trades (
      user_id, account_id, source, external_position_id, symbol, side, status, volume, lots,
      open_time, close_time, entry_price, exit_price, gross_pnl, commission, swap, net_pnl,
      pip_size, pips, stop_loss, r_multiple, setup, rating, emotion_before, emotion_after, followed_plan, notes
    ) values (
      demo, acct, 'manual', 'demo-' || i, sym, side, 'closed', lots * 100000, lots,
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

-- Deletes the demo account and its trades. Demo tags go only if no real
-- trade uses them.
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

  return removed;
end;
$$;

revoke all on function private.load_demo_trades(text) from public, anon, authenticated;
revoke all on function private.remove_demo_trades(text) from public, anon, authenticated;
