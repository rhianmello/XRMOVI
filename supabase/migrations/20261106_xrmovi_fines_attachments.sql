alter table xrmovi.record_attachments drop constraint if exists record_attachments_entity_kind_check;
alter table xrmovi.record_attachments add constraint record_attachments_entity_kind_check check(entity_kind in ('driver','vehicle','maintenance','fuel','expense','fine'));

CREATE OR REPLACE FUNCTION public.xrmovi_attachment_access(p_path text, p_write boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare parts text[]; cid uuid; rid uuid; kind text;
begin
 parts:=string_to_array(p_path,'/');
 if array_length(parts,1)<>4 or parts[1]!~'^[0-9a-f-]{36}$' or parts[3]!~'^[0-9a-f-]{36}$' or parts[4]!~'^[0-9a-f-]{36}[.](pdf|jpg|png|webp)$' then return false;end if;
 cid:=parts[1]::uuid;
 if not (xrmovi.company_is_paid(cid) or exists(select 1 from xrmovi.platform_admins pa where pa.user_id=auth.uid())) then return false;end if; kind:=parts[2];rid:=parts[3]::uuid;
 if kind not in ('driver','vehicle','maintenance','fuel','expense','fine') then return false;end if;
 if not exists(select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=(select auth.uid()) and (not p_write or m.role in ('owner','manager'))) then return false;end if;
 if not p_write and kind='driver' and not exists(select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=(select auth.uid()) and m.role in ('owner','manager')) then return false;end if;
 return case kind
 when 'driver' then exists(select 1 from xrmovi.drivers r where r.company_id=cid and r.id=rid)
 when 'vehicle' then exists(select 1 from xrmovi.vehicles r where r.company_id=cid and r.id=rid)
 when 'maintenance' then exists(select 1 from xrmovi.maintenance_tasks r where r.company_id=cid and r.id=rid)
 when 'fuel' then exists(select 1 from xrmovi.fuel_entries r where r.company_id=cid and r.id=rid)
 when 'expense' then exists(select 1 from xrmovi.vehicle_expenses r where r.company_id=cid and r.id=rid) when 'fine' then exists(select 1 from xrmovi.traffic_fines r where r.company_id=cid and r.id=rid)
 else false end;
exception when others then return false;
end $function$;


CREATE OR REPLACE FUNCTION public.xrmovi_attachment_register(cid uuid, kind text, rid uuid, p_path text, p_name text, p_type text, p_size bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare output_id uuid; vid uuid;
begin
 perform public.xrmovi_assert_company_access(cid);
 if not public.xrmovi_attachment_access(p_path,true) or p_path not like cid::text||'/'||kind||'/'||rid::text||'/%' then raise exception 'Not authorized';end if;
 if p_type not in ('application/pdf','image/jpeg','image/png','image/webp') or p_size not between 1 and 10485760 or length(p_name) not between 1 and 200 then raise exception 'Invalid attachment';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='xrmovi-record-attachments' and o.name=p_path and o.owner_id=(select auth.uid())::text) then raise exception 'Upload not found';end if;
 vid:=case kind when 'vehicle' then rid when 'maintenance' then (select vehicle_id from xrmovi.maintenance_tasks where company_id=cid and id=rid) when 'fuel' then (select vehicle_id from xrmovi.fuel_entries where company_id=cid and id=rid) when 'expense' then (select vehicle_id from xrmovi.vehicle_expenses where company_id=cid and id=rid) when 'fine' then (select vehicle_id from xrmovi.traffic_fines where company_id=cid and id=rid) else null end;
 insert into xrmovi.record_attachments(company_id,entity_kind,record_id,vehicle_id,original_name,object_path,content_type,size_bytes,uploaded_by)
 values(cid,kind,rid,vid,p_name,p_path,p_type,p_size,(select auth.uid())) returning id into output_id;
 return output_id;
end $function$;


CREATE OR REPLACE FUNCTION public.xrmovi_document_delete_prepare(cid uuid, p_source text, p_attachment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if rec.entity_kind not in ('driver','vehicle','maintenance','fuel','expense','fine')
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
$function$;
