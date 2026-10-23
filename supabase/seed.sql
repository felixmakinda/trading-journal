-- LOCAL DEVELOPMENT AND DEMO ONLY. Every trade here is fictional.
-- Runs on `supabase db reset`; never pushed to production.
-- Login: demo@journal.local / DemoTrader2026

do $$
declare
  demo uuid := '00000000-0000-4000-8000-00000000d3e0';
  acct uuid := '00000000-0000-4000-8000-0000000acc01';
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
  perform setseed(0.42);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', demo, 'authenticated', 'authenticated',
    'demo@journal.local', extensions.crypt('DemoTrader2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), demo, demo::text, 'email',
    jsonb_build_object('sub', demo::text, 'email', 'demo@journal.local', 'email_verified', true),
    now(), now(), now());

  update public.profiles set display_name = 'Demo Trader', rules = '{"startingBalance": 10000}'::jsonb
  where user_id = demo;

  insert into public.trading_accounts (id, user_id, platform, external_id, trader_login, name, currency, is_live, balance)
  values (acct, demo, 'manual', 'demo-1', '5012345', 'Razor (demo data)', 'USD', false, 10000);

  insert into public.tags (user_id, name, color) values
    (demo, 'A+ setup', '#0f766e'), (demo, 'Moved stop', '#b45309'),
    (demo, 'Early exit', '#7c3aed'), (demo, 'News', '#be123c');

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
  where t.user_id = demo and random() < 0.4;
end $$;
