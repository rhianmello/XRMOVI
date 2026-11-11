const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(
 fs.readFileSync(path.join(__dirname,'../functions/xrmovi-billing-sweep/index.ts'),'utf8')
 .replace(/^import .* from "npm:.*";\r?\n/m,'')
);
const intent='11111111-1111-4111-8111-111111111111';
const preapproval='existing-provider-subscription';
const amount=19.9;
const now=new Date().toISOString();
function harness({auth=true,merchant=10284642,providerStatus='authorized',paymentStatus='approved',live=true,invoiceCount=1}={}){
 const env={XRMOVI_BILLING_ENABLED:'true',XRMOVI_MP_ACCESS_TOKEN:'APP_USR-fake',
 SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'service-role-stub'};
 const calls={reads:[],settlements:[],validated:0};
 let handler;
 const subscription={id:preapproval,external_reference:intent,collector_id:merchant,status:providerStatus,
 auto_recurring:{currency_id:'BRL',transaction_amount:amount}};
 const invoice={id:'1001',preapproval_id:preapproval,payment:{id:'2001',status:paymentStatus},
 transaction_amount:amount,currency_id:'BRL',debit_date:now};
 const providerPayment={id:'2001',status:paymentStatus,live_mode:live,
 transaction_amount:amount,currency_id:'BRL',date_approved:now};
 const context={
  Request,Response,URL,AbortSignal,console,
  Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},
  createClient:()=>({rpc:async(name,args)=>{
   if(name==='xrmovi_support_worker_authorized'){calls.validated++;return {data:auth,error:null};}
   if(name==='xrmovi_billing_pending_for_worker')return {data:[{intent_id:intent,provider_id:preapproval,amount}],error:null};
   if(name==='xrmovi_checkout_settle'){calls.settlements.push(args);return {data:{status:'paid'},error:null};}
   throw Error('Unexpected RPC '+name);
  }}),
  fetch:async(url,options)=>{
   const address=String(url);const method=options?.method||'GET';
   assert.equal(method,'GET','No payment creation or cancellation permitted');
   calls.reads.push(address);
   if(address.endsWith('/preapproval/'+preapproval))return Response.json(subscription);
   if(address.includes('/authorized_payments/search'))return Response.json({results:invoiceCount?[invoice]:[],paging:{total:invoiceCount}});
   if(address.endsWith('/authorized_payments/1001'))return Response.json(invoice);
   if(address.endsWith('/v1/payments/2001'))return Response.json(providerPayment);
   throw Error('Unexpected provider path '+address);
  }
 };
 vm.runInNewContext(source,context,{filename:'billing-sweep.ts'});
 return {calls,async run(secret='a'.repeat(64)){
  const response=await handler(new Request('https://db.example.test/functions/v1/xrmovi-billing-sweep',{
   method:'POST',headers:{'x-xrmovi-worker-secret':secret}
  }));
  return {status:response.status,body:await response.json()};
 }};
}
test('missing worker authentication cannot touch payment provider',async()=>{
 const h=harness();const result=await h.run('');
 assert.equal(result.status,401);assert.equal(h.calls.reads.length,0);assert.equal(h.calls.settlements.length,0);
});
test('invalid authenticated worker cannot touch payment provider',async()=>{
 const h=harness({auth:false});const result=await h.run();
 assert.equal(result.status,401);assert.equal(h.calls.reads.length,0);
});
test('verified recurring invoice recovers activation with GET-only provider requests',async()=>{
 const h=harness();const result=await h.run();
 assert.equal(result.status,200);assert.equal(result.body.approved,1);
 assert.equal(h.calls.settlements.length,1);assert.equal(h.calls.settlements[0].paid_amount,amount);
 assert.equal(h.calls.reads.length,4);
});
test('wrong merchant or pending invoice never activates a subscription',async()=>{
 for(const config of [{merchant:4444},{paymentStatus:'pending'},{live:false},{providerStatus:'pending'}]){
  const h=harness(config);const result=await h.run();
  assert.equal(result.status,200);assert.equal(result.body.approved,0);assert.equal(h.calls.settlements.length,0);
 }
});
