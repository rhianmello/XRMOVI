const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

const onboarding=read('v3/onboarding.js');
const panel=read('v3/subscription-panel.js');
const readiness=read('supabase/functions/xrmovi-billing-readiness/index.ts');
const checkout=read('supabase/functions/xrmovi-create-subscription/index.ts');
const diagnostics=read('supabase/functions/xrmovi-billing-diagnostics/index.ts');

test('card onboarding does not silently ignore disabled checkout', () => {
 assert.match(onboarding, /reason==='pilot_only'/);
 assert.match(onboarding, /Nenhuma cobrança foi iniciada/);
 assert.match(onboarding, /xrm-bill-plan-feedback/);
 assert.doesNotMatch(onboarding, /if\(readiness\.error\|\|readiness\.data\?\.enabled!==true\)return;/);
});
test('billing controls are disabled until readiness is verified, with safe retry', () => {
 assert.match(panel, /checkoutButton\.disabled=!allowCheckout/);
 assert.match(panel, /pixButton\.disabled=!allowCheckout/);
 assert.match(panel, /xrm-bill-retry-readiness/);
 assert.match(panel, /reason==='pilot_only'/);
 assert.match(panel, /Nenhuma cobrança foi criada/);
});
test('server readiness requires valid provider config and does not bypass pilot', () => {
 assert.match(readiness, /XRMOVI_BILLING_ENABLED/);
 assert.match(readiness, /XRMOVI_BILLING_PILOT_ONLY/);
 assert.match(readiness, /xrmovi_billing_pilot_allowed/);
 assert.match(readiness, /provider_not_ready/);
 assert.match(readiness, /pilot_only/);
 assert.match(checkout, /xrmovi_billing_pilot_allowed/);
 assert.match(checkout, /status:"pending"/);
});
test('admin makes pilot-only launch risk visible',()=>{
 assert.match(diagnostics, /billing_pilot_only/);
 assert.match(read('admin/index.html'), /XRMOVI em piloto/);
 assert.match(read('admin/index.html'), /XRMOVI_BILLING_PILOT_ONLY/);
 assert.match(read('admin/index.html'), /assinatura dos webhooks/);
});

test('payer gets exact checkout-email guidance before redirect',()=>{
 const notice=read('v3/payment-email-notice.js');
 assert.match(onboarding,/createPaymentEmailNotice\(client\)/);
 assert.match(panel,/createPaymentEmailNotice\(client\)/);
 assert.match(notice,/data\?\.user\?\.email/);
 assert.match(notice,/ATENÇÃO — USE O E-MAIL DO CADASTRO/);
 assert.match(notice,/No Mercado Pago, digite exatamente este e-mail/);
});
test('returning buyer is reconciled from Mercado Pago without a new charge',()=>{
 assert.match(panel,/xrmovi-reconcile-subscription/);
 assert.match(panel,/checkedAfterReturn/);
 assert.match(panel,/reconcileOnce\(base\.id\)/);
 assert.match(panel,/reconcili|Conferindo pagamento/);
 assert.match(panel,/current\?\.status!=='active'/);
});

test('first onboarding screen offers a payment-only verification for existing checkout',()=>{
 assert.match(onboarding,/id='xrm-onboarding-verify-payment'/);
 assert.match(onboarding,/Já paguei · Verificar pagamento/);
 assert.match(onboarding,/functions\.invoke\('xrmovi-reconcile-subscription'/);
 assert.match(onboarding,/company_id:existing\.id/);
 assert.match(onboarding,/Nenhuma cobrança será feita/);
 assert.match(onboarding,/window.location.hash==='#subscription'/);
 assert.match(onboarding,/checkExistingPayment\(\)/);
 const email=read('v3/payment-email-notice.js');
 assert.match(email,/border:0;background:transparent/);
 assert.doesNotMatch(email,/background:#3d1920/);
});
