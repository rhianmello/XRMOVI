import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../supabase/functions/xrmovi-webhook-sandbox/index.ts',import.meta.url),'utf8');
test('sandbox receiver verifies HMAC, request identity and timestamp',()=>{
 for(const x of ['XRMOVI_MP_TEST_WEBHOOK_SECRET','x-signature','x-request-id','crypto.subtle.verify','signature_expired','id_mismatch','signature_mismatch'])assert.ok(code.includes(x),x);
});
test('sandbox receiver writes only isolated entitlements after verified sandbox order',()=>{
 assert.match(code,/xrmovi_hml_entitlements/);
 assert.match(code,/xrmovi_hml_/);
 assert.match(code,/order\.status/);
 assert.match(code,/accredited/);
 assert.match(code,/XRMOVI_MP_TEST_ACCESS_TOKEN/);
 assert.match(code,/signature_valid:true/);
 assert.doesNotMatch(code,/\.rpc\(|xrmovi_pix_settle|xrmovi_checkout_settle|xrmovi_pix_revoke|billing_ledger|client_access|billing_accounts/);
 assert.doesNotMatch(code,/api\.mercadopago\.com\/v1\/payments/);
});
