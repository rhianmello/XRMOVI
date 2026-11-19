-- XRMOVI | Histórico operacional seguro dos clientes | 19-11-2026
-- Não armazena IP, e-mail nas visitas, URLs completas, senhas ou dados dos veículos.
create table if not exists xrmovi.user_access_activity (
 user_id uuid not null references auth.users(id) on delete cascade,
 activity_date date not null,
 client_session_id uuid not null,
 module text not null,
 first_seen_at timestamptz not null,
 last_seen_at timestamptz not null,
 page_views integer not null default 0 check (page_views>=0),
 active_seconds integer not null default 0 check (active_seconds between 0 and 86400),
 primary key (user_id,activity_date,client_session_id,module)
);
create index if not exists user_access_activity_recent_idx on xrmovi.user_access_activity(user_id,activity_date desc);
alter table xrmovi.user_access_activity enable row level security;
revoke all on table xrmovi.user_access_activity from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.xrmovi_admin_access_history(p_account uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_result jsonb;
begin
 if (select auth.uid()) is null or not exists
  (select 1 from xrmovi.platform_admins pa where pa.user_id=(select auth.uid()))
 then raise exception 'Acesso permitido somente ao administrador da plataforma.' using errcode='42501'; end if;
 select a.owner_id into v_owner from xrmovi.billing_accounts a where a.id=p_account;
 if v_owner is null then raise exception 'Conta não encontrada.' using errcode='22023'; end if;
 select jsonb_build_object(
  'email',u.email,
  'created_at',u.created_at,
  'last_sign_in_at',u.last_sign_in_at,
  'last_seen_at',(select p.last_seen_at from xrmovi.user_presence p where p.user_id=u.id),
  'auth_session_count',(select count(*) from auth.sessions s where s.user_id=u.id),
  'auth_sessions',coalesce((select jsonb_agg(jsonb_build_object('created_at',s.created_at,'updated_at',s.updated_at) order by s.created_at desc)
     from (select created_at,updated_at from auth.sessions where user_id=u.id order by created_at desc limit 20) s),'[]'::jsonb),
  'vehicles_count',(select count(*) from xrmovi.vehicles v join xrmovi.account_companies ac on ac.company_id=v.company_id where ac.account_id=p_account),
  'first_vehicle_at',(select min(v.created_at) from xrmovi.vehicles v join xrmovi.account_companies ac on ac.company_id=v.company_id where ac.account_id=p_account),
  'tracked_session_count',(select count(distinct client_session_id) from xrmovi.user_access_activity x where x.user_id=u.id and x.activity_date >= (now() at time zone 'America/Sao_Paulo')::date-90),
  'page_views',(select coalesce(sum(page_views),0) from xrmovi.user_access_activity x where x.user_id=u.id and x.activity_date >= (now() at time zone 'America/Sao_Paulo')::date-90),
  'active_seconds',(select coalesce(sum(active_seconds),0) from xrmovi.user_access_activity x where x.user_id=u.id and x.activity_date >= (now() at time zone 'America/Sao_Paulo')::date-90),
  'modules',coalesce((select jsonb_agg(jsonb_build_object('module',m.module,'views',m.views,'active_seconds',m.seconds,'last_seen_at',m.last_seen_at) order by m.views desc,m.module)
    from (select module,sum(page_views) as views,sum(active_seconds) as seconds,max(last_seen_at) as last_seen_at
     from xrmovi.user_access_activity where user_id=u.id and activity_date >= (now() at time zone 'America/Sao_Paulo')::date-90
     group by module) m),'[]'::jsonb),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('day',d.activity_date,'module',d.module,'views',d.views,'active_seconds',d.seconds,'last_seen_at',d.last_seen_at) order by d.activity_date desc,d.last_seen_at desc)
    from (select activity_date,module,sum(page_views) as views,sum(active_seconds) as seconds,max(last_seen_at) as last_seen_at
     from xrmovi.user_access_activity where user_id=u.id and activity_date >= (now() at time zone 'America/Sao_Paulo')::date-90
     group by activity_date,module order by activity_date desc,max(last_seen_at) desc limit 120) d),'[]'::jsonb)
 ) into v_result from auth.users u where u.id=v_owner;
 return v_result;
end
$function$
;

CREATE OR REPLACE FUNCTION public.xrmovi_track_access(p_module text, p_event text, p_client_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid := (select auth.uid());
 v_now timestamptz := statement_timestamp();
 v_day date := (statement_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
 if v_user is null or p_client_session_id is null then return; end if;
 if p_event not in ('open','heartbeat') or p_module not in
 ('dashboard','assets','mileage','maintenance','drivers','documents','alerts',
  'history','fuel','fines','financial','subscription','account') then
   return;
 end if;
 -- O usuário só registra a própria navegação; administradores não são contados.
 if exists(select 1 from xrmovi.platform_admins where user_id=v_user)
    or not exists(select 1 from xrmovi.memberships where user_id=v_user) then
   return;
 end if;
 if p_event='open' then
  insert into xrmovi.user_access_activity as a
   (user_id,activity_date,client_session_id,module,first_seen_at,last_seen_at,page_views,active_seconds)
  values(v_user,v_day,p_client_session_id,p_module,v_now,v_now,1,0)
  on conflict(user_id,activity_date,client_session_id,module) do update
  set last_seen_at=v_now,
      page_views=least(100000,a.page_views+case when a.last_seen_at < v_now-interval '3 seconds' then 1 else 0 end);
 else
  insert into xrmovi.user_access_activity as a
   (user_id,activity_date,client_session_id,module,first_seen_at,last_seen_at,page_views,active_seconds)
  values(v_user,v_day,p_client_session_id,p_module,v_now,v_now,0,0)
  on conflict(user_id,activity_date,client_session_id,module) do update
  set active_seconds=least(86400,a.active_seconds+case
     when v_now-a.last_seen_at between interval '10 seconds' and interval '75 seconds'
     then floor(extract(epoch from v_now-a.last_seen_at))::int else 0 end),
      last_seen_at=v_now;
 end if;
end
$function$
;

revoke all on function public.xrmovi_track_access(text,text,uuid) from public,anon;
grant execute on function public.xrmovi_track_access(text,text,uuid) to authenticated;
revoke all on function public.xrmovi_admin_access_history(uuid) from public,anon;
grant execute on function public.xrmovi_admin_access_history(uuid) to authenticated;

do $job$
begin
 if not exists (select 1 from cron.job where jobname='xrmovi_access_history_retention_90d') then
  perform cron.schedule('xrmovi_access_history_retention_90d','17 3 * * *',
   $sql$delete from xrmovi.user_access_activity where activity_date < (now() at time zone 'America/Sao_Paulo')::date-90$sql$);
 end if;
end $job$;
