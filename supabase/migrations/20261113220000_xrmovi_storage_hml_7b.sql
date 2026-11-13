-- XRMOVI 7B: isolated, opt-in, administrator-only Storage homologation.
-- Does not change any customer bucket, membership, plan, or existing policy.
-- No test data is created by this migration; only the empty private bucket.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('xrmovi-hml-storage','xrmovi-hml-storage',false,10485760,array['application/pdf']::text[])
on conflict (id) do nothing;

-- Only the signed-in platform administrator may read/write paths under
-- <auth.uid()>/hml/<run-uuid>/hml-<file-uuid>.pdf.
-- SECURITY INVOKER: delegates the admin check to the existing server helper.
create or replace function public.xrmovi_hml_storage_path_allowed(p_path text)
returns boolean
language sql stable security invoker set search_path=''
as $function$
  select (select auth.uid()) is not null
    and public.xrmovi_platform_is_admin()
    and length(coalesce(p_path,'')) between 100 and 160
    and p_path ~ ('^' || (select auth.uid())::text ||
      '/hml/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
      '/hml-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.pdf$');
$function$;

revoke all on function public.xrmovi_hml_storage_path_allowed(text) from public,anon;
grant execute on function public.xrmovi_hml_storage_path_allowed(text) to authenticated;

create policy xrmovi_hml_admin_select on storage.objects
for select to authenticated
using (bucket_id='xrmovi-hml-storage'
  and public.xrmovi_hml_storage_path_allowed(name)
  and owner_id=(select auth.uid())::text);

create policy xrmovi_hml_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id='xrmovi-hml-storage'
  and public.xrmovi_hml_storage_path_allowed(name)
  and owner_id=(select auth.uid())::text);

-- Only test-created objects of the current administrator can be removed.
-- This never authorizes deleting an object from a customer bucket.
create policy xrmovi_hml_admin_delete on storage.objects
for delete to authenticated
using (bucket_id='xrmovi-hml-storage'
  and public.xrmovi_hml_storage_path_allowed(name)
  and owner_id=(select auth.uid())::text);

-- Read-only evidence confirms the object's exact PostgreSQL registration.
-- Storage object bytes themselves remain private. No hash is independently
-- calculated by the server; digest comparison occurs in the browser.
create or replace function public.xrmovi_hml_storage_inspect(p_path text)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  actor uuid := (select auth.uid());
  n bigint := 0;
  bytes bigint := 0;
begin
  if actor is null or not public.xrmovi_hml_storage_path_allowed(p_path) then
    raise exception 'Homologação: acesso negado' using errcode='42501';
  end if;
  select count(*),coalesce(sum((o.metadata->>'size')::bigint),0)
    into n,bytes
  from storage.objects o
  where o.bucket_id='xrmovi-hml-storage'
    and o.owner_id=actor::text and o.name=p_path;
  return jsonb_build_object('registered',n=1,'object_count',n,
    'stored_bytes',bytes,'bucket','xrmovi-hml-storage');
end;
$function$;

revoke all on function public.xrmovi_hml_storage_inspect(text) from public,anon;
grant execute on function public.xrmovi_hml_storage_inspect(text) to authenticated;
