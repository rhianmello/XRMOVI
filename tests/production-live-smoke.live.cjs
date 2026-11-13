'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,webkit,devices}=require('playwright');
const BASE='https://xrmovi.com.br';
async function publicGet(path){
 const res=await fetch(BASE+path,{redirect:'follow',signal:AbortSignal.timeout(25000)});
 assert.equal(res.status,200,`GET ${path} returned ${res.status}`);
 assert.equal(new URL(res.url).hostname,'xrmovi.com.br',`Unexpected redirect at ${path}`);
 return res;
}
test('live HTTPS routes and sitemap are reachable on the new domain',async()=>{
 for(const path of ['/', '/v3/', '/perguntas-frequentes/', '/recursos/', '/robots.txt', '/sitemap.xml','/manifest.webmanifest','/pwa/icon.svg']){
  const r=await publicGet(path);
  if(path==='/')assert.match(await r.text(),/<title>[^<]*XRMOVI/i);
  if(path==='/sitemap.xml')assert.match(await r.text(),/https:\/\/xrmovi\.com\.br\//i);
  if(path==='/manifest.webmanifest'){
   const manifest=await r.json();
   assert.equal(manifest.start_url,'/v3/');
   assert.equal(manifest.display,'standalone');
  }
 }
});
async function checkDevice(browserType,options,device){
 const browser=await browserType.launch({headless:true});
 const context=await browser.newContext(options);
 try{
  const page=await context.newPage();
  const response=await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:35000});
  assert.ok(response&&response.ok(),`${device}: homepage request failed`);
  assert.match(await page.title(),/XRMOVI/i);
  await page.locator('[data-xrm-install]').first().waitFor({state:'visible',timeout:15000});
  const horizontal=await page.evaluate(()=>({w:document.documentElement.scrollWidth,v:window.innerWidth}));
  assert.ok(horizontal.w<=horizontal.v+3,`${device}: horizontal overflow ${horizontal.w} > ${horizontal.v}`);
  await page.locator('[data-xrm-install]').first().click({timeout:12000});
  const instructions=page.locator('#xrm-install-instructions');
  await instructions.waitFor({state:'visible',timeout:7000});
  assert.match(await instructions.innerText(),device==='iOS'?/iPhone|iPad/:/Android/i);
  await page.locator('#xrm-install-close').click();
  assert.equal(await page.locator('#xrm-install-overlay').evaluate(x=>x.classList.contains('open')),false);
  await page.close();
 }finally{await context.close();await browser.close();}
}
test('Android live landing has usable responsive PWA instructions',async()=>{
 const d=devices['Pixel 7'];
 await checkDevice(chromium,{...d},'Android');
});
test('iOS WebKit live landing has usable responsive PWA instructions',async()=>{
 const d=devices['iPhone 13'];
 await checkDevice(webkit,{...d},'iOS');
});
test('live authentication page presents sign-in form without submitting credentials',async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage();
  const response=await page.goto(BASE+'/?login=1',{waitUntil:'domcontentloaded',timeout:35000});
  assert.ok(response&&response.ok(),'Login page not reachable');
  await page.locator('#xrm-auth-submit').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('input[name=email]').count(),1);
  assert.equal(await page.locator('input[name=password]').count(),1);
  await page.close();
 }finally{await context.close();await browser.close();}
});
