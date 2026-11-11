const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const modal=read('pix-checkout.js');
const onboarding=read('onboarding.js');
const panel=read('subscription-panel.js');
const edge=read('../supabase/functions/xrmovi-pix/index.ts');
const webhook=read('../supabase/functions/xrmovi-pix-webhook/index.ts');
test('Pix is a distinct manual option at signup and subscription',()=>{
 assert.match(onboarding,/value="pix"/);
 assert.match(onboarding,/openPixCheckout/);
 assert.match(panel,/xrm-bill-pix/);
 assert.match(panel,/openPixCheckout/);
 assert.match(modal,/renovação mensal manual|Renovação manual/);
});
test('Only approved verified Pix grants access; a generated QR never suffices',()=>{
 assert.match(edge,/payment\.status==="approved"/);
 assert.match(edge,/xrmovi_pix_settle/);
 assert.match(edge,/payment\.external_reference/);
 assert.match(edge,/payment\.currency_id!=="BRL"/);
 assert.match(edge,/payment\.payment_method_id!=="pix"/);
 assert.match(edge,/payment\.live_mode===false/);
 assert.doesNotMatch(modal,/status==='pending'[^]*?onPaid\(/);
});
test('Idempotency, pilot authorization and competing card cancellation are enforced',()=>{
 assert.match(edge,/X-Idempotency-Key/);
 assert.match(edge,/xrmovi_billing_pilot_allowed/);
 assert.match(edge,/xrmovi_pix_existing_card/);
 assert.match(edge,/xrmovi_pix_card_cancelled/);
 assert.match(edge,/xrmovi_pix_cancel_unlinked/);
 assert.match(edge,/getUser/);
});
test('Webhook signs notifications and re-fetches verified payment',()=>{
 assert.match(webhook,/x-signature/);
 assert.match(webhook,/crypto\.subtle\.verify/);
 assert.match(webhook,/\/v1\/payments\//);
 assert.match(webhook,/payment\.status!=="approved"/);
 assert.match(webhook,/xrmovi_pix_payment_for_webhook/);
 assert.match(webhook,/xrmovi_pix_settle/);
});
test('Pix modal uses actual MP QR code and never stores payer CPF',()=>{
 assert.match(modal,/qr_code_base64/);
 assert.match(modal,/qr_code/);
 assert.match(modal,/navigator\.clipboard\.writeText/);
 assert.match(modal,/client\.functions\.invoke\('xrmovi-pix'/);
 assert.doesNotMatch(modal,/localStorage|sessionStorage/);
});
