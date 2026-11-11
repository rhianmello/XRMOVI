-- Audited operational status. No service-role credentials in the browser.
create table if not exists xrmovi.vehicle_status_history (
  id bigint generated always as identity primary key,
  company_id uuid not null references xrmovi.companies(id) on delete cascade,
  vehicle_id uuid not null references xrmovi.vehicles(id) on delete cascade,
  changed_by uuid not null,
  old_status text not null,
  new_status text not null,
  reason text not null default 'Alteração pelo cadastro',
  changed_at timestamptz not null default now()
);
create index if not exists xrmovi_vehicle_status_history_vehicle_date
  on xrmovi.vehicle_status_history(company_id,vehicle_id,changed_at desc);
alter table xrmovi.vehicle_status_history enable row level security;
revoke all on xrmovi.vehicle_status_history from public,anon,authenticated;

create or replace function public.xrmovi_vehicle_status_update(
  cid uuid, vid uuid, p_status text, p_expected_status text default null,
  p_reason text default 'Alteração pelo cadastro'
) returns text language plpgsql security definer set search_path = ''
as $$
declare old_status text; operator_id uuid;
begin
 operator_id := auth.uid();
 if operator_id is null then
   raise exception 'Autenticação necessária.' using errcode='42501';
 end if;
 perform public.xrmovi_assert_company_access(cid);
 if not exists (
  select 1 from xrmovi.memberships
  where company_id=cid and user_id=operator_id and role in ('owner','manager')
 ) then raise exception 'Somente proprietários e gestores podem alterar o status.' using errcode='42501';end if;
 if p_status is null or p_status not in ('Ativo','Manutenção','Inativo') then
  raise exception 'Situação inválida. Escolha Ativo, Manutenção ou Inativo.' using errcode='22023';
 end if;
 select v.status into old_status from xrmovi.vehicles v
 where v.company_id=cid and v.id=vid for update;
 if not found then raise exception 'Veículo não encontrado nesta empresa.' using errcode='22023';end if;
 if p_expected_status is not null and old_status is distinct from p_expected_status then
  raise exception 'O status foi atualizado em outra sessão. Atualize os dados antes de salvar.' using errcode='40001';
 end if;
 if old_status is distinct from p_status then
  update xrmovi.vehicles set status=p_status where company_id=cid and id=vid;
  insert into xrmovi.vehicle_status_history(company_id,vehicle_id,changed_by,old_status,new_status,reason)
  values(cid,vid,operator_id,old_status,p_status,left(coalesce(nullif(trim(p_reason),''),'Alteração pelo cadastro'),240));
 end if;
 return p_status;
end $$;
revoke all on function public.xrmovi_vehicle_status_update(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.xrmovi_vehicle_status_update(uuid,uuid,text,text,text) to authenticated;

create or replace function public.xrmovi_vehicle_status_history(cid uuid,vid uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'Autenticação necessária.' using errcode='42501'; end if;
 perform public.xrmovi_assert_company_access(cid);
 if not exists (select 1 from xrmovi.memberships where company_id=cid and user_id=auth.uid()) then
  raise exception 'Usuário não pertence à empresa.' using errcode='42501';
 end if;
 if not exists(select 1 from xrmovi.vehicles where company_id=cid and id=vid) then
  raise exception 'Veículo não encontrado nesta empresa.' using errcode='22023';
 end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object('old_status',t.old_status,'new_status',t.new_status,'reason',t.reason,'changed_at',t.changed_at))
  from (select old_status,new_status,reason,changed_at from xrmovi.vehicle_status_history
  where company_id=cid and vehicle_id=vid order by changed_at desc limit 10) t
 ),'[]'::jsonb);
end $$;
revoke all on function public.xrmovi_vehicle_status_history(uuid,uuid) from public,anon;
grant execute on function public.xrmovi_vehicle_status_history(uuid,uuid) to authenticated;
