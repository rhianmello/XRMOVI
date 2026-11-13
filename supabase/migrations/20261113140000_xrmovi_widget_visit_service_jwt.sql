-- Fix consented visitor widget 503/42501 from old role-claim setting.
-- The Edge Function invokes this RPC using SUPABASE_SERVICE_ROLE_KEY.
-- Use the standard JWT claims helper; keep EXECUTE service-only and never
-- allow site visitors to write directly to the database.
create or replace function public.xrmovi_widget_record_visit(p_visitor uuid)
returns void
language plpgsql security definer
set search_path = ''
as $function$
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_visitor is null then
    raise exception 'Identificador inválido' using errcode = '22023';
  end if;
  insert into xrmovi.widget_visits(day,visitor_id,first_seen,last_seen)
  values((now() at time zone 'America/Sao_Paulo')::date,p_visitor,now(),now())
  on conflict(day,visitor_id)
  do update set last_seen=excluded.last_seen;
end;
$function$;

revoke all on function public.xrmovi_widget_record_visit(uuid) from public, anon, authenticated;
grant execute on function public.xrmovi_widget_record_visit(uuid) to service_role;
