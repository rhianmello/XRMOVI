const { test, before, after }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');
const site='https://xrmovi.test';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>browser?.close());

async function pageFor(width=390){
 const page=await browser.newPage({viewport:{width,height:740}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route(site+'/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/optimizer-test.html')return route.fulfill({
   contentType:'text/html; charset=utf-8',
   body:'<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p id="status">ready</p></body></html>'
  });
  const file=path.resolve(root,url.pathname.replace(/^\//,''));
  if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
  try {
   const ext=path.extname(file);
   const mime=ext==='.js'?'text/javascript':ext==='.html'?'text/html':ext==='.svg'?'image/svg+xml':'application/octet-stream';
   return route.fulfill({contentType:mime+'; charset=utf-8',body:fs.readFileSync(file)});
  }catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto(site+'/optimizer-test.html');
 return {page,errors};
}
async function sampleImage(page,{width=3000,height=1750,mime='image/jpeg',quality=0.99}={}){
 return page.evaluate(async ({width,height,mime,quality})=>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  const grad=ctx.createLinearGradient(0,0,width,height);
  grad.addColorStop(0,'#243547');grad.addColorStop(0.5,'#c3abb8');grad.addColorStop(1,'#274f65');
  ctx.fillStyle=grad;ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#1a1a1a';ctx.font='bold 60px sans-serif';
  for(let n=0;n<12;n++)ctx.fillText('HODOMETRO 123456 KM — '+n,100,100+n*120);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,quality));
  const file=new File([blob],'odometro.'+(mime==='image/png'?'png':'jpg'),{type:mime});
  window.sourceTestFile=file;
  return {size:file.size,mime:file.type};
 },{width,height,mime,quality});
}

test('large evidence JPEG is optimized without increasing bytes, preserves type and can be decoded',async()=>{
 const {page,errors}=await pageFor();
 try{
  const original=await sampleImage(page);
  const result=await page.evaluate(async()=>{
   const {optimizeUploadFile,uploadSummary}=await import('/v3/upload-optimizer.js');
   const {file,stats}=await optimizeUploadFile(window.sourceTestFile,{purpose:'proof',maxBytes:5*1024*1024});
   const decoded=await createImageBitmap(file);
   const info={size:file.size,mime:file.type,width:decoded.width,height:decoded.height,stats,summary:uploadSummary(stats)};
   decoded.close();return info;
  });
  assert.equal(result.mime,'image/jpeg');
  assert.ok(result.size<=original.size);
  assert.ok(result.width<=2560);
  assert.equal(result.stats.originalBytes,original.size);
  assert.equal(result.stats.finalBytes,result.size);
  assert.ok(result.summary.includes('MiB')||result.summary.includes('KiB'));
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('small transparent PNG is unchanged and no quality loss is introduced',async()=>{
 const {page,errors}=await pageFor();
 try{
  const result=await page.evaluate(async()=>{
   const {optimizeUploadFile}=await import('/v3/upload-optimizer.js');
   const canvas=document.createElement('canvas');canvas.width=60;canvas.height=40;
   const context=canvas.getContext('2d');context.fillStyle='rgba(10, 100, 50, .5)';context.fillRect(1,1,30,30);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   const orig=new File([blob],'transparente.png',{type:'image/png'});
   const out=await optimizeUploadFile(orig,{purpose:'logo',maxBytes:2*1024*1024});
   return {same:orig===out.file,bytes:out.stats.savedBytes,mime:out.file.type};
  });
  assert.deepEqual(result,{same:true,bytes:0,mime:'image/png'});
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('PDF with ByteRange signature is passed byte-for-byte, and ordinary PDF is unchanged too',async()=>{
 const {page,errors}=await pageFor();
 try{
  const result=await page.evaluate(async()=>{
   const {optimizeUploadFile}=await import('/v3/upload-optimizer.js');
   const documents=[
    '%PDF-1.7\n1 0 obj << /Type /Sig /ByteRange [0 100 200 300] >> endobj\n%%EOF',
    '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'
   ];
   let outputs=[];
   for(const [index,text] of documents.entries()){
    const file=new File([text],'arquivo-'+index+'.pdf',{type:'application/pdf'});
    const result=await optimizeUploadFile(file,{maxBytes:10485760});
    outputs.push({same:result.file===file,identical:await result.file.text()===text,
      bytes:result.stats.finalBytes,saved:result.stats.savedBytes,reason:result.stats.reason});
   }
   return outputs;
  });
  assert.ok(result.every(row=>row.same&&row.identical&&row.saved===0&&row.reason==='pdf-preserved'));
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('invalid PDF, invalid MIME, corrupt image, excessive size and too-small destination are rejected',async()=>{
 const {page,errors}=await pageFor();
 try{
  await sampleImage(page,{width:2600,height:1700});
  const result=await page.evaluate(async()=>{
   const {optimizeUploadFile}=await import('/v3/upload-optimizer.js');
   const cases=[
    new File(['Not a PDF'],'bad.pdf',{type:'application/pdf'}),
    new File(['<script>alert(1)</script>'],'x.html',{type:'text/html'}),
    new File(['not an image'],'bad.jpg',{type:'image/jpeg'}),
    new File([new Uint8Array(20*1024*1024+1)],'huge.pdf',{type:'application/pdf'})
   ];
   const results=[];
   for(const file of cases){
    try{await optimizeUploadFile(file);results.push('unexpected success')}
    catch(error){results.push(error.message)}
   }
   try{await optimizeUploadFile(window.sourceTestFile,{purpose:'proof',maxBytes:1500});results.push('unexpected success')}
   catch(error){results.push(error.message)}
   return results;
  });
  assert.equal(result.filter(s=>s!=='unexpected success').length,5);
  assert.match(result[0],/PDF/);
  assert.match(result[2],/corrompida|ilegível/);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('file is transmitted only after optimization; storage download and record metadata match uploaded bytes',async()=>{
 const {page,errors}=await pageFor();
 try{
  await sampleImage(page);
  const result=await page.evaluate(async()=>{
   const {optimizeUploadFile,fingerprintUpload}=await import('/v3/upload-optimizer.js');
   const {file,stats}=await optimizeUploadFile(window.sourceTestFile,{purpose:'document',maxBytes:10485760});
   let stored=null,entry=null;
   const storage={
    upload:async(path,payload,options)=>{stored={path,payload,options};return {error:null}},
    download:async()=>({data:stored.payload,error:null})
   };
   const rpc=async(name,data)=>{entry={name,data};return {data:true,error:null}};
   const hash=await fingerprintUpload(file);
   await storage.upload('company/fuel/item/'+hash+'.jpg',file,{contentType:file.type,upsert:false});
   await rpc('attachment_register',{p_path:stored.path,p_type:file.type,p_size:file.size});
   const back=(await storage.download()).data;
   const equal=(a,b)=>a.byteLength===b.byteLength&&new Uint8Array(a).every((v,i)=>v===new Uint8Array(b)[i]);
   return {equal:equal(await back.arrayBuffer(),await file.arrayBuffer()),
    metadataMatches:entry.data.p_size===stored.payload.size&&entry.data.p_type===stored.options.contentType,
    isPrivatePath:stored.path.startsWith('company/fuel/item/'),
    savings:stats.savedBytes};
  });
  assert.equal(result.equal,true);assert.equal(result.metadataMatches,true);
  assert.equal(result.isPrivatePath,true);assert.ok(result.savings>=0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('QR driver upload sends optimized image at three screen sizes',async()=>{
 for(const width of [320,390,768]){
  const {page,errors}=await pageFor(width);
  try{
   let submissions=0,bytes=0,mime='';
   await page.route('https://ztqtcbzjesrkuaijmylm.supabase.co/**', async route=>{
    const text=route.request().postData()||'';
    if(text.includes('token') && text.includes('photo')){
     submissions++;bytes=Buffer.byteLength(text);mime=text.includes('image/jpeg')?'image/jpeg':'other';
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({vehicle:{plate:'AAA1234',model:'Teste'}})});
   });
   await page.goto(site+'/km/index.html?token=11111111-1111-4111-8111-111111111111');
   await page.locator('[data-kind="km"]').click();
   await page.locator('#reading input[name="driver"]').fill('Motorista Teste');
   await page.locator('#reading input[name="meter"]').fill('123456');
   await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=3500;canvas.height=1800;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,3500,1800);
    ctx.fillStyle='#111';ctx.font='90px sans-serif';ctx.fillText('123456 KM',80,190);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.98));
    const file=new File([blob],'camera.jpg',{type:'image/jpeg'});
    const input=document.querySelector('#reading input[name="photo"]');
    const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.locator('#send').click();
   try {
    await page.waitForFunction(()=>document.getElementById('result').textContent.toLowerCase().includes('aguardando aprovação'),null,{timeout:8000});
   } catch(error) {
    const snapshot=await page.evaluate(()=>({
     status:document.getElementById('result')?.textContent,
     progress:document.getElementById('upload-progress')?.getAttribute('value'),
     hidden:document.getElementById('result')?.style.display,
     buttonDisabled:document.getElementById('send')?.disabled
    }));
    throw new Error('QR portal at '+width+'px: '+JSON.stringify({submissions,bytes,mime,snapshot,errors})+' / '+error.message);
   }
   assert.equal(submissions,1,'exactly one request');
   assert.ok(bytes>0 && mime==='image/jpeg');
   assert.equal(await page.locator('#upload-progress').getAttribute('value'),'100');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=2,width+'px portal overflow');
   assert.deepEqual(errors,[]);
  }finally{await page.close();}
 }
});

test('interrupted QR upload reports an error, unlocks button, and does not silently retry',async()=>{
 const {page,errors}=await pageFor(360);
 try{
  let attempted=0;
  await page.route('https://ztqtcbzjesrkuaijmylm.supabase.co/**',async route=>{
   const body=route.request().postData()||'';
   if(body.includes('photo')){attempted++;return route.abort('internetdisconnected');}
   return route.fulfill({status:200,contentType:'application/json',body:'{"vehicle":{"plate":"AAA1234"}}'});
  });
  await page.goto(site+'/km/index.html?token=11111111-1111-4111-8111-111111111111');
  await page.locator('[data-kind="km"]').click();
  await page.locator('#reading input[name="driver"]').fill('Motorista de teste');
  await page.locator('#reading input[name="meter"]').fill('27000');
  await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=800;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1000,800);
   ctx.fillStyle='#000';ctx.font='72px sans-serif';ctx.fillText('27000 KM',90,150);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
   const input=document.querySelector('#reading input[name="photo"]');
   const data=new DataTransfer();data.items.add(new File([blob],'odometro.jpg',{type:'image/jpeg'}));
   input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.locator('#send').click();
  await page.waitForFunction(()=>document.getElementById('result')?.classList.contains('error'),null,{timeout:7000});
  assert.equal(attempted,1);
  assert.equal(await page.locator('#send').isEnabled(),true);
  assert.equal(await page.locator('#upload-progress').isVisible(),false);
  assert.match(await page.locator('#result').innerText(),/Falha ao enviar|Failed to fetch|internet/i);
  assert.deepEqual(errors,[]);
 } finally{await page.close();}
});


test('legacy fuel receipts preserve JPEG base64 wire contract and legible dimensions',async()=>{
 const {page,errors}=await pageFor(390);
 try{
  const result=await page.evaluate(async()=>{
   const {optimizeLegacyFuelDataUri}=await import('/v3/upload-optimizer.js');
   const canvas=document.createElement('canvas');
   canvas.width=2300;canvas.height=1500;
   const ctx=canvas.getContext('2d');
   ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.fillStyle='black';ctx.font='bold 78px sans-serif';
   for(let y=160;y<1200;y+=150)ctx.fillText('NF 1234567890 TOTAL R$ 987,65',90,y);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   const file=new File([blob],'comprovante.png',{type:'image/png'});
   const data=await optimizeLegacyFuelDataUri(file);
   const image=new Image();image.src=data;await image.decode();
   return {prefix:data.slice(0,23),chars:data.length,sourceBytes:file.size,
    width:image.naturalWidth,height:image.naturalHeight};
  });
  assert.equal(result.prefix,'data:image/jpeg;base64,');
  assert.ok(result.chars<=650000);
  assert.ok(result.width<=1400);
  assert.ok(result.height>0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('legacy fuel receipt rejects corrupted input without touching existing saved notes',async()=>{
 const {page,errors}=await pageFor();
 try {
  const message=await page.evaluate(async()=>{
   const {optimizeLegacyFuelDataUri}=await import('/v3/upload-optimizer.js');
   try{await optimizeLegacyFuelDataUri(new File(['not image'],'corrupt.jpg',{type:'image/jpeg'}));return 'unexpected success';}
   catch(e){return e.message;}
  });
  assert.match(message,/corrompida|ilegível/i);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('EXIF orientation 6 is applied before re-encoding large mobile photo',async()=>{
 const {page,errors}=await pageFor(390);
 try{
  const result=await page.evaluate(async()=>{
   const {optimizeUploadFile}=await import('/v3/upload-optimizer.js');
   const canvas=document.createElement('canvas');canvas.width=3000;canvas.height=1600;
   const ctx=canvas.getContext('2d');
   const g=ctx.createLinearGradient(0,0,3000,1600);
   g.addColorStop(0,'#dd3311');g.addColorStop(1,'#224466');
   ctx.fillStyle=g;ctx.fillRect(0,0,3000,1600);
   ctx.fillStyle='#000';ctx.font='bold 100px sans-serif';ctx.fillText('KM 12345',140,250);
   const raw=new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',1))).arrayBuffer());
   // JPEG APP1 Exif, little-endian TIFF orientation tag 0x0112 = 6 (90 degrees clockwise).
   const exif=new Uint8Array([0x45,0x78,0x69,0x66,0,0,0x49,0x49,0x2a,0,8,0,0,0,
    1,0,0x12,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
   const payload=new Uint8Array(raw.length+exif.length+4);
   payload.set(raw.slice(0,2),0);payload[2]=255;payload[3]=225;
   const sectionLength=exif.length+2;
   payload[4]=sectionLength>>8;payload[5]=sectionLength&255;
   payload.set(exif,6);payload.set(raw.slice(2),6+exif.length);
   const original=new File([payload],'foto-mobil.jpg',{type:'image/jpeg'});
   const decoded=await createImageBitmap(original,{imageOrientation:'from-image'});
   const before={width:decoded.width,height:decoded.height};decoded.close();
   const {file,stats}=await optimizeUploadFile(original,{purpose:'proof',maxBytes:5*1024*1024});
   const final=await createImageBitmap(file);
   const after={width:final.width,height:final.height};
   final.close();
   return {before,after,reduced:stats.reduced,sourceBytes:stats.originalBytes};
  });
  assert.ok(result.before.height>result.before.width,'EXIF orientation should rotate tall');
  assert.ok(result.reduced,'large original should compress');
  assert.ok(result.after.height>result.after.width,'optimized output must preserve orientation');
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
