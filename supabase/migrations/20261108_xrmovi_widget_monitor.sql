-- XRMOVI Monitor — tráfego consentido, sem IP/user-agent/e-mail.
create table if not exists xrmovi.widget_visits(
  day date not null,
  visitor_id uuid not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key(day,visitor_id)
);
create index if not exists widget_visits_online_idx on xrmovi.widget_visits(day,last_seen desc);
alter table xrmovi.widget_visits enable row level security;
revoke all on xrmovi.widget_visits from anon,authenticated;
create or replace function public.xrmovi_widget_record_visit(p_visitor uuid) returns void
language plpgsql security definer set search_path=''
as $$
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role'
  then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_visitor is null then raise exception 'Identificador inválido'; end if;
  insert into xrmovi.widget_visits(day,visitor_id,first_seen,last_seen)
  values((now() at time zone 'America/Sao_Paulo')::date,p_visitor,now(),now())
  on conflict(day,visitor_id) do update set last_seen=excluded.last_seen;
end; $$;
revoke all on function public.xrmovi_widget_record_visit(uuid) from public,anon,authenticated;
grant execute on function public.xrmovi_widget_record_visit(uuid) to service_role;
create or replace function public.xrmovi_widget_traffic_stats() returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_day date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null or not exists(select 1 from xrmovi.platform_admins where user_id=auth.uid())
  then raise exception 'Acesso negado' using errcode='42501'; end if;
  return (select jsonb_build_object(
    'visitors_today',count(*),
    'online_now',count(*) filter(where last_seen>=now()-interval '5 minutes'),
    'as_of',now(),
    'basis','visitas com consentimento; ativo nos ultimos 5 minutos'
  ) from xrmovi.widget_visits where day=v_day);
end; $$;
revoke all on function public.xrmovi_widget_traffic_stats() from public,anon;
grant execute on function public.xrmovi_widget_traffic_stats() to authenticated;