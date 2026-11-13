import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const sql = fs.readFileSync(path.join(root,
  'supabase/migrations/20261113194000_xrmovi_logo_storage_metrics_6b.sql'), 'utf8');
const logo = fs.readFileSync(path.join(root,'v3/company-branding.js'),'utf8');
const tus = fs.readFileSync(path.join(root,'v3/storage-transfer.js'),'utf8');
const memory = fs.readFileSync(path.join(root,'v3/storage-tus-memory.js'),'utf8');

test('logo metrics are registered only after database logo save and successful response',()=>{
 const saved = logo.indexOf("client.rpc('xrmovi_company_logo_save'");
 const metric = logo.indexOf("client.rpc('xrmovi_storage_logo_metric_record'");
 assert.ok(saved >= 0);
 assert.ok(metric > saved);
 assert.match(logo,/saved = true;[\s\S]*?try \{[\s\S]*?xrmovi_storage_logo_metric_record/);
 assert.match(logo,/catch \{ \/\* Non-blocking telemetry; logo remains saved\. \*\/ \}/);
});

test('new logo metrics reject anonymous execution and require verified owner and company role',()=>{
 assert.match(sql,/revoke all on function public\.xrmovi_storage_logo_metric_record\(uuid,text,bigint\)[\s\S]*?from public,anon/);
 assert.match(sql,/grant execute on function public\.xrmovi_storage_logo_metric_record\(uuid,text,bigint\)[\s\S]*?to authenticated/);
 assert.match(sql,/perform public\.xrmovi_assert_company_access\(cid\)/);
 assert.match(sql,/m\.role in \('owner','manager'\)/);
 assert.match(sql,/o\.owner_id=caller::text/);
 assert.match(sql,/c\.logo_path=p_path/);
 assert.match(sql,/record_row\.stored_bytes not between 1 and 2097152/);
 assert.match(sql,/on conflict\(storage_object_id\) do nothing/);
});
test('storage schema is only widened to private logo bucket',()=>{
 assert.match(sql,/bucket_id in \('xrmovi-record-attachments', 'xrmovi-company-logos'\)/);
 assert.doesNotMatch(sql,/drop table|truncate|delete from storage\.objects/i);
});
test('TUS only retains resumable URLs in memory and hashes exact bytes',()=>{
 assert.match(tus,/urlStorage:memoryTusUrlStorage/);
 assert.match(tus,/crypto\.subtle\.digest\('SHA-256'/);
 assert.doesNotMatch(tus,/(?:window\\.)?(?:localStorage|sessionStorage)\\.(?:setItem|removeItem)/);
 assert.match(memory,/const entries = new Map\(\)/);
 assert.match(memory,/MAX_URL_AGE_MS = 60 \* 60 \* 1000/);
 assert.match(memory,/MAX_ENTRIES = 24/);
 assert.doesNotMatch(memory,/localStorage|sessionStorage|indexedDB\.open\(/);
});
