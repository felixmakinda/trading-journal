-- Row Level Security and MFA enforcement. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Two users, each with one trade. Profiles are created by the auth trigger.
insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

insert into public.trades (user_id, source, symbol, side, status, volume, lots, open_time, entry_price) values
  ('11111111-1111-4111-8111-111111111111', 'manual', 'EURUSD', 'buy', 'open', 100000, 1, now(), 1.1),
  ('22222222-2222-4222-8222-222222222222', 'manual', 'GBPUSD', 'sell', 'open', 100000, 1, now(), 1.3);

insert into public.broker_connections (id, user_id) values
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');
insert into public.broker_secrets (connection_id, access_token_enc, refresh_token_enc, expires_at) values
  ('33333333-3333-4333-8333-333333333333', 'v1.x.y', 'v1.x.y', now());

select ok(exists (select 1 from public.profiles where user_id = '11111111-1111-4111-8111-111111111111'), 'profile created on sign-up');

-- Anonymous visitors see nothing.
set local role anon;
select is((select count(*) from public.trades), 0::bigint, 'anon cannot read trades');
reset role;

-- User A, password-only session, no MFA enrolled.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}';

select is((select count(*) from public.trades), 1::bigint, 'A sees only their own trade');
select is((select symbol from public.trades), 'EURUSD', 'and it is the right one');
select is((select count(*) from public.broker_connections), 1::bigint, 'A can see their connection status');
select throws_ok(
  $$ select * from public.broker_secrets $$,
  '42501', null, 'encrypted tokens are not readable by users');
select throws_ok(
  $$ insert into public.trades (user_id, source, symbol, side, status, volume, lots, open_time, entry_price)
     values ('22222222-2222-4222-8222-222222222222', 'manual', 'X', 'buy', 'open', 1, 1, now(), 1) $$,
  '42501', null, 'A cannot write rows for B');
select is_empty(
  $$ update public.trades set notes = 'hacked' where user_id = '22222222-2222-4222-8222-222222222222' returning id $$,
  'A cannot update B''s trades');
select throws_ok(
  $$ insert into public.broker_connections (user_id) values ('11111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'connections are written by the server only');

-- A enrols MFA: a password-only session must now see nothing.
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'phone', 'totp', 'verified', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}';
select is((select count(*) from public.trades), 0::bigint, 'aal1 session sees nothing once MFA is enrolled');
select is((select count(*) from public.profiles), 0::bigint, 'including the profile');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}';
select is((select count(*) from public.trades), 1::bigint, 'aal2 session sees the data again');

select * from finish();
rollback;
