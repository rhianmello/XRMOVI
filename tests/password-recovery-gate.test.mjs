import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../redefinir-senha.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]?.replace(/^import\s+\{createClient\}\s+from\s+['"][^'"]+['"];\s*$/m,'');
assert.ok(script,'password reset module must exist');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

async function fixture({storedSession=null,getUserError=null}={}){
 const form={listeners:{},addEventListener(name,cb){this.listeners[name]=cb}};
 const button={disabled:true,textContent:'Validando link...'};
 const status={textContent:'',dataset:{},append(){}};
 const document={
  getElementById(id){return {'reset-form':form,'reset-submit':button,'status':status}[id]},
  createElement(tag){return {tag,textContent:'',href:''}}
 };
 let listener=null,updates=0,verifyCalls=0,signOuts=0;
 const client={auth:{
  onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}}},
  async getSession(){return {data:{session:storedSession},error:null}},
  async getUser(){verifyCalls++;return getUserError?{data:{user:null},error:new Error('expired')}:{data:{user:{id:'user-fixture'}},error:null}},
  async updateUser({password}){assert.equal(password,'ValidPass123!');updates++;return {error:null}},
  async signOut(){signOuts++;return {error:null}}
 }};
 const fetch=async()=>({ok:true,async json(){return {supabaseUrl:'https://project.example.invalid',supabaseAnonKey:'public-fixture'}}});
 const createClient=()=>client;
 class FormDataFake{get(key){return key==='password'||key==='confirm'?'ValidPass123!':null}}
 await new AsyncFunction('document','fetch','createClient','FormData',script)(document,fetch,createClient,FormDataFake);
 return {
  button,status,
  fire(event,session){listener(event,session)},
  async submit(){await form.listeners.submit({preventDefault(){}})},
  get updates(){return updates},
  get verifyCalls(){return verifyCalls},
  get signOuts(){return signOuts}
 };
}
test('ordinary cached login cannot enable reset password form',async()=>{
 const f=await fixture({storedSession:{user:{id:'normal-user'}}});
 assert.equal(f.button.disabled,true);
 assert.match(f.status.textContent,/sessão de login não é um link de recuperação/);
 f.fire('INITIAL_SESSION',{user:{id:'normal-user'}});
 f.fire('SIGNED_IN',{user:{id:'normal-user'}});
 assert.equal(f.button.disabled,true);
 await f.submit();
 assert.equal(f.updates,0);
 assert.equal(f.verifyCalls,0);
});
test('recovery event without verified session does not unlock password reset',async()=>{
 const f=await fixture();
 f.fire('PASSWORD_RECOVERY',null);
 assert.equal(f.button.disabled,true);
 assert.equal(f.updates,0);
});
test('Supabase PASSWORD_RECOVERY session allows a verified update, then signs out',async()=>{
 const f=await fixture();
 f.fire('PASSWORD_RECOVERY',{user:{id:'recovery-user'}});
 assert.equal(f.button.disabled,false);
 assert.match(f.status.textContent,/Link de recuperação validado/);
 await f.submit();
 assert.equal(f.verifyCalls,1);
 assert.equal(f.updates,1);
 assert.equal(f.signOuts,1);
 assert.equal(f.button.disabled,true);
 assert.match(f.status.textContent,/Senha atualizada/);
});
test('invalid session at submit prevents password change, even after recovery event',async()=>{
 const f=await fixture({getUserError:true});
 f.fire('PASSWORD_RECOVERY',{user:{id:'expired-recovery'}});
 await f.submit();
 assert.equal(f.verifyCalls,1);
 assert.equal(f.updates,0);
 assert.equal(f.signOuts,0);
 assert.equal(f.button.disabled,false);
 assert.equal(f.status.dataset.error,'true');
});
test('sign out revokes recovery form readiness',async()=>{
 const f=await fixture();
 f.fire('PASSWORD_RECOVERY',{user:{id:'recovery'}});
 assert.equal(f.button.disabled,false);
 f.fire('SIGNED_OUT',null);
 assert.equal(f.button.disabled,true);
 await f.submit();
 assert.equal(f.updates,0);
});
test('do not regress to treating SIGNED_IN, INITIAL_SESSION or getSession as recovery',()=>{
 assert.match(html,/event==='PASSWORD_RECOVERY'&&session/);
 assert.doesNotMatch(html,/event==='SIGNED_IN'\|\|event==='INITIAL_SESSION'/);
 assert.doesNotMatch(html,/if\(data\.session\)enable\(\)/);
 assert.match(html,/client\.auth\.getUser\(\)/);
});
