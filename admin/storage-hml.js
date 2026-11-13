// XRMOVI 7B — opt-in administrator-only production Storage homologation.
// No payment, client record, plan change or upload takes place on page load.
// Only the dedicated private xrmovi-hml-storage bucket can be written to.
import { transferPrivateObject, TUS_THRESHOLD_BYTES } from '../v3/storage-transfer.js?v=20261113-7b-1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const PROJECT_ID='ztqtcbzjesrkuaijmylm';
const BUCKET='xrmovi-hml-storage';
const el=id=>document.getElementById(id);
const reports=[];
const objects=new Map();
let client=null,anonClient=null,user=null,current=null,initialized=false;

function tell(message){el('hml-status').textContent=message;}
function stamp(){return new Date().toISOString();}
function bytes(n){return Number(n||0).toLocaleString('pt-BR')+' bytes';}
function shaHex(buffer){return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function hashBlob(blob){return shaHex(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));}
function assert(condition,reason){if(!condition)throw new Error(reason);}
function pdfFixture(large=false){
  // ASCII-only, syntactically valid single-page PDF with correct xref offsets.
  // The >6MiB case uses harmless PDF comment lines immediately before xref.
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  const appendObject=(number,body)=>{
    offsets[number]=pdf.length;
    pdf+=number+' 0 obj\n'+body+'\nendobj\n';
  };
  appendObject(1,'<</Type /Catalog /Pages 2 0 R>>');
  appendObject(2,'<</Type /Pages /Kids [3 0 R] /Count 1>>');
  appendObject(3,'<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>');
  const content='BT /F1 15 Tf 36 710 Td (XRMOVI TEST FILE - NO CUSTOMER DATA) Tj ET\n';
  appendObject(4,'<</Length '+content.length+'>>\nstream\n'+content+'endstream');
  appendObject(5,'<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>');
  if(large){
    const line='%HML-'+('X'.repeat(121))+'\n';
    const desired=7*1024*1024+32768;
    pdf+=line.repeat(Math.ceil((desired-pdf.length-250)/line.length));
  }
  const xrefOffset=pdf.length;
  pdf+='xref\n0 6\n0000000000 65535 f \n';
  for(let i=1;i<=5;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n'+xrefOffset+'\n%%EOF\n';
  return new File([new TextEncoder().encode(pdf)],large?'hml-7mb.pdf':'hml-small.pdf',
    {type:'application/pdf'});
}
function summaryRow(label,value){
  const row=document.createElement('div');row.className='hml-result-row';
  const strong=document.createElement('strong');strong.textContent=label;
  const detail=document.createElement('span');detail.textContent=String(value);
  row.append(strong,detail);return row;
}
function redraw(){
  const root=el('hml-results');root.replaceChildren();
  if(!reports.length){root.textContent='Nenhuma homologação executada nesta sessão.';return;}
  for(const result of reports.slice().reverse()){
    const card=document.createElement('article');card.className='hml-result';
    card.append(summaryRow(result.label,result.outcome),
      summaryRow('Momento',result.time),
      summaryRow('Bytes enviados',result.input_bytes),
      summaryRow('Transferência',result.transport||'Não concluída'),
      summaryRow('Registro PostgreSQL',result.db_registered===true?'Confirmado':result.db_registered===false?'Não confirmado':'Não executado'),
      summaryRow('SHA-256 idêntico',result.hash_match===true?'Sim':result.hash_match===false?'Não':'Não testado'),
      summaryRow('Negativa anônima',result.anonymous_denied===true?'Confirmada':result.anonymous_denied===false?'Falhou':'Não testada'),
      summaryRow('Progresso TUS observado',result.tus_progress===true?'Sim':result.tus_progress===false?'Não observado':'Não testado'),
      summaryRow('Resultado de duplicidade',result.duplicate_denied===true?'Bloqueada':result.duplicate_denied===false?'Não bloqueada':'Não testado'));
    if(result.error)card.append(summaryRow('Erro (sem credenciais)',result.error));
    root.append(card);
  }
}
function statusButtons(){
  const busy=!!current?.running;
  el('hml-small').disabled=!initialized||busy;
  el('hml-large').disabled=!initialized||busy;
  el('hml-own').disabled=!initialized||busy;
  el('hml-stop').disabled=!busy;
  el('hml-resume').disabled=!initialized||busy||current?.state!=='interrupted';
  el('hml-clean').disabled=!initialized||busy||objects.size===0;
  el('hml-export').disabled=reports.length===0;
}
function safeError(e){
  const message=String(e?.message||'Transferência não concluída');
  // Do not include raw requests, tokens, signed URLs, file paths or stack traces.
  if(/https?:\/\/|Bearer |eyJ[A-Za-z0-9_-]{15}/.test(message))return 'Falha de rede ou autorização. Consulte o console local, sem divulgar tokens.';
  return message.slice(0,180);
}
async function verifyLogin(){
  const {data,error}=await client.auth.getUser();
  assert(!error&&data?.user?.id===user?.id,'Sessão alterada. Atualize a página antes de continuar.');
  const {data:admin,error:roleError}=await client.rpc('xrmovi_platform_is_admin');
  assert(!roleError&&admin===true,'O usuário atual não é administrador da plataforma.');
}
async function inspect(path){
  const {data,error}=await client.rpc('xrmovi_hml_storage_inspect',{p_path:path});
  if(error)throw error;
  return data;
}
function progress(event){
  if(!current)return;
  const meter=el('hml-progress');
  if(event.transport==='tus'&&Number.isFinite(event.percentage)){
    meter.value=event.percentage;
    tell('Envio TUS: '+event.percentage+'% · '+bytes(event.sent)+' de '+bytes(event.total)+'.');
  }else if(event.phase==='sending'){
    meter.removeAttribute('value');
    tell('Transferência comum (sem porcentagem real disponível)…');
  }else if(event.phase==='resuming')tell('Tentando retomar transferência TUS na mesma aba…');
  current.progress.push({phase:event.phase,transport:event.transport||null,
    sent:Number.isFinite(event.sent)?event.sent:null,total:Number.isFinite(event.total)?event.total:null,
    percentage:Number.isFinite(event.percentage)?event.percentage:null});
}
async function verifyReceipt(test){
  const check=await inspect(test.path);
  test.evidence.db_registered=check.registered===true&&Number(check.object_count)===1;
  test.evidence.stored_bytes=Number(check.stored_bytes||0);
  assert(test.evidence.db_registered,'Objeto não foi registrado unicamente no PostgreSQL.');
  assert(test.evidence.stored_bytes===test.file.size,'Tamanho registrado difere dos bytes enviados.');
  const {data:download,error}=await client.storage.from(BUCKET).download(test.path);
  if(error)throw error;
  test.evidence.downloaded_bytes=data.size;
  test.evidence.sha256_download=await hashBlob(data);
  test.evidence.hash_match=test.evidence.sha256_download===test.evidence.sha256_original;
  assert(test.evidence.hash_match,'SHA-256 não corresponde ao arquivo original.');
  // A separate anonymous client must never be able to read the test bucket.
  const anonymous=await anonClient.storage.from(BUCKET).download(test.path);
  test.evidence.anonymous_denied=!!anonymous.error;
  assert(test.evidence.anonymous_denied,'URGENTE: download anônimo não foi bloqueado.');
  // Reattempt only a tiny synthetic file; never resend a 7 MiB payload solely to test conflicts.
  if(test.file.size<100000){
    const duplicate=await client.storage.from(BUCKET).upload(test.path,test.file,
      {upsert:false,contentType:'application/pdf'});
    test.evidence.duplicate_denied=!!duplicate.error;
    assert(test.evidence.duplicate_denied,'O Storage permitiu a segunda gravação sem upsert.');
    const after=await inspect(test.path);
    assert(Number(after.object_count)===1,'Foi identificada duplicação no PostgreSQL.');
  }
  if(test.evidence.transport==='tus'){
    test.evidence.tus_progress=test.progress.some(e=>e.phase==='sending'&&e.transport==='tus'&&
      Number.isFinite(e.percentage)&&e.percentage>0&&e.percentage<100);
  }
}
async function submit(test){
  current=test;test.state='running';test.running=true;
  const controller=new AbortController();test.controller=controller;
  const meter=el('hml-progress');meter.hidden=false;meter.removeAttribute('value');
  statusButtons();
  try{
    await verifyLogin();
    const uploaded=await transferPrivateObject({
      client,bucket:BUCKET,path:test.path,file:test.file,signal:controller.signal,
      onProgress:progress
    });
    test.evidence.transport=uploaded.transport;
    objects.set(test.path,{test,mayExist:true});
    tell('Arquivo recebido. Validando registro, download e integridade…');
    await verifyReceipt(test);
    test.state='complete';
    const isTus=test.file.size>TUS_THRESHOLD_BYTES;
    if(isTus&&test.evidence.transport!=='tus'){
      test.evidence.outcome='INCONCLUSIVO: envio caiu no modo padrão, sem TUS real';
    }else if(isTus&&!test.evidence.tus_progress){
      test.evidence.outcome='PARCIAL: TUS concluído, sem percentual intermediário observado';
    }else test.evidence.outcome='APROVADO no Storage real desta conta';
    tell(test.evidence.outcome+'. Confira as evidências abaixo.');
  }catch(error){
    if(error?.name==='AbortError'){
      test.state='interrupted';test.evidence.outcome='INTERROMPIDO: retomada disponível nesta aba';
      objects.set(test.path,{test,mayExist:true});
      tell('Envio interrompido sem excluir arquivo remoto. Clique em Retomar.');
    }else{
      test.state='error';test.evidence.outcome='FALHA OU INCONCLUSIVO';
      test.evidence.error=safeError(error);
      objects.set(test.path,{test,mayExist:true});
      tell('Teste não aprovado: '+test.evidence.error);
    }
  }finally{
    test.running=false;test.evidence.time=stamp();
    if(!reports.includes(test.evidence))reports.push(test.evidence);
    statusButtons();redraw();
  }
}
async function start(label,file){
  assert(initialized,'Acesso administrativo ainda não confirmado.');
  if(current?.state==='interrupted')throw Error('Retome ou finalize a transferência interrompida antes de iniciar outra.');
  assert(file instanceof File&&file.size&&file.size<=10485760,'PDF de teste deve ter até 10 MiB.');
  assert(file.type==='application/pdf','Selecione somente PDF de homologação.');
  assert((await file.slice(0,5).text())==='%PDF-','O arquivo não possui cabeçalho PDF.');
  const run=crypto.randomUUID();
  const path=user.id+'/hml/'+run+'/hml-'+crypto.randomUUID()+'.pdf';
  const test={path,file,state:'created',running:false,controller:null,progress:[],
    evidence:{run_id:run,label,outcome:'Preparando',time:stamp(),
      input_bytes:file.size,sha256_original:await hashBlob(file),
      transport:null,db_registered:null,hash_match:null,
      anonymous_denied:null,duplicate_denied:null,tus_progress:null,
      cross_account_isolation:'Pendente — requer segunda conta de teste',
      pades_cryptographic_validation:'Não executada',
      device_validation:'Não executada'
    }};
  await submit(test);
}
el('hml-small').addEventListener('click',()=>void start('PDF fictício pequeno',pdfFixture()).catch(e=>tell(safeError(e))));
el('hml-large').addEventListener('click',()=>void start('PDF fictício TUS >6 MiB',pdfFixture(true)).catch(e=>tell(safeError(e))));
el('hml-own').addEventListener('click',async()=>{
  if(!el('hml-confirm').checked){tell('Confirme que o documento opcional é de teste e não contém dados de clientes.');return;}
  const file=el('hml-file').files?.[0];
  if(!file){tell('Selecione um PDF de homologação.');return;}
  await start('PDF fornecido de homologação',file).catch(e=>tell(safeError(e)));
});
el('hml-stop').addEventListener('click',()=>{if(current?.running)current.controller.abort();});
el('hml-resume').addEventListener('click',()=>void(async()=>{
  if(!current||current.state!=='interrupted')return;
  await submit(current);
})());
el('hml-clean').addEventListener('click',()=>void(async()=>{
  if(!initialized||current?.running||!objects.size)return;
  if(!confirm('Remover SOMENTE os objetos de homologação criados nesta aba? Não serão afetados documentos de clientes.'))return;
  await verifyLogin().catch(e=>{tell(safeError(e));});
  let removed=0,failed=0;
  for(const [path,record] of objects){
    if(!path.startsWith(user.id+'/hml/')||
       !/^hml-[a-f0-9-]{36}\.pdf$/.test(path.split('/').at(-1)))continue;
    const {error}=await client.storage.from(BUCKET).remove([path]);
    if(error)failed++;else{objects.delete(path);removed++;}
  }
  tell('Limpeza restrita ao bucket de teste: '+removed+' confirmado(s), '+failed+' pendente(s). Nenhum arquivo de cliente foi tocado.');
  statusButtons();
})().catch(e=>tell('Falha na limpeza: '+safeError(e))));
el('hml-export').addEventListener('click',()=>{
  const evidence={project:'xrmovi-storage-7b',generated_at:stamp(),
    scope:'isolated-admin-test-bucket',tests:reports.map(x=>({...x}))};
  const url=URL.createObjectURL(new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='xrmovi-homologacao-storage-'+Date.now()+'.json';
  document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
});
async function init(){
  statusButtons();redraw();
  try{
    const response=await fetch('../v3/config.json',{cache:'no-store'});
    assert(response.ok,'Configuração do XRMOVI indisponível.');
    const cfg=await response.json();
    assert(new URL(cfg.supabaseUrl).hostname===PROJECT_ID+'.supabase.co','Projeto Supabase inesperado.');
    client=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
    anonClient=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    });
    const {data,error}=await client.auth.getUser();
    assert(!error&&data?.user?.id,'Acesse sua conta antes de executar a homologação.');
    user=data.user;
    await verifyLogin();
    initialized=true;el('hml-controls').hidden=false;
    tell('Administrador autenticado. Nenhum arquivo foi enviado automaticamente.');
    statusButtons();
  }catch(e){tell('Acesso não liberado: '+safeError(e));}
}
void init();
