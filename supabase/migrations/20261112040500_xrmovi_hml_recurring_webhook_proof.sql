-- Isolated Mercado Pago sandbox observability. No commercial table, ledger or entitlement changes.
alter table public.xrmovi_hml_card_subscriptions
 add column if not exists webhook_verified_at timestamptz,
 add column if not exists webhook_last_topic text,
 add column if not exists last_payment_status text,
 add column if not exists last_payment_id text,
 add column if not exists last_invoice_id text,
 add column if not exists last_payment_verified_at timestamptz;
comment on column public.xrmovi_hml_card_subscriptions.webhook_verified_at is
 'Most recent cryptographically authenticated test webhook, reconciled with isolated provider reference.';
