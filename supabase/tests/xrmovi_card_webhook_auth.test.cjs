const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {webcrypto}=require('node:crypto');
const raw=fs.readFileSync(path.join(__dirname,'../functions/xrmovi-billing-webhook/index.ts'),'utf8');
const executable=stripTypeScriptTypes(raw.replace(/^import .* from "npm:.*";\r?\n/m,''));
const secret='local-test-only-secret-do-not-use-in-production';
const id='187947785402';
async function signature({ts=String(Math.floor(Date.now()/1000)),rid='test-request-id',signedId=id,key=secret}={}){
 const k=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=await webcrypto.subtle.sign('HMAC',k,new TextEncoder().encode('id:'+signedId+';request-id:'+rid+';ts:'+ts+';'));
 return 'ts='+ts+',v1='+Buffer.from(sig).toString('hex');
}
function harness(){
 let handler;
 const calls={provider:0,database:0,logs:[]};
 vm.runInNewContext(executable,{
  Deno:{env:{get:name=>({
   XRMOVI_BILLING_ENABLED:'true',XRMOVI_MP_ACCESS_TOKEN:'APP_USR-local-test',
   XRMOVI_MP_WEBHOOK_SECRET:secret,SUPABASE_URL:'https://db.local.test',
   SUPABASE_SERVICE_ROLE_KEY:'local-service-test'
  })[name]},serve:fn=>handler=fn},
  crypto:webcrypto,TextEncoder,Uint8Array,Request,Response,URL,AbortSignal,
  console:{warn:(...args)=>calls.logs.push(args)},
  createClient:()=>{calls.database++;throw Error('Test event must not reach the database')},
  fetch:async()=>{calls.provider++;throw Error('Test event must not reach the provider')}
 });
 return {calls,invoke:async({sig,rid='test-request-id',query='data.id='+id+'&type=payment',
 body={action:'payment.updated',type:'payment',data:{id},live_mode:false}}={})=>{
  const headers={'content-type':'application/json'};
  if(sig!==undefined)headers['x-signature']=sig;
  if(rid!==null)headers['x-request-id']=rid;
  return handler(new Request('https://db.local.test/functions/v1/xrmovi-billing-webhook?'+query,{
   method:'POST',headers,body:JSON.stringify(body)
  }));
 }};
}
test('validly signed simulated event returns 200 without activating or querying payment',async()=>{
 const h=harness();
 const result=await h.invoke({sig:await signature()});
 assert.equal(result.status,200);
 assert.equal((await result.json()).ignored,'test_event');
 assert.equal(h.calls.provider,0);assert.equal(h.calls.database,0);
 assert.equal(h.calls.logs.length,0);
});
for(const [name,options,reason] of [
 ['missing signature',async()=>({}),'missing_signature'],
 ['missing request ID',async()=>({sig:await signature(),rid:null}),'missing_request_id'],
 ['malformed signature',async()=>({sig:'ts=garbage,v1=bad'}),'invalid_signature_format'],
 ['wrong key',async()=>({sig:await signature({key:'another-private-test-key'})}),'signature_mismatch'],
 ['tampered resource',async()=>({sig:await signature({signedId:'987654321'})}),'signature_mismatch'],
 ['expired timestamp',async()=>({sig:await signature({ts:String(Math.floor(Date.now()/1000)-601)})}),'timestamp_outside_window']
])test(name+' rejects without billing side effects and logs only a reason code',async()=>{
 const h=harness();
 const res=await h.invoke(await options());
 assert.equal(res.status,401);
 assert.equal(h.calls.provider,0);assert.equal(h.calls.database,0);
 assert.equal(h.calls.logs.length,1);
 assert.equal(h.calls.logs[0][1].reason,reason);
 const serialized=JSON.stringify(h.calls.logs);
 for(const forbidden of [secret,id,'test-request-id','v1='])assert.equal(serialized.includes(forbidden),false);
});
