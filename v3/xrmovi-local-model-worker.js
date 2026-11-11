/* XRMOVI V4 optional local-only browser inference worker. No Supabase data or API keys. */
import {pipeline} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
const MODEL='onnx-community/Qwen2.5-0.5B-Instruct';
let generator=null;
let busy=false;
const safeOutput=data=>{
 const result=data?.[0]?.generated_text;
 if(Array.isArray(result))return String(result[result.length-1]?.content||'').trim();
 return typeof result==='string'?result.trim():String(result?.content||'').trim();
};
self.addEventListener('message',async({data:msg})=>{
 if(!msg||typeof msg!=='object')return;
 if(msg.kind==='init'){
  if(generator)return;
  try{
   self.postMessage({kind:'status',status:'loading',message:'Preparando o modelo local (download grande)…'});
   generator=await pipeline('text-generation',MODEL,{
    device:'webgpu',dtype:'q4',
    progress_callback:info=>{
     if(info?.status==='progress'&&Number.isFinite(info.progress)){
      self.postMessage({kind:'progress',percent:Math.min(100,Math.max(0,Number(info.progress).toFixed(0))),file:String(info.file||'').slice(0,70)});
     }
    }
   });
   // An actual generation must succeed before the interface reports the model as ready.
   const proof=await generator([{role:'system',content:'Responda com uma palavra.'},{role:'user',content:'Escreva OK.'}],{max_new_tokens:8,do_sample:false});
   if(!safeOutput(proof))throw Error('O teste de inferência não retornou texto.');
   self.postMessage({kind:'ready',model:MODEL});
  }catch(error){generator=null;self.postMessage({kind:'error',message:String(error?.message||'Modelo indisponível').slice(0,220)});}
  return;
 }
 if(msg.kind==='ask'){
  if(!generator||busy){self.postMessage({kind:'error-answer',id:msg.id,message:'O modelo ainda não está pronto.'});return}
  busy=true;
  try{
   const question=String(msg.question||'').slice(0,300);
   const knowledge=String(msg.knowledge||'').slice(0,4500);
   const prompt=[
    {role:'system',content:'Você é um assistente de treinamento de frotas XRMOVI. Responda em português do Brasil. Use somente as instruções do manual fornecido. Não invente dados de empresas, valores, números, placas, botões ou funcionalidades. Não execute ações, código ou ferramentas. Quando não houver respaldo no manual, diga que não sabe e oriente procurar a aula ou o suporte. Responda em até 130 palavras.'},
    {role:'user',content:'MANUAL AUTORIZADO:\n'+knowledge+'\nPERGUNTA: '+question}
   ];
   const raw=await generator(prompt,{max_new_tokens:160,do_sample:false});
   const text=safeOutput(raw).slice(0,1200);
   self.postMessage({kind:'answer',id:msg.id,text:text||'Não encontrei uma explicação segura no manual.'});
  }catch(error){self.postMessage({kind:'error-answer',id:msg.id,message:String(error?.message||'Falha ao gerar resposta').slice(0,200)})}
  finally{busy=false;}
 }
});
