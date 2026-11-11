const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const src=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../functions/xrmovi-cancel-subscription/index.ts'),'utf8')
 .replace(/^import .* from "npm:.*";\r?\n/m,''));
const account='11111111-1111-4111-8111-111111111111';
const company='22222222-2222-4222-8222-222222222222';
const intent='33333333-3333-4333-8333-333333333333';
const preapproval='live-existing-subscription-id';
const user='44444444-4444-4444-8444-444444444444';
function scenario({providerState='authorized',externalReference=intent,merchant=10284642,
 price=19.9,failPut=false,targetError=false,recordError=false,authorized=true}={}){
 const calls={provider:[],rpcs:[]}; let handler;
 const env={SUPABASE_URL:'https://db.example.test',SUPABASE_ANON_KEY:'anon-test',
 SUPABASE_SERVICE_ROLE_KEY:'service-test',XRMOVI_MP_ACCESS_TOKEN:'APP_USR-mocked'};
 const data={id:preapproval,external_reference:externalReference,collector_id:merchant,
 status:providerState,auto_recurring:{currency_id:'BRL',transaction_amount:price}};
 const context={
  Request,Response,URL,AbortSignal,console,
  Deno:{env:{get:k=>env[k]},serve:f=>handler=f},
  createClient:(_url,key)=>key==='anon-test'
   ?{auth:{getUser:async()=>({data:{user:authorized?{id:user}:null},error:authorized?null:{message:'bad session'}})}}
   :{rpc:async(name,args)=>{
    calls.rpcs.push({name,args});
    if(name==='xrmovi_billing_cancel_target')return targetError?{data:null,error:{message:'not authorized'}}:{
     data:{account_id:account,preapproval_id:preapproval,reference_id:intent,amount_brl:19.9,
      actor_id:user,financial_status:'active',channel:args.p_account?'administrator':'customer'},error:null};
    if(name==='xrmovi_billing_cancel_record')return recordError?{data:null,error:{message:'db error'}}:
      {data:{status:'canceled',paid_through:'2026-12-05T00:00:00Z',retains_access:true},error:null};
    throw Error('Unexpected RPC '+name);
   }},
  fetch:async(url,opts)=>{
   calls.provider.push({url:String(url),method:opts.method,body:opts.body});
   assert.ok(String(url).startsWith('https://api.mercadopago.com/preapproval/'));
   if(opts.method==='PUT'){
    if(failPut)return Response.json({error:'rejected'},{status:503});
    data.status='canceled';return Response.json({...data});
   }
   assert.equal(opts.method,'GET');
   return Response.json({...data});
  }
 };
 vm.runInNewContext(src,context,{filename:'cancel-subscription.ts'});
 return {calls,async run(body={company_id:company},authorization='Bearer valid-user-jwt'){
  const response=await handler(new Request('https://db.example.test/functions/v1/xrmovi-cancel-subscription',{
   method:'POST',headers:{Authorization:authorization,'content-type':'application/json'},body:JSON.stringify(body)
  }));
  return {status:response.status,body:await response.json()};
 }};
}
test('authenticated customer cancels provider first and records DB only after confirmation',async()=>{
 const h=scenario(),res=await h.run();
 assert.equal(res.status,200);assert.equal(res.body.status,'canceled');assert.equal(res.body.retains_access,true);
 assert.equal(h.calls.provider.filter(x=>x.method==='PUT').length,1);
 assert.equal(h.calls.provider.filter(x=>x.method==='GET').length,2);
 assert.deepEqual(h.calls.rpcs.map(x=>x.name),['xrmovi_billing_cancel_target','xrmovi_billing_cancel_record']);
 assert.equal(h.calls.rpcs[1].args.p_channel,'customer');
 assert.ok(!h.calls.provider.some(x=>x.method==='POST'));
});
test('administrator uses explicit account scope and reason',async()=>{
 const h=scenario();const result=await h.run({account_id:account,reason:'Solicitação confirmada pelo cliente'});
 assert.equal(result.status,200);assert.equal(h.calls.rpcs[1].args.p_channel,'administrator');
});
test('bad session never touches Mercado Pago or billing RPC',async()=>{
 const h=scenario({authorized:false});const res=await h.run();
 assert.equal(res.status,401);assert.equal(h.calls.provider.length,0);assert.equal(h.calls.rpcs.length,0);
});
test('no way to supply account and company simultaneously',async()=>{
 const h=scenario();const res=await h.run({account_id:account,company_id:company,reason:'Solicitação confirmada pelo cliente'});
 assert.equal(res.status,400);assert.equal(h.calls.provider.length,0);
});
test('target must authorize owner/admin in server RPC before provider call',async()=>{
 const h=scenario({targetError:true});const res=await h.run();
 assert.equal(res.status,403);assert.equal(h.calls.provider.length,0);assert.equal(h.calls.rpcs.length,1);
});
test('provider mismatch cannot cancel another merchant subscription',async()=>{
 for(const config of [{merchant:99},{externalReference:'ffffffff-ffff-ffff-ffff-ffffffffffff'},{price:17.9}]){
  const h=scenario(config),res=await h.run();
  assert.equal(res.status,409);assert.equal(h.calls.provider.filter(x=>x.method==='PUT').length,0);
  assert.equal(h.calls.rpcs.filter(x=>x.name==='xrmovi_billing_cancel_record').length,0);
 }
});
test('provider failure leaves DB unchanged for safe retries',async()=>{
 const h=scenario({failPut:true});const res=await h.run();
 assert.equal(res.status,502);assert.equal(h.calls.rpcs.filter(x=>x.name==='xrmovi_billing_cancel_record').length,0);
});
test('already canceled at provider is idempotent and records locally without repeating PUT',async()=>{
 const h=scenario({providerState:'canceled'}),res=await h.run();
 assert.equal(res.status,200);assert.equal(h.calls.provider.filter(x=>x.method==='PUT').length,0);
 assert.equal(h.calls.rpcs.filter(x=>x.name==='xrmovi_billing_cancel_record').length,1);
});
test('database error after provider cancellation reports synchronization needed',async()=>{
 const h=scenario({recordError:true});const res=await h.run();
 assert.equal(res.status,503);assert.match(res.body.error,/Mercado Pago cancelou/);
 assert.equal(h.calls.provider.filter(x=>x.method==='PUT').length,1);
});
test('source includes no refunds and owner/admin SQL role checks',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../billing-cancellation.sql'),'utf8');
 assert.match(sql,/a\.owner_id=p_actor/);
 assert.match(sql,/platform_admins where user_id=p_actor/);
 assert.match(sql,/auth\.jwt\(\)->>'role'/);
 assert.match(sql,/grant execute.*service_role/i);
 assert.match(src,/status:"canceled"/);
 assert.doesNotMatch(src,/\/v1\/payments\/.*refund/);
});
