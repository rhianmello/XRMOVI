-- XRMOVI: editable refueling records, optimistic concurrency, and history.
-- Existing entries and receipts are preserved.
alter table xrmovi.fuel_entries
 add column if not exists revision integer not null default 0;

create table if not exists xrmovi.fuel_entry_changes(
 id bigint generated always as identity primary key,
 company_id uuid not null,
 fuel_id uuid not null,
 actor_id uuid not null,
 changed_at timestamptz not null default now(),
 reason text not null,
 before_data jsonb not null,
 after_data jsonb not null
);
create index if not exists fuel_entry_changes_lookup
 on xrmovi.fuel_entry_changes(company_id,fuel_id,changed_at desc);
alter table xrmovi.fuel_entry_changes enable row level security;
revoke all on xrmovi.fuel_entry_changes from public,anon,authenticated;

create or replace function public.xrmovi_fuel_details(cid uuid, fid uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare f xrmovi.fuel_entries;
begin
 perform public.xrmovi_assert_company_access(cid);
 if not exists(select 1 from xrmovi.memberships m
  where m.company_id=cid and m.user_id=(select auth.uid())
    and m.role in ('owner','manager')) then
  raise exception 'Somente proprietário ou gestor pode editar abastecimentos.'
    using errcode='42501';
 end if;
 select * into f from xrmovi.fuel_entries
  where company_id=cid and id=fid;
 if not found then raise exception 'Abastecimento não encontrado.' using errcode='22023';end if;
 return jsonb_build_object(
  'id',f.id,'vehicle_id',f.vehicle_id,'date',f.fueled_on,
  'liters',f.liters,'cost',f.total_cost,'meter',f.odometer,
  'station',f.station,'notes',f.notes,'revision',f.revision
 );
end;
$$;
revoke all on function public.xrmovi_fuel_details(uuid,uuid) from public,anon;
grant execute on function public.xrmovi_fuel_details(uuid,uuid) to authenticated;

create or replace function public.xrmovi_fuel_update(
 cid uuid,
 fid uuid,
 p_vehicle uuid,
 p_date date,
 p_liters numeric,
 p_cost numeric,
 p_meter numeric,
 p_station text,
 p_notes text,
 p_expected_revision integer,
 p_reason text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare previous xrmovi.fuel_entries;
        updated xrmovi.fuel_entries;
        changed boolean;
begin
 perform public.xrmovi_assert_company_access(cid);
 if (select auth.uid()) is null or not exists(
   select 1 from xrmovi.memberships m where m.company_id=cid
   and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
 ) then raise exception 'Somente proprietário ou gestor pode editar abastecimentos.'
 using errcode='42501';end if;

 select * into previous from xrmovi.fuel_entries
 where company_id=cid and id=fid for update;
 if not found then raise exception 'Abastecimento não encontrado.' using errcode='22023';end if;
 if p_expected_revision is null or previous.revision<>p_expected_revision then
  raise exception 'Este abastecimento foi modificado por outro usuário. Atualize e tente novamente.'
   using errcode='40001';end if;
 if p_vehicle is null or not exists(
  select 1 from xrmovi.vehicles v where v.company_id=cid and v.id=p_vehicle
 ) then raise exception 'Veículo inválido para esta empresa.' using errcode='22023';end if;
 if p_date is null or p_liters is null or p_liters<=0
    or p_cost is null or p_cost<0
    or (p_meter is not null and p_meter<0)
    or p_liters::text in ('NaN','Infinity','-Infinity')
    or p_cost::text in ('NaN','Infinity','-Infinity')
    or (p_meter is not null and p_meter::text in ('NaN','Infinity','-Infinity'))
    or length(coalesce(p_station,''))>120
    or length(coalesce(p_notes,''))>1000 then
  raise exception 'Confira os valores do abastecimento, data, posto e observações.'
   using errcode='22023';end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 then
  raise exception 'Informe o motivo da alteração (3 a 500 caracteres).'
  using errcode='22023';end if;

 changed:=previous.vehicle_id is distinct from p_vehicle
  or previous.fueled_on is distinct from p_date
  or previous.liters is distinct from p_liters
  or previous.total_cost is distinct from p_cost
  or previous.odometer is distinct from p_meter
  or coalesce(previous.station,'') is distinct from trim(coalesce(p_station,''))
  or coalesce(previous.notes,'') is distinct from trim(coalesce(p_notes,''));
 if not changed then
  raise exception 'Nenhuma alteração nos dados. Para anexar um comprovante, use o botão Comprovantes.'
   using errcode='22023';end if;

 update xrmovi.fuel_entries set
  vehicle_id=p_vehicle,fueled_on=p_date,liters=p_liters,total_cost=p_cost,
  odometer=p_meter,station=nullif(trim(coalesce(p_station,'')),''),
  notes=nullif(trim(coalesce(p_notes,'')),''),
  revision=previous.revision+1
 where company_id=cid and id=fid returning * into updated;

 -- Existing receipts follow the record when the linked vehicle is corrected.
 update xrmovi.record_attachments set vehicle_id=p_vehicle
  where company_id=cid and entity_kind='fuel' and record_id=fid
    and vehicle_id is distinct from p_vehicle;

 insert into xrmovi.fuel_entry_changes(
  company_id,fuel_id,actor_id,reason,before_data,after_data
 ) values(
  cid,fid,(select auth.uid()),trim(p_reason),
  to_jsonb(previous),to_jsonb(updated)
 );
 return jsonb_build_object('id',updated.id,'revision',updated.revision);
end;
$$;
revoke all on function public.xrmovi_fuel_update(uuid,uuid,uuid,date,numeric,numeric,numeric,text,text,integer,text)
 from public,anon;
grant execute on function public.xrmovi_fuel_update(uuid,uuid,uuid,date,numeric,numeric,numeric,text,text,integer,text)
 to authenticated;

create or replace function public.xrmovi_fuel_history(cid uuid,fid uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 perform public.xrmovi_assert_company_access(cid);
 if not exists(select 1 from xrmovi.memberships m
   where m.company_id=cid and m.user_id=(select auth.uid())
   and m.role in ('owner','manager')) then
   raise exception 'Histórico disponível somente a proprietário/gestor.'
   using errcode='42501';end if;
 if not exists(select 1 from xrmovi.fuel_entries f where f.company_id=cid and f.id=fid) then
  raise exception 'Abastecimento não encontrado.' using errcode='22023';end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'date',s.changed_at,'reason',s.reason,'actor',s.actor_id,
   'before',jsonb_build_object(
    'vehicle_id',s.before_data->>'vehicle_id',
    'date',s.before_data->>'fueled_on','liters',s.before_data->'liters',
    'cost',s.before_data->'total_cost','meter',s.before_data->'odometer',
    'station',s.before_data->>'station','notes',s.before_data->>'notes'),
   'after',jsonb_build_object(
    'vehicle_id',s.after_data->>'vehicle_id',
    'date',s.after_data->>'fueled_on','liters',s.after_data->'liters',
    'cost',s.after_data->'total_cost','meter',s.after_data->'odometer',
    'station',s.after_data->>'station','notes',s.after_data->>'notes')
  ) order by s.changed_at desc,s.id desc)
  from (select * from xrmovi.fuel_entry_changes c
        where c.company_id=cid and c.fuel_id=fid
        order by changed_at desc,id desc limit 50) s
 ),'[]'::jsonb);
end;
$$;
revoke all on function public.xrmovi_fuel_history(uuid,uuid) from public,anon;
grant execute on function public.xrmovi_fuel_history(uuid,uuid) to authenticated;
