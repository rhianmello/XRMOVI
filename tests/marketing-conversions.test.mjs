import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const analytics=load('analytics/xrmovi-analytics.js');
const auth=load('auth/public-auth.js');
const admin=load('admin/index.html');
const migration=load('supabase/migrations/20261105160000_xrmovi_marketing_attribution_and_verified_conversions.sql');
const conversions=load('admin/conversions-panel.js');

test('campaign attribution only starts after analytical consent, not on an ad click alone',()=>{
 assert.match(analytics,/function captureCampaign\(\)\s*\{\s*if\(status!=='accepted'\)return;/);
 assert.match(analytics,/function syncAttribution\(client\)/);
 assert.match(analytics,/utm_source/);
 assert.match(analytics,/utm_medium/);
 assert.match(analytics,/utm_campaign/);
 assert.match(analytics,/30\*24\*60\*60\*1000/);
 assert.match(analytics,/localStorage\.removeItem\(ATTR_KEY\)/);
 assert.doesNotMatch(analytics,/gtag\(['"]event['"],['"]purchase['"]/);
});

test('attribution sync runs after authentication but never gates authorization or access',()=>{
 const login=auth.indexOf("db.auth.signInWithPassword");
 const sync=auth.indexOf('syncAttribution');
 assert.equal(login,-1,'auth code uses the auth client, not db');
 assert.ok(sync>auth.indexOf('signInWithPassword'));
 assert.ok(sync<auth.indexOf('location.replace(destination)'));
 assert.match(auth,/Promise\.race/);
});

test('confirmed sale counts originate from verified server records, not checkout or manual access',()=>{
 assert.match(migration,/from xrmovi\.billing_ledger/);
 assert.match(migration,/from xrmovi\.pix_payment_intents p/);
 assert.match(migration,/p\.status='paid'/);
 assert.match(migration,/provider_payment_id is not null/);
 assert.match(migration,/not exists \(select 1 from xrmovi\.billing_ledger/);
 assert.match(migration,/xrmovi\.platform_admins/);
 assert.match(migration,/revoke all on table xrmovi\.marketing_attribution/);
 assert.doesNotMatch(migration,/select .*manual_access_grants.* as payments/i);
});

test('only admin dashboard presents distinct paying customers and receipt revenue',()=>{
 assert.match(admin,/data-tab="conversions"/);
 assert.match(admin,/rpc\('marketing_admin_dashboard'\)/);
 assert.match(conversions,/data\.paying_customers/);
 assert.match(conversions,/data\.confirmed_revenue/);
 assert.match(conversions,/Liberações manuais, testes grátis e checkouts abertos não são vendas/);
});
