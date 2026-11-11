'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const dir=path.join(__dirname,'..');
const manager=fs.readFileSync(path.join(dir,'xrmovi-local-model.js'),'utf8');
const worker=fs.readFileSync(path.join(dir,'xrmovi-local-model-worker.js'),'utf8');
function env(gpu=true){
 let created=0,terminated=0;
 class MockWorker{
  constructor(){created++;this.onmessage=null;this.onerror=null;}
  postMessage(msg){
   if(msg.kind==='init')this.onmessage({data:{kind:'ready',model:'test-only'}});
   if(msg.kind==='ask')this.onmessage({data:{kind:'answer',id:msg.id,text:'Resposta local simulada'}});
  }
  terminate(){terminated++;}
 }
 const window={isSecureContext:true,XrmoviGuideCourse:{topics:[],find:()=>null}};
 const context={window,location:{href:'https://example.com/v3/'},navigator:{gpu:gpu?{requestAdapter:async()=>({})}:undefined},Worker:MockWorker,URL,setTimeout,clearTimeout};
 vm.runInNewContext(manager,context,{timeout:1000});
 return {api:window.XrmoviLocalModel,created:()=>created,terminated:()=>terminated};
}
test('model downloads are opt-in and never start without a user action',async()=>{
 const e=env(true);assert.equal(e.created(),0);
 assert.equal(e.api.isReady(),false);
 await e.api.enable();assert.equal(e.created(),1);
 assert.equal(e.api.isReady(),true);
 assert.equal(await e.api.ask('O que é operacional?'),'Resposta local simulada');
 e.api.disable();assert.equal(e.api.isReady(),false);
 assert.equal(e.terminated(),1);
});
test('devices without WebGPU keep the essential assistant, without model loading',async()=>{
 const e=env(false);assert.equal(await e.api.enable(),false);assert.equal(e.created(),0);
 assert.equal(e.api.isReady(),false);
});
test('worker requires a successful local inference proof before sending ready',()=>{
 assert.match(worker,/const proof=await generator\(/);
 assert.match(worker,/if\(!safeOutput\(proof\)\)throw Error/);
 assert.match(worker,/device:'webgpu',dtype:'q4'/);
 assert.match(worker,/kind:'ready'/);
 assert.ok(!worker.includes('eval(')&&!worker.includes('new Function('));
});
test('generated answers have no execution or database bridge',()=>{
 assert.ok(!worker.includes('eval(')&&!worker.includes('new Function('));
 assert.match(worker,/Não execute ações, código ou ferramentas/);
 assert.match(worker,/MANUAL AUTORIZADO/);
});
