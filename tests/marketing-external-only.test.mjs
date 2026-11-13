import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261113203000_xrmovi_marketing_external_only_verified.sql',import.meta.url),'utf8');
const panel=readFileSync(new URL('../admin/conversions-panel.js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');

test('sales report fails closed for non-admins and does not mutate customers, payments or tracking',()=>{
 assert.match(sql,/create or replace function public\.xrmovi_marketing_admin_dashboard_verified/);
 assert.match(sql,/security definer/);
 assert.match(sql,/set search_path = ''/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/from xrmovi\.platform_admins pa/);
 assert.match(sql,/errcode = '42501'/);
 assert.match(sql,/revoke all on function public\.xrmovi_marketing_admin_dashboard_verified\(\)/);
 assert.doesNotMatch(sql,/\b(?:delete from|update xrmovi\.|insert into xrmovi\.|truncate)\b/i);
});
test('only explicitly classified external non-owner accounts are counted',()=>{
 assert.match(sql,/join xrmovi\.account_commercial_labels c/);
 assert.match(sql,/c\.classification = 'external'/);
 assert.match(sql,/not exists \(\s*select 1 from xrmovi\.platform_admins p/);
 assert.match(sql,/from commercial_recent/);
 assert.match(sql,/join eligible a on a\.id = p\.account_id/);
 assert.match(sql,/from eligible a[\s\S]*?left join xrmovi\.marketing_attribution/);
 assert.doesNotMatch(sql,/like '%teste%'|user_meta_data.*admin/i);
});
test('Pix receipts are de-duplicated and technical history is separate from sales',()=>{
 assert.match(sql,/from xrmovi\.billing_ledger l/);
 assert.match(sql,/from xrmovi\.pix_payment_intents p/);
 assert.match(sql,/p\.status='paid'/);
 assert.match(sql,/l\.provider_payment_id = p\.provider_payment_id/);
 assert.match(sql,/'historical_payments'/);
 assert.match(sql,/'historical_revenue'/);
 assert.match(sql,/'unclassified_accounts'/);
 assert.match(sql,/'excluded_payments'/);
});
test('browser must refuse unclassified report and never use the unfiltered marketing RPC',()=>{
 assert.match(admin,/rpc\('marketing_admin_dashboard_verified'\)/);
 assert.doesNotMatch(admin,/rpc\('marketing_admin_dashboard'\)/);
 assert.match(panel,/data\?\.scope!=='classified_external_only'/);
 assert.match(panel,/Nenhum dado financeiro será exibido como venda externa/);
 assert.match(panel,/Auditoria do histórico bruto:/);
 assert.match(panel,/data\.unclassified_accounts/);
 assert.match(panel,/data\.excluded_payments/);
});
test('server report carries campaign revenue only for classified accounts',()=>{
 assert.match(sql,/from eligible a[\s\S]*?left join per_account ap on ap\.account_id = a\.id/);
 assert.match(sql,/'campaigns'/);
 assert.match(panel,/não confirmam atribuição Google Ads/);
});
