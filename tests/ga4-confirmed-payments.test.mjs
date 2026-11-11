import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const schema=read('supabase/migrations/20261105180000_xrmovi_ga4_verified_purchase_outbox.sql');
const worker=read('supabase/functions/xrmovi-ga4-purchase/index.ts');
const analytics=read('analytics/xrmovi-analytics.js');
const bridge=read('analytics/xrmovi-bridge.js');
const dashboard=read('v3/index.html');

test('purchases are queued only by newly confirmed Pix or inserted card ledger',()=>{
 assert.match(schema,/after update of status on xrmovi\.pix_payment_intents/i);
 assert.match(schema,/new\.status='paid'/);
 assert.match(schema,/after insert on xrmovi\.billing_ledger/i);
 assert.match(schema,/on conflict\(transaction_id\) do nothing/);
 assert.match(schema,/new\.provider_payment_id/);
 assert.match(schema,/c\.consent=true and c\.client_id is not null/);
 assert.doesNotMatch(schema,/insert into xrmovi\.billing_ledger/i);
});

test('GA4 events are purchase events, verified and never sent by public Javascript',()=>{
 assert.match(worker,/name:"purchase"/);
 assert.match(worker,/transaction_id:/);
 assert.match(worker,/currency:"BRL"/);
 assert.match(worker,/Deno\.env\.get\("XRMOVI_GA4_API_SECRET"\)/);
 assert.match(worker,/rpc\("xrmovi_ga4_delivery_claim"/);
 assert.match(worker,/rpc\("xrmovi_support_worker_authorized"/);
 assert.doesNotMatch(analytics,/gtag\('event','purchase'/);
 assert.doesNotMatch(bridge,/XRMOVI_GA4_API_SECRET/);
});

test('visitor identity respects consent, revocation, and suppresses arbitrary query strings',()=>{
 assert.match(analytics,/function syncPurchaseIdentity\(client\)/);
 assert.match(analytics,/p_consent:false/);
 assert.match(analytics,/p_consent:true/);
 assert.match(analytics,/CLIENT_PATTERN\.test/);
 assert.match(analytics,/const source=new URLSearchParams\(location\.search\)/);
 assert.match(analytics,/gclid/);
 assert.match(dashboard,/xrmovi-bridge\.js/);
});

test('delivery is separately authorized, bounded and retried',()=>{
 assert.match(schema,/auth\.jwt\(\)->>'role'/);
 assert.match(schema,/next_attempt_at<=now\(\)/);
 assert.match(schema,/o\.attempts<5/);
 assert.match(schema,/for update of o skip locked/);
 assert.match(worker,/x-xrmovi-worker-secret/);
 assert.match(worker,/response\.status===204\|\|response\.status===200/);
});
