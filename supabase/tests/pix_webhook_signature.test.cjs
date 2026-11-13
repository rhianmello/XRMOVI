const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../functions/xrmovi-pix-webhook/index.ts'),'utf8');
const executable=stripTypeScriptTypes(source.replace(/^import .* from "npm:.*";\r?\n/m,''));
const secret='test-webhook-secret-never-a-real-credential',id='123456789';
async function signature({ts=String(Math.floor(Date.now()/1000)),rid='test-request-id',signedId=id,key=secret}={}){
 const signingKey=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await webcrypto.subtle.sign('HMAC',signingKey,new TextEncoder().encode(`id:${signedId};request-id:${rid};ts:${ts};`));
 return `ts=${ts},v1=${Buffer.from(bytes).toString('hex')}`;
}
function harness(){
 const calls={provider:0,database:0,logs:[]};let handler;
 vm.runInNewContext(executable,{
  Deno:{env:{get:name=>({XRMOVI_BILLING_ENABLED:'true',XRMOVI_MP_ACCESS_TOKEN:'APP_USR-test',XRMOVI_MP_WEBHOOK_SECRET:secret,SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'test-service-key'})[name]},serve:fn=>{handler=fn}},
  crypto:webcrypto,TextEncoder,Uint8Array,Request,Response,URL,AbortSignal,
  console:{warn:(...args)=>calls.logs.push(args)},
  fetch:async()=>{calls.provider++;return new Response(JSON.stringify({id,payment_method_id:'pix',currency_id:'BRL',live_mode:true,status:'approved'}));},
  createClient:()=>({rpc:async()=>{calls.database++;return {data:null,error:null};}})
 });
 return {calls,invoke:async({sig,rid='test-request-id',query=`data.id=${id}&type=payment`,body={type:'payment',data:{id},live_mode:true}}={})=>{
  const headers={'content-type':'application/json'};if(sig!==undefined)headers['x-signature']=sig;if(rid!==null)headers['x-request-id']=rid;
  return handler(new Request('https://database.test/functions/v1/xrmovi-pix-webhook?'+query,{method:'POST',headers,body:JSON.stringify(body)}));
 }};
}
test('valid signed payment is verified at provider before database lookup',async()=>{
 const h=harness();const response=await h.invoke({sig:await signature()});assert.equal(response.status,200);assert.equal(h.calls.provider,1);assert.equal(h.calls.database,1);assert.deepEqual(h.calls.logs,[]);
});
for(const [name,options,reason] of [
 ['missing signature',async()=>({}),'missing_signature'],
 ['missing request id',async()=>({sig:await signature(),rid:null}),'missing_request_id'],
 ['malformed signature',async()=>({sig:'ts=bad,v1=bad'}),'invalid_signature_format'],
 ['wrong secret',async()=>({sig:await signature({key:'different-test-secret'})}),'signature_mismatch'],
 ['tampered resource',async()=>({sig:await signature({signedId:'987654321'})}),'signature_mismatch'],
 ['expired signature',async()=>({sig:await signature({ts:String(Math.floor(Date.now()/1000)-601)})}),'timestamp_outside_window'],
 ['future signature',async()=>({sig:await signature({ts:String(Math.floor(Date.now()/1000)+601)})}),'timestamp_outside_window']
])test(name+' cannot reach provider or database and logs only reason',async()=>{
 const h=harness();const response=await h.invoke(await options());assert.equal(response.status,401);assert.equal(h.calls.provider,0);assert.equal(h.calls.database,0);
 assert.equal(h.calls.logs.length,1);assert.equal(h.calls.logs[0][1].reason,reason);
 const log=JSON.stringify(h.calls.logs);assert.equal(log.includes(secret),false);assert.equal(log.includes(id),false);assert.equal(log.includes('test-request-id'),false);assert.equal(log.includes('v1='),false);
});
test('legacy unsigned IPN is acknowledged but never grants access or calls provider',async()=>{
 const h=harness();
 const response=await h.invoke({query:`id=${id}&topic=payment`});
 assert.equal(response.status,200);
 assert.equal((await response.json()).ignored,'legacy_unsigned_ipn');
 assert.equal(h.calls.provider,0);assert.equal(h.calls.database,0);
 assert.equal(h.calls.logs.length,1);
 assert.equal(h.calls.logs[0][1].reason,'legacy_unsigned_ipn_ignored');
 assert.equal(JSON.stringify(h.calls.logs).includes(id),false);
});
test('legacy IPN with a missing or invalid id is rejected without side effects',async()=>{
 for(const query of ['topic=payment','topic=payment&id=not-a-payment','topic=merchant_order&id=123456789']){
  const h=harness();const response=await h.invoke({query});
  assert.equal(response.status,400);assert.equal(h.calls.provider,0);assert.equal(h.calls.database,0);
 }
});
test('legacy query with x-signature but no signed data.id cannot bypass verification',async()=>{
 const h=harness();const response=await h.invoke({query:`id=${id}&topic=payment`,sig:await signature()});
 assert.equal(response.status,400);assert.equal(h.calls.provider,0);assert.equal(h.calls.database,0);
});

test('signature in milliseconds is supported; signed body mismatch never reaches provider',async()=>{
 const h=harness();const response=await h.invoke({sig:await signature({ts:String(Date.now())}),body:{type:'payment',data:{id:'987654321'}}});assert.equal(response.status,400);assert.equal(h.calls.provider,0);assert.equal(h.calls.database,0);
});
