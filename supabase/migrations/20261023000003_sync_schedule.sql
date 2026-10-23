-- Every 15 minutes, ask the web app to sync broker trades (ADR 003).
-- Needs two Vault secrets, set once per environment (see README):
--   select vault.create_secret('https://<your-app>.vercel.app', 'app_url');
--   select vault.create_secret('<same value as SYNC_SECRET>', 'sync_secret');
-- Until both exist the job is a no-op.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.trigger_sync() returns void
language plpgsql security definer set search_path = '' as $$
declare
  app_url text;
  secret text;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'sync_secret';
  if app_url is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(app_url, '/') || '/api/sync/cron',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function private.trigger_sync() from public, anon, authenticated;

select cron.schedule('sync-broker-trades', '*/15 * * * *', 'select private.trigger_sync()');
