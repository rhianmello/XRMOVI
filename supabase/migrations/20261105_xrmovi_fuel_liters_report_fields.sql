CREATE OR REPLACE FUNCTION public.xrmovi_fuel_details(cid uuid, fid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  'liters',f.liters,'liters_declined',f.liters_declined,'liters_declined_at',f.liters_declined_at,'liters_declined_by',f.liters_declined_by,'cost',f.total_cost,'meter',f.odometer,
  'station',f.station,'notes',f.notes,'revision',f.revision
 );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.xrmovi_fuel_history(cid uuid, fid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'liters_declined',coalesce(s.before_data->'liters_declined','false'::jsonb),
    'cost',s.before_data->'total_cost','meter',s.before_data->'odometer',
    'station',s.before_data->>'station','notes',s.before_data->>'notes'),
   'after',jsonb_build_object(
    'vehicle_id',s.after_data->>'vehicle_id',
    'date',s.after_data->>'fueled_on','liters',s.after_data->'liters',
    'liters_declined',coalesce(s.after_data->'liters_declined','false'::jsonb),
    'cost',s.after_data->'total_cost','meter',s.after_data->'odometer',
    'station',s.after_data->>'station','notes',s.after_data->>'notes')
  ) order by s.changed_at desc,s.id desc)
  from (select * from xrmovi.fuel_entry_changes c
        where c.company_id=cid and c.fuel_id=fid
        order by changed_at desc,id desc limit 50) s
 ),'[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.xrmovi_cost_report(cid uuid, from_date date, to_date date, vid uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform public.xrmovi_assert_company_access(cid);
if not exists(select 1 from xrmovi.memberships where company_id=cid and user_id=auth.uid()) then raise exception 'Not authorized';end if;
if from_date is null or to_date is null or from_date>to_date or to_date-from_date>730 then raise exception 'Invalid period';end if;
select jsonb_build_object(
'fuel',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'vehicle_id',f.vehicle_id,'plate',v.plate,'date',f.fueled_on,'liters',f.liters,
'liters_declined',f.liters_declined,'liters_declined_at',f.liters_declined_at,
'liters_declined_by',f.liters_declined_by,
'liters_declined_email',(select u.email from auth.users u where u.id=f.liters_declined_by),
'cost',f.total_cost,'meter',f.odometer,'station',f.station) order by f.fueled_on) from xrmovi.fuel_entries f join xrmovi.vehicles v on v.id=f.vehicle_id where f.company_id=cid and (vid is null or f.vehicle_id=vid) and f.fueled_on between from_date and to_date),'[]'::jsonb),
'maintenance',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'vehicle_id',m.vehicle_id,'plate',v.plate,'date',m.completed_at::date,'title',m.title,'actual_cost',m.actual_cost,'estimated_cost',m.estimated_cost,'completed_meter',m.completed_meter) order by m.completed_at) from xrmovi.maintenance_tasks m join xrmovi.vehicles v on v.id=m.vehicle_id where m.company_id=cid and (vid is null or m.vehicle_id=vid) and m.status='done' and m.completed_at::date between from_date and to_date),'[]'::jsonb),
'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'vehicle_id',e.vehicle_id,'plate',v.plate,'date',e.paid_on,'expense_date',e.expense_date,'category',e.category,'description',e.description,'amount',e.amount) order by e.paid_on,e.id) from xrmovi.vehicle_expenses e join xrmovi.vehicles v on v.id=e.vehicle_id and v.company_id=e.company_id where e.company_id=cid and (vid is null or e.vehicle_id=vid) and e.paid_on between from_date and to_date),'[]'::jsonb)
) into result;
return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.xrmovi_financial_intelligence(cid uuid, days_back integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb;
begin
 perform public.xrmovi_assert_company_access(cid);
if not exists(select 1 from xrmovi.memberships where company_id=cid and user_id=(select auth.uid())) then raise exception 'Not authorized';end if;
if days_back not in (30,90,180,365) then raise exception 'Invalid interval';end if;
select jsonb_build_object(
'vehicles',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'plate',v.plate,'model',v.model,'contract_id',v.contract_id,'category',v.category,'odometer',v.odometer_value,'fuel_cost',coalesce((select sum(f.total_cost) from xrmovi.fuel_entries f where f.vehicle_id=v.id and f.fueled_on>=current_date-days_back+1),0),'maintenance_cost',coalesce((select sum(m.actual_cost) from xrmovi.maintenance_tasks m where m.vehicle_id=v.id and m.status='done' and m.completed_at::date>=current_date-days_back+1),0),'fuel_liters',coalesce((select sum(f.liters) from xrmovi.fuel_entries f where f.vehicle_id=v.id and f.fueled_on>=current_date-days_back+1),0),
'fuel_missing_liters',(select count(*) from xrmovi.fuel_entries f where f.vehicle_id=v.id and f.fueled_on>=current_date-days_back+1 and f.liters is null),'min_meter',(select min(f.odometer) from xrmovi.fuel_entries f where f.vehicle_id=v.id and f.fueled_on>=current_date-days_back+1),'max_meter',(select max(f.odometer) from xrmovi.fuel_entries f where f.vehicle_id=v.id and f.fueled_on>=current_date-days_back+1)) order by v.plate) from xrmovi.vehicles v where v.company_id=cid),'[]'::jsonb),
'forecast_next_30d',coalesce((select sum(m.estimated_cost) from xrmovi.maintenance_tasks m where m.company_id=cid and m.status='open' and m.due_date between current_date and current_date+30),0),
'without_contract', (select count(*) from xrmovi.vehicles v where v.company_id=cid and v.contract_id is null)
) into payload;
return payload;
end $function$
;