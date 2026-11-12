-- XRMOVI fleet-based pricing and one-time 24h trial. Existing paid subscriptions remain unchanged.

alter table xrmovi.billing_accounts add column if not exists trial_started_at timestamptz;

alter table xrmovi.billing_accounts add column if not exists trial_used_at timestamptz;

create or replace function public.xrmovi_vehicle_quote(p_count integer)
returns jsonb language plpgsql security definer set search_path=''
as $xrm_quote$
declare
 v_count integer; v_code text; v_price numeric(12,2); record_plan xrmovi.plans%rowtype;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta para contratar.' using errcode='42501'; end if;
 if p_count is null or p_count < 1 or p_count > 10000
 then raise exception 'Informe uma quantidade válida de veículos (1 a 10000).' using errcode='22023'; end if;
 v_count:=greatest(5,p_count);
 v_code:='fleet_'||v_count::text;
 v_price:=((2990::bigint + (v_count-5)::bigint*590)::numeric/100)::numeric(12,2);
 insert into xrmovi.plans(code,title,vehicle_limit,seat_limit,company_limit,contract_limit,monthly_brl,active)
 values(v_code,'XRMOVI · '||v_count||' veículos',v_count,1000000,1000000,1000000,v_price,true)
 on conflict (code) do nothing;
 select * into record_plan from xrmovi.plans where code=v_code and active;
 if record_plan.code is null or record_plan.vehicle_limit<>v_count
   or record_plan.monthly_brl<>v_price
 then raise exception 'Tabela de preços inconsistente; a contratação foi interrompida.' using errcode='23514'; end if;
 return jsonb_build_object('code',v_code,'title',record_plan.title,
  'vehicle_limit',v_count,'included_vehicles',5,
  'additional_vehicles',greatest(0,v_count-5),'additional_cents',590,
  'monthly_cents',2990+greatest(0,v_count-5)*590,
  'monthly_brl',record_plan.monthly_brl,'company_limit',record_plan.company_limit,
  'contract_limit',record_plan.contract_limit,'seat_limit',record_plan.seat_limit);
end
$xrm_quote$;

revoke all on function public.xrmovi_vehicle_quote(integer) from public, anon;

grant execute on function public.xrmovi_vehicle_quote(integer) to authenticated;

create or replace function public.xrmovi_start_trial(cid uuid)
returns jsonb language plpgsql security definer set search_path=''
as $xrm_trial$
declare a xrmovi.billing_accounts%rowtype; started timestamptz:=now(); expiration timestamptz;
begin
 if auth.uid() is null then raise exception 'Faça login para experimentar o XRMOVI.' using errcode='42501'; end if;
 select ba.* into a from xrmovi.billing_accounts ba
 join xrmovi.account_companies ac on ac.account_id=ba.id
 where ac.company_id=cid and ba.owner_id=auth.uid() for update of ba;
 if not found then raise exception 'Somente o titular da conta pode iniciar o teste.' using errcode='42501'; end if;
 if a.status<>'pending' or a.trial_started_at is not null or a.trial_used_at is not null
  or a.trial_end is not null or a.paid_through is not null or a.provider_subscription_id is not null
  or exists(select 1 from xrmovi.billing_ledger l where l.account_id=a.id)
  or exists(select 1 from xrmovi.billing_checkout_intents i where i.account_id=a.id and i.status in ('created','pending','paid'))
  or exists(select 1 from xrmovi.pix_payment_intents p where p.account_id=a.id and p.status in ('pending','paid'))
 then raise exception 'O teste gratuito já foi utilizado ou existe pagamento iniciado. Verifique a contratação atual.' using errcode='23514'; end if;
 if a.plan_code !~ '^fleet_([5-9]|[1-9][0-9]+)$' then
  raise exception 'Selecione a capacidade de veículos antes de iniciar o teste.' using errcode='22023';
 end if;
 expiration:=started+interval '24 hours';
 update xrmovi.billing_accounts set status='trial',trial_started_at=started,trial_used_at=started,
  trial_end=expiration,updated_at=started where id=a.id;
 update xrmovi.subscriptions set status='trial',trial_end=expiration,updated_at=started
 where company_id in(select company_id from xrmovi.account_companies where account_id=a.id);
 return jsonb_build_object('status','trial','trial_started_at',started,
  'trial_expires_at',expiration,'server_now',started,'vehicle_limit',5);
end
$xrm_trial$;

revoke all on function public.xrmovi_start_trial(uuid) from public, anon;

grant execute on function public.xrmovi_start_trial(uuid) to authenticated;

CREATE OR REPLACE FUNCTION xrmovi.company_is_paid(cid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select exists(
 select 1
 from xrmovi.account_companies ac
 join xrmovi.billing_accounts a on a.id=ac.account_id
 where ac.company_id=cid
 and not exists(select 1 from xrmovi.client_access ca where ca.account_id=a.id and ca.blocked)
 and (
  (
   a.status in ('active','canceled') and a.paid_through>now()
   and (
    (a.provider='mercadopago' and a.provider_subscription_id is not null
      and exists(select 1 from xrmovi.billing_ledger l where l.account_id=a.id and l.provider='mercadopago'))
    or
    (a.provider='mercadopago_pix' and a.provider_subscription_id like 'pix:%'
      and exists(select 1 from xrmovi.pix_payment_intents i where i.account_id=a.id and i.status='paid'
        and 'pix:'||i.provider_payment_id=a.provider_subscription_id))
   )
  )
  or (a.status='trial' and a.trial_started_at is not null
      and a.trial_end>now())
  or exists (
   select 1 from xrmovi.manual_access_grants g
   where g.account_id=a.id and g.revoked_at is null and g.valid_until>now()
  )
 )
);
$function$;


CREATE OR REPLACE FUNCTION xrmovi.enforce_account_quota()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare aid uuid; cap integer; used_count integer; kind text; status text; trial_end timestamptz;
begin
 if tg_table_name='account_companies' then
   aid:=new.account_id; kind:='company';
 elsif tg_table_name='memberships' then
   select ac.account_id into aid from xrmovi.account_companies ac where ac.company_id=new.company_id;
   kind:='seat';
 elsif tg_table_name='contracts' then
   select ac.account_id into aid from xrmovi.account_companies ac where ac.company_id=new.company_id;
   kind:='contract';
 elsif tg_table_name='vehicles' then
   select ac.account_id into aid from xrmovi.account_companies ac where ac.company_id=new.company_id;
   kind:='vehicle';
 end if;
 if aid is null then
   raise exception 'Conta de assinatura não localizada.' using errcode='23514';
 end if;
 -- Serializa inclusões simultâneas em empresas diferentes da mesma assinatura.
 perform 1 from xrmovi.billing_accounts a where a.id=aid for update;
 select a.status,a.trial_end,
   case kind when 'company' then p.company_limit when 'seat' then p.seat_limit
     when 'contract' then p.contract_limit when 'vehicle' then p.vehicle_limit end
 into status,trial_end,cap from xrmovi.billing_accounts a join xrmovi.plans p on p.code=a.plan_code where a.id=aid;
 if status not in ('pending','trial','active') or (status='trial' and (trial_end is null or trial_end<=now())) then
   raise exception 'Assinatura inativa. Consulte os planos.' using errcode='23514';
 end if;

 -- During the free evaluation, the shared fleet limit is five vehicles,
 -- independently of the customer's eventual paid capacity.
 if status='trial' and kind='vehicle' then cap:=least(coalesce(cap,5),5); end if;
 if status='pending' then
   -- At signup only the first company, its owner and one initial contract are permitted.
   -- This does not grant any fleet operation; access remains gated by paid ledger records.
   if kind='vehicle' then raise exception 'Aguarde a confirmação do pagamento para cadastrar veículos.' using errcode='42501';end if;
   if kind='company' and exists(select 1 from xrmovi.account_companies ac where ac.account_id=aid)
   then raise exception 'Pague a assinatura para adicionar empresas.' using errcode='42501';end if;
   if kind='contract' and exists(select 1 from xrmovi.contracts c join xrmovi.account_companies ac on ac.company_id=c.company_id where ac.account_id=aid)
   then raise exception 'Pague a assinatura para adicionar contratos.' using errcode='42501';end if;
   if kind='seat' and ((to_jsonb(new)->>'role') is distinct from 'owner'
     or not exists(select 1 from xrmovi.billing_accounts a where a.id=aid and a.owner_id=(to_jsonb(new)->>'user_id')::uuid)
     or exists(select 1 from xrmovi.memberships m join xrmovi.account_companies ac on ac.company_id=m.company_id where ac.account_id=aid))
   then raise exception 'Pague a assinatura para adicionar usuários.' using errcode='42501';end if;
 end if;
 if cap is not null then
 
   if kind='company' then
      select count(*) into used_count from xrmovi.account_companies where account_id=aid;
   elsif kind='seat' then
      if exists(
       select 1 from xrmovi.memberships m join xrmovi.account_companies ac on ac.company_id=m.company_id
       where ac.account_id=aid and m.user_id=new.user_id
      ) then return new; end if;
      select count(distinct m.user_id) into used_count from xrmovi.memberships m
       join xrmovi.account_companies ac on ac.company_id=m.company_id where ac.account_id=aid;
   elsif kind='contract' then
      select count(*) into used_count from xrmovi.contracts c
       join xrmovi.account_companies ac on ac.company_id=c.company_id where ac.account_id=aid;
   else
      select count(*) into used_count from xrmovi.vehicles v
       join xrmovi.account_companies ac on ac.company_id=v.company_id where ac.account_id=aid;
   end if;
   if used_count>=cap then
     raise exception 'Limite de % atingido (%). Amplie o plano.', kind, cap using errcode='23514';
   end if;
 end if;
 return new;
end $function$;


CREATE OR REPLACE FUNCTION public.xrmovi_access_status(cid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare admin_user boolean; a xrmovi.billing_accounts%rowtype; allowed boolean;
begin
 if auth.uid() is null or not exists(
 select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=auth.uid()
 ) then
 raise exception 'Conta não autorizada' using errcode='42501';
 end if;
 admin_user:=exists(select 1 from xrmovi.platform_admins pa where pa.user_id=auth.uid());
 select ba.* into a from xrmovi.billing_accounts ba
 join xrmovi.account_companies ac on ac.account_id=ba.id
 where ac.company_id=cid;
 allowed:=admin_user or xrmovi.company_is_paid(cid);
 return jsonb_build_object(
 'allowed',allowed,
 'admin',admin_user,
 'status',coalesce(a.status,'pending'),
 'plan',a.plan_code,
 'paid_through',a.paid_through,
 'trial_end',a.trial_end,
 'server_now',now(),
 'billing_required',not allowed,
 'message',case when allowed then 'Acesso liberado.' when a.status='trial' then 'Seu teste de 24 horas terminou. Selecione cartão ou Pix para continuar.' else 'Aguardando pagamento. Escolha uma forma de contratação para liberar a frota.' end
 );
end $function$;


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
 if chosen_plan !~ '^fleet_([5-9]|[1-9][0-9]+)$' then
  raise exception 'Novo cadastro requer o valor atualizado por veículo.' using errcode='22023';
 end if;
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
 -- An empty pending account may preexist the signup. Preserve its identifier
 -- while using the freshly quoted fleet capacity instead of its legacy default.
 if existing_account.id is not null then
  update xrmovi.billing_accounts set plan_code=chosen_plan, updated_at=now() where id=aid;
 end if;
 insert into xrmovi.companies(name) values(trim(company_name)) returning id into c;
 insert into xrmovi.subscriptions(company_id,plan_code,status,trial_end)
 values(c,chosen_plan,'pending',null);
 insert into xrmovi.account_companies(account_id,company_id) values(aid,c);
 insert into xrmovi.memberships(company_id,user_id,role) values(c,uid,'owner');
 if existing_account.id is not null then
  return jsonb_build_object('company_id',c,'contract_id',null,'account_id',aid,
   'selected_plan',chosen_plan,'status','pending','recovered',true);
 end if;
 if contract_name is not null then
  insert into xrmovi.contracts(company_id,name,client_name,contract_code)
  values(c,trim(contract_name),nullif(trim(contract_client),''),nullif(trim(contract_code),''))
  returning id into contract_id;
 end if;
 return jsonb_build_object('company_id',c,'contract_id',contract_id,'account_id',aid,'selected_plan',chosen_plan,'status','pending');
end $function$;

-- Allow an unpaid/trial account owner to adjust the payable capacity before checkout.
-- This never creates charges or extends an already used trial.
create or replace function public.xrmovi_set_checkout_capacity(cid uuid,p_count integer)
returns jsonb language plpgsql security definer set search_path=''
as $xrm_capacity$
declare a xrmovi.billing_accounts%rowtype; q jsonb; existing_vehicles bigint; pending_plan text;
begin
 if auth.uid() is null then
  raise exception 'Faça login para alterar sua assinatura.' using errcode='42501';
 end if;
 select ba.* into a from xrmovi.billing_accounts ba
 join xrmovi.account_companies ac on ac.account_id=ba.id
 where ac.company_id=cid and ba.owner_id=auth.uid()
 for update of ba;
 if not found then
  raise exception 'Somente o titular pode alterar a capacidade.' using errcode='42501';
 end if;
 if a.status not in ('pending','trial') or a.provider_subscription_id is not null
  or a.paid_through is not null
  or exists(select 1 from xrmovi.billing_ledger l where l.account_id=a.id)
  or exists(select 1 from xrmovi.pix_payment_intents pi where pi.account_id=a.id and pi.status='paid')
 then raise exception 'Para alterar assinatura paga, solicite uma atualização comercial.' using errcode='23514'; end if;
 q:=public.xrmovi_vehicle_quote(p_count);
 select count(*) into existing_vehicles from xrmovi.vehicles v
 join xrmovi.account_companies ac on ac.company_id=v.company_id
 where ac.account_id=a.id;
 if existing_vehicles>(q->>'vehicle_limit')::integer then
  raise exception 'Quantidade contratada insuficiente para os veículos já cadastrados.' using errcode='23514'; end if;
 select i.plan_code into pending_plan from xrmovi.billing_checkout_intents i
 where i.account_id=a.id and i.status in ('created','pending')
 order by i.created_at desc limit 1;
 if pending_plan is not null and pending_plan is distinct from q->>'code' then
  raise exception 'Já existe uma tentativa de cartão iniciada. Retome a cobrança original antes de alterar o valor.' using errcode='23514'; end if;
 if exists(select 1 from xrmovi.pix_payment_intents pi
  where pi.account_id=a.id and pi.status in ('created','pending') and pi.expires_at>now()
  and pi.plan_code is distinct from q->>'code') then
  raise exception 'Já existe um Pix pendente de outro valor. Conclua ou aguarde a expiração antes de alterar.' using errcode='23514';
 end if;
 update xrmovi.billing_accounts set plan_code=q->>'code',updated_at=now()
 where id=a.id;
 update xrmovi.subscriptions set plan_code=q->>'code',updated_at=now()
 where company_id in(select company_id from xrmovi.account_companies where account_id=a.id);
 return q || jsonb_build_object('status',a.status,'account_id',a.id,'changed',a.plan_code is distinct from q->>'code');
end
$xrm_capacity$;
revoke all on function public.xrmovi_set_checkout_capacity(uuid,integer) from public,anon;
grant execute on function public.xrmovi_set_checkout_capacity(uuid,integer) to authenticated;

CREATE OR REPLACE FUNCTION public.xrmovi_list_plans()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select coalesce(jsonb_agg(jsonb_build_object(
 'code',p.code,'title',p.title,
 'company_limit',p.company_limit,'contract_limit',p.contract_limit,
 'vehicle_limit',p.vehicle_limit,'seat_limit',p.seat_limit,
 'monthly_brl',p.monthly_brl
) order by p.monthly_brl nulls last),'[]'::jsonb)
from xrmovi.plans p where p.active and p.code !~ '^fleet_[0-9]+$'
$function$;

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
 if exists(select 1 from xrmovi.billing_accounts a where a.id=v_account_id
  and a.plan_code ~ '^fleet_' and chosen_plan !~ '^fleet_([5-9]|[1-9][0-9]+)$')
 then raise exception 'Planos anteriores não são oferecidos para novas contratações.' using errcode='23514'; end if;
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

CREATE OR REPLACE FUNCTION public.xrmovi_checkout_prepare(cid uuid, chosen_plan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 aid uuid; current_provider text; current_plan text; amount numeric; intent_id uuid; payer_email text;
 capacity xrmovi.plans%rowtype; previous xrmovi.billing_checkout_intents%rowtype;
 ncompanies bigint; nvehicles bigint; ncontracts bigint; nusers bigint;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária.' using errcode='42501';end if;
 select a.id,a.provider_subscription_id,a.plan_code into aid,current_provider,current_plan
 from xrmovi.billing_accounts a join xrmovi.account_companies ac on ac.account_id=a.id
 where ac.company_id=cid and a.owner_id=auth.uid() for update of a;
 if aid is null then raise exception 'Somente o titular pode contratar.' using errcode='42501';end if;
 if current_plan ~ '^fleet_' and chosen_plan is distinct from current_plan then
  raise exception 'O valor selecionado difere da capacidade confirmada.' using errcode='23514';
 end if;
 if current_provider is not null then
  raise exception 'Já existe assinatura recorrente vinculada. Verifique o pagamento em Minha assinatura antes de comprar novamente.' using errcode='23514';
 end if;
 select * into capacity from xrmovi.plans where code=chosen_plan and active and monthly_brl is not null;
 if not found then raise exception 'Plano indisponível para checkout.' using errcode='22023';end if;
 amount:=capacity.monthly_brl;
 select count(*) into ncompanies from xrmovi.account_companies where account_id=aid;
 select count(*) into nvehicles from xrmovi.vehicles v join xrmovi.account_companies ac on ac.company_id=v.company_id where ac.account_id=aid;
 select count(*) into ncontracts from xrmovi.contracts c join xrmovi.account_companies ac on ac.company_id=c.company_id where ac.account_id=aid;
 select count(distinct m.user_id) into nusers from xrmovi.memberships m join xrmovi.account_companies ac on ac.company_id=m.company_id where ac.account_id=aid;
 if (capacity.company_limit is not null and ncompanies>capacity.company_limit)
 or (capacity.vehicle_limit is not null and nvehicles>capacity.vehicle_limit)
 or (capacity.contract_limit is not null and ncontracts>capacity.contract_limit)
 or (capacity.seat_limit is not null and nusers>capacity.seat_limit) then
  raise exception 'O plano escolhido não comporta os cadastros atuais. Escolha um plano maior antes de pagar.' using errcode='23514';
 end if;
 select email into payer_email from auth.users where id=auth.uid();
 if coalesce(payer_email,'')='' then raise exception 'E-mail do titular indisponível.';end if;
 -- Never open a second intent while an earlier one may have created a real subscription.
 select * into previous from xrmovi.billing_checkout_intents
 where account_id=aid and status in ('created','pending')
 order by created_at desc limit 1;
 if found then
  if previous.plan_code<>chosen_plan or abs(previous.amount_brl-amount)>0.009 then
   raise exception 'Há uma tentativa de pagamento do plano % em andamento. Retome ou verifique essa cobrança antes de mudar de plano.',previous.plan_code using errcode='23514';
  end if;
  return jsonb_build_object(
   'intent_id',previous.id,'amount_brl',previous.amount_brl,'plan',previous.plan_code,
   'payer_email',payer_email,'existing',true,
   'provider_subscription_id',previous.provider_subscription_id,'intent_status',previous.status
  );
 end if;
 insert into xrmovi.billing_checkout_intents(account_id,plan_code,requested_by,amount_brl)
 values(aid,chosen_plan,auth.uid(),amount) returning id into intent_id;
 return jsonb_build_object(
  'intent_id',intent_id,'amount_brl',amount,'plan',chosen_plan,'payer_email',payer_email,
  'existing',false,'provider_subscription_id',null,'intent_status','created'
 );
end $function$;
