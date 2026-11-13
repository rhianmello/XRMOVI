
-- XRMOVI Etapa 5B: métricas verificadas pelo Storage e revisão humana; sem exclusão.
-- O tamanho ORIGINAL é apenas declarado pelo navegador; tamanho final/identidade,
-- vínculo com registro e propriedade são conferidos no PostgreSQL.
create table if not exists xrmovi.storage_upload_metrics (
  storage_object_id uuid primary key,
  company_id uuid not null references xrmovi.companies(id),
  bucket_id text not null check (bucket_id = 'xrmovi-record-attachments'),
  entity_kind text not null,
  stored_bytes bigint not null check (stored_bytes between 1 and 10485760),
  client_original_bytes bigint not null check (client_original_bytes between 1 and 20971520),
  source_verified boolean not null default false check (source_verified = false),
  recorded_at timestamptz not null default now(),
  uploaded_by uuid not null
);
comment on column xrmovi.storage_upload_metrics.client_original_bytes is 'Informado pelo navegador; não verificado independentemente pelo servidor.';
comment on column xrmovi.storage_upload_metrics.stored_bytes is 'Verificado na linha correspondente de storage.objects no registro da métrica.';
alter table xrmovi.storage_upload_metrics enable row level security;
revoke all on xrmovi.storage_upload_metrics from public, anon, authenticated;
create index if not exists xrmovi_storage_upload_metrics_period_idx on xrmovi.storage_upload_metrics(company_id,recorded_at desc);

create table if not exists xrmovi.storage_review_decisions (
  object_id uuid primary key,
  bucket_id text not null check (bucket_id like 'xrmovi-%'),
  review_status text not null check (review_status in ('investigate','retain','requires_evidence')),
  note text not null default '' check (length(note) <= 500),
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default now()
);
alter table xrmovi.storage_review_decisions enable row level security;
revoke all on xrmovi.storage_review_decisions from public, anon, authenticated;

create table if not exists xrmovi.storage_review_history (
  id bigint generated always as identity primary key,
  object_id uuid not null,
  bucket_id text not null,
  review_status text not null,
  note text not null,
  reviewed_by uuid not null,
  recorded_at timestamptz not null default now()
);
alter table xrmovi.storage_review_history enable row level security;
revoke all on xrmovi.storage_review_history from public, anon, authenticated;

create or replace function public.xrmovi_storage_metric_record(
  cid uuid, p_path text, p_original_bytes bigint
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  record_row record;
  inserted_id uuid;
begin
  perform public.xrmovi_assert_company_access(cid);
  if caller is null or length(coalesce(p_path,'')) not between 20 and 450
     or p_original_bytes not between 1 and 20971520
     or p_path not like cid::text||'/%' then
    raise exception 'Métrica inválida' using errcode='42501';
  end if;
  select o.id storage_id, (o.metadata->>'size')::bigint stored_bytes,
         a.entity_kind entity_kind
  into record_row
  from xrmovi.record_attachments a
  join storage.objects o on o.bucket_id = 'xrmovi-record-attachments'
      and o.name = a.object_path
  where a.company_id=cid and a.object_path=p_path
    and a.uploaded_by=caller and o.owner_id=caller::text;
  if not found or record_row.stored_bytes not between 1 and 10485760
     or p_original_bytes < record_row.stored_bytes then
    raise exception 'Arquivo registrado não corresponde à métrica' using errcode='42501';
  end if;
  insert into xrmovi.storage_upload_metrics(
    storage_object_id,company_id,bucket_id,entity_kind,stored_bytes,
    client_original_bytes,uploaded_by
  ) values (
    record_row.storage_id,cid,'xrmovi-record-attachments',
    record_row.entity_kind,record_row.stored_bytes,p_original_bytes,caller
  ) on conflict(storage_object_id) do nothing returning storage_object_id into inserted_id;
  return inserted_id is not null;
end;
$$;
revoke all on function public.xrmovi_storage_metric_record(uuid,text,bigint) from public,anon;
grant execute on function public.xrmovi_storage_metric_record(uuid,text,bigint) to authenticated;

create or replace function public.xrmovi_company_storage_history(cid uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
  perform public.xrmovi_assert_company_access(cid);
  select jsonb_build_object(
    'verified_stored_bytes',coalesce(sum(m.stored_bytes),0),
    'client_original_bytes',coalesce(sum(m.client_original_bytes),0),
    'savings_client_reported_bytes',coalesce(sum(m.client_original_bytes-m.stored_bytes),0),
    'completed',count(*),
    'source_original_verified',false
  ) into result
  from xrmovi.storage_upload_metrics m where m.company_id=cid;
  return result;
end;
$$;
revoke all on function public.xrmovi_company_storage_history(uuid) from public,anon;
grant execute on function public.xrmovi_company_storage_history(uuid) to authenticated;

create or replace function public.xrmovi_admin_storage_overview()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  caller uuid := (select auth.uid());
  summary jsonb;
  daily jsonb;
  candidates jsonb;
begin
  if caller is null or not exists(
    select 1 from xrmovi.platform_admins p where p.user_id=caller
  ) then
    raise exception 'Acesso administrativo negado' using errcode='42501';
  end if;

  select jsonb_build_object(
    'object_count',count(*),
    'stored_bytes',coalesce(sum((metadata->>'size')::bigint),0)
  ) into summary from storage.objects where bucket_id like 'xrmovi-%';

  select coalesce(jsonb_agg(to_jsonb(q) order by q.day desc, q.category),'[]'::jsonb)
  into daily from (
    select date_trunc('day',m.recorded_at)::date day,
      m.entity_kind category,count(*) completed,
      sum(m.stored_bytes) verified_stored_bytes,
      sum(m.client_original_bytes) client_original_bytes,
      sum(m.client_original_bytes-m.stored_bytes) client_reported_savings_bytes
    from xrmovi.storage_upload_metrics m
    group by date_trunc('day',m.recorded_at)::date,m.entity_kind
  ) q;

  with refs as (
    select 'xrmovi-company-logos' bucket,logo_path object_path from xrmovi.companies where logo_path is not null
    union all select 'xrmovi-odometer-proof',photo_path from xrmovi.odometer_reports where photo_path is not null
    union all select 'xrmovi-odometer-proof',photo_path from xrmovi.driver_service_submissions where photo_path is not null
    union all select 'xrmovi-record-attachments',object_path from xrmovi.record_attachments where object_path is not null
    union all select 'xrmovi-maintenance-docs',object_path from xrmovi.maintenance_attachments where object_path is not null
    union all select 'xrmovi-fuel-receipts',object_path from xrmovi.fuel_receipts where object_path is not null
    union all select 'xrmovi-vehicle-docs',object_path from xrmovi.vehicle_documents where object_path is not null
  ),
  objects as (
    select o.id,o.bucket_id,o.name,o.created_at,
      coalesce((o.metadata->>'size')::bigint,0) stored_bytes,
      nullif(coalesce(o.metadata->>'eTag',o.metadata->>'etag'),'') etag,
      exists(select 1 from refs r where r.bucket=o.bucket_id and r.object_path=o.name) currently_referenced
    from storage.objects o where o.bucket_id like 'xrmovi-%'
  ),
  rows as (
    select o.id object_id,o.bucket_id,o.created_at,o.stored_bytes,
      coalesce(d.review_status,'requires_evidence') review_status,
      coalesce(d.note,'') reviewer_note,d.reviewed_at,
      exists(select 1 from xrmovi.document_deletion_audit da where da.object_path=o.name) has_deletion_audit,
      exists(select 1 from objects r where r.bucket_id=o.bucket_id and r.currently_referenced
             and r.etag=o.etag and o.etag is not null) same_etag_as_referenced
    from objects o
    left join xrmovi.storage_review_decisions d on d.object_id=o.id
    where not o.currently_referenced
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.stored_bytes desc),'[]'::jsonb)
    into candidates from rows r;

  return jsonb_build_object('summary',summary,'daily',daily,'candidates',candidates,
    'savings_original_verified',false,
    'scope','xrmovi-only');
end;
$$;
revoke all on function public.xrmovi_admin_storage_overview() from public,anon;
grant execute on function public.xrmovi_admin_storage_overview() to authenticated;

create or replace function public.xrmovi_admin_storage_review_mark(
 p_object_id uuid,p_status text,p_note text default ''
) returns boolean language plpgsql security definer set search_path=''
as $$
declare
  caller uuid := (select auth.uid());
  the_bucket text;
  clean_note text := trim(coalesce(p_note,''));
begin
  if caller is null or not exists(select 1 from xrmovi.platform_admins p where p.user_id=caller) then
    raise exception 'Acesso administrativo negado' using errcode='42501';
  end if;
  if p_status not in ('investigate','retain','requires_evidence')
     or length(clean_note)>500 then
    raise exception 'Decisão inválida' using errcode='22023';
  end if;
  select o.bucket_id into the_bucket from storage.objects o
  where o.id=p_object_id and o.bucket_id like 'xrmovi-%';
  if the_bucket is null then
    raise exception 'Objeto XRMOVI não encontrado' using errcode='22023';
  end if;
  insert into xrmovi.storage_review_decisions(object_id,bucket_id,review_status,note,reviewed_by)
    values(p_object_id,the_bucket,p_status,clean_note,caller)
  on conflict(object_id) do update
    set review_status=excluded.review_status,note=excluded.note,
        reviewed_by=excluded.reviewed_by,reviewed_at=now();
  insert into xrmovi.storage_review_history(object_id,bucket_id,review_status,note,reviewed_by)
    values(p_object_id,the_bucket,p_status,clean_note,caller);
  return true;
end;
$$;
revoke all on function public.xrmovi_admin_storage_review_mark(uuid,text,text) from public,anon;
grant execute on function public.xrmovi_admin_storage_review_mark(uuid,text,text) to authenticated;
