-- Run as postgres after checkout_service_jwt_claims. No provider API is called.
-- Every business fixture and assertion is rolled back. Identity sequences can
-- advance normally even on rollback; no ledger/account/payment row is retained.
begin;

create temporary table checkout_checks (
  name text primary key,
  passed boolean not null check (passed)
) on commit drop;
create temporary table checkout_fixture (
  account_id uuid, company_id uuid, intent_id uuid, failed_intent_id uuid,
  plan_code text, amount_brl numeric, provider_reference text,
  invoice_reference text, payment_reference text, first_paid_through timestamptz
) on commit drop;
create temporary table checkout_calls (name text, expression text) on commit drop;

do $setup$
declare
  owner uuid;
  aid uuid := gen_random_uuid();
  cid uuid := gen_random_uuid();
  iid uuid := gen_random_uuid();
  fid uuid := gen_random_uuid();
  selected_plan text;
  selected_amount numeric;
  reference text := 'rollback-checkout-' || gen_random_uuid()::text;
begin
  -- Reuse only an existing owner's FK; all application records are new fixtures.
  select owner_id into owner from xrmovi.billing_accounts limit 1;
  if owner is null then raise exception 'An existing billing owner is required'; end if;
  select code, monthly_brl into selected_plan, selected_amount
    from xrmovi.plans where active and monthly_brl > 0
    order by monthly_brl limit 1;
  if selected_plan is null then raise exception 'An active paid plan is required'; end if;
  insert into xrmovi.companies(id, name) values(cid, 'ROLLBACK checkout authorization fixture');
  insert into xrmovi.billing_accounts(id, owner_id, plan_code, status)
    values(aid, owner, selected_plan, 'pending');
  insert into xrmovi.account_companies(account_id, company_id) values(aid, cid);
  insert into xrmovi.subscriptions(company_id, plan_code, status)
    values(cid, selected_plan, 'pending');
  insert into xrmovi.billing_checkout_intents(id, account_id, plan_code, requested_by, amount_brl)
    values(iid, aid, selected_plan, owner, selected_amount),
          (fid, aid, selected_plan, owner, selected_amount);
  insert into checkout_fixture values
    (aid, cid, iid, fid, selected_plan, selected_amount, reference,
     reference || '-invoice', reference || '-payment', null);
  insert into checkout_calls values
    ('attach', format('select public.xrmovi_checkout_attach(%L::uuid,%L)', iid, reference)),
    ('settle', format('select public.xrmovi_checkout_settle(%L::uuid,%L,%L,%L,%L::numeric,now())',
      iid, reference, reference || '-invoice', reference || '-payment', selected_amount)),
    ('provider_status', format('select public.xrmovi_checkout_provider_status(%L,%L)', reference, 'paused')),
    ('fail', format('select public.xrmovi_checkout_fail(%L::uuid)', fid));
end $setup$;
grant select, insert on checkout_checks to anon, authenticated, service_role;
grant select on checkout_calls to anon, authenticated, service_role;
grant select, update on checkout_fixture to service_role;

-- Actual role execution verifies grants, independently of the JWT guard.
set local role anon;
do $acl$
declare item record; denied boolean;
begin
  for item in select * from checkout_calls loop
    denied := false;
    begin execute item.expression;
    exception when insufficient_privilege then denied := true; end;
    insert into checkout_checks values ('acl_anon_' || item.name, denied);
  end loop;
end $acl$;
reset role;
set local role authenticated;
do $acl$
declare item record; denied boolean;
begin
  for item in select * from checkout_calls loop
    denied := false;
    begin execute item.expression;
    exception when insufficient_privilege then denied := true; end;
    insert into checkout_checks values ('acl_authenticated_' || item.name, denied);
  end loop;
end $acl$;
reset role;

-- Even postgres must supply an authorized claim to these SECURITY DEFINER RPCs.
select set_config('request.jwt.claim', '', true);
select set_config('request.jwt.claim.role', '', true);
do $guards$
declare claims text; item record; denied boolean;
begin
  foreach claims in array array['{}', '{"role":"authenticated"}'] loop
    perform set_config('request.jwt.claims', claims, true);
    for item in select * from checkout_calls loop
      denied := false;
      begin execute item.expression;
      exception when insufficient_privilege then
        denied := SQLERRM like 'Acesso exclusivo do serviço de pagamento%';
      end;
      insert into checkout_checks values
        ('guard_' || case when claims = '{}' then 'missing' else 'authenticated' end || '_' || item.name, denied);
    end loop;
  end loop;
end $guards$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $payment$
declare f record; result jsonb; rejected boolean;
begin
  select * into f from checkout_fixture;
  insert into checkout_checks values ('json_claims_without_legacy',
    auth.jwt()->>'role' = 'service_role' and current_setting('request.jwt.claim.role', true) = '');
  insert into checkout_checks values ('attach', public.xrmovi_checkout_attach(f.intent_id, f.provider_reference));
  insert into checkout_checks values ('attach_idempotent', public.xrmovi_checkout_attach(f.intent_id, f.provider_reference));
  rejected := false;
  begin perform public.xrmovi_checkout_attach(f.intent_id, f.provider_reference || '-different');
  exception when check_violation then rejected := true; end;
  insert into checkout_checks values ('attach_different_reference_denied', rejected);
  rejected := false;
  begin
    perform public.xrmovi_checkout_settle(f.intent_id, f.provider_reference,
      f.invoice_reference, f.payment_reference, f.amount_brl + 1, now());
  exception when check_violation then rejected := true; end;
  insert into checkout_checks values ('settle_wrong_amount_denied', rejected);
  result := public.xrmovi_checkout_settle(f.intent_id, f.provider_reference,
    f.invoice_reference, f.payment_reference, f.amount_brl, now());
  insert into checkout_checks values ('settle_paid', result->>'status' = 'paid');
  update checkout_fixture set first_paid_through = (result->>'paid_through')::timestamptz;
  result := public.xrmovi_checkout_settle(f.intent_id, f.provider_reference,
    f.invoice_reference, f.payment_reference, f.amount_brl, now());
  insert into checkout_checks values ('settle_duplicate', result->>'status' = 'duplicate');
end $payment$;
reset role;

insert into checkout_checks
select 'settle_activates_account_and_subscription',
  a.status = 'active' and s.status = 'active' and i.status = 'paid'
  and a.plan_code = f.plan_code and s.plan_code = f.plan_code
from checkout_fixture f
join xrmovi.billing_accounts a on a.id = f.account_id
join xrmovi.subscriptions s on s.company_id = f.company_id
join xrmovi.billing_checkout_intents i on i.id = f.intent_id;
insert into checkout_checks
select 'duplicate_preserves_paid_through',
  a.paid_through = f.first_paid_through and s.paid_through = f.first_paid_through
from checkout_fixture f
join xrmovi.billing_accounts a on a.id = f.account_id
join xrmovi.subscriptions s on s.company_id = f.company_id;
insert into checkout_checks
select 'one_ledger_event', count(*) = 1
from xrmovi.billing_ledger l join checkout_fixture f on f.intent_id = l.checkout_id;

set local role service_role;
do $status$
declare f record; rejected boolean;
begin
  select * into f from checkout_fixture;
  insert into checkout_checks values ('fail_unattached_created', public.xrmovi_checkout_fail(f.failed_intent_id));
  insert into checkout_checks values ('fail_repeated_returns_false', not public.xrmovi_checkout_fail(f.failed_intent_id));
  insert into checkout_checks values ('provider_pauses', public.xrmovi_checkout_provider_status(f.provider_reference, 'paused'));
  rejected := false;
  begin perform public.xrmovi_checkout_provider_status(f.provider_reference, 'active');
  exception when raise_exception then rejected := SQLERRM = 'Estado não permitido.'; end;
  insert into checkout_checks values ('provider_invalid_status_denied', rejected);
  insert into checkout_checks values ('provider_unknown_returns_false',
    not public.xrmovi_checkout_provider_status(f.provider_reference || '-unknown', 'paused'));
end $status$;
reset role;
insert into checkout_checks
select 'provider_pause_reaches_account_and_subscription', a.status = 'paused' and s.status = 'paused'
from checkout_fixture f
join xrmovi.billing_accounts a on a.id = f.account_id
join xrmovi.subscriptions s on s.company_id = f.company_id;

select count(*) as passed_checks, bool_and(passed) as all_passed from checkout_checks;
rollback;
