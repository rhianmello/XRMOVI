CREATE OR REPLACE FUNCTION public.xrmovi_expense_save(cid uuid, p_id uuid, p_vehicle uuid, p_category text, p_description text, p_date date, p_due date, p_amount numeric, p_paid date, p_notes text, expected_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target xrmovi.vehicle_expenses;eid uuid;
begin
 perform public.xrmovi_assert_company_access(cid);
 if not exists(select 1 from xrmovi.memberships where company_id=cid and user_id=(select auth.uid()) and role in ('owner','manager')) then raise exception 'Not authorized' using errcode='42501';end if;
 if not exists(select 1 from xrmovi.vehicles where id=p_vehicle and company_id=cid) then raise exception 'Veículo não encontrado na empresa.' using errcode='22023';end if;
 if p_category is null or p_category not in ('ipva','multa','seguro','licenciamento','pedagio','outros') or length(trim(coalesce(p_description,''))) not between 3 and 180 or p_date is null or p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2)<>p_amount or p_paid>current_date or length(coalesce(p_notes,''))>1000 then raise exception 'Dados da despesa inválidos. Use valor positivo com até duas casas decimais e pagamento até hoje.' using errcode='22023';end if;
 if p_id is null then insert into xrmovi.vehicle_expenses(company_id,vehicle_id,category,description,expense_date,due_date,amount,paid_on,notes) values(cid,p_vehicle,p_category,trim(p_description),p_date,p_due,p_amount,p_paid,nullif(trim(p_notes),'')) returning id into eid;
 else
  if exists(select 1 from xrmovi.traffic_fines where company_id=cid and expense_id=p_id) then
   raise exception 'Esta despesa está vinculada a uma multa. Edite pelo módulo Multas e Infrações para evitar divergências financeiras.' using errcode='22023';
  end if;
  select * into target from xrmovi.vehicle_expenses where company_id=cid and id=p_id for update;
  if not found then raise exception 'Despesa não encontrada.' using errcode='22023';end if;
  if expected_revision is null or expected_revision<>target.revision then raise exception 'Despesa alterada por outro usuário. Atualize os dados.' using errcode='40001';end if;
  update xrmovi.vehicle_expenses set vehicle_id=p_vehicle,category=p_category,description=trim(p_description),expense_date=p_date,due_date=p_due,amount=p_amount,paid_on=p_paid,notes=nullif(trim(p_notes),'') where company_id=cid and id=p_id returning id into eid;
 end if;return eid;
end $function$;
