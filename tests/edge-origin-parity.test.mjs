import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('commercial cancellation CORS fallback uses current xrmovi.com.br',()=>{
 const s=text('supabase/functions/xrmovi-cancel-subscription/index.ts');
 assert.match(s,/"access-control-allow-origin":origin\|\|"https:\/\/xrmovi\.com\.br"/);
 assert.doesNotMatch(s,/"access-control-allow-origin":origin\|\|"https:\/\/frota\.nospassa\.com\.br"/);
 assert.match(s,/xrmovi_billing_cancel_target/);
 assert.match(s,/xrmovi_billing_cancel_record/);
});
test('consented visitor API strictly recognizes canonical domain and service RPC',()=>{
 const s=text('supabase/functions/xrmovi-widget-visit/index.ts');
 assert.match(s,/req\.headers\.get\("origin"\)!==ORIGIN/);
 assert.match(s,/const ORIGIN = "https:\/\/xrmovi\.com\.br"/);
 assert.match(s,/req\.method!=="POST"/);
 assert.match(s,/xrmovi_widget_record_visit/);
 assert.match(s,/SUPABASE_SERVICE_ROLE_KEY/);
});
