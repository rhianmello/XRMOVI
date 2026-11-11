-- XRMOVI support cron: keep the shared worker token only in Supabase Vault.
-- Idempotent deployment; do not commit the plaintext token.
do $setup$
begin
 if not exists (select 1 from vault.secrets where name='xrmovi_support_worker_token') then
   perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'xrmovi_support_worker_token');
 end if;
end $setup$;

create or replace function public.xrmovi_support_worker_authorized(p_token text)
returns boolean language plpgsql security definer set search_path to ''
as $worker$
begin
 if (auth.jwt() ->> 'role') is distinct from 'service_role' then
   raise exception 'Somente o serviço pode validar o agendador' using errcode='42501';
 end if;
 if p_token is null or length(p_token) <> 64 then return false;end if;
 return coalesce((
  select v.decrypted_secret = p_token from vault.decrypted_secrets v
  where v.name='xrmovi_support_worker_token'
 ),false);
end $worker$;

revoke all on function public.xrmovi_support_worker_authorized(text) from public, anon, authenticated;
grant execute on function public.xrmovi_support_worker_authorized(text) to service_role;

-- Supabase pg_cron + pg_net. Recurring job is updated in place by name.
select cron.schedule('xrmovi-support-mail-queue','*/2 * * * *',
 $job$select net.http_post(
  url := 'https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/xrmovi-support-email',
  headers := jsonb_build_object('Content-Type','application/json','x-xrmovi-worker-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='xrmovi_support_worker_token')),
  body := '{}'::jsonb, timeout_milliseconds := 10000
 );$job$
);
