import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
const root=path.resolve(import.meta.dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261113190000_xrmovi_storage_observability_5b.sql'),'utf8');
const html=fs.readFileSync(path.join(root,'admin/storage.html'),'utf8');

test('storage tables are isolated from direct user writes and have RLS enabled',()=>{
 for(const table of ['storage_upload_metrics','storage_review_decisions','storage_review_history','storage_upload_attempt_events']){
  assert.match(migration,new RegExp('create table if not exists xrmovi\.'+table));
  assert.match(migration,new RegExp('alter table xrmovi\.'+table+' enable row level security'));
  assert.match(migration,new RegExp('revoke all on xrmovi\.'+table+' from public, anon, authenticated'));
 }
});
test('all exposed storage RPCs revoke anonymous access and limit execution to authenticated sessions',()=>{
 for(const sig of [
  'xrmovi_storage_metric_record(uuid,text,bigint)',
  'xrmovi_company_storage_history(uuid)',
  'xrmovi_admin_storage_overview()',
  'xrmovi_admin_storage_review_mark(uuid,text,text)',
  'xrmovi_storage_attempt_event(uuid,text,text)'
 ]) {
  assert.ok(migration.includes('revoke all on function public.'+sig+' from public,anon'));
  assert.ok(migration.includes('grant execute on function public.'+sig+' to authenticated'));
 }
});
test('admin reporting and review functions include server-side platform-admin check',()=>{
 assert.equal((migration.match(/from xrmovi\.platform_admins p where p.user_id=caller/g)||[]).length,2);
 assert.match(migration,/raise exception 'Acesso administrativo negado' using errcode='42501'/);
});
test('successful upload metric verifies company access, storage object ownership and source record',()=>{
 assert.match(migration,/perform public\.xrmovi_assert_company_access\(cid\)/);
 assert.match(migration,/a\.uploaded_by=caller and o\.owner_id=caller::text/);
 assert.match(migration,/from xrmovi\.record_attachments a/);
 assert.match(migration,/on conflict\(storage_object_id\) do nothing/);
});
test('stored bytes are server-verified, original size is labeled as client-reported',()=>{
 assert.match(migration,/o\.metadata->>'size'/);
 assert.match(migration,/client_original_bytes/);
 assert.match(migration,/source_verified boolean not null default false check \(source_verified = false\)/);
 assert.match(html,/não têm verificação independente/);
 assert.match(html,/Economia informada/);
});
test('storage review tooling has no delete ability or file-path disclosure in UI',()=>{
 assert.doesNotMatch(migration,/\bdelete\s+from\s+storage\.objects\b/i);
 assert.doesNotMatch(migration,/\bupdate\s+storage\.objects\b/i);
 assert.match(html,/Nenhuma opção exclui arquivos/);
 assert.doesNotMatch(html,/\.remove\(/);
});

test('attempt metrics are clearly identified as client-reported and rate-limited',()=>{
 assert.match(migration,/storage_upload_attempt_events/);
 assert.match(migration,/p_event not in \('failed','interrupted'\)/);
 assert.match(migration,/interval '1 minute'\) >= 12/);
 assert.match(html,/Falhas e interrupções são sinais enviados pelo navegador/);
 assert.match(html,/Não equivale ao crescimento líquido histórico/);
});
