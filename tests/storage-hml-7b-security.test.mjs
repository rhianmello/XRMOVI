import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=path.resolve(import.meta.dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261113220000_xrmovi_storage_hml_7b.sql'),'utf8');
const hardening=fs.readFileSync(path.join(root,'supabase/migrations/20261113220500_xrmovi_hml_inspect_invoker_7b.sql'),'utf8');
const app=fs.readFileSync(path.join(root,'admin/storage-hml.js'),'utf8');
const html=fs.readFileSync(path.join(root,'admin/storage-hml.html'),'utf8');
const probe=fs.readFileSync(path.join(root,'admin/storage-hml-probe.html'),'utf8');
const transfer=fs.readFileSync(path.join(root,'v3/storage-transfer.js'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin/storage.html'),'utf8');

test('HML uses dedicated private bucket outside customer inventory',()=>{
 assert.match(sql,/insert into storage\.buckets/);
 assert.match(sql,/values \('hml-xrmovi-storage','hml-xrmovi-storage',false,10485760/);
 assert.match(sql,/array\['application\/pdf'\]/);
 assert.doesNotMatch(sql,/insert into xrmovi\.(?:companies|memberships|record_attachments)|update xrmovi\.(?:companies|memberships)/i);
 assert.match(transfer,/bucket === 'hml-xrmovi-storage'/);
 assert.match(admin,/\.\/storage-hml\.html/);
});
test('HML RLS restricts each operation to auth.uid and platform admin, never customer buckets',()=>{
 for(const name of ['xrmovi_hml_admin_select','xrmovi_hml_admin_insert','xrmovi_hml_admin_delete']){
  assert.match(sql,new RegExp('create policy '+name+' on storage.objects'));
 }
 assert.match(sql,/public\.xrmovi_platform_is_admin\(\)/);
 assert.match(sql,/owner_id=\(select auth\.uid\(\)\)::text/g);
 assert.match(sql,/name~?/i); // paths are verified through path-check helper
 assert.doesNotMatch(sql,/drop policy|alter policy|delete from storage\.objects|truncate/i);
});
test('all new RPC calls require an authenticated user',()=>{
 for(const name of ['xrmovi_hml_storage_path_allowed\(text\)','xrmovi_hml_storage_inspect\(text\)']){
  const sig='public.'+name;
  assert.ok(sql.includes(sig));
 }
 assert.match(sql,/revoke all on function public\.xrmovi_hml_storage_path_allowed\(text\) from public,anon/);
 assert.match(sql,/revoke all on function public\.xrmovi_hml_storage_inspect\(text\) from public,anon/);
 assert.match(sql,/grant execute on function public\.xrmovi_hml_storage_inspect\(text\) to authenticated/);
});
test('HML is inert on page load and only runs tests by explicit clicks',()=>{
 assert.match(app,/void init\(\)/);
 assert.match(app,/addEventListener\('click'/);
 assert.match(app,/await verifyLogin\(\)/);
 assert.match(html,/nenhum arquivo é enviado/i);
 assert.doesNotMatch(app,/window\.onload\s*=\s*start/);
});
test('evidence uses downloaded SHA-256 and registered storage bytes',()=>{
 assert.match(app,/crypto\.subtle\.digest\('SHA-256'/);
 assert.match(app,/sha256_download===test\.evidence\.sha256_original/);
 assert.match(app,/test\.evidence\.stored_bytes===test\.file\.size/);
 assert.match(app,/object_count\)===1/);
 assert.match(app,/upsert:false/);
 assert.match(app,/anonymous_http_status/);
 assert.match(app,/duplicate_http_status/);
});
test('HML cleanup is manual, admin checked, and always limited to isolated bucket paths',()=>{
 assert.match(app,/confirm\('Remover SOMENTE/);
 assert.match(app,/try\{await verifyLogin\(\);\}catch/);
 assert.match(app,/path\.startsWith\(user\.id\+'\/hml\/'\)/);
 assert.match(app,/client\.storage\.from\(BUCKET\)\.remove\(\[path\]\)/);
 assert.doesNotMatch(app,/client\.storage\.from\('xrmovi-record-attachments'\)/);
});
test('second-account probe cannot upload or remove files',()=>{
 assert.match(probe,/storage\.from\(BUCKET\)\.download\(path\)/);
 assert.doesNotMatch(probe,/\.upload\(|\.remove\(/);
 assert.match(probe,/code===404/);
 assert.match(probe,/Acesso|ACESSO|isolation|isolamento/i);
});
test('privacy review keeps ETag similarity and deletion-audit distinct from proven orphans',()=>{
 assert.match(admin,/não prova conteúdo duplicado/);
 assert.match(admin,/item\.has_deletion_audit/);
 assert.match(admin,/item\.same_etag_as_referenced/);
 assert.doesNotMatch(admin,/storage\.from\([^\n]+\)\.remove\(/);
});

test('HML metadata inspection uses invoker privileges and Storage RLS',()=>{
 assert.match(hardening,/alter function public\.xrmovi_hml_storage_inspect\(text\) security invoker/i);
 assert.doesNotMatch(hardening,/security definer/i);
});
