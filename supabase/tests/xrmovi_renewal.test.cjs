// Node 22+: node --test supabase/tests/xrmovi_renewal.test.cjs
// Uses an isolated in-memory Mercado Pago and Supabase transport; never charges cards.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {test}=require('node:test');
const source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../functions/xrmovi-reconcile-subscription/index.ts'),'utf8').replace(/^import .* from "npm:.*";\r?\n/m,''));
const companyId='11111111-1111-4111-8111-111111111111';
const intentId='22222222-2222-4222-8222-222222222222';
const providerId='approved-subscription';
const datePast=new Date(Date.now()-86400000).toISOString();
const dateFuture=new Date(Date.now()+20*86400000).toISOString();
function scenario({recordStatus='active',paidThrough=datePast,invoiceStatus='approved',invoices=1,providerStatus='authorized',alreadyRecorded=false,pageSize=50,rejectPaging=false,rejectAllInvoiceSearch=false}={}){
 const sent=[],settled=new Set(alreadyRecorded?['1000']:[]);
 let record={status:recordStatus,intent_status:'paid',intent_id:intentId,provider_subscription_id:providerId,expected_amount:19.90,paid_through:paidThrough};
 const env={SUPABASE_URL:'https://db.example.test',SUPABASE_ANON_KEY:'fake-anon',SUPABASE_SERVICE_ROLE_KEY:'fake-service',XRMOVI_MP_ACCESS_TOKEN:'APP_USR-fake'};
 let handler;
 const paymentDate=new Date().toISOString();
 const invoiceItems=Array.from({length:invoices},(_,i)=>({id:String(1000+i),preapproval_id:providerId,payment:{id:String(2000+i),status:invoiceStatus},currency_id:'BRL',transaction_amount:19.90,debit_date:paymentDate}));
 const context={
  Request,Response,URL,AbortSignal,console,Deno:{env:{get:name=>env[name]},serve:callback=>{handler=callback}},
  createClient:(_url,key)=>key===env.SUPABASE_SERVICE_ROLE_KEY?{
   rpc:async(name,args)=>{
    sent.push({kind:'rpc',name,args});
    if(name==='xrmovi_checkout_provider_status'){record.status=args.new_status;return{data:true,error:null}}
    assert.equal(name,'xrmovi_checkout_settle');
    if(settled.has(args.invoice_id))return{data:{status:'duplicate'},error:null};
    settled.add(args.invoice_id);
    record.status='active';record.paid_through=dateFuture;
    return{data:{status:'paid'},error:null};
   }
  }:{
   auth:{getUser:async()=>({data:{user:{id:'signed-in-user'}},error:null})},
   rpc:async(name,args)=>{assert.equal(name,'xrmovi_checkout_reconcile_lookup');assert.equal(args.cid,companyId);return {data:{...record},error:null}}
  },
  fetch:async(url,opts)=>{
   sent.push({kind:'fetch',url:String(url),method:opts?.method||'GET'});
   assert.equal(opts?.method||'GET','GET','Reconciliation must never charge or create a subscription');
   const u=String(url);
   if(u.includes('/preapproval/'))return Response.json({id:providerId,external_reference:intentId,collector_id:10284642,status:providerStatus,auto_recurring:{currency_id:'BRL',transaction_amount:19.90}});
   if(u.includes('/authorized_payments/search')){
    if(rejectAllInvoiceSearch||(rejectPaging&&new URL(u).searchParams.has('limit')))return Response.json({error:'bad_request'},{status:400});
    const offset=Number(new URL(u).searchParams.get('offset')||0);
    return Response.json({results:invoiceItems.slice(offset,offset+pageSize),paging:{total:invoiceItems.length,limit:pageSize,offset}});
   }
   if(u.includes('/authorized_payments/')){const id=u.split('/').at(-1);return Response.json({...invoiceItems.find(i=>i.id===id)});}
   if(u.includes('/v1/payments/'))return Response.json({id:u.split('/').at(-1),status:invoiceStatus,currency_id:'BRL',live_mode:true,transaction_amount:19.90,date_approved:paymentDate});
   throw Error('unexpected endpoint '+u);
  }
 };
 vm.runInNewContext(source,context,{filename:'xrmovi-reconcile-subscription.ts'});
 return {sent,async run(){
  const response=await handler(new Request('https://db.example.test/functions/v1/xrmovi-reconcile-subscription',{method:'POST',
   headers:{origin:'https://frota.nospassa.com.br',authorization:'Bearer test-user', 'content-type':'application/json'},
   body:JSON.stringify({company_id:companyId})}));
  return{status:response.status,body:await response.json()}
 }};
}
test('expired active flag with no approved renewal does not unlock access',async()=>{
 const f=scenario({invoices:0});
 const {body}=await f.run();
 assert.equal(body.status,'pending');assert.equal(f.sent.filter(x=>x.name==='xrmovi_checkout_settle').length,0);
});
test('active flag with future expiry is still checked for missed renewal',async()=>{
 const f=scenario({paidThrough:dateFuture,invoices:1});
 const {body}=await f.run();
 assert.equal(body.status,'active');assert.equal(body.renewals_confirmed,1);
 assert.equal(f.sent.filter(x=>x.name==='xrmovi_checkout_settle').length,1);
});
test('webhook gap recovers an approved invoice without charging a card',async()=>{
 const f=scenario({invoices:1});
 const {status,body}=await f.run();
 assert.equal(status,200);assert.equal(body.status,'active');assert.equal(body.renewals_confirmed,1);
 assert.ok(f.sent.filter(x=>x.kind==='fetch').every(x=>x.method==='GET'));
});
test('already settled invoice does not extend the expiry twice',async()=>{
 const f=scenario({invoices:1,alreadyRecorded:true,paidThrough:dateFuture});
 const {body}=await f.run();
 assert.equal(body.status,'active');assert.equal(body.renewals_confirmed,0);
});
test('pending provider payment is not treated as approved',async()=>{
 const f=scenario({invoiceStatus:'pending'});
 const {body}=await f.run();
 assert.equal(body.status,'pending');assert.equal(f.sent.filter(x=>x.name==='xrmovi_checkout_settle').length,0);
});
test('canceled provider status syncs and blocks active flag',async()=>{
 const f=scenario({paidThrough:dateFuture,providerStatus:'canceled'});
 const {body}=await f.run();
 assert.equal(body.status,'inactive');assert.equal(body.provider_status,'canceled');
 assert.equal(f.sent.filter(x=>x.name==='xrmovi_checkout_provider_status').length,1);
});
test('inactive with future expiry is not reported as active',async()=>{
 const f=scenario({recordStatus:'canceled',paidThrough:dateFuture,invoices:0});
 const {body}=await f.run();assert.equal(body.status,'pending');
});

test('paginated provider result does not hide second renewal invoice',async()=>{
 const f=scenario({invoices:2,pageSize:1});const {body}=await f.run();
 assert.equal(body.status,'active');assert.equal(body.renewals_confirmed,2);
 assert.equal(f.sent.filter(x=>x.name==='xrmovi_checkout_settle').length,2);
});

test('search HTTP 400 from optional paging safely retries GET without paging',async()=>{
 const f=scenario({recordStatus:'pending',paidThrough:null,invoices:1,rejectPaging:true});
 const {status,body}=await f.run();
 assert.equal(status,200);
 assert.equal(body.status,'active');
 assert.equal(body.renewals_confirmed,1);
 assert.equal(f.sent.filter(x=>x.kind==='fetch'&&x.url.includes('/authorized_payments/search')).length,2);
 assert.ok(f.sent.filter(x=>x.kind==='fetch').every(x=>x.method==='GET'));
});
test('persistent Mercado Pago HTTP 400 never unlocks access or starts new subscription',async()=>{
 const f=scenario({recordStatus:'pending',paidThrough:null,invoices:1,rejectAllInvoiceSearch:true});
 const {status,body}=await f.run();
 assert.equal(status,502);
 assert.match(body.error,/faturas.+HTTP 400/);
 assert.equal(f.sent.filter(x=>x.kind==='rpc'&&x.name==='xrmovi_checkout_settle').length,0);
 assert.ok(f.sent.filter(x=>x.kind==='fetch').every(x=>x.method==='GET'));
});
