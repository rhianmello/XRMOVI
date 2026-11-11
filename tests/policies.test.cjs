const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');let browser;
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
async function localPage(viewport){
 const page=await browser.newPage({viewport});
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.hostname!=='xrmovi.test')return route.abort();
  let name=u.pathname;if(name.endsWith('/'))name+='index.html';
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
  try{return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});}catch{return route.fulfill({status:404,body:''});}
 });return page;
}
test('policies publish named contact and remain readable at desktop and mobile widths',async()=>{
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const page=await localPage(viewport);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [slug,title] of [['termos','Termos de Uso'],['privacidade','Política de Privacidade'],['cancelamento','Política de Cancelamento']]){
   const response=await page.goto('https://xrmovi.test/'+slug+'/');assert.equal(response.status(),200);
   assert.equal(await page.locator('h1').innerText(),title);assert.match(await page.locator('main').innerText(),/Rhian Mello/);
   assert.equal(await page.locator('a[href="mailto:rhian.udm@gmail.com"]').count()>0,true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.locator('footer a').count(),3);
   assert.doesNotMatch(await page.locator('body').innerText(),/\[definir|\[preencher|Lorem ipsum|RASCUNHO/);
   if(process.env.POLICY_SCREENSHOT_DIR&&slug==='privacidade'){
    fs.mkdirSync(process.env.POLICY_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.POLICY_SCREENSHOT_DIR,'privacidade-'+viewport.width+'.png'),fullPage:false});
   }
  }assert.deepEqual(errors,[]);await page.close();
 }
});
test('already paid Pix checks the provider once and hides every charge-generation field',async()=>{
 const page=await localPage({width:390,height:844});
 await page.route('https://xrmovi.test/pix-fixture',r=>r.fulfill({contentType:'text/html',body:`<script type="module">
  import {openPixCheckout} from '/v3/pix-checkout.js';
  window.calls=[];window.paidCallback=0;
  openPixCheckout({client:{functions:{invoke:async(name,{body})=>{window.calls.push({name,body});return {data:{status:'paid'},error:null};}}},companyId:'test-company',onPaid:()=>{window.paidCallback++;}});
 </script>`}));
 await page.goto('https://xrmovi.test/pix-fixture');await page.getByText('Pagamento confirmado! A assinatura foi liberada.',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-form]').isVisible(),false);assert.equal(await page.locator('[data-qr]').isVisible(),false);
 const result=await page.evaluate(()=>({calls:window.calls,paid:window.paidCallback}));assert.equal(result.calls.length,1);assert.equal(result.calls[0].body.action,'check');assert.equal(result.paid,1);await page.close();
});
