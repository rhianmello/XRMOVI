-- XRMOVI: commercial reporting labels only. This migration NEVER changes
-- billing_accounts, payments, entitlements, plans, subscriptions or customer data.
-- An existing paid account is intentionally UNCLASSIFIED until an admin reviews it.
create table if not exists xrmovi.account_commercial_labels (
  account_id uuid primary key references xrmovi.billing_accounts(id) on delete restrict,
  classification text not null check (classification in ('external','internal','homologation','unclassified')),
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  classified_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);
create table if not exists xrmovi.account_commercial_label_audit (
  id bigint generated always as identity primary key,
  account_id uuid not null references xrmovi.billing_accounts(id) on delete restrict,
  previous_classification text not null,
  classification text not null check (classification in ('external','internal','homologation','unclassified')),
  reason text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);
alter table xrmovi.account_commercial_labels enable row level security;
alter table xrmovi.account_commercial_label_audit enable row level security;
revoke all on xrmovi.account_commercial_labels from public, anon, authenticated;
revoke all on xrmovi.account_commercial_label_audit from public, anon, authenticated;
revoke all on sequence xrmovi.account_commercial_label_audit_id_seq from public, anon, authenticated;

create or replace function public.xrmovi_admin_commercial_labels()
returns jsonb language plpgsql stable security definer
set search_path = ''
as $function$
declare actor uuid := (select auth.uid()); result jsonb;
begin
  if actor is null or not exists (
    select 1 from xrmovi.platform_admins a where a.user_id=actor
  ) then
    raise exception 'Acesso restrito ao administrador' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',a.id,
    'classification',coalesce(l.classification,'unclassified'),
    'reason',l.reason,
    'changed_at',l.changed_at
  ) order by a.created_at desc),'[]'::jsonb)
  into result
  from xrmovi.billing_accounts a
  left join xrmovi.account_commercial_labels l on l.account_id=a.id;
  return result;
end;
$function$;

create or replace function public.xrmovi_admin_commercial_receipts()
returns jsonb language plpgsql stable security definer
set search_path = ''
as $function$
declare actor uuid := (select auth.uid()); result jsonb;
begin
  if actor is null or not exists (
    select 1 from xrmovi.platform_admins a where a.user_id=actor
  ) then
    raise exception 'Acesso restrito ao administrador' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',p.account_id,'email',u.email,'amount',p.amount_brl,
    'provider',p.provider,'date',p.confirmed_at
  ) order by p.confirmed_at desc),'[]'::jsonb) into result
  from (
    select account_id,amount_brl,provider,confirmed_at from xrmovi.billing_ledger
    union all
    select p.account_id,p.amount_brl,'mercadopago_pix'::text,p.paid_at
    from xrmovi.pix_payment_intents p
    where p.status='paid' and p.paid_at is not null
      and not exists (
        select 1 from xrmovi.billing_ledger l
        where l.provider_payment_id=p.provider_payment_id
          and p.provider_payment_id is not null
      )
    order by confirmed_at desc
  ) p
  join xrmovi.billing_accounts a on a.id=p.account_id
  join auth.users u on u.id=a.owner_id;
  return result;
end;
$function$;

create or replace function public.xrmovi_admin_commercial_label_set(
  p_account uuid, p_classification text, p_reason text
) returns jsonb language plpgsql security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  previous text;
  changed timestamptz := clock_timestamp();
  owner uuid;
begin
  if actor is null or not exists (
    select 1 from xrmovi.platform_admins a where a.user_id=actor
  ) then
    raise exception 'Acesso restrito ao administrador' using errcode='42501';
  end if;
  if p_account is null
     or p_classification is null
     or p_classification not in ('external','internal','homologation','unclassified')
     or p_reason is null
     or char_length(btrim(p_reason)) not between 10 and 500
  then
    raise exception 'Classificação ou justificativa inválida' using errcode='22023';
  end if;
  select a.owner_id into owner
  from xrmovi.billing_accounts a where a.id=p_account for key share;
  if not found then
    raise exception 'Conta não encontrada' using errcode='22023';
  end if;
  if exists (select 1 from xrmovi.platform_admins x where x.user_id=owner) then
    raise exception 'A conta proprietária não pode virar cliente comercial'
      using errcode='42501';
  end if;
  -- A row lock serializes subsequent changes so audit always captures the old value.
  select classification into previous from xrmovi.account_commercial_labels
  where account_id=p_account for update;
  previous := coalesce(previous,'unclassified');
  if previous=p_classification then
    return jsonb_build_object('account_id',p_account,'classification',previous,
      'changed',false);
  end if;
  insert into xrmovi.account_commercial_labels
    (account_id,classification,reason,classified_by,changed_at)
  values(p_account,p_classification,btrim(p_reason),actor,changed)
  on conflict(account_id) do update set
    classification=excluded.classification,
    reason=excluded.reason,
    classified_by=excluded.classified_by,
    changed_at=excluded.changed_at;

  insert into xrmovi.account_commercial_label_audit
    (account_id,previous_classification,classification,reason,actor_id,changed_at)
  values(p_account,previous,p_classification,btrim(p_reason),actor,changed);

  return jsonb_build_object('account_id',p_account,'classification',p_classification,
    'previous',previous,'changed',true,'changed_at',changed);
end;
$function$;

revoke all on function public.xrmovi_admin_commercial_labels() from public,anon,authenticated;
revoke all on function public.xrmovi_admin_commercial_receipts() from public,anon,authenticated;
revoke all on function public.xrmovi_admin_commercial_label_set(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.xrmovi_admin_commercial_labels() to authenticated,service_role;
grant execute on function public.xrmovi_admin_commercial_receipts() to authenticated,service_role;
grant execute on function public.xrmovi_admin_commercial_label_set(uuid,text,text)
  to authenticated,service_role;
