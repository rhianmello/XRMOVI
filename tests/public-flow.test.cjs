const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
async function open({configFailure=false,viewport={width:1280,height:900}}={}){
 const page=await browser.newPage({viewport});
 const calls=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('recordAuthCall',call=>calls.push(call));
 await page.addInitScript(()=>{
  window.mockClient={auth:{
   getUser:async()=>({data:{user:null},error:null}),
   getSession:async()=>({data:{session:null},error:null}),
   onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
   signUp:async args=>{await window.recordAuthCall({method:'signup',args});return {data:{session:null},error:null};},
   signInWithPassword:async args=>{await window.recordAuthCall({method:'signin',args});return {data:{session:{}},error:null};},
   resetPasswordForEmail:async(email,args)=>{await window.recordAuthCall({method:'recover',email,args});return {error:null};}
  },rpc:async()=>({data:false,error:null})};
 });
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='esm.sh')return route.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:'export const createClient=()=>window.mockClient;'});
  if(url.hostname!=='xrmovi.test')return route.abort();
  if(configFailure&&url.pathname==='/v3/config.json')return route.fulfill({status:503,body:'unavailable'});
  if(url.pathname==='/v3/')return route.fulfill({contentType:'text/html',body:'<h1>Painel de teste</h1>'});
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
  const type={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain';
  try{return route.fulfill({contentType:type,body:fs.readFileSync(file)});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto('https://xrmovi.test/?login=1');await page.locator('#xrm-auth-submit').waitFor({state:'visible'});
 return {page,calls,errors};
}
test('signup checks matching passwords and waits for email confirmation',async()=>{
 const {page,calls,errors}=await open();await page.getByRole('button',{name:'Criar conta',exact:true}).click();
 await page.locator('[name=email]').fill('test@example.invalid');await page.locator('[name=password]').fill('TestPassword123!');
 await page.locator('[name=confirmation]').fill('DifferentPassword123!');await page.locator('#xrm-auth-submit').click();
 await page.getByText('As senhas não coincidem.',{exact:true}).waitFor();assert.equal(calls.length,0);
 await page.locator('[name=confirmation]').fill('TestPassword123!');await page.locator('#xrm-auth-submit').click();
 await page.getByText('Conta criada. Confirme seu e-mail e depois faça login.',{exact:true}).waitFor();
 assert.equal(calls.length,1);assert.equal(calls[0].method,'signup');assert.equal(new URL(page.url()).pathname,'/');assert.deepEqual(errors,[]);await page.close();
});
test('recovery redirects to same origin and does not submit a password',async()=>{
 const {page,calls}=await open();await page.locator('#xrm-auth-forgot').click();await page.locator('[name=email]').fill('test@example.invalid');await page.locator('#xrm-auth-submit').click();
 await page.getByText(/Se houver uma conta com este e-mail/).waitFor();assert.equal(calls[0].method,'recover');
 assert.equal(calls[0].args.redirectTo,'https://xrmovi.test/redefinir-senha.html');assert.equal(calls[0].args.password,undefined);await page.close();
});
test('verified sign-in opens fleet; configuration failure disables access',async()=>{
 const {page,calls}=await open();await page.locator('[name=email]').fill('test@example.invalid');await page.locator('[name=password]').fill('TestPassword123!');
 await page.locator('#xrm-auth-submit').click();await page.waitForURL('https://xrmovi.test/v3/');assert.equal(calls[0].method,'signin');await page.close();
 const failed=await open({configFailure:true});await failed.page.getByText(/Serviço temporariamente indisponível/).waitFor();assert.equal(await failed.page.locator('#xrm-auth-submit').isDisabled(),true);await failed.page.close();
});
test('mobile access fits viewport and copy distinguishes manual Pix renewal',async()=>{
 const {page,errors}=await open({viewport:{width:390,height:844}});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#xrm-auth-close').click();assert.match(await page.locator('body').innerText(),/Pix.*renovação manual/);assert.deepEqual(errors,[]);await page.close();
});
