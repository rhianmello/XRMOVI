-- XRMOVI 4B — RELATÓRIO ADMINISTRATIVO SOMENTE LEITURA
-- Executar exclusivamente no Supabase SQL Editor do projeto ztqtcbzjesrkuaijmylm.
-- Não há DELETE, UPDATE, INSERT, alteração de RLS ou exposição no Data API.
-- O resultado usa hashes curtos, não mostra nomes privados nem caminhos.
-- "Sem vínculo" NÃO significa "pode excluir": verificar registros históricos
-- e eventuais referências indiretas antes de qualquer avaliação humana.
WITH refs AS (
 SELECT 'xrmovi-company-logos' bucket,name FROM (SELECT logo_path name FROM xrmovi.companies WHERE logo_path IS NOT NULL) a
 UNION ALL SELECT 'xrmovi-odometer-proof',photo_path FROM xrmovi.odometer_reports WHERE photo_path IS NOT NULL
 UNION ALL SELECT 'xrmovi-odometer-proof',photo_path FROM xrmovi.driver_service_submissions WHERE photo_path IS NOT NULL
 UNION ALL SELECT 'xrmovi-record-attachments',object_path FROM xrmovi.record_attachments WHERE object_path IS NOT NULL
 UNION ALL SELECT 'xrmovi-maintenance-docs',object_path FROM xrmovi.maintenance_attachments WHERE object_path IS NOT NULL
 UNION ALL SELECT 'xrmovi-fuel-receipts',object_path FROM xrmovi.fuel_receipts WHERE object_path IS NOT NULL
 UNION ALL SELECT 'xrmovi-vehicle-docs',object_path FROM xrmovi.vehicle_documents WHERE object_path IS NOT NULL
), objects AS (
 SELECT o.bucket_id,o.name,o.created_at,
        coalesce((o.metadata->>'size')::bigint,0) size_bytes,
        nullif(coalesce(o.metadata->>'eTag',o.metadata->>'etag'),'') e_tag,
        EXISTS (SELECT 1 FROM refs r WHERE r.bucket=o.bucket_id AND r.name=o.name) active_reference,
        EXISTS (SELECT 1 FROM xrmovi.document_deletion_audit d WHERE d.object_path=o.name) logged_deletion
 FROM storage.objects o WHERE o.bucket_id LIKE 'xrmovi-%'
)
SELECT bucket_id,left(md5(name),14) object_fingerprint,created_at,size_bytes,
       CASE WHEN logged_deletion THEN 'historical_deletion_review'
            ELSE 'no_direct_reference_review' END status,
       EXISTS (
        SELECT 1 FROM objects o2
        WHERE o2.bucket_id=objects.bucket_id AND o2.active_reference
          AND o2.e_tag=objects.e_tag AND o2.e_tag IS NOT NULL
       ) same_etag_as_referenced
FROM objects WHERE NOT active_reference
ORDER BY size_bytes DESC,bucket_id,created_at;

-- Capacidade atual por mês e bucket: bytes medidos no Storage, não a economia.
SELECT bucket_id,date_trunc('month',created_at)::date storage_month,
       count(*) object_count,
       coalesce(sum((metadata->>'size')::bigint),0) stored_bytes,
       round(coalesce(sum((metadata->>'size')::bigint),0)/1048576.0,3) stored_mib
FROM storage.objects
WHERE bucket_id LIKE 'xrmovi-%'
GROUP BY bucket_id,date_trunc('month',created_at)
ORDER BY storage_month DESC,bucket_id;
