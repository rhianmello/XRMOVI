'use strict';
// XRMOVI Etapa 9: real, read-only integration reachability checks.
// NO account creation, email delivery, payment, subscription or analytics event is sent.
const {test}=require('node:test');
const assert=require('node:assert/strict');

const SITE='https://xrmovi.com.br';
const PROJECT='https://ztqtcbzjesrkuaijmylm.supabase.co';
const timeout=15000;
async function get(url,headers={}){
 const response=await fetch(url,{method:'GET',redirect:'error',headers,signal:AbortSignal.timeout(timeout)});
 assert.equal(response.status,200,'GET '+new URL(url).pathname+' returned HTTP '+response.status);
 assert.equal(response.url,url,'Unexpected redirect for '+new URL(url).pathname);
 return response;
}
async function config(){
 const response=await get(SITE+'/v3/config.json');
 const type=response.headers.get('content-type')||'';
 assert.match(type,/json/i,'The public Supabase client config must be JSON');
 const value=await response.json();
 assert.equal(value.supabaseUrl,PROJECT,'Wrong Supabase project configured on production website');
 assert.equal(typeof value.supabaseAnonKey,'string');
 assert.ok(value.supabaseAnonKey.length>=25,'Supabase public client key is missing');
 return value;
}
test('live site points to the official Supabase project and public recovery page',async()=>{
 const conf=await config();
 assert.equal(conf.supabaseUrl,PROJECT);
 const response=await get(SITE+'/redefinir-senha.html');
 const html=await response.text();
 assert.match(html,/PASSWORD_RECOVERY/,'Recovery page must require Supabase recovery event');
 assert.match(html,/auth\.getUser\(\)/,'Password update must recheck user session');
 assert.doesNotMatch(html,/nospassa\.com\.br/i,'Recovery path should not link old production domain');
});
test('live Supabase Auth health and public email-provider switch are reachable without login',async()=>{
 const conf=await config();
 const headers={apikey:conf.supabaseAnonKey,accept:'application/json'};
 // GoTrue health and settings are GET-only public metadata.
 const health=await get(PROJECT+'/auth/v1/health',headers);
 const text=await health.text();
 assert.ok(text.length>0&&text.length<2500,'Unexpected Auth health response envelope');
 const settings=await get(PROJECT+'/auth/v1/settings',headers);
 const body=await settings.json();
 assert.ok(body&&typeof body==='object'&&!Array.isArray(body),'Invalid GoTrue settings format');
 assert.equal(body.external?.email,true,'Email sign-in is disabled in live Supabase Auth runtime');
 assert.notEqual(body.disable_signup,true,'Email registration is disabled in live Supabase Auth runtime');
 // A public settings response does not expose custom SMTP, Site URL or allowed redirects.
 // Do not make unsupported claims about delivery or recovery email links.
});
test('public billing-readiness endpoint is available without creating any payment',async()=>{
 const conf=await config();
 const response=await get(PROJECT+'/functions/v1/xrmovi-billing-readiness',{apikey:conf.supabaseAnonKey,accept:'application/json'});
 const body=await response.json();
 assert.equal(body.provider,'mercadopago');
 assert.equal(typeof body.enabled,'boolean');
 assert.ok(['pilot','production','not_ready'].includes(body.mode),'Unexpected billing readiness mode');
 assert.ok(body.reason===null||typeof body.reason==='string','Unexpected readiness reason');
 // enabled=true is not proof that the Mercado Pago webhook is registered.
 // This check deliberately does not call checkout, reconcile, cancel or webhooks.
});
