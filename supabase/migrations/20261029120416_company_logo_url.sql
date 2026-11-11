-- Additive branding support for the existing XRMOVI private logo bucket.
-- No existing logo objects, company fields, memberships or policies are removed.

ALTER TABLE xrmovi.companies
  ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN xrmovi.companies.logo_url IS
  'Stable authenticated Supabase Storage URL for the company logo. Not a signed URL; consumers must authenticate or obtain a fresh signed URL using logo_path.';

CREATE OR REPLACE FUNCTION xrmovi.sync_company_logo_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  NEW.logo_url := CASE
    WHEN NEW.logo_path IS NULL THEN NULL
    ELSE 'https://ztqtcbzjesrkuaijmylm.supabase.co/storage/v1/object/authenticated/xrmovi-company-logos/' || NEW.logo_path
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION xrmovi.sync_company_logo_url() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER xrmovi_company_logo_url_sync
BEFORE INSERT OR UPDATE OF logo_path ON xrmovi.companies
FOR EACH ROW EXECUTE FUNCTION xrmovi.sync_company_logo_url();

-- Preserve any pre-existing logo_path while complementing its URL.
UPDATE xrmovi.companies
SET logo_path = logo_path
WHERE logo_path IS NOT NULL AND logo_url IS NULL;

-- The private xrmovi schema is deliberately not exposed or granted to clients.
-- This narrow RPC follows the existing API boundary, with an explicit current
-- membership check, an empty search_path and restricted EXECUTE privileges.
CREATE OR REPLACE FUNCTION public.xrmovi_company_logo_save(cid uuid, p_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  saved jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM xrmovi.memberships m
    WHERE m.company_id = cid
      AND m.user_id = (SELECT auth.uid())
      AND m.role IN ('owner', 'manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_path IS NULL
    OR split_part(p_path, '/', 1) <> cid::text
    OR NOT coalesce(public.xrmovi_logo_access(p_path, true), false)
    OR NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'xrmovi-company-logos'
        AND o.name = p_path
    ) THEN
    RAISE EXCEPTION 'Invalid company logo' USING ERRCODE = '22023';
  END IF;

  UPDATE xrmovi.companies c
  SET logo_path = p_path
  WHERE c.id = cid
  RETURNING jsonb_build_object(
    'id', c.id, 'name', c.name,
    'logo_path', c.logo_path, 'logo_url', c.logo_url
  ) INTO saved;

  IF saved IS NULL THEN
    RAISE EXCEPTION 'Company not found' USING ERRCODE = '22023';
  END IF;
  RETURN saved;
END;
$function$;

REVOKE ALL ON FUNCTION public.xrmovi_company_logo_save(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xrmovi_company_logo_save(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.xrmovi_my_companies()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'role', m.role,
    'plan', s.plan_code, 'status', s.status, 'trial_end', s.trial_end,
    'vehicle_limit', p.vehicle_limit, 'seat_limit', p.seat_limit,
    'logo_path', c.logo_path, 'logo_url', c.logo_url
  )), '[]'::jsonb)
  FROM xrmovi.memberships m
  JOIN xrmovi.companies c ON c.id = m.company_id
  JOIN xrmovi.subscriptions s ON s.company_id = c.id
  JOIN xrmovi.plans p ON p.code = s.plan_code
  WHERE m.user_id = (SELECT auth.uid())
$function$;

REVOKE ALL ON FUNCTION public.xrmovi_my_companies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xrmovi_my_companies() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.xrmovi_company_identity(cid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'name', c.name, 'logo_path', c.logo_path, 'logo_url', c.logo_url,
    'trade_name', c.trade_name, 'legal_name', c.legal_name,
    'cnpj', c.cnpj, 'contact_email', c.contact_email,
    'phone', c.phone, 'address', c.address, 'report_color', c.report_color
  )
  FROM xrmovi.companies c
  WHERE c.id = cid AND EXISTS (
    SELECT 1 FROM xrmovi.memberships m
    WHERE m.company_id = cid AND m.user_id = (SELECT auth.uid())
  )
$function$;

REVOKE ALL ON FUNCTION public.xrmovi_company_identity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xrmovi_company_identity(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
