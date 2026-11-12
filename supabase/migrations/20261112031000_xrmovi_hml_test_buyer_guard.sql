-- XRMOVI: optional test-only buyer identity from POST /users/test.
-- No commercial tables, payment authorizations, or bi-epc15 changes.
ALTER TABLE public.xrmovi_hml_card_subscriptions
  ADD COLUMN IF NOT EXISTS test_buyer_id text,
  ADD COLUMN IF NOT EXISTS test_buyer_email text,
  ADD COLUMN IF NOT EXISTS test_buyer_state text NOT NULL DEFAULT 'not_created',
  ADD COLUMN IF NOT EXISTS test_buyer_error_id uuid;
ALTER TABLE public.xrmovi_hml_card_subscriptions
  ADD CONSTRAINT xrmovi_hml_buyer_state_check
  CHECK (test_buyer_state IN ('not_created','creating','ready','rejected','unknown'));
REVOKE ALL ON public.xrmovi_hml_card_subscriptions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.xrmovi_hml_card_subscriptions ENABLE ROW LEVEL SECURITY;
COMMENT ON COLUMN public.xrmovi_hml_card_subscriptions.test_buyer_email
  IS 'Synthetic email returned by the official Mercado Pago test-user creation endpoint. Service-role access only. No password or OTP stored.';
