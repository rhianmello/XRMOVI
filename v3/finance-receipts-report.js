// XRMOVI: print financial values and private fuel receipts linked by record ID.
// No signed URL, JWT or access token is ever included in the printable HTML.
const pdfLibraryUrl="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const pdfWorkerUrl="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function reportEscape(v){
 return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;")
  .replace(/[\u0000-\u001f\u007f]/g,' ');
}
const displayDate=v=>{
 const s=String(v||'').slice(0,10);
 return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.split('-').reverse().join('/'):'—';
};
const safeData=v=>/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(v||'')?v:'';

export function buildFuelEvidenceGroups({companyId,vehicles=[],fuelEntries=[],catalog=[],scopeIds=null}){
 if(!/^[a-f0-9-]{36}$/i.test(String(companyId||'')))throw Error('Empresa inválida.');
 const allowed=new Set(vehicles.filter(v=>!scopeIds||scopeIds.has(v.id)).map(v=>v.id));
 const byVehicle=new Map(),seen=new Set();
 for(const f of fuelEntries){
  if(!f?.id||!allowed.has(f.vehicle_id)||seen.has(f.id))continue;
  seen.add(f.id);
  const v=vehicles.find(v=>v.id===f.vehicle_id);
  if(!byVehicle.has(f.vehicle_id))byVehicle.set(f.vehicle_id,{
   id:f.vehicle_id,plate:v?.plate||f.plate||'Veículo',model:v?.model||'',entries:[]
  });
  byVehicle.get(f.vehicle_id).entries.push({
   id:f.id,vehicle_id:f.vehicle_id,date:String(f.fueled_on||f.date||'').slice(0,10),
   station:String(f.station||''),liters:f.liters==null?null:Number(f.liters),
    litersDeclined:f.liters==null||f.liters_declined===true,
    declinedAt:String(f.liters_declined_at||''),declinedBy:String(f.liters_declined_email||''),
   cost:Number(f.cost??f.total_cost??0),documents:[]
  });
 }
 const entries=new Map([...byVehicle.values()].flatMap(g=>g.entries.map(f=>[f.id,f])));
 const paths=new Set();
 for(const doc of catalog){
  if(doc?.kind!=='fuel'||!doc.record_id||!doc.vehicle_id||!doc.path)continue;
  const fuel=entries.get(doc.record_id);
  if(!fuel||fuel.vehicle_id!==doc.vehicle_id)continue;
  if(!String(doc.path).startsWith(companyId+'/fuel/'+fuel.id+'/'))continue;
  if(paths.has(doc.path))continue;
  paths.add(doc.path);
  fuel.documents.push({
   id:String(doc.id||''),name:String(doc.name||'Comprovante').slice(0,200),
   path:String(doc.path),created_at:String(doc.created_at||''),pages:[]
  });
 }
 const groups=[...byVehicle.values()].sort((a,b)=>a.plate.localeCompare(b.plate,'pt-BR'));
 for(const group of groups){
  group.entries.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  for(const fuel of group.entries)fuel.documents.sort((a,b)=>a.created_at.localeCompare(b.created_at));
  group.total=group.entries.reduce((sum,f)=>sum+f.cost,0);
  group.liters=group.entries.reduce((sum,f)=>sum+(f.liters??0),0);
 }
 return groups;
}
async function photoPages(blob){
 const bitmap=await createImageBitmap(blob);
 try{
  const ratio=Math.min(1,1800/bitmap.width,3200/bitmap.height);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
  canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Falha ao preparar foto.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL('image/jpeg',0.9);
  if(!safeData(data))throw Error('Imagem de comprovante inválida.');
  return [data];
 }finally{bitmap.close?.();}
}
let pdfjsPromise;
async function pdfPages(blob){
 if(!pdfjsPromise){
  pdfjsPromise=import(pdfLibraryUrl).then(api=>{
   api.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;return api;
  }).catch(e=>{pdfjsPromise=null;throw e;});
 }
 const api=await pdfjsPromise;
 const task=api.getDocument({data:new Uint8Array(await blob.arrayBuffer())});
 const pdf=await task.promise;
 try{
  if(pdf.numPages>20)throw Error('O comprovante PDF tem mais de 20 páginas. Separe-o em arquivos menores.');
  const images=[];
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n),base=page.getViewport({scale:1});
   const vp=page.getViewport({scale:Math.min(2.1,1800/base.width,2400/base.height)});
   const canvas=document.createElement('canvas');
   canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
   const ctx=canvas.getContext('2d',{alpha:false});
   if(!ctx)throw Error('Falha ao renderizar comprovante PDF.');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   await page.render({canvasContext:ctx,viewport:vp}).promise;
   const img=canvas.toDataURL('image/jpeg',0.9);
   if(!safeData(img))throw Error('Página PDF não pôde ser convertida.');
   images.push(img);page.cleanup();
  }
  return images;
 }finally{await pdf.destroy();}
}
async function downloadPages(client,doc){
 const path=doc.path;
 if(!path||path.startsWith('/')||path.includes('..')||path.length>600){
  throw Error('Caminho de documento inválido.');
 }
 const {data,error}=await client.storage.from('xrmovi-record-attachments').download(path);
 if(error||!data)throw Error('Arquivo privado inacessível.');
 if(data.size>10485760)throw Error('Arquivo maior que 10 MB.');
 const ext=(doc.name.split('.').pop()||'').toLowerCase();
 if(ext==='pdf'||data.type==='application/pdf')return pdfPages(data);
 if(['jpg','jpeg','png','webp'].includes(ext)||/^image\/(jpeg|png|webp)$/.test(data.type||'')){
  return photoPages(data);
 }
 throw Error('Formato de comprovante não suportado.');
}
function reportStyles(){
 return [
 '@page{size:A4 portrait;margin:12mm 13mm}',
 '*{box-sizing:border-box}',
 'body{font:10px Arial,sans-serif;color:#173b4a;background:white;margin:0}',
 'h1{font-size:20px;margin:0 0 7px}h2{font-size:17px;color:#14667c;margin:0 0 9px}',
 'header{display:flex;gap:14px;align-items:center;border-bottom:2px solid #218ba1;padding-bottom:12px}',
 '.logo{width:58px;height:58px;object-fit:contain}',
 '.muted,.sub,.filename,.foot{font-size:10px;color:#547583;line-height:1.5}',
 '.totals{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin:15px 0}',
 '.total{border:1px solid #ccdde3;border-radius:6px;padding:10px}',
 '.total strong{display:block;font-size:16px;margin-top:5px;color:#116c81}',
 'table{border-collapse:collapse;width:100%;table-layout:fixed}',
 'th{background:#e2f0f3;color:#235065;text-align:left;font-size:9px}',
 'th,td{border-bottom:1px solid #d8e5ea;padding:7px 6px;overflow-wrap:anywhere}',
 'tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}',
 '.value{text-align:right;white-space:nowrap}',
 '.foot{border-top:1px solid #d8e5ea;margin-top:15px;padding-top:8px}',
 '.page-break{break-before:page;page-break-before:always}',
 '.vehicle{padding-top:4px}.vehicle .sub{margin-bottom:16px}',
 '.receipt{height:262mm;display:flex;flex-direction:column;padding-top:6px}',
 '.eyebrow{color:#1285a0;font-size:9px;letter-spacing:1.2px;margin-bottom:9px}',
 '.receipt-metrics{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}',
 '.receipt-metrics span{padding:7px;border:1px solid #d7e4e9;border-radius:5px}',
 '.filename{margin:9px 0;overflow-wrap:anywhere}',
 '.proof{flex:1;min-height:0;display:flex;justify-content:center;align-items:flex-start;padding:6px;border:1px solid #d8e6e8}',
 '.proof img{max-width:100%;max-height:210mm;object-fit:contain}',
 '@media print{.print-toolbar{display:none!important}}',
 '.print-toolbar{position:sticky;top:0;z-index:3;padding:12px;margin:-12px 0 14px;background:#e1f2f4;display:flex;gap:12px;align-items:center}',
 '.print-toolbar button{border:0;border-radius:6px;background:#127a92;color:white;font-weight:700;padding:10px 18px;cursor:pointer}',
 '@media screen{body{background:#f7fbfd;padding:20px;max-width:860px;margin:auto}',
 '.summary,.vehicle,.receipt{background:white;padding:16px;margin-bottom:20px;box-shadow:0 1px 8px #ccd8dc}}'
 ].join('');
}
export function buildFuelEvidenceHtml({companyName='',range='',rows=[],groups=[],logoDataUrl='',emittedAt=''}){
 const e=reportEscape;
 const logo=/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(logoDataUrl)?
  '<img class="logo" alt="Logo" src="'+logoDataUrl+'">':'';
 const financialTable=rows.map(row=>'<tr>'+row.map((v,i)=>
  '<td'+(i===4?' class="value"':'')+'>'+e(i===4?money(v):v)+'</td>'
 ).join('')+'</tr>').join('');
 const kinds=[['Total',null],['Combustível','Combustível'],
  ['Manutenção realizada','Manutenção realizada'],['Despesas pagas','Despesa paga']];
 const cards=kinds.map(([label,type])=>'<div class="total">'+e(label)+'<strong>'+
  e(money(rows.filter(r=>type===null||r[2]===type).reduce((sum,r)=>sum+Number(r[4]||0),0)))+
  '</strong></div>').join('');
 let pages='',proofPages=0;
 for(const vehicle of groups){
  const local=vehicle.entries.map(f=>{
   const count=f.documents.reduce((n,d)=>n+d.pages.length,0);
   return '<tr><td>'+e(displayDate(f.date))+'</td><td>'+e(f.station||'—')+
    '</td><td class="value">'+(f.litersDeclined?
    '<strong>Não informado</strong><small> · Declaração registrada '+e(f.declinedAt?new Date(f.declinedAt).toLocaleString('pt-BR'):'(data indisponível)')+
    (f.declinedBy?' · '+e(f.declinedBy):'')+'</small>':e(f.liters.toLocaleString('pt-BR')))+
    '</td><td class="value">'+e(money(f.cost))+
    '</td><td>'+e(count?count+' página(s)':'Sem comprovante')+'</td></tr>';
  }).join('');
  pages+='<section class="vehicle page-break"><h2>Veículo: '+e(vehicle.plate)+'</h2>'+
   '<div class="sub">Modelo: '+e(vehicle.model||'—')+' · '+vehicle.entries.length+
   ' abastecimento(s) · '+(vehicle.entries.some(x=>x.litersDeclined)?e(vehicle.liters.toLocaleString('pt-BR'))+' L informados · '+vehicle.entries.filter(x=>x.litersDeclined).length+' sem informação de litros':e(vehicle.liters.toLocaleString('pt-BR'))+' litros')+' · Total: '+e(money(vehicle.total))+'</div>'+
   '<table><thead><tr><th>Data</th><th>Posto</th><th>Litros</th><th>Valor</th><th>Comprovantes</th></tr></thead>'+
   '<tbody>'+local+'</tbody></table></section>';
  for(const fuel of vehicle.entries)for(const doc of fuel.documents){
   for(let index=0;index<doc.pages.length;index++){
    const img=safeData(doc.pages[index]);
    if(!img)throw Error('Comprovante contém imagem inválida.');
    proofPages++;
    pages+='<section class="receipt page-break">'+
     '<div class="eyebrow">XRMOVI · COMPROVANTE DE ABASTECIMENTO</div>'+
     '<h2>'+e(vehicle.plate)+' · '+e(displayDate(fuel.date))+'</h2>'+
     '<div class="receipt-metrics"><span>Posto: '+e(fuel.station||'—')+
     '</span><span>Litros: '+(fuel.litersDeclined?'Não informado (omissão registrada)':e(fuel.liters.toLocaleString('pt-BR')))+
     '</span><span>Valor: '+e(money(fuel.cost))+'</span></div>'+
     '<div class="filename">Arquivo: '+e(doc.name)+' · Página '+(index+1)+' de '+
     doc.pages.length+' · ID do abastecimento: '+e(fuel.id)+'</div>'+
     '<div class="proof"><img alt="Comprovante '+e(vehicle.plate)+'" src="'+img+'"></div></section>';
   }
  }
 }
 if(!groups.length)pages='<section class="page-break"><h2>Comprovantes</h2>'+
  '<p>Não há abastecimentos neste período.</p></section>';
 const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
  '<title>XRMOVI — PDF com comprovantes</title><style>'+reportStyles()+
  '</style></head><body><div class="print-toolbar"><button type="button" onclick="window.print()">Imprimir / Salvar como PDF</button><span>Confira as imagens antes de salvar.</span></div><section class="summary"><header>'+logo+
  '<div><h1>Relatório financeiro com comprovantes</h1><div class="muted">XRMOVI · Empresa: '+
  e(companyName)+' · Período: '+e(range)+' · Emitido em: '+e(emittedAt)+
  '</div></div></header><div class="totals">'+cards+'</div>'+
  '<table><thead><tr><th>Data</th><th>Veículo</th><th>Tipo</th><th>Descrição</th><th>Valor</th></tr></thead>'+
  '<tbody>'+financialTable+'</tbody></table>'+
  '<div class="foot">'+rows.length+' lançamento(s) · '+groups.reduce((n,g)=>n+g.entries.filter(f=>f.litersDeclined).length,0)+' abastecimento(s) com litros omitidos (consumo potencialmente incompleto) · '+groups.length+
  ' veículo(s) abastecido(s) · '+proofPages+' página(s) com comprovantes · Valores em reais</div>'+
  '</section>'+pages+'</body></html>';
 return html;
}
function popupMessage(popup,message){
 if(popup.closed)throw Error('Janela de impressão fechada.');
 popup.document.body.replaceChildren();
 const p=popup.document.createElement('p');
 p.style.cssText='font:15px Arial,sans-serif;padding:28px;color:#183b50;line-height:1.5';
 p.textContent=message;popup.document.body.append(p);
}
export async function printFuelEvidenceReport({
 client,company,vehicles,fuelEntries,rows,range,logoDataUrl='',getLogo=null,
 scopeIds=null,stillCurrent=()=>true,onProgress=()=>{}
}){
 // Open synchronously within the click; browsers block windows opened after await.
 const popup=window.open('','_blank');
 if(!popup)throw Error('Autorize a abertura de pop-ups para imprimir o relatório.');
 popup.document.open();
 popup.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
  '<title>Preparando relatório XRMOVI</title></head><body></body></html>');
 popup.document.close();
 const progress=text=>{onProgress(text);popupMessage(popup,text);};
 try{
  progress('Consultando comprovantes da empresa...');
  const {data:catalog,error}=await client.rpc('xrmovi_company_document_catalog',{cid:company.id});
  if(error||!Array.isArray(catalog))throw Error('Não foi possível consultar os comprovantes autorizados.');
  if(!stillCurrent())throw Error('A empresa foi alterada durante a geração.');
  const groups=buildFuelEvidenceGroups({companyId:company.id,vehicles,fuelEntries,catalog,scopeIds});
  const total=groups.reduce((n,g)=>n+g.entries.reduce((m,f)=>m+f.documents.length,0),0);
  let loaded=0;
  for(const group of groups)for(const fuel of group.entries)for(const doc of fuel.documents){
   if(!stillCurrent())throw Error('A empresa foi alterada durante a geração.');
   progress('Preparando comprovante '+(loaded+1)+' de '+total+' · '+group.plate+'...');
   try{doc.pages=await downloadPages(client,doc);}
   catch(err){throw Error('Falha no comprovante "'+doc.name+'" de '+group.plate+': '+(err?.message||'erro de acesso'));}
   if(!doc.pages.length)throw Error('O comprovante "'+doc.name+'" não possui páginas.');
   loaded++;
  }
  if(!stillCurrent())throw Error('A empresa foi alterada durante a geração.');
  progress('Montando relatório para impressão...');
  let printableLogo=logoDataUrl;
  if(getLogo){
   try{printableLogo=await getLogo()||'';}catch{printableLogo='';}
  }
  if(!stillCurrent())throw Error('A empresa foi alterada durante a geração.');
  const markup=buildFuelEvidenceHtml({
   companyName:company.name,range,rows,groups,logoDataUrl:printableLogo,
   emittedAt:new Date().toLocaleString('pt-BR')
  });
  popup.document.open();popup.document.write(markup);popup.document.close();
  await Promise.all([...popup.document.images].map(img=>img.decode().catch(()=>{})));
  if(!stillCurrent()||popup.closed)throw Error('A impressão foi interrompida.');
  popup.focus();popup.print();
  onProgress('Relatório com comprovantes preparado. Selecione “Salvar como PDF”.');
  return {vehicles:groups.length,receipts:loaded};
 }catch(err){
  if(!popup.closed)popupMessage(popup,'Não foi possível gerar o relatório com todos os comprovantes: '+
   (err?.message||'Erro desconhecido')+'. Use “Somente valores” ou tente novamente.');
  throw err;
 }
}
