const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {test}=require('node:test');
const source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../functions/xrmovi-support-email/index.ts'),'utf8').replace(/^import .* from "npm:.*";\r?\n/m,''));
function fixture({authorized=true,configured=true,queue=[]}={}){
 const secret='a'.repeat(64),calls=[];
 const env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'fake-service',
  XRMOVI_RESEND_API_KEY:configured?'re_test':'',
  XRMOVI_SUPPORT_MAIL_FROM:configured?'XRMOVI <test@example.test>':''};
 let handler;
 vm.runInNewContext(source,{
  Deno:{env:{get:key=>env[key]},serve:f=>handler=f},Request,Response,AbortSignal,console,
  createClient:()=>({rpc:async(name,args)=>{
   calls.push({kind:'rpc',name,args});
   if(name==='xrmovi_support_worker_authorized')return{data:authorized&&args.p_token===secret,error:null};
   if(name==='xrmovi_support_mail_claim')return{data:queue,error:null};
   if(name==='xrmovi_support_mail_finish')return{data:null,error:null};
   throw Error(name);
  }}),
  fetch:async(url,opts)=>{calls.push({kind:'email',url,opts});return Response.json({id:'mock-sent-id'})}
 },{filename:'xrmovi-support-email.ts'});
 return {calls,secret,async send(key){
  const response=await handler(new Request('https://db.test/functions/v1/xrmovi-support-email',{method:'POST',
   headers:key?{'x-xrmovi-worker-secret':key}:{},body:'{}'}));
  return{code:response.status,body:await response.json()};
 }};
}
test('public POST without secret cannot process support outbox',async()=>{
 const f=fixture({queue:[{id:'test'}]});const out=await f.send();assert.equal(out.code,401);assert.equal(f.calls.length,0);
});
test('invalid cron token cannot claim messages',async()=>{
 const f=fixture();const out=await f.send('b'.repeat(64));assert.equal(out.code,401);
 assert.equal(f.calls.some(x=>x.name==='xrmovi_support_mail_claim'),false);
});
test('authorized worker keeps queue when provider is not configured',async()=>{
 const f=fixture({configured:false});const out=await f.send(f.secret);
 assert.equal(out.code,503);assert.equal(out.body.status,'not_configured');
 assert.equal(f.calls.some(x=>x.name==='xrmovi_support_mail_claim'),false);
});
test('authorized worker sends once through fake provider and finishes queue',async()=>{
 const messageId='11111111-1111-4111-8111-111111111111';
 const f=fixture({queue:[{id:'22222222-2222-4222-8222-222222222222',message_id:messageId,company:'Teste',sender:'Contato'}]});
 const out=await f.send(f.secret);
 assert.equal(out.code,200);assert.equal(out.body.sent,1);assert.equal(out.body.failed,0);
 const email=f.calls.find(x=>x.kind==='email');
 assert.equal(email.opts.headers['Idempotency-Key'],messageId);
 assert.equal(email.url,'https://api.resend.com/emails');
 assert.equal(f.calls.filter(x=>x.name==='xrmovi_support_mail_finish').length,1);
});
