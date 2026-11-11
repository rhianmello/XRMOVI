const { test,before,after }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>browser?.close());
async function setup(width=390,role='owner'){
 const page=await browser.newPage({viewport:{width,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const html='<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<link rel="stylesheet" href="/v3/css/frota.css">'+
 '<link rel="stylesheet" href="/v3/mobile-experience.css">'+
 '<link rel="stylesheet" href="/v3/mobile-refinement.css"></head>'+
 '<body class="fleet-page"><main class="fleet-content"><div id="vehicle-documents"></div>'+
 '<span id="xrm-doc-total"></span><select id="xrm-doc-link"></select>'+
 '<div id="xrm-doc-history"><button id="xrm-doc-history-button">Histórico</button><div id="xrm-doc-history-list"></div></div></main></body></html>';
 await page.route('https://xrmovi.test/**',r=>{
  const req=new URL(r.request().url());
  if(req.pathname==='/mobile-test.html')return r.fulfill({contentType:'text/html',body:html});
  const filename=path.resolve(root,req.pathname.slice(1));
  if(!filename.startsWith(root+path.sep))return r.fulfill({status:403,body:''});
  try{return r.fulfill({contentType:path.extname(filename)==='.js'?'text/javascript':'text/css',body:fs.readFileSync(filename)});}
  catch{return r.fulfill({status:404,body:''});}
 });
 await page.route('https://secure.example.test/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')}));
 await page.goto('https://xrmovi.test/mobile-test.html');
 await page.evaluate(async role=>{
  const app=await import('/v3/document-center.js');
  const docs=[
   {id:'doc1',kind:'driver',record_id:'d1',driver_name:'MOTORISTA COM NOME COMPRIDO DE TESTE',path:'sample/user/cnh.pdf',name:'CNH_documento_com_nome_comprido_2026.pdf',created_at:'2026-11-05'},
   {id:'doc2',kind:'vehicle',vehicle_id:'v1',record_id:'v1',path:'sample/vehicle/crlv.png',name:'crlv.png',created_at:'2026-11-05'}
  ];
  const mock={
   supabaseUrl:'https://secure.example.test',
   storage:{from:bucket=>({createSignedUrl:async(file,seconds)=>{window.testSignedCalls.push({bucket,file,seconds});
    return {data:{signedUrl:'https://secure.example.test/storage/v1/object/sign/'+bucket+'/'+file+'?token=private-test'},error:null};}})}
  };
  window.testSignedCalls=[];
  const center=app.createDocumentCenter({
   client:()=>mock,
   rpc:async()=>[],
   getCompany:()=>({id:'company-1'}),
   getVehicles:()=>[{id:'v1',plate:'XYZ1234'}],
   getDrivers:()=>[{id:'d1',name:'MOTORISTA COM NOME COMPRIDO DE TESTE'}],
   getLegacyDocs:()=>[],getCatalog:()=>docs,canWrite:()=>role==='owner',
   upload:async()=>{},refresh:async()=>{},notify:msg=>{window.lastNotify=msg}
  });
  center.renderCentral();
  window.testCenter=center;
 },role);
 return {page,errors};
}
test('iPhone document preview is an in-app PDF dialog with genuine tappable links',async()=>{
 const {page,errors}=await setup();
 await page.evaluate(()=>testCenter.openRecord('driver',{id:'d1',name:'MOTORISTA COM NOME COMPRIDO DE TESTE'}));
 assert.equal(await page.locator('.xrm-doc-dialog').isVisible(),true);
 const cut=await page.locator('.xrm-doc-dialog').evaluate(el=>el.scrollWidth-el.clientWidth);
 assert.ok(cut<=2,'driver document modal must not clip columns horizontally: '+cut);
 assert.equal(await page.locator('.xrm-doc-dialog tbody .xrm-doc-row td').count(),6);
 assert.equal(await page.locator('.xrm-doc-dialog .xrm-doc-row td[data-xrm-label="Arquivo"]').count(),1);
 await page.locator('.xrm-doc-dialog .xrm-doc-row button').filter({hasText:'Visualizar'}).click();
 await page.waitForFunction(()=>!document.querySelector('.xrm-doc-preview-backdrop').hidden);
 assert.equal(await page.locator('.xrm-doc-preview-stage iframe').getAttribute('src'),'https://secure.example.test/storage/v1/object/sign/xrmovi-record-attachments/sample/user/cnh.pdf?token=private-test');
 assert.ok((await page.locator('[data-preview-open]').getAttribute('href')).startsWith('https://secure.example.test/'));
 assert.match(await page.locator('[data-preview-download]').getAttribute('href'),/download=/);
 assert.equal(await page.evaluate(()=>testSignedCalls.length),1);
 const pcut=await page.locator('.xrm-doc-preview-panel').evaluate(el=>el.scrollWidth-el.clientWidth);
 assert.ok(pcut<=2,'file preview must fit phone: '+pcut);
 await page.locator('[data-preview-close]').click();
 assert.equal(await page.locator('.xrm-doc-preview-backdrop').isVisible(),false);
 assert.deepEqual(errors,[]);
 await page.close();
});
test('download remains a native, user-tappable action and images preview inside the dashboard',async()=>{
 const {page,errors}=await setup();
 await page.evaluate(()=>testCenter.openRecord('vehicle',{id:'v1',plate:'XYZ1234'}));
 await page.locator('.xrm-doc-dialog .xrm-doc-row button').filter({hasText:'Baixar'}).click();
 await page.waitForFunction(()=>!document.querySelector('.xrm-doc-preview-backdrop').hidden);
 assert.equal(await page.locator('[data-preview-image]').isVisible(),true);
 assert.equal(await page.locator('[data-preview-pdf]').isVisible(),false);
 assert.ok((await page.locator('[data-preview-download]').getAttribute('href')).includes('download=crlv.png'));
 assert.deepEqual(errors,[]);
 await page.close();
});
test('driver private documents do not appear in reader-only document catalog',async()=>{
 const {page,errors}=await setup(390,'viewer');
 assert.equal(await page.locator('#vehicle-documents .xrm-doc-row').count(),1);
 assert.equal(await page.locator('#vehicle-documents').innerText().then(t=>t.includes('CNH_documento')),false);
 assert.deepEqual(errors,[]);
 await page.close();
});
