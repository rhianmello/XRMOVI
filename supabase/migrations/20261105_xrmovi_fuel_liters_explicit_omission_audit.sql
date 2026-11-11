
-- Preserve original records; missing liters are accepted only after explicit acknowledgement.
alter table xrmovi.fuel_entries
  alter column liters drop not null;
alter table xrmovi.fuel_entries
  add column if not exists liters_declined boolean not null default false,
  add column if not exists liters_declined_at timestamptz,
  add column if not exists liters_declined_by uuid references auth.users(id);
alter table xrmovi.fuel_entries
  add constraint fuel_entries_liter_decision_check check(
   (liters is not null and liters>0 and liters_declined=false
     and liters_declined_at is null and liters_declined_by is null)
   or
   (liters is null and liters_declined=true
     and liters_declined_at is not null and liters_declined_by is not null)
  );
create or replace function xrmovi.fuel_liter_decision_guard()
returns trigger language plpgsql set search_path to '' as $$
begin
 if new.liters is not null then
   new.liters_declined:=false;
   new.liters_declined_at:=null;
   new.liters_declined_by:=null;
 elsif new.liters_declined is distinct from true
   or new.liters_declined_at is null or new.liters_declined_by is null then
   raise exception 'Informe os litros ou confirme expressamente que não deseja informá-los.'
   using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists fuel_liter_decision_guard on xrmovi.fuel_entries;
create trigger fuel_liter_decision_guard before insert or update on xrmovi.fuel_entries
for each row execute function xrmovi.fuel_liter_decision_guard();

create table if not exists xrmovi.fuel_liter_omissions(
 id bigint generated always as identity primary key,
 company_id uuid not null references xrmovi.companies(id),
 fuel_id uuid not null references xrmovi.fuel_entries(id),
 actor_id uuid not null references auth.users(id),
 declared_at timestamptz not null default now(),
 acknowledgement text not null default 'Optei por não informar os litros deste abastecimento e reconheço que isso compromete a confiabilidade do indicador de consumo.'
);
create index if not exists fuel_liter_omissions_fuel_idx on xrmovi.fuel_liter_omissions(fuel_id,declared_at desc);
alter table xrmovi.fuel_liter_omissions enable row level security;
revoke all on table xrmovi.fuel_liter_omissions from public,anon,authenticated;
revoke all on sequence xrmovi.fuel_liter_omissions_id_seq from public,anon,authenticated;

create or replace function public.xrmovi_fuel_save_v2(
 cid uuid,vid uuid,f_date date,qty numeric,cost numeric,meter numeric,
 station_name text,detail text,p_decline boolean
) returns uuid language plpgsql security definer set search_path to '' as $$
declare rid uuid;
begin
 perform public.xrmovi_assert_company_access(cid);
 if auth.uid() is null or not exists(
  select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=auth.uid()
  and m.role in ('owner','manager')
 ) then raise exception 'Somente proprietário ou gestor pode registrar abastecimentos.' using errcode='42501'; end if;
 if not exists(select 1 from xrmovi.vehicles where id=vid and company_id=cid) then
  raise exception 'Veículo inválido para esta empresa.' using errcode='22023';end if;
 if f_date is null or cost is null or cost<0 or cost::text in ('NaN','Infinity','-Infinity')
 or (meter is not null and (meter<0 or meter::text in ('NaN','Infinity','-Infinity')))
 or length(coalesce(station_name,''))>120 or length(coalesce(detail,''))>1000
 or ((qty is null) is distinct from coalesce(p_decline,false))
 or (qty is not null and (qty<=0 or qty::text in ('NaN','Infinity','-Infinity')))
 then raise exception 'Informe litros positivos ou confirme expressamente que optou por não informá-los.' using errcode='22023';end if;
 insert into xrmovi.fuel_entries(company_id,vehicle_id,fueled_on,liters,total_cost,odometer,station,notes,
  liters_declined,liters_declined_at,liters_declined_by)
 values(cid,vid,f_date,qty,cost,meter,nullif(trim(coalesce(station_name,'')),''),
  nullif(trim(coalesce(detail,'')),''),
  qty is null,case when qty is null then now() else null end,
  case when qty is null then auth.uid() else null end)
 returning id into rid;
 if qty is null then
  insert into xrmovi.fuel_liter_omissions(company_id,fuel_id,actor_id) values(cid,rid,auth.uid());
 end if;
 return rid;
end $$;
revoke all on function public.xrmovi_fuel_save_v2(uuid,uuid,date,numeric,numeric,numeric,text,text,boolean) from public,anon;
grant execute on function public.xrmovi_fuel_save_v2(uuid,uuid,date,numeric,numeric,numeric,text,text,boolean) to authenticated;

create or replace function public.xrmovi_fuel_update_v2(
 cid uuid,fid uuid,p_vehicle uuid,p_date date,p_liters numeric,p_cost numeric,p_meter numeric,
 p_station text,p_notes text,p_expected_revision integer,p_reason text,p_decline boolean
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare previous xrmovi.fuel_entries;
        updated xrmovi.fuel_entries;
        changed boolean;
begin
 perform public.xrmovi_assert_company_access(cid);
 if auth.uid() is null or not exists(
  select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=auth.uid()
  and m.role in ('owner','manager')
 ) then raise exception 'Somente proprietário ou gestor pode editar abastecimentos.' using errcode='42501';end if;
 select * into previous from xrmovi.fuel_entries where id=fid and company_id=cid for update;
 if not found then raise exception 'Abastecimento não encontrado.' using errcode='22023';end if;
 if previous.revision is distinct from p_expected_revision then
  raise exception 'Este abastecimento foi modificado por outro usuário. Atualize a página.'
  using errcode='40001';end if;
 if p_vehicle is null or not exists(select 1 from xrmovi.vehicles where id=p_vehicle and company_id=cid) then
  raise exception 'Veículo inválido para esta empresa.' using errcode='22023';end if;
 if p_date is null or p_cost is null or p_cost<0 or p_cost::text in ('NaN','Infinity','-Infinity')
 or (p_meter is not null and (p_meter<0 or p_meter::text in ('NaN','Infinity','-Infinity')))
 or length(coalesce(p_station,''))>120 or length(coalesce(p_notes,''))>1000
 or ((p_liters is null) is distinct from coalesce(p_decline,false))
 or (p_liters is not null and (p_liters<=0 or p_liters::text in ('NaN','Infinity','-Infinity'))) then
  raise exception 'Informe litros positivos ou confirme expressamente que optou por não informá-los.'
  using errcode='22023';end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 then
  raise exception 'Informe o motivo da edição (3 a 500 caracteres).' using errcode='22023';end if;
 changed:=previous.vehicle_id is distinct from p_vehicle
  or previous.fueled_on is distinct from p_date
  or previous.liters is distinct from p_liters
  or previous.liters_declined is distinct from p_decline
  or previous.total_cost is distinct from p_cost
  or previous.odometer is distinct from p_meter
  or coalesce(previous.station,'') is distinct from trim(coalesce(p_station,''))
  or coalesce(previous.notes,'') is distinct from trim(coalesce(p_notes,''));
 if not changed then raise exception 'Nenhuma alteração nos dados.' using errcode='22023';end if;
 update xrmovi.fuel_entries set
  vehicle_id=p_vehicle,fueled_on=p_date,liters=p_liters,total_cost=p_cost,odometer=p_meter,
  station=nullif(trim(coalesce(p_station,'')),''),
  notes=nullif(trim(coalesce(p_notes,'')),''),
  liters_declined=coalesce(p_decline,false),
  liters_declined_at=case when p_liters is not null then null
    when previous.liters_declined then previous.liters_declined_at else now() end,
  liters_declined_by=case when p_liters is not null then null
    when previous.liters_declined then previous.liters_declined_by else auth.uid() end,
  revision=previous.revision+1
 where id=fid and company_id=cid returning * into updated;
 update xrmovi.record_attachments set vehicle_id=p_vehicle
 where company_id=cid and entity_kind='fuel' and record_id=fid
   and vehicle_id is distinct from p_vehicle;
 insert into xrmovi.fuel_entry_changes(company_id,fuel_id,actor_id,reason,before_data,after_data)
 values(cid,fid,auth.uid(),trim(p_reason),to_jsonb(previous),to_jsonb(updated));
 if p_liters is null and previous.liters_declined=false then
  insert into xrmovi.fuel_liter_omissions(company_id,fuel_id,actor_id)
  values(cid,fid,auth.uid());
 end if;
 return jsonb_build_object('id',updated.id,'revision',updated.revision);
end $$;
revoke all on function public.xrmovi_fuel_update_v2(uuid,uuid,uuid,date,numeric,numeric,numeric,text,text,integer,text,boolean) from public,anon;
grant execute on function public.xrmovi_fuel_update_v2(uuid,uuid,uuid,date,numeric,numeric,numeric,text,text,integer,text,boolean) to authenticated;
