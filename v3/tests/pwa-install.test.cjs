const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '../..');
const origin = 'https://xrmovi.test';
let browser;

before(async () => { browser = await chromium.launch({ headless:true }); });
after(async () => { await browser?.close(); });

async function openInstall({ width = 390, height = 700, userAgent } = {}) {
 const context = await browser.newContext({
  viewport:{width,height}, ...(userAgent ? {userAgent} : {})
 });
 const page = await context.newPage();
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.route(origin+'/**', async route => {
  const pathname = new URL(route.request().url()).pathname;
  if(pathname === '/install-test.html') return route.fulfill({
   contentType:'text/html; charset=utf-8',
   body:'<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button type="button" data-xrm-install>Instalar XRMOVI</button><script src="/pwa/install.js"></script></body></html>'
  });
  const full=path.resolve(root,pathname.slice(1));
  if(!full.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
  try { return route.fulfill({contentType:'text/javascript; charset=utf-8',body:fs.readFileSync(full)}); }
  catch { return route.fulfill({status:404,body:''}); }
 });
 await page.goto(origin+'/install-test.html');
 return {context,page,errors};
}

test('PWA manifest has the correct app scope and non-empty icons', () => {
 const manifest=JSON.parse(fs.readFileSync(path.resolve(root,'manifest.webmanifest'),'utf8'));
 assert.equal(manifest.id,'/v3/');
 assert.equal(manifest.start_url,'/v3/');
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.scope,'/');
 assert.ok(manifest.icons.some(x=>x.purpose==='any'&&x.sizes==='any'));
 assert.ok(manifest.icons.some(x=>x.purpose==='maskable'));
});

test('iOS install guidance remains keyboard accessible at 320px', async () => {
 const {context,page,errors}=await openInstall({width:320,height:520,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1'});
 try {
  await page.locator('[data-xrm-install]').click();
  assert.equal(await page.locator('#xrm-install-overlay').isVisible(),true);
  assert.match(await page.locator('#xrm-install-instructions').innerText(),/Safari/);
  assert.match(await page.locator('#xrm-install-instructions').innerText(),/Tela de Início/);
  assert.equal(await page.locator('#xrm-install-primary').evaluate(el=>document.activeElement===el),true);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=1,'install modal must not overflow 320px: '+overflow);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#xrm-install-overlay').isVisible(),false);
  assert.equal(await page.locator('[data-xrm-install]').evaluate(el=>document.activeElement===el),true);
  assert.deepEqual(errors,[]);
 } finally { await context.close(); }
});

test('Android guidance and dialog focus stay usable at 390px',async()=>{
 const {context,page,errors}=await openInstall({width:390,userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'});
 try {
  await page.locator('[data-xrm-install]').click();
  assert.match(await page.locator('#xrm-install-instructions').innerText(),/Android/);
  assert.match(await page.locator('#xrm-install-instructions').innerText(),/Play Store/);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#xrm-install-close').evaluate(el=>document.activeElement===el),true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#xrm-install-primary').evaluate(el=>document.activeElement===el),true);
  await page.locator('#xrm-install-close').click();
  assert.equal(await page.locator('#xrm-install-overlay').isVisible(),false);
  assert.deepEqual(errors,[]);
 } finally { await context.close(); }
});

test('PWA install help fits 430px, 768px and desktop without horizontal scrolling',async()=>{
 for(const width of [430,768,1366]){
  const {context,page,errors}=await openInstall({width});
  try{
   await page.locator('[data-xrm-install]').click();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
   assert.ok(overflow<=1,width+'px overflows horizontally by '+overflow+'px');
   assert.deepEqual(errors,[]);
  } finally { await context.close(); }
 }
});
