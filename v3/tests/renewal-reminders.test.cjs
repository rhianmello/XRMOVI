const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../renewal-reminder.js'),'utf8');
const worker=fs.readFileSync(path.join(__dirname,'../../supabase/functions/xrmovi-renewal-email/index.ts'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const subscription=fs.readFileSync(path.join(__dirname,'../subscription-panel.js'),'utf8');
const adapter=fs.readFileSync(path.join(__dirname,'../xrmovi-adapter.js'),'utf8');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const today=new Date('2026-11-03T12:00:00.000Z');
const state=(days,provider='mercadopago_pix',more={})=>({
 status:'active',provider,owner:true,
 paid_through:new Date(today.getTime()+days*86400000).toISOString(),...more
});
test('Pix notices count 7, 3 and 1 day by Sao Paulo calendar dates',async()=>{
 const {renewalNotice}=await load();
 for(const days of [7,3,1]){
  const notice=renewalNotice(state(days),today);
  assert.equal(notice.days,days);
  assert.equal(notice.pix,true);
  assert.match(notice.detail,/renovação é manual/);
 }
});
test('Card notices never instruct a Pix duplicate payment',async()=>{
 const {renewalNotice}=await load();
 const notice=renewalNotice(state(3,'mercadopago'),today);
 assert.equal(notice.card,true);
 assert.match(notice.detail,/automática/);
 assert.match(notice.detail,/não faça um Pix adicional/);
});
test('Outside window and unpaid accounts show no renewal nag',async()=>{
 const {renewalNotice}=await load();
 assert.equal(renewalNotice(state(8),today),null);
 assert.equal(renewalNotice(state(7,'mercadopago_pix',{status:'pending'}),today),null);
 assert.equal(renewalNotice(state(7,'untrusted_provider'),today),null);
});
test('Due today and expired status give appropriately urgent messages',async()=>{
 const {renewalNotice}=await load();
 const due=renewalNotice(state(0),today);
 assert.match(due.title,/vence hoje/);
 const overdue=renewalNotice(state(-1,'mercadopago_pix',{status:'past_due'}),today);
 assert.equal(overdue.tone,'critical');
});
test('Worker checks signed cron token, paid account state, and idempotent email sends',()=>{
 assert.match(worker,/x-xrmovi-worker-secret/);
 assert.match(worker,/xrmovi_support_worker_authorized/);
 assert.match(worker,/xrmovi_renewal_mail_claim/);
 assert.match(worker,/xrmovi_renewal_mail_current/);
 assert.match(worker,/Idempotency-Key/);
 assert.match(worker,/xrmovi_renewal_mail_finish/);
 assert.match(worker,/mercadopago_pix/);
 assert.match(worker,/XRMOVI_RESEND_API_KEY/);
});
test('Global dashboard and subscription panel render renewal notices',()=>{
 assert.match(html,/id="xrm-renewal-banner"/);
 assert.match(adapter,/refreshRenewalBanner/);
 assert.match(subscription,/id="xrm-bill-renewal"/);
 assert.match(subscription,/renewalNotice\(info\)/);
});
