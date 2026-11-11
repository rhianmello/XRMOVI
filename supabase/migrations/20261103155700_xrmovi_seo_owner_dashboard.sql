-- Etapa SEO XRMOVI: métricas privadas, status de indexação, gráficos e acompanhamento.
-- Executada no projeto Supabase aprovaai. Sem modificações em frotas, pagamentos ou auth.
create table if not exists xrmovi.seo_daily_metrics(
 metric_date date primary key,
 clicks integer not null check(clicks>=0),
 impressions integer not null check(impressions>=0),
 avg_position numeric(9,3) check(avg_position is null or avg_position>=0),
 collected_at timestamptz not null default now(),
 source text not null default 'windsor_searchconsole'
);
create table if not exists xrmovi.seo_top_queries(
 query text primary key,
 clicks integer not null check(clicks>=0),
 impressions integer not null check(impressions>=0),
 avg_position numeric(9,3) check(avg_position is null or avg_position>=0),
 period_end date not null,
 collected_at timestamptz not null default now()
);
create table if not exists xrmovi.seo_sync_state(
 id boolean primary key default true check(id=true),
 last_checked_at timestamptz,
 last_success_at timestamptz,
 status text not null default 'waiting' check(status in('waiting','no_data','ok','error')),
 description text,
 source text not null default 'Windsor.ai / Google Search Console'
);
insert into xrmovi.seo_sync_state(id,status,description)
values (true,'no_data','Search Console conectado; aguardando registros de desempenho.')
on conflict(id) do nothing;
create table if not exists xrmovi.seo_page_indexation(
 page_path text primary key check(page_path like '/%' and char_length(page_path)<=160),
 title text not null,
 index_status text not null check(index_status in('indexed','pending','issue','unknown')),
 eligible boolean,
 last_checked_on date,
 provenance text not null default 'search_console_manual',
 notes text,
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
insert into xrmovi.seo_page_indexation(page_path,title,index_status,eligible,last_checked_on,provenance,notes) values
('/','Página inicial','indexed',true,'2026-11-03','search_console_screenshot','Indexação confirmada no Search Console.'),
('/gestao-de-frotas/','Gestão de frotas','pending',true,'2026-11-03','search_console_screenshot','Detectada via sitemap; teste em tempo real liberou indexação.'),
('/controle-de-manutencao/','Controle de manutenção','pending',true,'2026-11-03','search_console_screenshot','Detectada via sitemap; teste em tempo real liberou indexação.'),
('/controle-de-abastecimento/','Controle de abastecimento','indexed',true,'2026-11-03','search_console_screenshot','Indexação confirmada no Search Console.')
on conflict(page_path) do nothing;
alter table xrmovi.seo_daily_metrics enable row level security;
alter table xrmovi.seo_top_queries enable row level security;
alter table xrmovi.seo_sync_state enable row level security;
alter table xrmovi.seo_page_indexation enable row level security;
revoke all on xrmovi.seo_daily_metrics,xrmovi.seo_top_queries,xrmovi.seo_sync_state,xrmovi.seo_page_indexation from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.xrmovi_admin_seo_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 p28 jsonb;
 p7 jsonb;
 by_day jsonb;
 by_query jsonb;
 pages jsonb;
 sync_obj jsonb;
begin
 if auth.uid() is null or not exists (select 1 from xrmovi.platform_admins pa where pa.user_id = auth.uid()) then
   raise exception 'Acesso ao SEO reservado ao proprietário.' using errcode='42501';
 end if;
 select jsonb_build_object(
   'days_with_data',count(*)::integer,
   'clicks',sum(clicks)::integer,
   'impressions',sum(impressions)::integer,
   'ctr',case when sum(impressions)>0 then round(sum(clicks)::numeric * 100 / sum(impressions),2) else null end,
   'avg_position',case when sum(impressions)>0 then round(sum(avg_position*impressions) / nullif(sum(impressions) filter (where avg_position is not null),0),2) else null end
 ) into p28 from xrmovi.seo_daily_metrics where metric_date between current_date-27 and current_date;

 select jsonb_build_object(
   'days_with_data',count(*)::integer,
   'clicks',sum(clicks)::integer,
   'impressions',sum(impressions)::integer,
   'ctr',case when sum(impressions)>0 then round(sum(clicks)::numeric * 100 / sum(impressions),2) else null end,
   'avg_position',case when sum(impressions)>0 then round(sum(avg_position*impressions) / nullif(sum(impressions) filter (where avg_position is not null),0),2) else null end
 ) into p7 from xrmovi.seo_daily_metrics where metric_date between current_date-6 and current_date;

 select coalesce(jsonb_agg(jsonb_build_object('date',r.metric_date,'clicks',r.clicks,'impressions',r.impressions,'position',r.avg_position) order by r.metric_date),'[]'::jsonb)
 into by_day from (select metric_date,clicks,impressions,avg_position from xrmovi.seo_daily_metrics where metric_date >= current_date-27 order by metric_date) r;

 select coalesce(jsonb_agg(jsonb_build_object('query',q.query,'clicks',q.clicks,'impressions',q.impressions,'position',q.avg_position,'period_end',q.period_end) order by q.impressions desc,q.clicks desc),'[]'::jsonb)
 into by_query from (select query,clicks,impressions,avg_position,period_end from xrmovi.seo_top_queries where period_end >= current_date-35 order by impressions desc, clicks desc limit 12) q;

 select coalesce(jsonb_agg(jsonb_build_object('path',p.page_path,'title',p.title,'status',p.index_status,'eligible',p.eligible,'checked_on',p.last_checked_on,'provenance',p.provenance,'notes',p.notes) order by p.page_path),'[]'::jsonb)
 into pages from xrmovi.seo_page_indexation p;

 select jsonb_build_object('last_checked_at',last_checked_at,'last_success_at',last_success_at,'status',status,'description',description,'source',source)
 into sync_obj from xrmovi.seo_sync_state where id=true;

 return jsonb_build_object('property','https://frota.nospassa.com.br/','last_7_days',p7,'last_28_days',p28,
 'daily',by_day,'queries',by_query,'pages',pages,'sync',sync_obj);
end
$function$
;
revoke all on function public.xrmovi_admin_seo_dashboard() from public,anon;
grant execute on function public.xrmovi_admin_seo_dashboard() to authenticated;

CREATE OR REPLACE FUNCTION public.xrmovi_admin_seo_page_status(p_path text, p_status text, p_eligible boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rec xrmovi.seo_page_indexation%rowtype;
begin
 if auth.uid() is null or not exists (select 1 from xrmovi.platform_admins pa where pa.user_id = auth.uid()) then
  raise exception 'Apenas proprietário pode atualizar a inspeção.' using errcode='42501';
 end if;
 if p_status not in ('indexed','pending','issue','unknown') then
  raise exception 'Situação inválida.' using errcode='22023';
 end if;
 if char_length(coalesce(p_note,''))>350 then
  raise exception 'Observação muito longa.' using errcode='22023';
 end if;
 update xrmovi.seo_page_indexation
 set index_status=p_status, eligible=p_eligible,notes=nullif(btrim(p_note),''),
     last_checked_on=current_date,provenance='manual_owner',updated_by=auth.uid(),updated_at=now()
 where page_path=p_path returning * into rec;
 if not found then raise exception 'Página não cadastrada no SEO.' using errcode='22023'; end if;
 return jsonb_build_object('path',rec.page_path,'status',rec.index_status,'checked_on',rec.last_checked_on);
end
$function$
;
revoke all on function public.xrmovi_admin_seo_page_status(text,text,boolean,text) from public,anon;
grant execute on function public.xrmovi_admin_seo_page_status(text,text,boolean,text) to authenticated;
