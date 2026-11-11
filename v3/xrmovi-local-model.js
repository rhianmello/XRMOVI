/* XRMOVI optional experimental on-device model. It never performs fleet commands. */
(function(root){
 'use strict';
 let worker=null,status='off',message='Desligado',progress=0;
 let subscribers=new Set(),pending=new Map(),counter=0,loadResolve=null,loadReject=null;
 const emit=()=>{for(const fn of subscribers){try{fn({status,message,progress})}catch{}}};
 function set(next,text,pct){status=next;message=text;if(pct!=null)progress=pct;emit();}
 async function supported(){
  if(!root.isSecureContext||!navigator.gpu?.requestAdapter)return false;
  try{return Boolean(await navigator.gpu.requestAdapter())}catch{return false}
 }
 function failPending(error){
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(error)}
  pending.clear();
  if(loadReject)loadReject(error);
  loadResolve=null;loadReject=null;
 }
 function disable(){
  const err=new Error('Carregamento ou geração cancelado.');
  failPending(err);
  if(worker){worker.terminate();worker=null}
  progress=0;set('off','Desligado');
 }
 async function enable(){
  if(status==='ready')return true;
  if(status==='loading')return false;
  if(!await supported()){set('unsupported','Este navegador ou GPU não permite IA local. O assistente essencial continua disponível.');return false}
  set('loading','Iniciando download de modelo quantizado (centenas de MB)…',0);
  try{
   worker=new Worker(new URL('./xrmovi-local-model-worker.js',location.href),{type:'module'});
   worker.onerror=event=>{event.preventDefault?.();const err=new Error('Falha ao carregar o motor local de IA.');failPending(err);worker?.terminate();worker=null;set('error',err.message)};
   worker.onmessage=({data})=>{
    if(!data)return;
    if(data.kind==='progress'){set('loading','Baixando modelo local: '+(data.percent||0)+'%'+(data.file?' · '+data.file:''),data.percent||0);}
    else if(data.kind==='status'){set('loading',data.message||'Carregando IA local…');}
    else if(data.kind==='ready'){
     set('ready','IA Local experimental carregada e testada neste dispositivo.',100);
     loadResolve?.(true);loadResolve=null;loadReject=null;
    }else if(data.kind==='error'){
     const err=new Error(data.message||'Modelo indisponível');
     failPending(err);worker?.terminate();worker=null;set('error','Falha na IA local: '+err.message);
    }else if(data.kind==='answer'||data.kind==='error-answer'){
     const p=pending.get(data.id);if(!p)return;
     clearTimeout(p.timer);pending.delete(data.id);
     if(data.kind==='answer')p.resolve(String(data.text||'').slice(0,1200));
     else p.reject(new Error(data.message||'Resposta indisponível'));
    }
   };
   const promise=new Promise((resolve,reject)=>{loadResolve=resolve;loadReject=reject});
   worker.postMessage({kind:'init'});
   return await promise;
  }catch(error){
   if(worker){worker.terminate();worker=null}
   if(status!=='off')set('error','IA local indisponível: '+String(error?.message||'Erro de inicialização'));
   // An intentional cancellation remains Off rather than showing a false failure.
   return false;
  }
 }
 async function ask(question){
  if(status!=='ready'||!worker)throw Error('Modelo local não carregado.');
  const course=root.XrmoviGuideCourse;
  const chosen=course?.find?.(String(question||''))||null;
  const candidate=chosen?[chosen]:(course?.topics||[]).filter(t=>['Primeiros passos','Indicadores'].includes(t.group)).slice(0,5);
  const knowledge=candidate.map(t=>t.title+': '+t.intro+' Passos: '+t.steps.join(' ')+' '+(t.note||'')).join('\n').slice(0,4500);
  const id=++counter;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(new Error('A geração excedeu o tempo suportado.'))},75000);
   pending.set(id,{resolve,reject,timer});
   worker.postMessage({kind:'ask',id,question:String(question||'').slice(0,300),knowledge});
  });
 }
 root.XrmoviLocalModel=Object.freeze({supported,enable,disable,ask,subscribe(fn){subscribers.add(fn);fn({status,message,progress});return()=>subscribers.delete(fn)},isReady:()=>status==='ready'});
})(window);
