const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),origin='https://xrmovi.test';
const cid='11111111-1111-4111-8111-111111111111';
const rid='22222222-2222-4222-8222-222222222222';
const objectPath=cid+'/vehicle/'+rid+'/33333333-3333-4333-8333-333333333333.pdf';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>browser?.close());

async function open(){
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(origin+'/**',route=>{
  const location=new URL(route.request().url()).pathname;
  if(location==='/test.html')return route.fulfill({
   contentType:'text/html',
   body:'<!doctype html><html><meta charset="utf-8"><body>Storage test</body></html>'
  });
  const file=path.resolve(root,location.slice(1));
  if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
  try{return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file)});}
  catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto(origin+'/test.html');
 return {page,errors};
}

test('small files keep standard upload, private object scope and indeterminate progress',async()=>{
 const {page,errors}=await open();
 try{
  const result=await page.evaluate(async path=>{
   const {transferPrivateObject}=await import('/v3/storage-transfer.js');
   let uploaded, events=[];
   const client={storage:{from:bucket=>({upload:async(filePath,file,opts)=>{
    uploaded={bucket,filePath,size:file.size,upsert:opts.upsert,type:opts.contentType};
    return {error:null};
   }})}};
   const file=new File(['small-document'],'doc.pdf',{type:'application/pdf'});
   const result=await transferPrivateObject({client,path,file,onProgress:e=>events.push(e)});
   return {result,uploaded,events};
  },objectPath);
  assert.equal(result.result.transport,'standard');
  assert.equal(result.uploaded.bucket,'xrmovi-record-attachments');
  assert.equal(result.uploaded.upsert,false);
  assert.equal(result.uploaded.filePath,objectPath);
  assert.equal(result.events[0].percentage,null);
  assert.equal(result.events.at(-1).percentage,100);
  assert.deepEqual(errors,[]);
 } finally{await page.close();}
});

test('TUS over 6MiB reports real progress, respects 6MiB chunk and disables overwrites',async()=>{
 const {page,errors}=await open();
 try{
  const result=await page.evaluate(async path=>{
   const {transferPrivateObject,TUS_CHUNK_BYTES,TUS_THRESHOLD_BYTES}=await import('/v3/storage-transfer.js');
   let config,events=[],usedStandard=false,started=0;
   class Upload{
    constructor(file,opts){config=opts;this.file=file;}
    findPreviousUploads(){return Promise.resolve([]);}
    start(){started++;config.onProgress(this.file.size/2,this.file.size);config.onProgress(this.file.size,this.file.size);config.onSuccess();}
    abort(){return Promise.resolve();}
   }
   const client={
    auth:{getSession:async()=>({data:{session:{access_token:'test-only-token',user:{id:'user-a'}}}})},
    supabaseKey:'test-publishable-key',
    storage:{from:()=>({upload:async()=>{usedStandard=true;return {error:null}}})}
   };
   const file=new File([new Uint8Array(TUS_THRESHOLD_BYTES+128)],'large.pdf',{type:'application/pdf'});
   const result=await transferPrivateObject({client,path,file,loadTus:async()=>({Upload}),onProgress:e=>events.push(e)});
   return {transport:result.transport,events,usedStandard,started,
    chunk:config.chunkSize,metadata:config.metadata,endpoint:config.endpoint,
    noUpsert:config.headers['x-upsert']==='false',retry:config.retryDelays.length,
    credential:config.headers.authorization==='Bearer test-only-token',
    fingerprint:await config.fingerprint(file,config),expectedChunk:TUS_CHUNK_BYTES};
  },objectPath);
  assert.equal(result.transport,'tus');
  assert.equal(result.usedStandard,false);
  assert.equal(result.started,1);
  assert.equal(result.chunk,6*1024*1024);
  assert.equal(result.metadata.objectName,objectPath);
  assert.equal(result.metadata.bucketName,'xrmovi-record-attachments');
  assert.match(result.endpoint,/\.storage\.supabase\.co\/storage\/v1\/upload\/resumable$/);
  assert.equal(result.noUpsert,true);
  assert.equal(result.credential,true);
  assert.ok(result.events.some(x=>x.percentage===50&&x.transport==='tus'));
  assert.equal(result.events.at(-1).percentage,100);
  assert.ok(result.fingerprint.includes(objectPath));
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('TUS resumes only matching tenant, bucket, path and file size',async()=>{
 const {page,errors}=await open();
 try {
  const result=await page.evaluate(async path=>{
   const {transferPrivateObject,TUS_THRESHOLD_BYTES}=await import('/v3/storage-transfer.js');
   let config,resume=null,started=0;
   const file=new File([new Uint8Array(TUS_THRESHOLD_BYTES+16)],'same.pdf',{type:'application/pdf'});
   class Upload{
    constructor(_file,options){config=options;}
    findPreviousUploads(){return Promise.resolve([
     {metadata:{bucketName:'other-bucket',objectName:path},size:file.size},
     {metadata:{bucketName:'xrmovi-record-attachments',objectName:path},size:8},
     {metadata:{bucketName:'xrmovi-record-attachments',objectName:path},size:file.size,uploadUrl:'https://tus.test/resume'}
    ]);}
    resumeFromPreviousUpload(item){resume=item.uploadUrl;}
    start(){started++;config.onSuccess();}
   }
   const makeClient=id=>({supabaseKey:'key',auth:{getSession:async()=>({data:{session:{access_token:'token',user:{id}}}})}});
   await transferPrivateObject({client:makeClient('user-a'),file,path,loadTus:async()=>({Upload})});
   const one=await config.fingerprint(file,config);
   await transferPrivateObject({client:makeClient('user-b'),file,path,loadTus:async()=>({Upload})});
   const two=await config.fingerprint(file,config);
   return {one,two,resume,started};
  },objectPath);
  assert.equal(result.resume,'https://tus.test/resume');
  assert.notEqual(result.one,result.two);
  assert.equal(result.started,2);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('TUS cancellation stops transfer without terminating resumable resource',async()=>{
 const {page,errors}=await open();
 try{
  const result=await page.evaluate(async path=>{
   const {transferPrivateObject,TUS_THRESHOLD_BYTES}=await import('/v3/storage-transfer.js');
   const controller=new AbortController();
   let aborted=null,config;
   class Upload{
    constructor(_file,options){config=options;}
    findPreviousUploads(){return Promise.resolve([]);}
    start(){controller.abort();}
    abort(terminate){aborted=terminate;return Promise.resolve();}
   }
   const client={supabaseKey:'key',auth:{getSession:async()=>({data:{session:{access_token:'token',user:{id:'user-a'}}}})}};
   try{await transferPrivateObject({client,file:new File([new Uint8Array(TUS_THRESHOLD_BYTES+1)],'x.pdf',{type:'application/pdf'}),
       path,signal:controller.signal,loadTus:async()=>({Upload})});return {unexpected:true};}
   catch(error){return {name:error.name,aborted};}
  },objectPath);
  assert.deepEqual(result,{name:'AbortError',aborted:false});
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('a TUS network error never silently retries as a fresh standard upload',async()=>{
 const {page,errors}=await open();
 try{
  const result=await page.evaluate(async path=>{
   const {transferPrivateObject,TUS_THRESHOLD_BYTES}=await import('/v3/storage-transfer.js');
   let standardCalls=0;
   class Upload{
    constructor(_file,options){this.options=options;}
    findPreviousUploads(){return Promise.resolve([]);}
    start(){this.options.onError(new Error('network disconnected'));}
   }
   const client={supabaseKey:'key',auth:{getSession:async()=>({data:{session:{access_token:'token',user:{id:'user-a'}}}})},
    storage:{from:()=>({upload:async()=>{standardCalls++;return {error:null};}})}};
   try {await transferPrivateObject({
    client,file:new File([new Uint8Array(TUS_THRESHOLD_BYTES+1)],'big.pdf',{type:'application/pdf'}),
    path,loadTus:async()=>({Upload})});return {unexpected:true};}
   catch(error){return {message:error.message,standardCalls};}
  },objectPath);
  assert.equal(result.standardCalls,0);
  assert.match(result.message,/interrompido/i);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('invalid paths and missing authenticated sessions reject before upload',async()=>{
 const {page,errors}=await open();
 try{
  const result=await page.evaluate(async path=>{
   const {transferPrivateObject,TUS_THRESHOLD_BYTES}=await import('/v3/storage-transfer.js');
   const file=new File([new Uint8Array(TUS_THRESHOLD_BYTES+1)],'large.pdf',{type:'application/pdf'});
   const client={auth:{getSession:async()=>({data:{session:null}})}};
   let failures=[];
   for(const objectPath of ['../escape.pdf','company/../../../file.pdf',path]){
    try{await transferPrivateObject({client,path:objectPath,file,loadTus:async()=>({Upload:class{}})});}
    catch(error){failures.push(error.message);}
   }
   return failures;
  },objectPath);
  assert.equal(result.length,3);
  assert.match(result.at(-1),/login/i);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});


test('CDN import outage falls back only before any TUS POST, keeping object path and upsert false',async()=>{
 const {page,errors}=await open();
 try{
  const result=await page.evaluate(async path=>{
   const {transferPrivateObject,TUS_THRESHOLD_BYTES}=await import('/v3/storage-transfer.js');
   let requests=0,seenPath=null,upsert=null,events=[];
   const client={
    supabaseKey:'publishable',
    auth:{getSession:async()=>({data:{session:{access_token:'test-token',user:{id:'user-a'}}}})},
    storage:{from:bucket=>({upload:async(p,file,options)=>{
     requests++;seenPath=p;upsert=options.upsert;return {error:null};
    }})}
   };
   const file=new File([new Uint8Array(TUS_THRESHOLD_BYTES+1)],'large.pdf',{type:'application/pdf'});
   const answer=await transferPrivateObject({
    client,file,path,loadTus:async()=>{throw Error('CDN unavailable');},
    onProgress:p=>events.push(p)
   });
   return {requests,seenPath,upsert,transport:answer.transport,events};
  },objectPath);
  assert.equal(result.requests,1);
  assert.equal(result.seenPath,objectPath);
  assert.equal(result.upsert,false);
  assert.equal(result.transport,'standard');
  assert.equal(result.events[0].percentage,null);
  assert.equal(result.events.at(-1).percentage,100);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});


test('session metrics never combine two companies and reflect measured byte savings only',async()=>{
 const {page,errors}=await open();
 try{
  const result=await page.evaluate(async()=>{
   const {recordStorageMetric,getStorageMetrics,storageSessionSummary}=await import('/v3/storage-metrics.js');
   recordStorageMetric('company-A','complete',{originalBytes:1000,finalBytes:600});
   recordStorageMetric('company-A','failed');
   recordStorageMetric('company-A','interrupted');
   recordStorageMetric('company-B','complete',{originalBytes:300,finalBytes:300});
   // Invalid savings must not inflate a customer's totals.
   recordStorageMetric('company-A','complete',{originalBytes:100,finalBytes:900});
   return {a:getStorageMetrics('company-A'),b:getStorageMetrics('company-B'),
    summary:storageSessionSummary('company-A')};
  });
  assert.equal(result.a.completed,1);
  assert.equal(result.a.savedBytes,400);
  assert.equal(result.a.failed,1);
  assert.equal(result.a.interrupted,1);
  assert.equal(result.b.completed,1);
  assert.equal(result.b.savedBytes,0);
  assert.match(result.summary,/Nesta sessão/);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
