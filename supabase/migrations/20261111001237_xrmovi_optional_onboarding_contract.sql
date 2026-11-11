-- A null contract name skips contract creation or editing during onboarding.
CREATE OR REPLACE FUNCTION public.xrmovi_onboarding_complete(company_name text, contract_name text, chosen_plan text, contract_client text DEFAULT ''::text, contract_code text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 uid uuid:=auth.uid();
 c uuid; aid uuid; plan xrmovi.plans%rowtype; contract_id uuid;
begin
 if uid is null then raise exception 'Você precisa entrar na sua conta.' using errcode='42501';end if;
 if length(trim(coalesce(company_name,''))) not between 2 and 160
 or (contract_name is not null and length(trim(contract_name)) not between 2 and 160)
 or length(coalesce(contract_client,''))>160 or length(coalesce(contract_code,''))>60
 then raise exception 'Verifique os dados da empresa e do contrato.' using errcode='22023';end if;
 select * into plan from xrmovi.plans p where p.code=chosen_plan and p.active and p.monthly_brl is not null and p.company_limit>=1 and p.contract_limit>=1;
 if not found then raise exception 'Plano comercial indisponível.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 if exists(select 1 from xrmovi.billing_accounts a where a.owner_id=uid) then
  raise exception 'Sua conta já possui cadastro. Entre em Minha assinatura para conferir o pagamento.' using errcode='23514';
 end if;
 insert into xrmovi.companies(name) values(trim(company_name)) returning id into c;
 insert into xrmovi.subscriptions(company_id,plan_code,status,trial_end) values(c,chosen_plan,'pending',null);
 insert into xrmovi.billing_accounts(owner_id,plan_code,status,trial_end) values(uid,chosen_plan,'pending',null) returning id into aid;
 insert into xrmovi.account_companies(account_id,company_id) values(aid,c);
 insert into xrmovi.memberships(company_id,user_id,role) values(c,uid,'owner');
 if contract_name is not null then
  insert into xrmovi.contracts(company_id,name,client_name,contract_code)
  values(c,trim(contract_name),nullif(trim(contract_client),''),nullif(trim(contract_code),''))
  returning id into contract_id;
 end if;
 return jsonb_build_object('company_id',c,'contract_id',contract_id,'account_id',aid,'selected_plan',chosen_plan,'status','pending');
end $function$;

CREATE OR REPLACE FUNCTION public.xrmovi_onboarding_update(cid uuid, company_name text, contract_name text, chosen_plan text, contract_client text DEFAULT ''::text, contract_code text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_account_id uuid; contract_id uuid;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária.' using errcode='42501';end if;
 if length(trim(coalesce(company_name,''))) not between 2 and 160
 or (contract_name is not null and length(trim(contract_name)) not between 2 and 160)
 or length(coalesce(contract_client,''))>160 or length(coalesce(contract_code,''))>60 then
 raise exception 'Verifique os dados de cadastro.' using errcode='22023';end if;
 if not exists(select 1 from xrmovi.plans where code=chosen_plan and active and monthly_brl is not null)
 then raise exception 'Plano indisponível.' using errcode='22023';end if;
 select a.id into v_account_id from xrmovi.billing_accounts a
 join xrmovi.account_companies ac on ac.account_id=a.id where ac.company_id=cid
 and a.owner_id=auth.uid() and a.status='pending'
 and a.provider_subscription_id is null
 for update of a;
 if v_account_id is null then raise exception 'Cadastro já contratado, indisponível para alterações iniciais.' using errcode='42501';end if;
 if exists(select 1 from xrmovi.billing_checkout_intents i where i.account_id=v_account_id and i.status='paid')
 then raise exception 'Existe pagamento confirmado; atualize a assinatura em vez de refazer o cadastro.' using errcode='23514';end if;
 if exists(select 1 from xrmovi.billing_checkout_intents i where i.account_id=v_account_id and i.status in ('created','pending') and i.plan_code is distinct from chosen_plan)
 then raise exception 'Há um pagamento iniciado em outro plano. Retome esse pagamento antes de alterar a assinatura.' using errcode='23514';end if;
 update xrmovi.companies set name=trim(company_name) where id=cid;
 update xrmovi.billing_accounts set plan_code=chosen_plan,updated_at=now() where id=v_account_id;
 update xrmovi.subscriptions set plan_code=chosen_plan,updated_at=now() where company_id=cid;
 select id into contract_id from xrmovi.contracts where company_id=cid order by created_at limit 1 for update;
 if contract_name is not null then
  if contract_id is null then
   insert into xrmovi.contracts(company_id,name,client_name,contract_code)
   values(cid,trim(contract_name),nullif(trim(contract_client),''),nullif(trim($6),''))
   returning id into contract_id;
  else
   update xrmovi.contracts set name=trim(contract_name),client_name=nullif(trim(contract_client),''),contract_code=nullif(trim($6),'') where id=contract_id;
  end if;
 end if;
 return jsonb_build_object('company_id',cid,'contract_id',contract_id,'account_id',v_account_id,'selected_plan',chosen_plan,'status','pending');
end $function$;
