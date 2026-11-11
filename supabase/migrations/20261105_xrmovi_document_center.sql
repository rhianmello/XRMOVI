-- XRMOVI: private attachments, Central de Documentos and auditable deletion.
-- All document removals are mediated by an authenticated Edge Function.
create table if not exists xrmovi.document_deletion_audit (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 source_type text not null check (source_type in ('record','legacy')),
 attachment_id uuid not null,
 entity_kind text not null,
 record_id uuid not null,
 object_path text not null,
 original_name text not null,
 deleted_by uuid not null,
 deleted_at timestamptz not null default now()
);
alter table xrmovi.document_deletion_audit enable row level security;
revoke all on xrmovi.document_deletion_audit from public, anon, authenticated;
grant select, insert on xrmovi.document_deletion_audit to service_role;

create or replace function public.xrmovi_document_delete_prepare(
 cid uuid, p_source text, p_attachment_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare rec xrmovi.record_attachments%rowtype;
        legacy_doc xrmovi.vehicle_documents%rowtype;
        path_value text; file_name text; kind_value text; rid uuid;
begin
 if auth.uid() is null then raise exception 'Login necessário.' using errcode='42501'; end if;
 perform public.xrmovi_assert_company_access(cid);
 if not exists (
  select 1 from xrmovi.memberships m
  where m.company_id=cid and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
 ) then raise exception 'Somente proprietário ou gestor pode excluir anexos.' using errcode='42501'; end if;

 if p_source = 'record' then
  select * into rec from xrmovi.record_attachments
   where company_id=cid and id=p_attachment_id;
  if not found then raise exception 'Documento não encontrado.' using errcode='22023'; end if;
  if rec.entity_kind not in ('driver','vehicle','maintenance','fuel','expense')
    or rec.object_path not like cid::text||'/'||rec.entity_kind||'/'||rec.record_id::text||'/%'
  then raise exception 'Documento com vínculo inválido.' using errcode='42501'; end if;
  path_value:=rec.object_path; file_name:=rec.original_name;
  kind_value:=rec.entity_kind; rid:=rec.record_id;
 elsif p_source='legacy' then
  select * into legacy_doc from xrmovi.vehicle_documents
   where company_id=cid and id=p_attachment_id;
  if not found then raise exception 'Documento não encontrado.' using errcode='22023'; end if;
  if not exists (select 1 from xrmovi.vehicles v
      where v.id=legacy_doc.vehicle_id and v.company_id=cid)
  then raise exception 'Veículo do documento indisponível.' using errcode='42501'; end if;
  path_value:=legacy_doc.object_path; file_name:=legacy_doc.original_name;
  kind_value:='vehicle'; rid:=legacy_doc.vehicle_id;
 else
  raise exception 'Origem de documento inválida.' using errcode='22023';
 end if;
 return jsonb_build_object(
  'attachment_id',p_attachment_id,'source',p_source,
  'bucket',case when p_source='record' then 'xrmovi-record-attachments'
      else 'xrmovi-vehicle-docs' end,
  'path',path_value,'name',file_name,'kind',kind_value,'record_id',rid
 );
end;
$$;
revoke all on function public.xrmovi_document_delete_prepare(uuid,text,uuid) from public,anon;
grant execute on function public.xrmovi_document_delete_prepare(uuid,text,uuid) to authenticated;

create or replace function public.xrmovi_document_delete_commit(
 cid uuid, p_source text, p_attachment_id uuid, p_path text, p_actor uuid
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare rec xrmovi.record_attachments%rowtype;
        legacy_doc xrmovi.vehicle_documents%rowtype;
begin
 if auth.jwt()->>'role' is distinct from 'service_role'
 then raise exception 'Acesso exclusivo do serviço.' using errcode='42501'; end if;
 if p_actor is null or not exists (
  select 1 from xrmovi.memberships m
  where m.company_id=cid and m.user_id=p_actor and m.role in ('owner','manager')
 ) then raise exception 'Responsável não autorizado.' using errcode='42501'; end if;
 if p_source='record' then
  select * into rec from xrmovi.record_attachments
   where company_id=cid and id=p_attachment_id for update;
  if not found or rec.object_path is distinct from p_path
  then raise exception 'Registro de documento divergente.' using errcode='22023'; end if;
  insert into xrmovi.document_deletion_audit
   (company_id,source_type,attachment_id,entity_kind,record_id,object_path,original_name,deleted_by)
  values (cid,'record',rec.id,rec.entity_kind,rec.record_id,rec.object_path,rec.original_name,p_actor);
  delete from xrmovi.record_attachments where id=rec.id and company_id=cid;
 elsif p_source='legacy' then
  select * into legacy_doc from xrmovi.vehicle_documents
   where company_id=cid and id=p_attachment_id for update;
  if not found or legacy_doc.object_path is distinct from p_path
  then raise exception 'Registro de documento divergente.' using errcode='22023'; end if;
  insert into xrmovi.document_deletion_audit
   (company_id,source_type,attachment_id,entity_kind,record_id,object_path,original_name,deleted_by)
  values (cid,'legacy',legacy_doc.id,'vehicle',legacy_doc.vehicle_id,legacy_doc.object_path,legacy_doc.original_name,p_actor);
  delete from xrmovi.vehicle_documents where id=legacy_doc.id and company_id=cid;
 else raise exception 'Origem inválida.' using errcode='22023';
 end if;
 return true;
end;
$$;
revoke all on function public.xrmovi_document_delete_commit(uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.xrmovi_document_delete_commit(uuid,text,uuid,text,uuid) to service_role;

-- Existing catalog now includes driver attachments only for managers/owners.
create or replace function public.xrmovi_company_document_catalog(cid uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
 perform public.xrmovi_assert_company_access(cid);
 return (
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'name',a.original_name,'path',a.object_path,
   'created_at',a.created_at,'kind',a.entity_kind,
   'vehicle_id',a.vehicle_id,'record_id',a.record_id,'plate',v.plate,
   'driver_name',case when a.entity_kind='driver' then d.name else null end,
   'expires_on',case when a.entity_kind='driver' then d.cnh_expires_on else null end
  ) order by a.created_at desc),'[]'::jsonb)
  from xrmovi.record_attachments a
  left join xrmovi.vehicles v on v.company_id=a.company_id and v.id=a.vehicle_id
  left join xrmovi.drivers d on d.company_id=a.company_id and d.id=a.record_id and a.entity_kind='driver'
  where a.company_id=cid and exists (
   select 1 from xrmovi.memberships m
   where m.company_id=cid and m.user_id=(select auth.uid())
   and (a.entity_kind<>'driver' or m.role in ('owner','manager'))
  )
 );
end;
$$;

create or replace function public.xrmovi_document_deletion_history(
 cid uuid, p_kind text default null, p_record_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
 perform public.xrmovi_assert_company_access(cid);
 if not exists (
  select 1 from xrmovi.memberships m
  where m.company_id=cid and m.user_id=(select auth.uid())
    and m.role in ('owner','manager')
 ) then raise exception 'Histórico restrito ao gestor.' using errcode='42501'; end if;
 return (
  select coalesce(jsonb_agg(jsonb_build_object(
   'kind',e.entity_kind,'record_id',e.record_id,'name',e.original_name,
   'deleted_at',e.deleted_at,'actor',coalesce(u.email,'Usuário desativado'),
   'source',e.source_type
  ) order by e.deleted_at desc),'[]'::jsonb)
  from (
   select * from xrmovi.document_deletion_audit a
   where a.company_id=cid and (p_kind is null or a.entity_kind=p_kind)
    and (p_record_id is null or a.record_id=p_record_id)
   order by deleted_at desc limit 100
  ) e left join auth.users u on u.id=e.deleted_by
 );
end;
$$;
revoke all on function public.xrmovi_document_deletion_history(uuid,text,uuid) from public,anon;
grant execute on function public.xrmovi_document_deletion_history(uuid,text,uuid) to authenticated;
