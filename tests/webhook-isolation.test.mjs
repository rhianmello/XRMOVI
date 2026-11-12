import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const pix=readFileSync(new URL('../supabase/functions/xrmovi-pix-webhook/index.ts',import.meta.url),'utf8');
const recurring=readFileSync(new URL('../supabase/functions/xrmovi-billing-webhook/index.ts',import.meta.url),'utf8');
const sandbox=readFileSync(new URL('../supabase/functions/xrmovi-payment-sandbox/index.ts',import.meta.url),'utf8');

test('webhooks require signed notifications and reject outdated timestamps',()=>{
 for(const code of [pix,recurring]){
  assert.match(code,/x-signature/);
  assert.match(code,/x-request-id/);
  assert.match(code,/HMAC/);
  assert.match(code,/600_?000/);
  assert.match(code,/signature.*\.ok|verification\.ok/);
 }
});

test('test events cannot reach live settlement',()=>{
 assert.match(pix,/body\?\.live_mode===false\)return respond\(\{ok:true,ignored:"sandbox"\}/);
 assert.match(recurring,/body\?\.live_mode===false\)return send\(\{ok:true,ignored:"test_event"\}/);
 assert.ok(pix.indexOf('body?.live_mode===false')<pix.indexOf('xrmovi_pix_settle'));
 assert.ok(recurring.indexOf('body?.live_mode===false')<recurring.indexOf('xrmovi_checkout_settle'));
});

test('real settlements re-fetch provider details and validate entitlement',()=>{
 assert.match(pix,/api\.mercadopago\.com\/v1\/payments/);
 assert.match(pix,/payment\.external_reference/);
 assert.match(pix,/transaction_amount/);
 assert.match(pix,/payment\.status!=="approved"/);
 assert.match(recurring,/xrmovi_checkout_settle/);
});

test('sandbox cannot write commercial ledger, activate accounts, or mark webhook delivered',()=>{
 assert.match(sandbox,/xrmovi_platform_is_admin/);
 assert.match(sandbox,/XRMOVI_MP_TEST_ACCESS_TOKEN/);
 assert.match(sandbox,/XRMOVI_MP_SANDBOX_ENABLED/);
 assert.match(sandbox,/access_actually_changed:false/);
 assert.match(sandbox,/billing_ledger_changed:false/);
 assert.match(sandbox,/webhook_delivered:false/);
 assert.doesNotMatch(sandbox,/\.rpc\(["']xrmovi_(pix_settle|checkout_settle|pix_revoke)/);
});

test('HMAC manifest contract changes on request id, time or payment id',()=>{
 const key='test-secret-only';
 const signature=(id,rid,ts)=>createHmac('sha256',key).update('id:'+id.toLowerCase()+';request-id:'+rid+';ts:'+ts+';').digest('hex');
 const base=signature('12345','request-a','1794440000');
 assert.equal(base,signature('12345','request-a','1794440000'));
 assert.notEqual(base,signature('12346','request-a','1794440000'));
 assert.notEqual(base,signature('12345','request-b','1794440000'));
 assert.notEqual(base,signature('12345','request-a','1794440001'));
});

test('integrated homologation uses an internally signed webhook only after admin verification',()=>{
 assert.match(sandbox,/run_signed_webhook_hml/);
 assert.match(sandbox,/xrmovi_platform_is_admin/);
 assert.match(sandbox,/XRMOVI_MP_TEST_WEBHOOK_SECRET/);
 assert.match(sandbox,/crypto\.subtle\.sign/);
 assert.match(sandbox,/xrmovi-webhook-sandbox/);
 assert.match(sandbox,/xrmovi_hml_entitlements/);
 assert.match(sandbox,/internally_signed_simulation/);
 assert.match(sandbox,/real_mercadopago_webhook_delivery_tested:false/);
 assert.doesNotMatch(sandbox,/xrmovi_pix_settle|xrmovi_checkout_settle/);
});

test('recurring card sandbox uses test credential and a single isolated preapproval',()=>{
 assert.match(sandbox,/create_card_hml/);
 assert.match(sandbox,/inspect_card_hml/);
 assert.match(sandbox,/XRMOVI_MP_TEST_ACCESS_TOKEN/);
 assert.match(sandbox,/xrmovi_hml_card_subscriptions/);
 assert.match(sandbox,/xrmovi_hml_card_sandbox_only/);
 assert.match(sandbox,/status:"pending"/);
 assert.match(sandbox,/preapproval/);
 assert.match(sandbox,/status","not_created"/);
 assert.doesNotMatch(sandbox,/xrmovi_checkout_settle|xrmovi_pix_settle/);
});
