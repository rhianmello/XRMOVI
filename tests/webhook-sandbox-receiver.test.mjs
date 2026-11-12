import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../supabase/functions/xrmovi-webhook-sandbox/index.ts',import.meta.url),'utf8');
test('sandbox receiver verifies HMAC, request identity and timestamp',()=>{
 for(const x of ['XRMOVI_MP_TEST_WEBHOOK_SECRET','x-signature','x-request-id','crypto.subtle.verify','signature_expired','id_mismatch','signature_mismatch'])assert.ok(code.includes(x),x);
});
test('sandbox receiver cannot settle, revoke, authorize or write financial entries',()=>{
 assert.ok(code.includes('access_changed:false'));
 assert.ok(code.includes('revenue_changed:false'));
 assert.doesNotMatch(code,/createClient|\.rpc\(|\.from\(|xrmovi_pix_settle|xrmovi_checkout_settle|service_role|SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(code,/MP_ACCESS_TOKEN|api\.mercadopago\.com/);
});
