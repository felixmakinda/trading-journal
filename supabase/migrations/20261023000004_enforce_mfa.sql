-- Once a user has a verified MFA factor, a password-only (aal1) session can
-- read or write nothing. This is the authoritative check; the app's redirect
-- to /login/mfa is only the friendly path to it (ADR 007).

create or replace function private.mfa_satisfied() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    );
$$;

revoke all on function private.mfa_satisfied() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.mfa_satisfied() to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'broker_connections', 'trading_accounts', 'symbols', 'trade_plans', 'trades',
    'executions', 'tags', 'trade_tags', 'attachments', 'daily_journal', 'sync_runs', 'audit_log'
  ] loop
    execute format(
      'create policy "require mfa when enrolled" on public.%I as restrictive for all to authenticated
         using ((select private.mfa_satisfied())) with check ((select private.mfa_satisfied()))', t);
  end loop;
end $$;

create policy "require mfa when enrolled" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'attachments' or (select private.mfa_satisfied()))
  with check (bucket_id <> 'attachments' or (select private.mfa_satisfied()));
