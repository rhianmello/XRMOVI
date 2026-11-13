import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261113163000_xrmovi_audited_commercial_classifications.sql',import.meta.url),'utf8');
test('account commercial classification is additive and never modifies billing entitlement',()=>{
 assert.match(sql,/create table if not exists xrmovi\.account_commercial_labels/);
 assert.match(sql,/create table if not exists xrmovi\.account_commercial_label_audit/);
 assert.doesNotMatch(sql,/\b(delete from|truncate|update xrmovi\.billing_accounts|update xrmovi\.pix_payment_intents)\b/i);
 assert.doesNotMatch(sql,/insert into xrmovi\.account_commercial_labels\s*select/i);
});
test('classification tables default private and reject unprivileged access',()=>{
 for(const table of ['account_commercial_labels','account_commercial_label_audit']){
  assert.match(sql,new RegExp('alter table xrmovi\\.'+table+' enable row level security'));
  assert.match(sql,new RegExp('revoke all on xrmovi\\.'+table+' from public, anon, authenticated'));
 }
});
test('admin RPCs verify auth.uid and platform_admins rather than trusting metadata',()=>{
 for(const name of ['admin_commercial_labels','admin_commercial_receipts','admin_commercial_label_set'])
   assert.match(sql,new RegExp('create or replace function public\\.xrmovi_'+name));
 assert.equal((sql.match(/from xrmovi\.platform_admins a where a\.user_id=actor/g)||[]).length,3);
 assert.match(sql,/p_classification not in \('external','internal','homologation','unclassified'\)/);
 assert.match(sql,/char_length\(btrim\(p_reason\)\) not between 10 and 500/);
 assert.match(sql,/A conta proprietária não pode virar cliente comercial/);
 assert.match(sql,/insert into xrmovi\.account_commercial_label_audit/);
 assert.match(sql,/set search_path = ''/);
});
test('payment RPC returns real account_id, never guesses attribution by email',()=>{
 assert.match(sql,/'account_id',p\.account_id/);
 assert.match(sql,/status='paid'/);
 assert.match(sql,/l\.provider_payment_id=p\.provider_payment_id/);
 assert.doesNotMatch(sql,/order by confirmed_at desc limit 100/);
});
