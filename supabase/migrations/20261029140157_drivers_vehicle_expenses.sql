-- Additive operational driver registry and non-maintenance vehicle expenses.
create table xrmovi.drivers (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references xrmovi.companies(id),
 name text not null check(length(trim(name)) between 2 and 160), phone text,
 cnh_number text, cnh_category text, cnh_expires_on date, active boolean not null default true, notes text,
 revision integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,id)
);
create index drivers_company_name on xrmovi.drivers(company_id,active,name);
create unique index drivers_company_cnh on xrmovi.drivers(company_id,lower(cnh_number)) where cnh_number is not null;
alter table xrmovi.drivers enable row level security;
revoke all on xrmovi.drivers from public,anon,authenticated;
create policy drivers_member_read on xrmovi.drivers for select to authenticated using(exists(select 1 from xrmovi.memberships m where m.company_id=drivers.company_id and m.user_id=(select auth.uid())));

alter table xrmovi.vehicles add column driver_id uuid;
alter table xrmovi.vehicles add constraint vehicles_company_driver_fk foreign key(company_id,driver_id) references xrmovi.drivers(company_id,id);
create index vehicles_company_driver on xrmovi.vehicles(company_id,driver_id);
create unique index vehicles_company_id_key on xrmovi.vehicles(company_id,id);

create table xrmovi.vehicle_expenses (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references xrmovi.companies(id),
 vehicle_id uuid not null, category text not null check(category in ('ipva','multa','seguro','licenciamento','pedagio','outros')),
 description text not null check(length(trim(description)) between 3 and 180), expense_date date not null,
 due_date date, amount numeric(14,2) not null check(amount>0 and amount::text not in ('NaN','Infinity','-Infinity')),
 paid_on date, notes text, revision integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(company_id,vehicle_id) references xrmovi.vehicles(company_id,id)
);
create index vehicle_expenses_company_vehicle on xrmovi.vehicle_expenses(company_id,vehicle_id,expense_date);
create index vehicle_expenses_paid on xrmovi.vehicle_expenses(company_id,paid_on) where paid_on is not null;
create index vehicle_expenses_pending on xrmovi.vehicle_expenses(company_id,due_date) where paid_on is null;
alter table xrmovi.vehicle_expenses enable row level security;
revoke all on xrmovi.vehicle_expenses from public,anon,authenticated;
create policy vehicle_expenses_member_read on xrmovi.vehicle_expenses for select to authenticated using(exists(select 1 from xrmovi.memberships m where m.company_id=vehicle_expenses.company_id and m.user_id=(select auth.uid())));

create table xrmovi.registry_changes (
 id bigint generated always as identity primary key, company_id uuid not null references xrmovi.companies(id),
 entity text not null,record_id uuid not null,actor_id uuid references auth.users(id),
 changed_at timestamptz not null default now(),before_data jsonb,after_data jsonb not null
);
create index registry_changes_record on xrmovi.registry_changes(company_id,entity,record_id,changed_at desc);
create index registry_changes_actor on xrmovi.registry_changes(actor_id);
alter table xrmovi.registry_changes enable row level security;
revoke all on xrmovi.registry_changes from public,anon,authenticated;
create policy registry_changes_member_read on xrmovi.registry_changes for select to authenticated using(exists(select 1 from xrmovi.memberships m where m.company_id=registry_changes.company_id and m.user_id=(select auth.uid())));

create function xrmovi.registry_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (to_jsonb(new)-'revision'-'updated_at') is distinct from (to_jsonb(old)-'revision'-'updated_at') then new.revision:=old.revision+1;new.updated_at:=now();else new.revision:=old.revision;new.updated_at:=old.updated_at;end if;
 return new;
end $$;
create function xrmovi.registry_capture() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' or to_jsonb(old) is distinct from to_jsonb(new) then
  insert into xrmovi.registry_changes(company_id,entity,record_id,actor_id,before_data,after_data)
  values(new.company_id,tg_table_name,new.id,(select auth.uid()),case when tg_op='INSERT' then null else to_jsonb(old) end,to_jsonb(new));
 end if;return new;
end $$;
create function xrmovi.vehicle_driver_capture() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.driver_id is distinct from new.driver_id then
 insert into xrmovi.registry_changes(company_id,entity,record_id,actor_id,before_data,after_data)
 values(new.company_id,'vehicle_driver',new.id,(select auth.uid()),jsonb_build_object('driver_id',old.driver_id),jsonb_build_object('driver_id',new.driver_id));end if;return new;
end $$;
create function xrmovi.registry_keep_history() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Registry history is append-only' using errcode='42501';end $$;
revoke all on function xrmovi.registry_revision(),xrmovi.registry_capture(),xrmovi.vehicle_driver_capture(),xrmovi.registry_keep_history() from public,anon,authenticated;
create trigger drivers_revision before update on xrmovi.drivers for each row execute function xrmovi.registry_revision();
create trigger drivers_capture after insert or update on xrmovi.drivers for each row execute function xrmovi.registry_capture();
create trigger vehicle_expenses_revision before update on xrmovi.vehicle_expenses for each row execute function xrmovi.registry_revision();
create trigger vehicle_expenses_capture after insert or update on xrmovi.vehicle_expenses for each row execute function xrmovi.registry_capture();
create trigger vehicle_driver_capture after update of driver_id on xrmovi.vehicles for each row execute function xrmovi.vehicle_driver_capture();
create trigger registry_history_keep before update or delete on xrmovi.registry_changes for each row execute function xrmovi.registry_keep_history();

-- Private-schema API: explicitly check current company membership in every RPC.
create function public.xrmovi_drivers_list(cid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member_role text;
begin
 select role into member_role from xrmovi.memberships where company_id=cid and user_id=(select auth.uid());
 if member_role is null then raise exception 'Not authorized' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'phone',case when member_role in ('owner','manager') then d.phone end,'cnh_number',case when member_role in ('owner','manager') then d.cnh_number end,'cnh_category',d.cnh_category,'cnh_expires_on',d.cnh_expires_on,'active',d.active,'notes',case when member_role in ('owner','manager') then d.notes end,'revision',d.revision) order by d.active desc,d.name) from xrmovi.drivers d where d.company_id=cid),'[]'::jsonb);
end $$;

create function public.xrmovi_driver_save(cid uuid,p_id uuid,p_name text,p_phone text,p_cnh text,p_category text,p_expires date,p_active boolean,p_notes text,expected_revision integer) returns uuid language plpgsql security definer set search_path='' as $$
declare target xrmovi.drivers;did uuid;
begin
 if not exists(select 1 from xrmovi.memberships where company_id=cid and user_id=(select auth.uid()) and role in ('owner','manager')) then raise exception 'Not authorized' using errcode='42501';end if;
 if length(trim(coalesce(p_name,''))) not between 2 and 160 or length(coalesce(p_phone,''))>40 or length(coalesce(p_cnh,''))>30 or length(coalesce(p_notes,''))>1000 or coalesce(p_category,'') not in ('','A','B','AB','C','AC','D','AD','E','AE') or p_active is null then raise exception 'Dados do motorista inválidos.' using errcode='22023';end if;
 if p_id is null then
  insert into xrmovi.drivers(company_id,name,phone,cnh_number,cnh_category,cnh_expires_on,active,notes) values(cid,trim(p_name),nullif(trim(p_phone),''),nullif(trim(p_cnh),''),nullif(p_category,''),p_expires,p_active,nullif(trim(p_notes),'')) returning id into did;
 else
  select * into target from xrmovi.drivers where company_id=cid and id=p_id for update;
  if not found then raise exception 'Motorista não encontrado.' using errcode='22023';end if;
  if expected_revision is null or expected_revision<>target.revision then raise exception 'Motorista alterado por outro usuário. Atualize os dados.' using errcode='40001';end if;
  update xrmovi.drivers set name=trim(p_name),phone=nullif(trim(p_phone),''),cnh_number=nullif(trim(p_cnh),''),cnh_category=nullif(p_category,''),cnh_expires_on=p_expires,active=p_active,notes=nullif(trim(p_notes),'') where id=p_id and company_id=cid returning id into did;
 end if;return did;
exception when unique_violation then raise exception 'Já existe um motorista com essa CNH nesta empresa.' using errcode='23505';
end $$;

create function public.xrmovi_vehicle_save_with_driver(cid uuid,p_id uuid,p_plate text,p_brand text,p_model text,p_category text,p_manufacture_year integer,p_model_year integer,p_odometer numeric,p_unit text,p_notes text,p_driver uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare vid uuid; previous_driver uuid;is_active boolean;
begin
 if not exists(select 1 from xrmovi.memberships where company_id=cid and user_id=(select auth.uid()) and role in ('owner','manager')) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_id is not null then select driver_id into previous_driver from xrmovi.vehicles where id=p_id and company_id=cid for update;if not found then raise exception 'Vehicle not found';end if;end if;
 if p_driver is not null then
  select active into is_active from xrmovi.drivers where company_id=cid and id=p_driver for share;
  if not found or (not is_active and previous_driver is distinct from p_driver) then raise exception 'Selecione um motorista ativo da empresa.' using errcode='22023';end if;
 end if;
 if p_odometer::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid odometer';end if;
 vid:=public.xrmovi_save_vehicle(cid,p_id,p_plate,p_brand,p_model,p_category,p_manufacture_year,p_model_year,p_odometer,p_unit,p_notes);
 update xrmovi.vehicles set driver_id=p_driver where company_id=cid and id=vid;
 return vid;
end $$;

create function public.xrmovi_expenses_list(cid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from xrmovi.memberships where company_id=cid and user_id=(select auth.uid())) then raise exception 'Not authorized' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('plate',v.plate) order by e.expense_date desc,e.created_at desc) from xrmovi.vehicle_expenses e join xrmovi.vehicles v on v.id=e.vehicle_id and v.company_id=e.company_id where e.company_id=cid),'[]'::jsonb);
end $$;

create function public.xrmovi_expense_save(cid uuid,p_id uuid,p_vehicle uuid,p_category text,p_description text,p_date date,p_due date,p_amount numeric,p_paid date,p_notes text,expected_revision integer) returns uuid language plpgsql security definer set search_path='' as $$
declare target xrmovi.vehicle_expenses;eid uuid;
begin
 if not exists(select 1 from xrmovi.memberships where company_id=cid and user_id=(select auth.uid()) and role in ('owner','manager')) then raise exception 'Not authorized' using errcode='42501';end if;
 if not exists(select 1 from xrmovi.vehicles where id=p_vehicle and company_id=cid) then raise exception 'Veículo não encontrado na empresa.' using errcode='22023';end if;
 if p_category is null or p_category not in ('ipva','multa','seguro','licenciamento','pedagio','outros') or length(trim(coalesce(p_description,''))) not between 3 and 180 or p_date is null or p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2)<>p_amount or p_paid>current_date or length(coalesce(p_notes,''))>1000 then raise exception 'Dados da despesa inválidos. Use valor positivo com até duas casas decimais e pagamento até hoje.' using errcode='22023';end if;
 if p_id is null then insert into xrmovi.vehicle_expenses(company_id,vehicle_id,category,description,expense_date,due_date,amount,paid_on,notes) values(cid,p_vehicle,p_category,trim(p_description),p_date,p_due,p_amount,p_paid,nullif(trim(p_notes),'')) returning id into eid;
 else
  select * into target from xrmovi.vehicle_expenses where company_id=cid and id=p_id for update;
  if not found then raise exception 'Despesa não encontrada.' using errcode='22023';end if;
  if expected_revision is null or expected_revision<>target.revision then raise exception 'Despesa alterada por outro usuário. Atualize os dados.' using errcode='40001';end if;
  update xrmovi.vehicle_expenses set vehicle_id=p_vehicle,category=p_category,description=trim(p_description),expense_date=p_date,due_date=p_due,amount=p_amount,paid_on=p_paid,notes=nullif(trim(p_notes),'') where company_id=cid and id=p_id returning id into eid;
 end if;return eid;
end $$;

revoke all on function public.xrmovi_drivers_list(uuid),public.xrmovi_driver_save(uuid,uuid,text,text,text,text,date,boolean,text,integer),public.xrmovi_vehicle_save_with_driver(uuid,uuid,text,text,text,text,integer,integer,numeric,text,text,uuid),public.xrmovi_expenses_list(uuid),public.xrmovi_expense_save(uuid,uuid,uuid,text,text,date,date,numeric,date,text,integer) from public,anon;
grant execute on function public.xrmovi_drivers_list(uuid),public.xrmovi_driver_save(uuid,uuid,text,text,text,text,date,boolean,text,integer),public.xrmovi_vehicle_save_with_driver(uuid,uuid,text,text,text,text,integer,integer,numeric,text,text,uuid),public.xrmovi_expenses_list(uuid),public.xrmovi_expense_save(uuid,uuid,uuid,text,text,date,date,numeric,date,text,integer) to authenticated,service_role;

create or replace function public.xrmovi_my_vehicles(cid uuid) returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'plate',v.plate,'model',v.model,'brand',v.brand,'category',v.category,'manufacture_year',v.manufacture_year,'model_year',v.model_year,'odometer_value',v.odometer_value,'unit_name',v.unit_name,'notes',v.notes,'status',v.status,'contract_id',v.contract_id,'driver_id',v.driver_id,'driver_name',d.name) order by v.created_at desc),'[]'::jsonb)
from xrmovi.vehicles v left join xrmovi.drivers d on d.id=v.driver_id and d.company_id=v.company_id where v.company_id=cid and exists(select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=(select auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.xrmovi_save_vehicle(cid uuid, p_id uuid, p_plate text, p_brand text, p_model text, p_category text, p_manufacture_year integer, p_model_year integer, p_odometer numeric, p_unit text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare lim integer; state text; deadline timestamptz; vid uuid;
begin
if not exists(select 1 from xrmovi.memberships where company_id=cid and user_id=(select auth.uid()) and role in ('owner','manager')) then raise exception 'Not authorized'; end if;
select p.vehicle_limit,s.status,s.trial_end into lim,state,deadline from xrmovi.subscriptions s join xrmovi.plans p on p.code=s.plan_code where s.company_id=cid for update of s;
if state not in ('active','trial') or (state='trial' and (deadline is null or deadline<=now())) then raise exception 'Subscription inactive'; end if;
if p_id is null and lim is not null and (select count(*) from xrmovi.vehicles where company_id=cid)>=lim then raise exception 'Vehicle limit exceeded';end if;
if length(trim(coalesce(p_plate,''))) not between 3 and 30 or length(trim(coalesce(p_model,''))) not between 2 and 100 or length(trim(coalesce(p_brand,''))) not between 2 and 100 then raise exception 'Invalid identification, brand or model';end if;
if p_category not in ('Leve','Utilitário','Caminhão','Trator','Máquina','Ônibus','Moto','Implemento','Outro','Van','Equipamento') then raise exception 'Invalid category';end if;
if p_manufacture_year is not null and p_manufacture_year not between 1950 and 2100 then raise exception 'Invalid year';end if;
if p_model_year is not null and p_model_year not between 1950 and 2100 then raise exception 'Invalid year';end if;
if p_odometer is null or p_odometer<0 then raise exception 'Invalid odometer';end if;
if p_id is null then
insert into xrmovi.vehicles(company_id,plate,brand,model,category,manufacture_year,model_year,odometer_value,unit_name,notes)
values(cid,upper(trim(p_plate)),trim(p_brand),trim(p_model),p_category,p_manufacture_year,p_model_year,p_odometer,left(coalesce(p_unit,''),150),left(coalesce(p_notes,''),1000)) returning id into vid;
else
update xrmovi.vehicles set plate=upper(trim(p_plate)),brand=trim(p_brand),model=trim(p_model),category=p_category,manufacture_year=p_manufacture_year,model_year=p_model_year,odometer_value=p_odometer,unit_name=left(coalesce(p_unit,''),150),notes=left(coalesce(p_notes,''),1000)
where id=p_id and company_id=cid returning id into vid;
if vid is null then raise exception 'Vehicle not found';end if;
end if;
return vid;
end $function$;

CREATE OR REPLACE FUNCTION public.xrmovi_cost_report(cid uuid, from_date date, to_date date, vid uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
if not exists(select 1 from xrmovi.memberships where company_id=cid and user_id=auth.uid()) then raise exception 'Not authorized';end if;
if from_date is null or to_date is null or from_date>to_date or to_date-from_date>730 then raise exception 'Invalid period';end if;
select jsonb_build_object(
'fuel',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'vehicle_id',f.vehicle_id,'plate',v.plate,'date',f.fueled_on,'liters',f.liters,'cost',f.total_cost,'meter',f.odometer,'station',f.station) order by f.fueled_on) from xrmovi.fuel_entries f join xrmovi.vehicles v on v.id=f.vehicle_id where f.company_id=cid and (vid is null or f.vehicle_id=vid) and f.fueled_on between from_date and to_date),'[]'::jsonb),
'maintenance',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'vehicle_id',m.vehicle_id,'plate',v.plate,'date',m.completed_at::date,'title',m.title,'actual_cost',m.actual_cost,'estimated_cost',m.estimated_cost,'completed_meter',m.completed_meter) order by m.completed_at) from xrmovi.maintenance_tasks m join xrmovi.vehicles v on v.id=m.vehicle_id where m.company_id=cid and (vid is null or m.vehicle_id=vid) and m.status='done' and m.completed_at::date between from_date and to_date),'[]'::jsonb),
'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'vehicle_id',e.vehicle_id,'plate',v.plate,'date',e.paid_on,'expense_date',e.expense_date,'category',e.category,'description',e.description,'amount',e.amount) order by e.paid_on,e.id) from xrmovi.vehicle_expenses e join xrmovi.vehicles v on v.id=e.vehicle_id and v.company_id=e.company_id where e.company_id=cid and (vid is null or e.vehicle_id=vid) and e.paid_on between from_date and to_date),'[]'::jsonb)
) into result;
return result;
end $function$;

revoke all on function public.xrmovi_my_vehicles(uuid),public.xrmovi_save_vehicle(uuid,uuid,text,text,text,text,integer,integer,numeric,text,text),public.xrmovi_cost_report(uuid,date,date,uuid) from public,anon;
grant execute on function public.xrmovi_my_vehicles(uuid),public.xrmovi_save_vehicle(uuid,uuid,text,text,text,text,integer,integer,numeric,text,text),public.xrmovi_cost_report(uuid,date,date,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
