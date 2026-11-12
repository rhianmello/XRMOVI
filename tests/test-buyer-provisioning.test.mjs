import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const edge=readFileSync(new URL('../supabase/functions/xrmovi-payment-sandbox/index.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261112031000_xrmovi_hml_test_buyer_guard.sql',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('test buyer created only via authorized server endpoint and explicit action',()=>{
  assert.match(edge,/xrmovi_platform_is_admin/);
  assert.match(edge,/action==="prepare_buyer_hml"/);
  assert.match(html,/action:'prepare_buyer_hml'/);
  assert.match(html,/Contas de teste criadas não podem ser excluídas/);
  assert.match(edge,/https:\/\/api\.mercadopago\.com\/users\/test/);
  assert.doesNotMatch(html,/api\.mercadopago\.com\/users\/test/);
});

test('test-user provisioning is single-shot and persists synthetic email server-side',()=>{
  assert.match(edge,/eq\("test_buyer_state","not_created"\)/);
  assert.match(edge,/test_buyer_state:"creating"/);
  assert.match(edge,/test_buyer_state:"ready"/);
  assert.match(edge,/test_buyer_email:email/);
  assert.match(edge,/test_buyer_state:"unknown"/);
  assert.match(edge,/test_buyer_state:"rejected"/);
  assert.match(edge,/record\.test_buyer_state!=="not_created"/);
});

test('test-user creation never returns or persists password or OTP',()=>{
  assert.match(edge,/Never use or persist data\.password/);
  assert.match(sql,/REVOKE ALL ON public\.xrmovi_hml_card_subscriptions FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(edge,/test_buyer_password|test_buyer_verification_code/);
});

test('recurring card creation still remains blocked on prior rejected attempt',()=>{
  assert.match(edge,/if\(record\.provider_id\|\|record\.status!=="not_created"\)/);
  assert.match(edge,/if\(!check\.buyerTest\|\|!check\.sellerTest\|\|!check\.sameCountry\|\|!check\.buyerEmail\)/);
  assert.match(edge,/payer_email:check\.buyerEmail/);
  assert.match(edge,/\bcreated_subscription:false\b/);
});
