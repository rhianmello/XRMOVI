-- Server-only queue worker. The shared XRMOVI worker token stays in Vault and
-- is resolved only at execution time: never committed to source or sent to browsers.
select cron.schedule(
 'xrmovi-ga4-confirmed-purchases',
 '*/5 * * * *',
 $job$
 select net.http_post(
  url := 'https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/xrmovi-ga4-purchase',
  headers := jsonb_build_object(
   'Content-Type','application/json',
   'x-xrmovi-worker-secret',(
    select decrypted_secret from vault.decrypted_secrets
    where name='xrmovi_support_worker_token' limit 1
   )
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 15000
 );
 $job$
);
