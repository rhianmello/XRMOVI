const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../migrations/20261113140000_xrmovi_widget_visit_service_jwt.sql'),'utf8');
test('visitor widget requires service_role in signed claims, not legacy deprecated setting',()=>{
 assert.match(source,/auth\.jwt\(\)->>'role'/);
 assert.doesNotMatch(source,/current_setting\('request\.jwt\.claim\.role'/);
 assert.match(source,/is distinct from 'service_role'/);
 assert.match(source,/errcode = '42501'/);
});
test('visitor widget does not expose direct writes and preserves daily deduplication',()=>{
 assert.match(source,/revoke all on function public\.xrmovi_widget_record_visit\(uuid\) from public, anon, authenticated/);
 assert.match(source,/grant execute on function public\.xrmovi_widget_record_visit\(uuid\) to service_role/);
 assert.match(source,/on conflict\(day,visitor_id\)/);
 assert.match(source,/America\/Sao_Paulo/);
});
