const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),base='https://xrmovi.test';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>browser?.close());

async function boot({admin=true,pathname='/admin/storage-hml.html',width=390}={}){
 const page=await browser.newPage({viewport:{width,height:840}});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.addInitScript(isAdmin=>{
  const owner='11111111-1111-4111-8111-111111111111';
  const files=new Map();
  const calls=[];
  const uploaded=[];
  let createClientCalls=0;
  const makeStorage=(anonymous=false)=>({
   from:bucket=>({
    upload:async(path,file,opts)=>{
     calls.push({kind:'upload',bucket,path,upsert:opts?.upsert,anonymous});
     if(anonymous)return {data:null,error:{message:'Unauthorized',statusCode:401}};
     if(files.has(path))return {data:null,error:{message:'Already exists',statusCode:409}};
     files.set(path,new Blob([await file.arrayBuffer()],{type:file.type}));
     uploaded.push(path);return {data:{path},error:null};
    },
    download:async path=>{
     calls.push({kind:'download',bucket,anonymous});
     if(anonymous)return {data:null,error:{message:'Unauthorized',statusCode:403}};
     const data=files.get(path);
     return data?{data,error:null}:{data:null,error:{message:'Not found'}};
    },
    remove:async paths=>{
     calls.push({kind:'remove',bucket,paths});
     if(anonymous)return {error:{message:'Unauthorized'}};
     for(const p of paths)files.delete(p);
     return {error:null};
    }
   })
  });
  const client={
   auth:{getUser:async()=>({data:{user:{id:owner}},error:null}),
     getSession:async()=>({data:{session:{user:{id:owner},access_token:'test-fake-token'}},error:null})},
   rpc:async(name,args)=>{
    calls.push({kind:'rpc',name});
    if(name==='xrmovi_platform_is_admin')return {data:isAdmin,error:null};
    if(name==='xrmovi_hml_storage_inspect'){
     const data=files.get(args.p_path);
     return {data:{registered:!!data,object_count:data?1:0,stored_bytes:data?.size||0},error:null};
    }
    return {data:null,error:{message:'Unknown RPC '+name}};
   },
   storage:makeStorage()
  };
  const anon={auth:{getUser:async()=>({data:{user:null},error:null})},storage:makeStorage(true)};
  window.hmlMock={owner,files,calls,uploaded,isAdmin,client,anon,
   createClient(){return (++createClientCalls===1)?client:anon},
   put(path,file){files.set(path,new Blob([file],{type:file.type}));uploaded.push(path)}
  };
 },admin);
 await page.route(base+'/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/v3/config.json')return route.fulfill({
   contentType:'application/json',body:JSON.stringify({
    supabaseUrl:'https://ztqtcbzjesrkuaijmylm.supabase.co',supabaseAnonKey:'test-publishable'
   })
  });
  const local=path.resolve(root,url.pathname.slice(1));
  if(!local.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
  try{return route.fulfill({
   contentType:path.extname(local)==='.html'?'text/html':'text/javascript',
   body:fs.readFileSync(local)
  });}
  catch{return route.fulfill({status:404,body:''});}
 });
 await page.route('https://esm.sh/**',route=>{
  const url=route.request().url();
  if(url.includes('tus-js-client'))return route.fulfill({
   contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},
   body:`export class Upload {
    constructor(file,opts){this.file=file;this.opts=opts;}
    async findPreviousUploads(){return [];}
    resumeFromPreviousUpload(){}
    start(){
      window.hmlMock.put(this.opts.metadata.objectName,this.file);
      this.opts.onProgress(Math.floor(this.file.size/2),this.file.size);
      this.opts.onProgress(this.file.size,this.file.size);
      this.opts.onSuccess();
    }
    abort(){return Promise.resolve();}
   }`
  });
  return route.fulfill({
   contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},
   body:'export const createClient=(...args)=>window.hmlMock.createClient(...args)'
  });
 });
 await page.goto(base+pathname);
 return {page,errors};
}

test('admin HML does not create files until explicit click',async()=>{
 const {page,errors}=await boot();
 try{
  await page.locator('#hml-small').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('hml-small').disabled===false);
  const state=await page.evaluate(()=>({
   files:window.hmlMock.files.size,
   calls:window.hmlMock.calls.filter(c=>c.kind==='upload'||c.kind==='remove').length
  }));
  assert.deepEqual(state,{files:0,calls:0});
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('non-admin cannot access HML controls or create test objects',async()=>{
 const {page,errors}=await boot({admin:false});
 try{
  await page.waitForFunction(()=>document.getElementById('hml-status').textContent.includes('Acesso não liberado'));
  assert.equal(await page.locator('#hml-controls').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.hmlMock.files.size),0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('small synthetic PDF exercises Storage register, SHA, anon deny and duplicate prevention',async()=>{
 const {page,errors}=await boot();
 try{
  await page.locator('#hml-small').waitFor({state:'visible'});
  await page.locator('#hml-small').click();
  await page.waitForFunction(()=>document.getElementById('hml-status').textContent.includes('APROVADO'),null,{timeout:15000});
  const result=await page.evaluate(()=>{
   const paths=window.hmlMock.uploaded;
   const calls=window.hmlMock.calls;
   return {paths,uploads:calls.filter(c=>c.kind==='upload'),
    downloads:calls.filter(c=>c.kind==='download'),
    rpcs:calls.filter(c=>c.kind==='rpc').map(c=>c.name),
    objects:window.hmlMock.files.size,
    rendered:document.getElementById('hml-results').innerText,
    displayedPath:document.getElementById('hml-test-path').value};
  });
  assert.equal(result.objects,1);
  assert.equal(result.uploads.length,2,'first upload + 409 duplicate check');
  assert.ok(result.uploads.every(u=>u.bucket==='xrmovi-hml-storage'&&u.upsert===false));
  assert.equal(result.paths.length,1);
  assert.ok(result.downloads.some(c=>c.anonymous===true));
  assert.ok(result.rpcs.includes('xrmovi_hml_storage_inspect'));
  assert.match(result.rendered,/SHA-256 idêntico.*Sim/s);
  assert.match(result.rendered,/Negativa anônima.*Confirmada/s);
  assert.match(result.displayedPath,/^11111111-1111-4111-8111-111111111111\/hml\/[a-f0-9-]{36}\/hml-[a-f0-9-]{36}\.pdf$/);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('large synthetic PDF takes TUS, measures intermediate progress, no billing calls',async()=>{
 const {page,errors}=await boot();
 try{
  await page.locator('#hml-large').waitFor({state:'visible'});
  await page.locator('#hml-large').click();
  await page.waitForFunction(()=>document.getElementById('hml-status').textContent.includes('APROVADO'),null,{timeout:30000});
  const result=await page.evaluate(()=>({
   files:[...window.hmlMock.files.values()].map(b=>b.size),
   transportText:document.getElementById('hml-results').innerText,
   calls:window.hmlMock.calls.map(c=>c.name||c.kind),
   progress:document.getElementById('hml-progress').value
  }));
  assert.equal(result.files.length,1);
  assert.ok(result.files[0]>6*1024*1024);
  assert.match(result.transportText,/Progresso TUS observado.*Sim/s);
  assert.equal(result.progress,100);
  assert.equal(result.calls.filter(n=>/payment|checkout|subscription/i.test(n)).length,0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('manual cleanup touches only generated HML bucket object and requires confirm',async()=>{
 const {page,errors}=await boot();
 try{
  await page.locator('#hml-small').waitFor({state:'visible'});
  await page.locator('#hml-small').click();
  await page.waitForFunction(()=>document.getElementById('hml-status').textContent.includes('APROVADO'));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#hml-clean').click();
  await page.waitForFunction(()=>document.getElementById('hml-status').textContent.includes('Limpeza restrita'));
  const result=await page.evaluate(()=>({
   files:window.hmlMock.files.size,
   removes:window.hmlMock.calls.filter(c=>c.kind==='remove')
  }));
  assert.equal(result.files,0);
  assert.equal(result.removes.length,1);
  assert.equal(result.removes[0].bucket,'xrmovi-hml-storage');
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('mobile HML maintains visible controls without horizontal overflow',async()=>{
 const {page,errors}=await boot({width:320});
 try{
  await page.locator('#hml-small').waitFor({state:'visible'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=2,'Horizontal overflow '+overflow);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
