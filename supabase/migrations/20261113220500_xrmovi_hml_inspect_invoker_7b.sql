-- 7B follow-up hardening: avoid a privileged RPC for read-only HML inspection.
-- The authenticated role can SELECT storage.objects but only via RLS.
-- xrmovi_hml_storage_inspect keeps strict auth.uid() / path checks and now
-- ALSO respects RLS on the private test bucket.
alter function public.xrmovi_hml_storage_inspect(text) security invoker;
