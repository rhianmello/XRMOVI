-- XRMOVI 6B — observabilidade adicional SOMENTE de novas logotipos autenticadas.
-- Storage histórico intocado, RLS e controles comerciais não alterados.
alter table xrmovi.storage_upload_metrics
  drop constraint storage_upload_metrics_bucket_id_check;
alter table xrmovi.storage_upload_metrics
  add constraint storage_upload_metrics_bucket_id_check
  check (bucket_id in ('xrmovi-record-attachments', 'xrmovi-company-logos'));

create or replace function public.xrmovi_storage_logo_metric_record(
  cid uuid, p_path text, p_original_bytes bigint
) returns boolean
language plpgsql security definer set search_path=''
as $storage_6b$
declare
  caller uuid := (select auth.uid());
  record_row record;
  new_object uuid;
begin
  perform public.xrmovi_assert_company_access(cid);
  if caller is null or cid is null or p_path is null
    or p_path not like cid::text || '/%'
    or length(p_path) not between 40 and 180
    or p_original_bytes not between 1 and 2097152 then
    raise exception 'Métrica de logo inválida' using errcode='42501';
  end if;
  if not exists (
    select 1 from xrmovi.memberships m
    where m.company_id=cid and m.user_id=caller
      and m.role in ('owner','manager')
  ) then
    raise exception 'Somente gestor pode registrar esta métrica' using errcode='42501';
  end if;

  select o.id storage_id, (o.metadata->>'size')::bigint stored_bytes
  into record_row
  from xrmovi.companies c
  join storage.objects o on
       o.bucket_id='xrmovi-company-logos' and o.name=c.logo_path
  where c.id=cid and c.logo_path=p_path
     and o.owner_id=caller::text;
  if not found
     or record_row.stored_bytes not between 1 and 2097152
     or p_original_bytes < record_row.stored_bytes then
    raise exception 'Logo salva não corresponde ao arquivo' using errcode='42501';
  end if;

  insert into xrmovi.storage_upload_metrics (
    storage_object_id,company_id,bucket_id,entity_kind,
    stored_bytes,client_original_bytes,uploaded_by
  ) values (
    record_row.storage_id,cid,'xrmovi-company-logos','logo',
    record_row.stored_bytes,p_original_bytes,caller
  ) on conflict(storage_object_id) do nothing
    returning storage_object_id into new_object;
  return new_object is not null;
end;
$storage_6b$;

revoke all on function public.xrmovi_storage_logo_metric_record(uuid,text,bigint)
  from public,anon;
grant execute on function public.xrmovi_storage_logo_metric_record(uuid,text,bigint)
  to authenticated;
