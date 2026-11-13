const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),base='https://xrmovi.test';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>browser?.close());

async function boot({isAdmin=true,viewport={width:390,height:780}}={}){
 const page=await browser.newPage({viewport});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(admin=>{
  const metrics={
   summary:{object_count:28,stored_bytes:22259816},
   daily:[{upload_day:'2026-11-13',category:'vehicle',completed:2,
    verified_stored_bytes:500000,client_original_bytes:650000,client_reported_savings_bytes:150000}],
   attempts:[{upload_day:'2026-11-13',category:'vehicle',failures_client_reported:1,interruptions_client_reported:1}],
   growth_existing_objects:[{storage_month:'2026-11-01',bucket_id:'xrmovi-record-attachments',existing_objects:8,current_bytes:4810099}],
   candidates:[{object_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',bucket_id:'xrmovi-odometer-proof',
     stored_bytes:1048576,created_at:'2026-10-29T12:00:00Z',review_status:'requires_evidence',reviewer_note:''}]
  };
  const mock=window.storageAdminTest={calls:[],isAdmin:admin,metrics};
  mock.client={
   auth:{getUser:async()=>({data:{user:{id:'test-admin'}}})},
   rpc:async(name,args)=>{
    mock.calls.push({name,args});
    if(name==='xrmovi_platform_is_admin')return {data:mock.isAdmin,error:null};
    if(name==='xrmovi_admin_storage_overview')return {data:metrics,error:null};
    if(name==='xrmovi_admin_storage_review_mark'){
     if(!mock.isAdmin)return {data:null,error:{message:'não autorizado'}};
     return {data:true,error:null};
    }
    return {data:null,error:{message:'RPC desconhecida'}};
   }
  };
 },isAdmin);
 await page.route(base+'/**',route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/v3/config.json')return route.fulfill({
   contentType:'application/json',body:JSON.stringify({supabaseUrl:'https://ztqtcbzjesrkuaijmylm.supabase.co',supabaseAnonKey:'test'})
  });
  const local=path.resolve(root,u.pathname.replace(/^\//,''));
  if(!local.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
  try{return route.fulfill({contentType:path.extname(local)==='.html'?'text/html':'text/javascript',body:fs.readFileSync(local)});}
  catch{return route.fulfill({status:404,body:''});}
 });
 await page.route('https://esm.sh/**',route=>route.fulfill({
  contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},
  body:'export const createClient = () => window.storageAdminTest.client;'
 }));
 await page.goto(base+'/admin/storage.html');
 return {page,errors};
}

test('admin storage dashboard shows verified bytes versus browser-declared savings distinctly',async()=>{
 const {page,errors}=await boot();
 try{
  await page.locator('#content').waitFor({state:'visible'});
  const body=await page.locator('body').innerText();
  assert.match(body,/28/);
  assert.match(body,/não têm verificação independente/i);
  assert.match(body,/economia informada/i);
  assert.match(body,/Armazenamento atual/i);
  assert.equal(await page.locator('#candidates tr').count(),1);
  assert.equal(await page.locator('#periods tr').count(),1);
  assert.equal(await page.locator('#attempts tr').count(),1);
  assert.equal(await page.locator('#growth tr').count(),1);
  const calls=await page.evaluate(()=>window.storageAdminTest.calls.map(c=>c.name));
  assert.deepEqual(calls,['xrmovi_platform_is_admin','xrmovi_admin_storage_overview']);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('non-admin cannot open storage data or write review',async()=>{
 const {page,errors}=await boot({isAdmin:false});
 try{
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Acesso restrito'));
  assert.equal(await page.locator('#content').isVisible(),false);
  const calls=await page.evaluate(()=>window.storageAdminTest.calls.map(c=>c.name));
  assert.deepEqual(calls,['xrmovi_platform_is_admin']);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('human review records a category but never calls delete or exposes object file path',async()=>{
 const {page,errors}=await boot();
 try{
  await page.locator('#content').waitFor({state:'visible'});
  await page.locator('#candidates select').selectOption('retain');
  await page.locator('#candidates textarea').fill('Conferido: manter documento até revisão contratual.');
  await page.locator('#candidates button').click();
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Revisão registrada'));
  const calls=await page.evaluate(()=>window.storageAdminTest.calls);
  const review=calls.find(c=>c.name==='xrmovi_admin_storage_review_mark');
  assert.ok(review);
  assert.equal(review.args.p_status,'retain');
  assert.equal(review.args.p_object_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(calls.filter(c=>/delete|remove|storage\.from/.test(c.name)).length,0);
  assert.equal((await page.locator('body').innerText()).includes('company-id/vehicle/private.pdf'),false);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('mobile layout retains metrics and review controls without clipping the viewport',async()=>{
 const {page,errors}=await boot({viewport:{width:320,height:680}});
 try{
  await page.locator('#content').waitFor({state:'visible'});
  assert.equal(await page.locator('#refresh').isVisible(),true);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=2,'Horizontal page overflow of '+overflow+'px');
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
