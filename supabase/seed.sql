-- LOCAL DEVELOPMENT AND DEMO ONLY. Every trade here is fictional.
-- Runs on `supabase db reset`; never pushed to production.
-- Login: demo@journal.local / DemoTrader2026

do $$
declare
  demo uuid := '00000000-0000-4000-8000-00000000d3e0';
begin
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

  update public.profiles set display_name = 'Demo Trader' where user_id = demo;

  perform private.load_demo_trades('demo@journal.local');
end $$;
