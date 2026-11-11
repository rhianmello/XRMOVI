-- Additive maintenance audit and narrow authenticated RPCs.
-- The xrmovi schema stays private; no client table grants are added.
alter table xrmovi.maintenance_tasks add column if not exists revision integer not null default 0;

create table xrmovi.maintenance_changes (
  id bigint generated always as identity primary key,
  company_id uuid not null references xrmovi.companies(id),
  task_id uuid not null references xrmovi.maintenance_tasks(id),
  actor_id uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  reason text,
  before_data jsonb not null,
  after_data jsonb not null
);
create index maintenance_changes_task_time on xrmovi.maintenance_changes(company_id,task_id,changed_at desc,id desc);
alter table xrmovi.maintenance_changes enable row level security;
revoke all on xrmovi.maintenance_changes from public,anon,authenticated;
create policy maintenance_changes_member_read on xrmovi.maintenance_changes for select to authenticated
using (exists(select 1 from xrmovi.memberships m where m.company_id=maintenance_changes.company_id and m.user_id=(select auth.uid())));

create function xrmovi.audit_maintenance_change() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (to_jsonb(new)-'revision') is distinct from (to_jsonb(old)-'revision') then
    new.revision:=old.revision+1;
    insert into xrmovi.maintenance_changes(company_id,task_id,actor_id,reason,before_data,after_data)
    values(old.company_id,old.id,(select auth.uid()),nullif(current_setting('xrmovi.maintenance_change_reason',true),''),to_jsonb(old),to_jsonb(new));
  else new.revision:=old.revision;
  end if;
  return new;
end $$;
revoke all on function xrmovi.audit_maintenance_change() from public,anon,authenticated;
create trigger maintenance_changes_capture before update on xrmovi.maintenance_tasks for each row execute function xrmovi.audit_maintenance_change();

create function xrmovi.keep_maintenance_history() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Maintenance history is append-only' using errcode='42501'; end $$;
revoke all on function xrmovi.keep_maintenance_history() from public,anon,authenticated;
create trigger maintenance_changes_append_only before update or delete on xrmovi.maintenance_changes for each row execute function xrmovi.keep_maintenance_history();

-- SECURITY DEFINER intentionally bridges the existing private schema API boundary.
-- Every call checks the current membership; PUBLIC/anon execute is revoked below.
create function public.xrmovi_maintenance_update(cid uuid,tid uuid,expected_revision integer,task_title text,deadline date,deadline_meter numeric,detail text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare task xrmovi.maintenance_tasks;
begin
  if (select auth.uid()) is null or not exists(select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=(select auth.uid()) and m.role in ('owner','manager')) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into task from xrmovi.maintenance_tasks where company_id=cid and id=tid for update;
  if not found then raise exception 'Maintenance not found' using errcode='22023';end if;
  if expected_revision is null or task.revision<>expected_revision then raise exception 'Registro alterado por outro usuário. Atualize os detalhes antes de salvar.' using errcode='40001';end if;
  if task.status<>'open' then raise exception 'Serviços concluídos não podem ser reprogramados.' using errcode='22023';end if;
  if length(trim(coalesce(task_title,''))) not between 3 and 150 or (deadline is null and deadline_meter is null)
    or (deadline_meter is not null and (deadline_meter<0 or deadline_meter::text in ('NaN','Infinity','-Infinity')))
    or length(coalesce(detail,''))>1000 or length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'Informe serviço, vencimento e motivo da alteração válidos.' using errcode='22023';
  end if;
  perform set_config('xrmovi.maintenance_change_reason',trim(p_reason),true);
  update xrmovi.maintenance_tasks set title=trim(task_title),due_date=deadline,due_meter=deadline_meter,notes=nullif(trim(detail),'')
    where company_id=cid and id=tid returning * into task;
  perform set_config('xrmovi.maintenance_change_reason','',true);
  return to_jsonb(task);
end $$;
revoke all on function public.xrmovi_maintenance_update(uuid,uuid,integer,text,date,numeric,text,text) from public,anon;
grant execute on function public.xrmovi_maintenance_update(uuid,uuid,integer,text,date,numeric,text,text) to authenticated,service_role;

-- Cost recording and optional completion are one atomic UPDATE.
create function public.xrmovi_maintenance_record(cid uuid,tid uuid,expected_revision integer,forecast numeric,spent numeric,final_meter numeric,finish boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare task xrmovi.maintenance_tasks;
begin
  if (select auth.uid()) is null or not exists(select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=(select auth.uid()) and m.role in ('owner','manager')) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into task from xrmovi.maintenance_tasks where company_id=cid and id=tid for update;
  if not found then raise exception 'Maintenance not found' using errcode='22023';end if;
  if expected_revision is null or task.revision<>expected_revision then raise exception 'Registro alterado por outro usuário. Atualize os detalhes antes de salvar.' using errcode='40001';end if;
  if coalesce(finish,false) and (task.status<>'open' or spent is null or final_meter is null) then
    raise exception 'Informe custo realizado e KM/horímetro para concluir um serviço pendente.' using errcode='22023';
  end if;
  if exists(select 1 from (values(forecast),(spent),(final_meter)) v(n) where n<0 or n::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'Informe valores não negativos e finitos.' using errcode='22023';
  end if;
  perform set_config('xrmovi.maintenance_change_reason',case when coalesce(finish,false) then 'Conclusão do serviço' else 'Atualização de custos e leitura' end,true);
  update xrmovi.maintenance_tasks set estimated_cost=forecast,actual_cost=spent,completed_meter=final_meter,
    status=case when coalesce(finish,false) then 'done' else status end,
    completed_at=case when coalesce(finish,false) then now() else completed_at end
    where company_id=cid and id=tid returning * into task;
  perform set_config('xrmovi.maintenance_change_reason','',true);
  return to_jsonb(task);
end $$;
revoke all on function public.xrmovi_maintenance_record(uuid,uuid,integer,numeric,numeric,numeric,boolean) from public,anon;
grant execute on function public.xrmovi_maintenance_record(uuid,uuid,integer,numeric,numeric,numeric,boolean) to authenticated,service_role;

create function public.xrmovi_maintenance_history(cid uuid,tid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not exists(select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=(select auth.uid())) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if not exists(select 1 from xrmovi.maintenance_tasks where company_id=cid and id=tid) then raise exception 'Maintenance not found' using errcode='22023';end if;
  return coalesce((select jsonb_agg(to_jsonb(h) order by h.changed_at desc,h.id desc) from
    (select id,actor_id,changed_at,reason,before_data,after_data from xrmovi.maintenance_changes where company_id=cid and task_id=tid order by changed_at desc,id desc limit 50)h),'[]'::jsonb);
end $$;
revoke all on function public.xrmovi_maintenance_history(uuid,uuid) from public,anon;
grant execute on function public.xrmovi_maintenance_history(uuid,uuid) to authenticated,service_role;

create or replace function public.xrmovi_maintenance_list(cid uuid) returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'vehicle_id',t.vehicle_id,'title',t.title,'due_date',t.due_date,'due_meter',t.due_meter,'status',t.status,'notes',t.notes,'plate',v.plate,'current_meter',v.odometer_value,'estimated_cost',t.estimated_cost,'actual_cost',t.actual_cost,'completed_meter',t.completed_meter,'revision',t.revision,'created_at',t.created_at,'completed_at',t.completed_at) order by t.due_date nulls last),'[]'::jsonb)
from xrmovi.maintenance_tasks t join xrmovi.vehicles v on v.id=t.vehicle_id and v.company_id=t.company_id
where t.company_id=cid and exists(select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=(select auth.uid()))
$$;
revoke all on function public.xrmovi_maintenance_list(uuid) from public,anon;
grant execute on function public.xrmovi_maintenance_list(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
