-- PostgREST supplies the signed JWT as request.jwt.claims JSON.
-- Preserve service-only execution, ownership, values, state transitions and idempotency.

CREATE OR REPLACE FUNCTION public.xrmovi_checkout_attach(intent_id uuid, preapproval_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (auth.jwt() ->> 'role') is distinct from 'service_role' then
  raise exception 'Acesso exclusivo do serviço de pagamento.' using errcode='42501';
 end if;
 if preapproval_id is null or length(preapproval_id) not between 4 and 120 then raise exception 'Referência inválida.';end if;
 update xrmovi.billing_checkout_intents
 set provider_subscription_id=preapproval_id,status='pending',updated_at=now()
 where id=intent_id and status in ('created','pending') and (provider_subscription_id is null or provider_subscription_id=preapproval_id);
 if not found then raise exception 'Checkout inválido ou já vinculado.' using errcode='23514';end if;
 return true;
end $function$;

CREATE OR REPLACE FUNCTION public.xrmovi_checkout_settle(intent_id uuid, preapproval_id text, invoice_id text, payment_id text, paid_amount numeric, payment_date timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i xrmovi.billing_checkout_intents%rowtype; a xrmovi.billing_accounts%rowtype; p xrmovi.plans%rowtype;
old_vehicle_count integer;old_contract_count integer;old_company_count integer;old_user_count integer;
next_due timestamptz;
begin
 if (auth.jwt() ->> 'role') is distinct from 'service_role' then
  raise exception 'Acesso exclusivo do serviço de pagamento.' using errcode='42501';end if;
 if coalesce(invoice_id,'')='' or coalesce(payment_id,'')='' or payment_date is null or payment_date>now()+interval '10 minutes'
 then raise exception 'Pagamento inválido.' using errcode='22023';end if;
 select * into i from xrmovi.billing_checkout_intents where id=intent_id for update;
 if not found or i.provider_subscription_id is distinct from preapproval_id or i.provider<>'mercadopago'
 then raise exception 'Pagamento não corresponde ao checkout.' using errcode='23514';end if;
 select * into a from xrmovi.billing_accounts where id=i.account_id for update;
 select * into p from xrmovi.plans where code=i.plan_code;
 if paid_amount is distinct from i.amount_brl or paid_amount is distinct from p.monthly_brl then
  raise exception 'Valor de pagamento divergente.' using errcode='23514';end if;
 if a.provider_subscription_id is not null and a.provider_subscription_id<>preapproval_id then
  raise exception 'Assinatura vinculada a outro provedor.' using errcode='23514';end if;
 select count(*) into old_vehicle_count from xrmovi.vehicles v join xrmovi.account_companies ac on ac.company_id=v.company_id where ac.account_id=a.id;
 select count(*) into old_contract_count from xrmovi.contracts c join xrmovi.account_companies ac on ac.company_id=c.company_id where ac.account_id=a.id;
 select count(*) into old_company_count from xrmovi.account_companies ac where ac.account_id=a.id;
 select count(distinct m.user_id) into old_user_count from xrmovi.memberships m join xrmovi.account_companies ac on ac.company_id=m.company_id where ac.account_id=a.id;
 if (p.vehicle_limit is not null and old_vehicle_count>p.vehicle_limit) or
    (p.contract_limit is not null and old_contract_count>p.contract_limit) or
    (p.company_limit is not null and old_company_count>p.company_limit) or
    (p.seat_limit is not null and old_user_count>p.seat_limit)
 then raise exception 'O plano pago não comporta a operação atual; exige ajuste manual.' using errcode='23514';end if;
 insert into xrmovi.billing_ledger(account_id,checkout_id,provider,event_id,provider_payment_id,amount_brl)
 values(a.id,i.id,'mercadopago',invoice_id,payment_id,paid_amount)
 on conflict(provider,event_id) do nothing;
 if not found then return jsonb_build_object('status','duplicate','account_id',a.id);end if;
 next_due:=greatest(coalesce(a.paid_through,now()),payment_date,now())+interval '1 month';
 update xrmovi.billing_accounts set plan_code=i.plan_code,status='active',paid_through=next_due,
  provider='mercadopago',provider_subscription_id=preapproval_id,updated_at=now() where id=a.id;
 update xrmovi.subscriptions s set plan_code=i.plan_code,status='active',paid_through=next_due,
  provider_subscription_id=preapproval_id,updated_at=now()
 where s.company_id in (select company_id from xrmovi.account_companies where account_id=a.id);
 update xrmovi.billing_checkout_intents set status='paid',updated_at=now() where id=i.id;
 update xrmovi.plan_requests pr set status='paid'
 where pr.status='awaiting_checkout' and pr.requested_plan=i.plan_code and pr.company_id in
 (select company_id from xrmovi.account_companies where account_id=a.id);
 return jsonb_build_object('status','paid','account_id',a.id,'plan',i.plan_code,'paid_through',next_due);
end $function$;

CREATE OR REPLACE FUNCTION public.xrmovi_checkout_provider_status(preapproval_id text, new_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare aid uuid; mapped text;
begin
 if (auth.jwt() ->> 'role') is distinct from 'service_role' then
  raise exception 'Acesso exclusivo do serviço de pagamento.' using errcode='42501';end if;
 if new_status not in ('paused','canceled') then raise exception 'Estado não permitido.';end if;
 select a.id,a.provider_subscription_id into aid,mapped from xrmovi.billing_accounts a
 where a.provider='mercadopago' and a.provider_subscription_id=preapproval_id for update;
 if aid is null or mapped is distinct from preapproval_id then return false;end if;
 update xrmovi.billing_accounts set status=new_status,updated_at=now() where id=aid;
 update xrmovi.subscriptions set status=new_status,updated_at=now() where company_id in
  (select company_id from xrmovi.account_companies where account_id=aid);
 return true;
end $function$;

CREATE OR REPLACE FUNCTION public.xrmovi_checkout_fail(intent_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (auth.jwt() ->> 'role') is distinct from 'service_role' then
  raise exception 'Acesso exclusivo do serviço de pagamento' using errcode='42501';
 end if;
 update xrmovi.billing_checkout_intents
 set status='failed',updated_at=now()
 where id=intent_id and status='created' and provider_subscription_id is null;
 return found;
end $function$;

-- Keep payment mutations inaccessible to browser roles.
revoke all on function public.xrmovi_checkout_attach(uuid,text) from public, anon, authenticated;
grant execute on function public.xrmovi_checkout_attach(uuid,text) to service_role;
revoke all on function public.xrmovi_checkout_settle(uuid,text,text,text,numeric,timestamptz) from public, anon, authenticated;
grant execute on function public.xrmovi_checkout_settle(uuid,text,text,text,numeric,timestamptz) to service_role;
revoke all on function public.xrmovi_checkout_provider_status(text,text) from public, anon, authenticated;
grant execute on function public.xrmovi_checkout_provider_status(text,text) to service_role;
revoke all on function public.xrmovi_checkout_fail(uuid) from public, anon, authenticated;
grant execute on function public.xrmovi_checkout_fail(uuid) to service_role;
