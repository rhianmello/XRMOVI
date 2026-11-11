// Pure, tenant-scoped fine metrics and report formatting for XRMOVI.
// Dates supplied by the UI are ISO YYYY-MM-DD; never infer statutory deadlines.
export const fineStatusLabels=Object.freeze({
 pending:'Pendente',appeal:'Em defesa/recurso',paid:'Paga',canceled:'Cancelada'
});
export const responsibilityLabels=Object.freeze({
 undetermined:'Não definida',company:'Empresa',driver:'Motorista',third_party:'Terceiro'
});
export function isoDate(value){
 const x=String(value||'');
 return /^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))?x:'';
}
export function plusDays(iso,days){
 const d=new Date(iso+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
}
export const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const displayDate=value=>isoDate(value)?new Date(value+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC'}):'—';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const csvField=value=>{
 const valueText=String(value??'');
 // Excel interprets leading formula characters even in quoted CSV cells.
 const safe=/^[\s]*[=+\-@\t\r]/.test(valueText)?"'"+valueText:valueText;
 return '"'+safe.replaceAll('"','""')+'"';
};
export function filterTrafficFines(records,filter={}){
 const q=String(filter.query||'').trim().toLocaleLowerCase('pt-BR');
 const from=isoDate(filter.from),to=isoDate(filter.to);
 return (records||[]).filter(f=>{
  if(filter.vehicleId&&f.vehicle_id!==filter.vehicleId)return false;
  if(filter.status&&f.status!==filter.status)return false;
  if(from&&f.infraction_date<from||to&&f.infraction_date>to)return false;
  if(q&&!([f.plate,f.driver_name,f.notice_number,f.authority,f.infraction_code,f.description,f.location]
    .some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(q))))return false;
  return true;
 }).sort((a,b)=>String(b.infraction_date).localeCompare(String(a.infraction_date))||
 String(b.created_at||'').localeCompare(String(a.created_at||'')));
}
export function fineDeadlineEvents(records,todayIso,daysAhead=7,allowedVehicles=null){
 const end=plusDays(todayIso,daysAhead),events=[];
 for(const fine of records||[]){
  if(!['pending','appeal'].includes(fine.status))continue;
  if(allowedVehicles&& !allowedVehicles.has(fine.vehicle_id))continue;
  for(const [field,label] of [
   ['due_date','Prazo de pagamento informado'],
   ['driver_nomination_deadline','Prazo informado para indicação do condutor'],
   ['defense_deadline','Prazo informado para defesa/recurso']
  ]){
   const date=isoDate(fine[field]);
   if(date&&date<=end)events.push({fineId:fine.id,vehicleId:fine.vehicle_id,
    plate:fine.plate||'Veículo',label,date,overdue:date<todayIso,status:fine.status});
  }
 }
 return events.sort((a,b)=>a.date.localeCompare(b.date)||a.plate.localeCompare(b.plate));
}
export function fineSummary(records,todayIso){
 const list=records||[],open=list.filter(x=>['pending','appeal'].includes(x.status));
 return {
  total:list.length,
  outstanding:open.length,
  amountOpen:open.reduce((s,x)=>s+Number(x.amount||0),0),
  paid:list.filter(x=>x.status==='paid').length,
  amountPaid:list.filter(x=>x.status==='paid').reduce((s,x)=>s+Number(x.amount||0),0),
  dueSoon:fineDeadlineEvents(list,todayIso).length,
  overdue:fineDeadlineEvents(list,todayIso).filter(x=>x.overdue).length
 };
}
export function fineRanking(records,kind='vehicle'){
 const aggregated=new Map();
 for(const fine of records||[]){
  if(fine.status==='canceled')continue;
  const id=kind==='driver'?fine.driver_id||'unidentified':fine.vehicle_id;
  const label=kind==='driver'?(fine.driver_name||'Condutor não identificado'):(fine.plate||'Veículo');
  if(!id)continue;
  const previous=aggregated.get(id)||{id,label,count:0,amount:0};
  previous.count+=1;previous.amount+=Number(fine.amount||0);
  aggregated.set(id,previous);
 }
 return [...aggregated.values()].sort((a,b)=>b.count-a.count||b.amount-a.amount||a.label.localeCompare(b.label)).slice(0,5);
}
export function fineCsv(records){
 const keys=['Placa','Condutor','Auto','Órgão','Código','Descrição','Data infração','Data notificação','Local','Valor (R$)','Vencimento','Indicação condutor','Defesa/recurso','Pontos informados','Responsável pelo pagamento','Situação','Pago em','Observações'];
 const rows=(records||[]).map(f=>[
  f.plate,f.driver_name,f.notice_number,f.authority,f.infraction_code,f.description,
  f.infraction_date,f.notice_date,f.location,Number(f.amount||0).toFixed(2).replace('.',','),
  f.due_date,f.driver_nomination_deadline,f.defense_deadline,f.points,
  responsibilityLabels[f.responsibility]||'Não definida',fineStatusLabels[f.status]||f.status,
  f.paid_on,f.notes
 ]);
 return '\uFEFF'+[keys,...rows].map(r=>r.map(csvField).join(';')).join('\r\n');
}
export function fineReportHtml(records,companyName,{docCatalog=[],images=[]}={}){
 const e=escapeHtml,now=new Date().toLocaleString('pt-BR'),list=records||[];
 const docsById=new Map();
 for(const doc of docCatalog||[]){
  if(doc.kind!=='fine')continue;
  const value=docsById.get(doc.record_id)||[];value.push(doc);docsById.set(doc.record_id,value);
 }
 const rows=list.map(f=>{
  const docs=docsById.get(f.id)||[];
  const files=docs.map(d=>e(d.name||'Anexo')).join(' · ');
  return '<tr><td>'+e(f.plate||'—')+'</td><td>'+e(f.notice_number)+'</td><td>'+
   e(f.authority)+'</td><td>'+e(f.description)+'</td><td>'+e(displayDate(f.infraction_date))+
   '</td><td>'+e(money(f.amount))+'</td><td>'+e(displayDate(f.due_date))+'</td><td>'+
   e(fineStatusLabels[f.status]||f.status)+'</td><td>'+e(f.driver_name||'Não identificado')+
   '</td><td>'+e(files||'Sem anexos')+'</td></tr>';
 }).join('');
 const pictures=(images||[]).filter(x=>String(x.dataUrl||'').startsWith('data:image/')).map(x=>
  '<figure><img src="'+e(x.dataUrl)+'" alt="Comprovante privado da multa"><figcaption>'+
   e(x.plate||'Veículo')+' · '+e(x.fileName||'Documento')+'</figcaption></figure>').join('');
 const total=fineSummary(list,new Date().toISOString().slice(0,10));
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>XRMOVI — Multas e infrações</title>'+
 '<style>@page{size:A4 landscape;margin:13mm}body{font:11px Arial;color:#193042}h1{margin:0 0 5px;font-size:20px}header{border-bottom:3px solid #158c9b;padding-bottom:12px;margin-bottom:14px}.muted{color:#607584;font-size:11px}.totals{display:flex;gap:18px;margin:14px 0}.totals strong{font-size:13px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#e9f1f3;text-align:left}td,th{padding:7px;border-bottom:1px solid #d8e2e7;overflow-wrap:anywhere;font-size:10px}tr,figure{break-inside:avoid}figure{margin:12px 0;padding:12px;border:1px solid #d7e1e6;width:45%;display:inline-block;vertical-align:top}figure img{max-width:100%;max-height:460px}figcaption{font-size:10px;margin-top:7px}footer{margin-top:18px;color:#5f7480;font-size:10px}@media print{body{background:white}}</style></head><body>'+
 '<header><h1>XRMOVI — Multas e infrações</h1><div>'+e(companyName||'Empresa')+'</div>'+
 '<p class="muted">Emitido em '+e(now)+' · Documento gerencial. Prazos informados manualmente; confirme junto ao órgão autuador.</p></header>'+
 '<div class="totals"><span>Total de registros: <strong>'+total.total+'</strong></span>'+
 '<span>Pendentes/em recurso: <strong>'+total.outstanding+'</strong></span>'+
 '<span>Valor pendente: <strong>'+e(money(total.amountOpen))+'</strong></span>'+
 '<span>Valor pago: <strong>'+e(money(total.amountPaid))+'</strong></span></div>'+
 '<table><thead><tr>'+['Veículo','Auto','Órgão','Descrição','Data','Valor','Vencimento','Situação','Condutor','Anexos'].map(x=>'<th>'+e(x)+'</th>').join('')+
 '</tr></thead><tbody>'+rows+'</tbody></table>'+
 (pictures?'<h2>Comprovantes em imagem</h2>'+pictures:'')+
 '<footer>Arquivos PDF anexados permanecem disponíveis na Central de Documentos do XRMOVI. Cancelamento, defesa ou recurso não são realizados automaticamente pelo sistema.</footer></body></html>';
}