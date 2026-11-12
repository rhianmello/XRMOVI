-- Proven provider response: HTTP 403 "caller.id must be a productive user".
-- No test buyer was created, so permit one new explicitly authorized attempt
-- with a productive caller. Preserve the original error_id for audit.
UPDATE public.xrmovi_hml_card_subscriptions
SET test_buyer_state='not_created',updated_at=now()
WHERE id='card-sandbox-only'
  AND test_buyer_state='rejected'
  AND test_buyer_error_id='e1732287-f16c-49e0-b947-183b63651467'::uuid
  AND test_buyer_id IS NULL
  AND test_buyer_email IS NULL
  AND provider_id IS NULL
  AND status='rejected';
