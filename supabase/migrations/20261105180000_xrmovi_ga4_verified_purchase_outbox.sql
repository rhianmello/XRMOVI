-- XRMOVI · GA4 confirmed-purchase outbox.
-- No backfill: only fresh, verified settlements made after deployment are eligible.
-- Analytics consent is explicit, revocable and independent of payment entitlements.
create table if not exists xrmovi.ga4_client_consent(
 user_id uuid primary key references auth.users(id) on delete cascade,
 consent boolean not null default false,
 client_id text,
 session_id text,
 updated_at timestamptz not null default now(),
 constraint ga4_client_id_format check(client_id is null or client_id ~ '^[0-9]{1,14}\.[0-9]{1,14}$'),
 constraint ga4_session_id_format check(session_id is null or session_id ~ '^[0-9]{6,20}$'),
 constraint ga4_no_id_without_consent check(consent or (client_id is null and session_id is null))
);
alter table xrmovi.ga4_client_consent enable row level security;
revoke all on xrmovi.ga4_client_consent from public, anon, authenticated;

create table if not exists xrmovi.ga4_purchase_outbox (
 id uuid primary key default gen_random_uuid(),
 transaction_id text not null unique,
 user_id uuid not null references auth.users(id) on delete cascade,
 account_id uuid not null references xrmovi.billing_accounts(id) on delete cascade,
 plan_code text not null,
 amount_brl numeric(12,2) not null check(amount_brl>0 and amount_brl<100000),
 paid_at timestamptz not null,
 delivery_status text not null default 'pending'
  check(delivery_status in('pending','sending','retry','sent','failed')),
 attempts integer not null default 0 check(attempts>=0),
 next_attempt_at timestamptz not null default now(),
 sent_at timestamptz,
 last_error text,
 created_at timestamptz not null default now()
);
create index if not exists ga4_purchase_outbox_pending
 on xrmovi.ga4_purchase_outbox(next_attempt_at) where delivery_status in('pending','retry');
alter table xrmovi.ga4_purchase_outbox enable row level security;
revoke all on xrmovi.ga4_purchase_outbox from public, anon, authenticated;

create or replace function public.xrmovi_ga4_consent_update(p_consent boolean,p_client_id text default null,p_session_id text default null)
returns boolean language plpgsql security definer set search_path=''
as $fn$
declare uid uuid := auth.uid(); client text := trim(coalesce(p_client_id,'')); session text := trim(coalesce(p_session_id,''));
begin
 if uid is null or (auth.jwt()->>'role') <> 'authenticated' then
  raise exception 'Login necessário' using errcode='42501';
 end if;
 if p_consent is null then raise exception 'Consentimento obrigatório' using errcode='22023'; end if;
 if not p_consent then
  insert into xrmovi.ga4_client_consent(user_id,consent,client_id,session_id)
  values(uid,false,null,null)
  on conflict(user_id) do update set consent=false,client_id=null,session_id=null,updated_at=now();
  return true;
 end if;
 if client !~ '^[0-9]{1,14}\.[0-9]{1,14}$' then
  return false; -- Tag blocked/not ready; never invent a GA client id.
 end if;
 if session<>'' and session !~ '^[0-9]{6,20}$' then session:=''; end if;
 insert into xrmovi.ga4_client_consent(user_id,consent,client_id,session_id)
 values(uid,true,client,nullif(session,''))
 on conflict(user_id) do update set
 consent=true,client_id=excluded.client_id,session_id=excluded.session_id,updated_at=now();
 return true;
end;
$fn$;
revoke all on function public.xrmovi_ga4_consent_update(boolean,text,text) from public,anon;
grant execute on function public.xrmovi_ga4_consent_update(boolean,text,text) to authenticated;

create or replace function xrmovi.ga4_enqueue_settlement()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare a xrmovi.billing_accounts%rowtype; plan text; trans text; at_time timestamptz;
begin
 if TG_TABLE_NAME='pix_payment_intents' then
  if TG_OP<>'UPDATE' or old.status='paid' or new.status<>'paid' or
     new.paid_at is null or new.provider_payment_id is null or
     new.provider_payment_id !~ '^[0-9]{5,22}$' then return new; end if;
  trans:='pix:'||new.provider_payment_id;
  plan:=new.plan_code;
  at_time:=new.paid_at;
 else
  if TG_OP<>'INSERT' or new.provider_payment_id is null or new.confirmed_at is null or
     new.provider_payment_id !~ '^[0-9]{5,22}$' then return new; end if;
  trans:='card:'||new.provider_payment_id;
  select ci.plan_code into plan from xrmovi.billing_checkout_intents ci where ci.id=new.checkout_id;
  at_time:=new.confirmed_at;
 end if;
 select * into a from xrmovi.billing_accounts where id=new.account_id;
 if not found then return new; end if;
 if not exists(select 1 from xrmovi.ga4_client_consent c
  where c.user_id=a.owner_id and c.consent=true and c.client_id is not null) then return new; end if;
 -- Prevent historical settlements, test imports or refund replay from being recorded.
 if at_time < now()-interval '1 hour' or at_time > now()+interval '5 minutes' then return new; end if;
 insert into xrmovi.ga4_purchase_outbox(transaction_id,user_id,account_id,plan_code,amount_brl,paid_at)
 values(trans,a.owner_id,a.id,coalesce(plan,a.plan_code),new.amount_brl,at_time)
 on conflict(transaction_id) do nothing;
 return new;
end;
$fn$;
revoke all on function xrmovi.ga4_enqueue_settlement() from public,anon,authenticated;
drop trigger if exists ga4_pix_paid_outbox on xrmovi.pix_payment_intents;
create trigger ga4_pix_paid_outbox after update of status on xrmovi.pix_payment_intents
 for each row when (old.status is distinct from new.status and new.status='paid')
 execute function xrmovi.ga4_enqueue_settlement();
drop trigger if exists ga4_card_paid_outbox on xrmovi.billing_ledger;
create trigger ga4_card_paid_outbox after insert on xrmovi.billing_ledger
 for each row execute function xrmovi.ga4_enqueue_settlement();

create or replace function public.xrmovi_ga4_delivery_claim(p_limit integer default 10)
returns setof jsonb language plpgsql security definer set search_path=''
as $fn$
declare r record;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then
  raise exception 'Somente serviço autorizado' using errcode='42501';end if;
 for r in
  select o.id,o.transaction_id,o.plan_code,o.amount_brl,o.paid_at,c.client_id,c.session_id
   from xrmovi.ga4_purchase_outbox o
   join xrmovi.ga4_client_consent c on c.user_id=o.user_id
   where o.delivery_status in ('pending','retry')
     and o.next_attempt_at<=now()
     and o.attempts<5
     and o.paid_at>=now()-interval '48 hours'
     and c.consent=true and c.client_id is not null
   order by o.created_at,o.id
   for update of o skip locked limit least(greatest(p_limit,1),10)
 loop
  update xrmovi.ga4_purchase_outbox set delivery_status='sending',attempts=attempts+1 where id=r.id;
  return next jsonb_build_object('id',r.id,'transaction_id',r.transaction_id,
   'plan',r.plan_code,'amount',r.amount_brl,'paid_at',r.paid_at,
   'client_id',r.client_id,'session_id',r.session_id);
 end loop;
 return;
end;
$fn$;
revoke all on function public.xrmovi_ga4_delivery_claim(integer) from public,anon,authenticated;
grant execute on function public.xrmovi_ga4_delivery_claim(integer) to service_role;

create or replace function public.xrmovi_ga4_delivery_finish(p_id uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=''
as $fn$
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then
  raise exception 'Somente serviço autorizado' using errcode='42501';end if;
 update xrmovi.ga4_purchase_outbox
 set delivery_status=case when p_success then 'sent' when attempts>=5 then 'failed' else 'retry' end,
     sent_at=case when p_success then now() else null end,
     last_error=case when p_success then null else left(coalesce(p_error,'GA4 transport failed'),120) end,
     next_attempt_at=now()+make_interval(mins=>least(60,5*greatest(attempts,1)))
 where id=p_id and delivery_status='sending';
 return found;
end;
$fn$;
revoke all on function public.xrmovi_ga4_delivery_finish(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.xrmovi_ga4_delivery_finish(uuid,boolean,text) to service_role;

-- Dedicated read-only diagnostics for the platform owner, no visitor identifiers exposed.
create or replace function public.xrmovi_ga4_admin_status()
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
begin
 if auth.uid() is null or not exists(select 1 from xrmovi.platform_admins where user_id=auth.uid()) then
  raise exception 'Acesso negado' using errcode='42501';end if;
 return jsonb_build_object(
  'consented_clients',(select count(*) from xrmovi.ga4_client_consent where consent),
  'pending',(select count(*) from xrmovi.ga4_purchase_outbox where delivery_status in('pending','retry','sending')),
  'sent',(select count(*) from xrmovi.ga4_purchase_outbox where delivery_status='sent'),
  'failed',(select count(*) from xrmovi.ga4_purchase_outbox where delivery_status='failed'),
  'last_sent',(select max(sent_at) from xrmovi.ga4_purchase_outbox where delivery_status='sent')
 );
end;
$fn$;
revoke all on function public.xrmovi_ga4_admin_status() from public,anon;
grant execute on function public.xrmovi_ga4_admin_status() to authenticated;
