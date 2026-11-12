import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sandbox=readFileSync(new URL('../supabase/functions/xrmovi-payment-sandbox/index.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261112024600_xrmovi_hml_card_lifecycle.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('only the server may call Mercado Pago preapproval with a separate secret',()=>{
 assert.match(sandbox,/Deno\.env\.get\("XRMOVI_MP_TEST_ACCESS_TOKEN"\)/);
 assert.match(sandbox,/api\.mercadopago\.com\/preapproval/);
 assert.match(sandbox,/Authorization:"Bearer "/);
 assert.doesNotMatch(page,/api\.mercadopago\.com\/preapproval/);
 assert.match(sandbox,/mpToken===liveToken/);
 assert.match(sandbox,/xrmovi_platform_is_admin/);
});

test('pending subscription payload is complete and generated server-side',()=>{
 for(const fragment of [
  'external_reference:reference','payer_email:check.buyerEmail',
  'frequency:1','frequency_type:"months"','end_date:new Date(',
  'transaction_amount:19.90','currency_id:"BRL"',
  'back_url:"https://xrmovi.com.br/"','status:"pending"'
 ])assert.ok(sandbox.includes(fragment),fragment);
});

test('local statuses are separate from provider payment states',()=>{
 assert.match(migration,/check \(status in \('not_created','creating','created','rejected','unknown'\)\)/);
 assert.match(sandbox,/status:"creating"/);
 assert.match(sandbox,/status:"created",provider_id:/);
 assert.match(sandbox,/status:"rejected",error_id:errorId,error_details:diagnostic/);
 assert.match(sandbox,/provider_status:String\(body\.status\|\|"pending"\)/);
 assert.match(page,/Status local:/);
});

test('HTTP errors have UUID correlation and only sanitized diagnosis',()=>{
 assert.match(sandbox,/const diagnostic=mpError\(body,response\.status\),errorId=crypto\.randomUUID\(\)/);
 assert.match(sandbox,/console\.error\("XRMOVI sandbox preapproval rejected"/);
 assert.match(sandbox,/error_id:errorId/);
 assert.match(sandbox,/cause\}/);
 assert.match(sandbox,/\[redacted\]/);
 assert.doesNotMatch(sandbox,/console\.log\(payload\)/);
});

test('retried remote creation stays blocked until exhaustive recovery and seller/buyer verification',()=>{
 assert.match(sandbox,/if\(!check\.buyerTest\|\|!check\.sellerTest\|\|!check\.buyerEmail\)/);
 assert.match(sandbox,/if\(!existing\.complete\|\|existing\.found\?\.length\)/);
 assert.match(sandbox,/if\(record\.provider_id\|\|record\.status!=="not_created"\)/);
 assert.match(sandbox,/status:"creating",error_id:null/);
 assert.match(sandbox,/record\.status==="not_created"/);
 assert.match(sandbox,/action==="diagnose_card_hml"/);
 assert.doesNotMatch(sandbox,/xrmovi_checkout_settle|xrmovi_pix_settle/);
});
