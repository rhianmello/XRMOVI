
-- XRMOVI: traffic fine control, isolated by company. No existing expense is modified or migrated.
create table if not exists xrmovi.traffic_fines (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references xrmovi.companies(id),
 vehicle_id uuid not null,
 driver_id uuid references xrmovi.drivers(id),
 notice_number text not null,
 authority text not null,
 infraction_code text,
 description text not null,
 infraction_date date not null,
 notice_date date,
 location text,
 amount numeric(12,2) not null check (amount>0),
 due_date date,
 driver_nomination_deadline date,
 defense_deadline date,
 points integer check (points between 0 and 30),
 responsibility text not null default 'undetermined' check (responsibility in ('undetermined','company','driver','third_party')),
 status text not null default 'pending' check (status in ('pending','appeal','paid','canceled')),
 paid_on date,
 notes text,
 expense_id uuid unique references xrmovi.vehicle_expenses(id),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 revision integer not null default 1 check (revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint traffic_fines_vehicle_company_fkey foreign key (company_id,vehicle_id)
   references xrmovi.vehicles(company_id,id),
 constraint traffic_fines_payment_check check ((status='paid')=(paid_on is not null)),
 constraint traffic_fines_number_check check (length(trim(notice_number)) between 3 and 120),
 constraint traffic_fines_authority_check check (length(trim(authority)) between 2 and 120),
 constraint traffic_fines_description_check check (length(trim(description)) between 3 and 500),
 constraint traffic_fines_notes_check check (length(coalesce(notes,''))<=2000),
 constraint traffic_fines_location_check check (length(coalesce(location,''))<=300),
 constraint traffic_fines_code_check check (length(coalesce(infraction_code,''))<=40)
);
create unique index if not exists traffic_fines_company_number_authority
 on xrmovi.traffic_fines(company_id, lower(notice_number),lower(authority));
create index if not exists traffic_fines_company_dates
 on xrmovi.traffic_fines(company_id,status,due_date);
create index if not exists traffic_fines_vehicle on xrmovi.traffic_fines(company_id,vehicle_id);
alter table xrmovi.traffic_fines enable row level security;
revoke all on xrmovi.traffic_fines from public,anon,authenticated;
grant select on xrmovi.traffic_fines to authenticated;
drop policy if exists traffic_fines_member_select on xrmovi.traffic_fines;
create policy traffic_fines_member_select on xrmovi.traffic_fines for select to authenticated
 using (exists(select 1 from xrmovi.memberships m
 where m.company_id=traffic_fines.company_id and m.user_id=(select auth.uid())));

create table if not exists xrmovi.traffic_fine_changes (
 id bigint generated always as identity primary key,
 company_id uuid not null references xrmovi.companies(id),
 fine_id uuid not null references xrmovi.traffic_fines(id),
 actor_id uuid not null references auth.users(id),
 reason text not null,
 before_data jsonb,
 after_data jsonb not null,
 created_at timestamptz not null default now(),
 constraint traffic_fine_changes_reason check(length(trim(reason)) between 3 and 500)
);
create index if not exists traffic_fine_changes_lookup on xrmovi.traffic_fine_changes(company_id,fine_id,created_at desc);
alter table xrmovi.traffic_fine_changes enable row level security;
revoke all on xrmovi.traffic_fine_changes from public,anon,authenticated;
grant select on xrmovi.traffic_fine_changes to authenticated;
drop policy if exists traffic_fine_changes_manager_select on xrmovi.traffic_fine_changes;
create policy traffic_fine_changes_manager_select on xrmovi.traffic_fine_changes
 for select to authenticated using (exists(select 1 from xrmovi.memberships m
 where m.company_id=traffic_fine_changes.company_id and m.user_id=(select auth.uid())
 and m.role in ('owner','manager')));

create or replace function public.xrmovi_traffic_fines_list(cid uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
begin
 perform public.xrmovi_assert_company_access(cid);
 if not exists(select 1 from xrmovi.memberships
 where company_id=cid and user_id=(select auth.uid()))
 then raise exception 'Acesso não autorizado à empresa.' using errcode='42501';end if;
 return coalesce((
 select jsonb_agg(jsonb_build_object(
  'id',f.id,'company_id',f.company_id,'vehicle_id',f.vehicle_id,'driver_id',f.driver_id,
  'plate',v.plate,'driver_name',d.name,
  'notice_number',f.notice_number,'authority',f.authority,'infraction_code',f.infraction_code,
  'description',f.description,'infraction_date',f.infraction_date,
  'notice_date',f.notice_date,'location',f.location,'amount',f.amount,
  'due_date',f.due_date,'driver_nomination_deadline',f.driver_nomination_deadline,
  'defense_deadline',f.defense_deadline,'points',f.points,
  'responsibility',f.responsibility,'status',f.status,'paid_on',f.paid_on,
  'notes',f.notes,'expense_id',f.expense_id,'revision',f.revision,
  'created_at',f.created_at,'updated_at',f.updated_at)
 order by f.infraction_date desc,f.created_at desc)
 from xrmovi.traffic_fines f
 join xrmovi.vehicles v on v.id=f.vehicle_id and v.company_id=f.company_id
 left join xrmovi.drivers d on d.id=f.driver_id and d.company_id=f.company_id
 where f.company_id=cid
 ),'[]'::jsonb);
end $$;
revoke all on function public.xrmovi_traffic_fines_list(uuid) from public,anon;
grant execute on function public.xrmovi_traffic_fines_list(uuid) to authenticated;

create or replace function public.xrmovi_traffic_fine_history(cid uuid,fid uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
begin
 perform public.xrmovi_assert_company_access(cid);
 if not exists(select 1 from xrmovi.memberships
 where company_id=cid and user_id=(select auth.uid()) and role in ('owner','manager'))
 then raise exception 'Somente gestores podem consultar auditoria.' using errcode='42501';end if;
 if not exists(select 1 from xrmovi.traffic_fines where id=fid and company_id=cid)
 then raise exception 'Infração não encontrada.' using errcode='22023';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
 'date',a.created_at,'reason',a.reason,'actor',coalesce(u.email,'Usuário indisponível'),
 'before',a.before_data,'after',a.after_data) order by a.created_at desc)
 from (select * from xrmovi.traffic_fine_changes where company_id=cid and fine_id=fid
 order by created_at desc limit 100) a
 left join auth.users u on u.id=a.actor_id),'[]'::jsonb);
end $$;
revoke all on function public.xrmovi_traffic_fine_history(uuid,uuid) from public,anon;
grant execute on function public.xrmovi_traffic_fine_history(uuid,uuid) to authenticated;

create or replace function public.xrmovi_traffic_fine_save(
 cid uuid, p_id uuid, p_vehicle uuid, p_driver uuid, p_number text, p_authority text,
 p_code text, p_description text, p_infraction_date date, p_notice_date date,
 p_location text, p_amount numeric, p_due date, p_nomination_due date,
 p_defense_due date, p_points integer, p_responsibility text,
 p_status text, p_paid date, p_notes text, p_expected_revision integer,
 p_reason text
) returns uuid language plpgsql security definer set search_path to ''
as $$
declare old xrmovi.traffic_fines%rowtype; newer xrmovi.traffic_fines%rowtype;
        output_id uuid; expense uuid; actor uuid;
begin
 actor:=auth.uid();
 if actor is null then raise exception 'Login necessário.' using errcode='42501';end if;
 perform public.xrmovi_assert_company_access(cid);
 if not exists(select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=actor
 and m.role in ('owner','manager')) then
 raise exception 'Somente proprietário ou gestor pode alterar multas.' using errcode='42501';end if;
 if not exists(select 1 from xrmovi.vehicles where company_id=cid and id=p_vehicle)
 then raise exception 'Veículo não pertence à empresa.' using errcode='22023';end if;
 if p_driver is not null and not exists(
 select 1 from xrmovi.drivers where company_id=cid and id=p_driver)
 then raise exception 'Motorista não pertence à empresa.' using errcode='22023';end if;
 if length(trim(coalesce(p_number,''))) not between 3 and 120
 or length(trim(coalesce(p_authority,''))) not between 2 and 120
 or length(trim(coalesce(p_description,''))) not between 3 and 500
 or length(coalesce(p_code,''))>40 or length(coalesce(p_location,''))>300
 or length(coalesce(p_notes,''))>2000
 or p_infraction_date is null or p_amount is null or p_amount<=0
 or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2)<>p_amount
 or (p_points is not null and p_points not between 0 and 30)
 or p_status not in ('pending','appeal','paid','canceled')
 or p_responsibility not in ('undetermined','company','driver','third_party')
 or (p_status='paid') is distinct from (p_paid is not null)
 or (p_paid is not null and p_paid>current_date)
 or (p_reason is not null and length(trim(p_reason)) not between 3 and 500)
 then raise exception 'Dados inválidos. Verifique auto, órgão, valor, situação, pagamento e datas.'
 using errcode='22023';end if;
 if p_id is null then
  insert into xrmovi.traffic_fines(
   company_id,vehicle_id,driver_id,notice_number,authority,infraction_code,description,
   infraction_date,notice_date,location,amount,due_date,driver_nomination_deadline,
   defense_deadline,points,responsibility,status,paid_on,notes,created_by,updated_by
  ) values (
   cid,p_vehicle,p_driver,trim(p_number),trim(p_authority),nullif(trim(coalesce(p_code,'')),''),
   trim(p_description),p_infraction_date,p_notice_date,
   nullif(trim(coalesce(p_location,'')),''),p_amount,p_due,p_nomination_due,
   p_defense_due,p_points,p_responsibility,p_status,p_paid,
   nullif(trim(coalesce(p_notes,'')),''),actor,actor
  ) returning * into newer;
 else
  select * into old from xrmovi.traffic_fines where company_id=cid and id=p_id for update;
  if not found then raise exception 'Multa não encontrada nesta empresa.' using errcode='22023';end if;
  if p_expected_revision is null or old.revision<>p_expected_revision then
   raise exception 'Registro atualizado por outra pessoa. Recarregue a lista.' using errcode='40001';end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 500 then
   raise exception 'Informe motivo da edição (3 a 500 caracteres).' using errcode='22023';end if;
  if old.status='paid' and p_status<>'paid' then
   raise exception 'Multa paga não pode ser reaberta diretamente. Solicite uma correção financeira auditada.' using errcode='22023';end if;
  if old.expense_id is not null and p_vehicle<>old.vehicle_id then
   raise exception 'Multa já contabilizada: o veículo não pode ser alterado após pagamento.' using errcode='22023';end if;
  update xrmovi.traffic_fines set
   vehicle_id=p_vehicle,driver_id=p_driver,notice_number=trim(p_number),authority=trim(p_authority),
   infraction_code=nullif(trim(coalesce(p_code,'')),''),description=trim(p_description),
   infraction_date=p_infraction_date,notice_date=p_notice_date,
   location=nullif(trim(coalesce(p_location,'')),''),amount=p_amount,due_date=p_due,
   driver_nomination_deadline=p_nomination_due,defense_deadline=p_defense_due,
   points=p_points,responsibility=p_responsibility,status=p_status,paid_on=p_paid,
   notes=nullif(trim(coalesce(p_notes,'')),''),revision=old.revision+1,
   updated_by=actor,updated_at=now()
   where id=old.id and company_id=cid returning * into newer;
 end if;
 -- Only a paid fine becomes a financial expense; one fine maps to one expense_id.
 -- This keeps pending/disputed amounts out of paid-cost totals.
 if newer.status='paid' then
  if newer.expense_id is null then
   insert into xrmovi.vehicle_expenses(company_id,vehicle_id,category,description,expense_date,
     due_date,amount,paid_on,notes)
   values(cid,newer.vehicle_id,'multa',left('Multa '||newer.notice_number||' — '||newer.description,180),
    newer.infraction_date,newer.due_date,newer.amount,newer.paid_on,
    'Vinculada ao módulo Multas e Infrações. Atualizar no cadastro da multa.')
   returning id into expense;
   update xrmovi.traffic_fines set expense_id=expense where id=newer.id returning * into newer;
  else
   update xrmovi.vehicle_expenses set
    description=left('Multa '||newer.notice_number||' — '||newer.description,180),
    expense_date=newer.infraction_date,due_date=newer.due_date,
    amount=newer.amount,paid_on=newer.paid_on,revision=revision+1,updated_at=now()
   where id=newer.expense_id and company_id=cid and category='multa'
   returning id into expense;
   if expense is null then raise exception 'Despesa vinculada inválida.' using errcode='23514';end if;
  end if;
 end if;
 insert into xrmovi.traffic_fine_changes(company_id,fine_id,actor_id,reason,before_data,after_data)
 values(cid,newer.id,actor,case when p_id is null then 'Cadastro da infração' else trim(p_reason) end,
 case when p_id is null then null else to_jsonb(old) end,to_jsonb(newer));
 return newer.id;
end $$;
revoke all on function public.xrmovi_traffic_fine_save(
 uuid,uuid,uuid,uuid,text,text,text,text,date,date,text,numeric,date,date,date,integer,text,text,date,text,integer,text
) from public,anon;
grant execute on function public.xrmovi_traffic_fine_save(
 uuid,uuid,uuid,uuid,text,text,text,text,date,date,text,numeric,date,date,date,integer,text,text,date,text,integer,text
) to authenticated;
