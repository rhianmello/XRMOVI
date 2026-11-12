-- Isolated homologation only. No changes to xrmovi commercial schema or bi-epc15.
alter table public.xrmovi_hml_card_subscriptions
  add column if not exists provider_status text,
  add column if not exists error_id uuid,
  add column if not exists error_details jsonb,
  add column if not exists last_attempt_at timestamptz;

alter table public.xrmovi_hml_card_subscriptions
  drop constraint if exists xrmovi_hml_card_subscriptions_status_check;

-- Historic rejection received HTTP 400; local 'pending' was not a provider outcome.
update public.xrmovi_hml_card_subscriptions
set status='rejected',
    error_id=coalesce(error_id,gen_random_uuid()),
    error_details=coalesce(error_details,
      jsonb_build_object('status',400,'error','',
        'message','Both payer and collector must be real or test users',
        'cause','[]'::jsonb)),
    updated_at=now()
where id='card-sandbox-only' and status='pending' and provider_id is null;

alter table public.xrmovi_hml_card_subscriptions
  add constraint xrmovi_hml_card_subscriptions_status_check
  check (status in ('not_created','creating','created','rejected','unknown'));

create unique index if not exists xrmovi_hml_card_provider_unique
  on public.xrmovi_hml_card_subscriptions(provider_id)
  where provider_id is not null;

comment on column public.xrmovi_hml_card_subscriptions.status is
  'Local lifecycle not_created/creating/created/rejected/unknown; provider status separately.';
