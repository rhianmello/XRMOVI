CREATE OR REPLACE FUNCTION public.xrmovi_onboarding_complete(company_name text, contract_name text, chosen_plan text, contract_client text DEFAULT ''::text, contract_code text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 uid uuid:=auth.uid();
 c uuid; aid uuid; plan xrmovi.plans%rowtype; contract_id uuid;
 existing_account xrmovi.billing_accounts%rowtype;
begin
 if uid is null then raise exception 'Você precisa entrar na sua conta.' using errcode='42501';end if;
 if length(trim(coalesce(company_name,''))) not between 2 and 160
 or (contract_name is not null and length(trim(contract_name)) not between 2 and 160)
 or length(coalesce(contract_client,''))>160 or length(coalesce(contract_code,''))>60
 then raise exception 'Verifique os dados da empresa e do contrato.' using errcode='22023';end if;
 select * into plan from xrmovi.plans p where p.code=chosen_plan and p.active and p.monthly_brl is not null and p.company_limit>=1 and p.contract_limit>=1;
 if not found then raise exception 'Plano comercial indisponível.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 select * into existing_account from xrmovi.billing_accounts a where a.owner_id=uid for update;
 if found then
  if existing_account.status <> 'pending' or existing_account.provider_subscription_id is not null
     or existing_account.paid_through is not null or existing_account.trial_end is not null
     or exists(select 1 from xrmovi.account_companies ac where ac.account_id=existing_account.id)
     or exists(select 1 from xrmovi.billing_checkout_intents i where i.account_id=existing_account.id) then
   raise exception 'Sua conta já possui cadastro. Entre em Minha assinatura para conferir o pagamento.' using errcode='23514';
  end if;
  aid:=existing_account.id;
 else
  insert into xrmovi.billing_accounts(owner_id,plan_code,status,trial_end)
  values(uid,chosen_plan,'pending',null) returning id into aid;
 end if;
 insert into xrmovi.companies(name) values(trim(company_name)) returning id into c;
 insert into xrmovi.subscriptions(company_id,plan_code,status,trial_end)
 values(c,coalesce(existing_account.plan_code,chosen_plan),'pending',null);
 insert into xrmovi.account_companies(account_id,company_id) values(aid,c);
 insert into xrmovi.memberships(company_id,user_id,role) values(c,uid,'owner');
 if existing_account.id is not null then
  return jsonb_build_object('company_id',c,'contract_id',null,'account_id',aid,
   'selected_plan',existing_account.plan_code,'status','pending','recovered',true);
 end if;
 if contract_name is not null then
  insert into xrmovi.contracts(company_id,name,client_name,contract_code)
  values(c,trim(contract_name),nullif(trim(contract_client),''),nullif(trim(contract_code),''))
  returning id into contract_id;
 end if;
 return jsonb_build_object('company_id',c,'contract_id',contract_id,'account_id',aid,'selected_plan',chosen_plan,'status','pending');
end $function$;
