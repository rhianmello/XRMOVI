// XRMOVI — transferência privada e retomável, sem alterar ACL, RLS ou documentos.
import { memoryTusUrlStorage } from './storage-tus-memory.js';
// TUS só é utilizado para arquivos acima de 6 MiB; uploads pequenos seguem o SDK.
export const TUS_THRESHOLD_BYTES = 6 * 1024 * 1024;
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const PROJECT_ID = 'ztqtcbzjesrkuaijmylm';
const TUS_URL = 'https://' + PROJECT_ID + '.storage.supabase.co/storage/v1/upload/resumable';

function errorText(error) {
 return error?.message || String(error || 'Falha de transferência.');
}
function abortError() {
 const error = new Error('Envio interrompido. Selecione o mesmo arquivo para tentar retomá-lo.');
 error.name = 'AbortError';
 return error;
}
function validatePath(path, bucket, file) {
 if (!/^xrmovi-[a-z-]+$/.test(bucket) || typeof path !== 'string' ||
     path.includes('..') || path.startsWith('/') || path.length > 450 ||
     !/^[\w-]+\/[\w-]+\/[\w-]+\/[\w.-]+$/.test(path)) {
  throw new Error('Destino de armazenamento inválido.');
 }
 if (!(file instanceof Blob) || !file.size) throw new Error('Arquivo inválido.');
}

/**
 * @returns {{ transport: "standard"|"tus", bytes: number }}
 * onProgress is real network progress ONLY in the TUS branch; ordinary SDK
 * uploads deliberately expose no fake percentages.
 */
export async function transferPrivateObject({
 client, bucket = 'xrmovi-record-attachments', path, file,
 onProgress = () => {}, signal, loadTus
} = {}) {
 validatePath(path, bucket, file);
 if (signal?.aborted) throw abortError();
 if (file.size <= TUS_THRESHOLD_BYTES) {
  onProgress({ phase:'sending', transport:'standard', percentage:null, sent:null, total:file.size });
  // The Storage SDK's default path does not offer a reliable upload progress API.
  const { error } = await client.storage.from(bucket).upload(path,file,{
   contentType:file.type, upsert:false, cacheControl:'3600'
  });
  if (error) throw error;
  if (signal?.aborted) throw abortError();
  onProgress({ phase:'uploaded', transport:'standard', percentage:100, sent:file.size, total:file.size });
  return { transport:'standard',bytes:file.size };
 }
 // This branch is opt-in by file size. No fallback to a new upload after a TUS
 // request may have reached the server: doing so could create duplicates.
 const { data, error: authError } = await client.auth.getSession();
 if (authError) throw authError;
 const session = data?.session;
 if (!session?.access_token || !session?.user?.id) throw new Error('Faça login novamente para enviar este documento.');
 const importer = loadTus || (() => import('https://esm.sh/tus-js-client@4.3.1'));
 let tus;
 try { tus = await importer(); } catch {
  // CDN unavailable before *any* resumable request. One standard upload to
  // the same random path is safe; NEVER fallback after an uncertain TUS POST.
  if (signal?.aborted) throw abortError();
  onProgress({phase:'sending',transport:'standard',percentage:null,sent:null,total:file.size});
  const {error:storageError}=await client.storage.from(bucket).upload(path,file,{
   contentType:file.type,upsert:false,cacheControl:'3600'
  });
  if (storageError) throw storageError;
  onProgress({phase:'uploaded',transport:'standard',percentage:100,sent:file.size,total:file.size});
  return {transport:'standard',bytes:file.size};
 }
 if (!tus?.Upload) throw new Error('Biblioteca de envio retomável indisponível.');
 if (signal?.aborted) throw abortError();
 onProgress({ phase:'preparing', transport:'tus', percentage:0, sent:0, total:file.size });

 return new Promise((resolve,reject)=>{
  let settled=false;
  let upload;
  const finish=(error,result)=>{
   if (settled) return;
   settled=true;
   signal?.removeEventListener('abort', onAbort);
   if (error) reject(error); else resolve(result);
  };
  const onAbort=()=>{
   if (settled) return;
   // Do not terminate the remote upload: the same file can resume it later.
   Promise.resolve(upload?.abort(false)).catch(()=>{});
   finish(abortError());
  };
  // Prevent resuming a different file that happens to have the same name,
  // MIME and length. The fingerprint is never written to persistent storage.
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha = [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const scopedFingerprint = [ 'xrmovi-v2',session.user.id,bucket,path,file.size,file.type,sha ].join(':');
  try {
   upload = new tus.Upload(file,{
    endpoint:TUS_URL,
    headers:{
     authorization:'Bearer ' + session.access_token,
     apikey:client.supabaseKey || '',
     'x-upsert':'false'
    },
    uploadDataDuringCreation:true,
    storeFingerprintForResuming:true,
    // The default tus-js-client stores URL + fingerprint in localStorage.
    // Keep resumability only within this tab until a server-mediated method
    // is reviewed; no durable URL, identity or path at rest.
    urlStorage:memoryTusUrlStorage,
    removeFingerprintOnSuccess:true,
    chunkSize:TUS_CHUNK_BYTES,
    retryDelays:[0,1500,4000,8000],
    fingerprint:async()=>scopedFingerprint,
    metadata:{bucketName:bucket, objectName:path, contentType:file.type, cacheControl:'3600'},
    onProgress:(sent,total)=>{
     if (!Number.isFinite(total)||total<=0) return;
     onProgress({phase:'sending',transport:'tus',percentage:Math.min(99,Math.floor(sent*100/total)),sent,total});
    },
    onError:e=>finish(new Error('Envio interrompido: '+errorText(e)+'. Selecione novamente o mesmo arquivo para tentar retomar.')),
    onSuccess:()=>{
     onProgress({phase:'uploaded',transport:'tus',percentage:100,sent:file.size,total:file.size});
     finish(null,{transport:'tus',bytes:file.size});
    }
   });
   signal?.addEventListener('abort',onAbort,{once:true});
   if (signal?.aborted) { onAbort(); return; }
   Promise.resolve(upload.findPreviousUploads()).then(previous=>{
    if (settled) return;
    const match=Array.isArray(previous) ? previous.find(p=>
     p?.metadata?.bucketName===bucket && p.metadata.objectName===path &&
     Number(p?.size)===file.size) : null;
    if (match) {
     upload.resumeFromPreviousUpload(match);
     onProgress({phase:'resuming',transport:'tus',percentage:null,sent:null,total:file.size});
    }
    if (!settled) upload.start();
   }).catch(e=>finish(new Error('Não foi possível consultar o envio anterior: '+errorText(e))));
  }catch(e){finish(e);}
 });
}
