// XRMOVI / Multas e infrações. Uses existing authenticated RPC, private documents and company scope.
import {
 fineStatusLabels,responsibilityLabels,fineDeadlineEvents,fineSummary,
 filterTrafficFines,fineCsv,fineReportHtml,displayDate,money,isoDate
} from './fines-core.js?v=20261106-fines-1';

export function setupTrafficFines({
 rpc,client,getCompany,getVehicles,getDrivers,getFilteredIds,canWrite,
 openView,getCatalog,refreshCatalog,openDocument,notify
}){
 const byId=id=>document.getElementById(id);
 const root=byId('view-fines');
 if(!root)throw Error('Módulo Multas indisponível no painel.');
 const status=byId('xrm-fines-status'),listRoot=byId('xrm-fines-list');
 const controls={
  query:byId('xrm-fines-search'),vehicle:byId('xrm-fines-vehicle'),
  status:byId('xrm-fines-status-filter'),from:byId('xrm-fines-from'),to:byId('xrm-fines-to')
 };
 let records=[],loadedCid=null,requestId=0,formRecord=null,previousFocus=null,busy=false;
 const say=text=>{if(status)status.textContent=text||'';};
 const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
 const format=value=>displayDate(value);
 const pickLabel=(map,key)=>map[key]||String(key||'—');
 const selectOptions=(node,options,old='')=>{
  node.replaceChildren();
  for(const [value,label] of options){
   const opt=document.createElement('option');opt.value=value;opt.textContent=label;node.append(opt);
  }
  node.value=options.some(x=>x[0]===old)?old:(options[0]?.[0]||'');
 };
 const button=(text,action,cls='fleet-button')=>{
  const el=document.createElement('button');el.type='button';el.className=cls;el.textContent=text;
  el.onclick=action;return el;
 };
 const textNode=(tag,value,cls='')=>{
  const node=document.createElement(tag);node.textContent=String(value??'—');
  if(cls)node.className=cls;
  return node;
 };
 const resetFilterOptions=()=>{
  const selection=controls.vehicle.value;
  selectOptions(controls.vehicle,[['','Todos os veículos'],...getVehicles().map(v=>[v.id,(v.plate||'Veículo')+' · '+(v.model||v.category||'')])],selection);
 };
 const currentFilters=()=>({
  query:controls.query.value,vehicleId:controls.vehicle.value,
  status:controls.status.value,from:controls.from.value,to:controls.to.value
 });
 const scopedRecords=()=>filterTrafficFines(records,currentFilters());
 const showQuick=()=>{
  const place=byId('xrm-fines-quick');
  if(!place)return;
  const scope=getFilteredIds(),list=scope?records.filter(f=>scope.has(f.vehicle_id)):records;
  const value=fineSummary(list,today());
  place.replaceChildren();
  const text=document.createElement('div');
  text.append(textNode('strong',value.outstanding+' multa(s) pendente(s) ou em recurso'));
  text.append(textNode('span',' · '+money(value.amountOpen)+' em valores registrados · '+value.dueSoon+' prazo(s) próximos'));
  const go=button('Ver multas',()=>openView('fines'),'fleet-button');
  place.append(text,go);
 };
 function render(){
  resetFilterOptions();
  const rows=scopedRecords(),summary=fineSummary(rows,today());
  for(const [id,value]of Object.entries({
   'xrm-fines-total':summary.total,'xrm-fines-open':summary.outstanding,
   'xrm-fines-value':money(summary.amountOpen),'xrm-fines-soon':summary.dueSoon
  }))if(byId(id))byId(id).textContent=String(value);
  listRoot.replaceChildren();
  if(!rows.length){
   listRoot.append(textNode('p',loadedCid?
    'Nenhuma multa encontrada nos filtros selecionados.':'Os dados ainda não foram carregados.','xrm-fines-empty'));
   showQuick();return;
  }
  const table=document.createElement('table');table.className='fleet-table xrm-fines-table';
  const head=document.createElement('thead'),tr=document.createElement('tr');
  for(const v of ['Veículo / motorista','Auto / infração','Data / prazos','Valor / situação','Ações']){
   const th=textNode('th',v);th.scope='col';tr.append(th);
  }
  head.append(tr);const body=document.createElement('tbody');
  for(const fine of rows){
   const row=document.createElement('tr');
   const vehicle=document.createElement('td');
   vehicle.append(textNode('strong',fine.plate||'—'));
   vehicle.append(textNode('small','Condutor: '+(fine.driver_name||'Não identificado')));
   vehicle.append(textNode('small','Responsável pelo pagamento: '+pickLabel(responsibilityLabels,fine.responsibility)));
   row.append(vehicle);
   const details=document.createElement('td');
   details.append(textNode('strong',fine.notice_number));
   details.append(textNode('small',fine.authority+' · '+(fine.infraction_code||'Código não informado')));
   details.append(textNode('small',fine.description));
   row.append(details);
   const dates=document.createElement('td');
   dates.append(textNode('span','Infração: '+format(fine.infraction_date)));
   if(fine.due_date)dates.append(textNode('small','Pagamento: '+format(fine.due_date)));
   if(fine.driver_nomination_deadline)dates.append(textNode('small','Indicação de condutor: '+format(fine.driver_nomination_deadline)));
   if(fine.defense_deadline)dates.append(textNode('small','Defesa/recurso: '+format(fine.defense_deadline)));
   row.append(dates);
   const price=document.createElement('td');price.append(textNode('strong',money(fine.amount)));
   const pill=textNode('span',pickLabel(fineStatusLabels,fine.status),'xrm-fine-pill');
   pill.dataset.state=fine.status;price.append(document.createElement('br'),pill);
   if(fine.status==='paid')price.append(textNode('small','Pagamento: '+format(fine.paid_on)));
   row.append(price);
   const actions=document.createElement('td');actions.className='xrm-fines-row-actions';
   actions.append(button('Documentos',()=>void documents(fine)));
   if(canWrite()){
    actions.append(button('Editar',()=>openForm(fine)));
    actions.append(button('Histórico',()=>openForm(fine,true)));
   }
   row.append(actions);body.append(row);
  }
  table.append(head,body);
  const scroll=document.createElement('div');scroll.className='fleet-table-wrap';scroll.append(table);
  listRoot.append(scroll);
  showQuick();
 }
 function renderAlerts(){
  const alerts=byId('alerts-content'),preview=byId('alert-preview');
  const oldAlerts=[...(alerts?.querySelectorAll('[data-xrm-fine-alert]')||[])];
  const oldPreview=[...(preview?.querySelectorAll('[data-xrm-fine-alert]')||[])];
  oldAlerts.forEach(x=>x.remove());oldPreview.forEach(x=>x.remove());
  const base=Math.max(0,Number(byId('nav-alert-count')?.textContent||0)-oldAlerts.length);
  if(!loadedCid||loadedCid!==getCompany()?.id)return;
  const events=fineDeadlineEvents(records,today(),7,getFilteredIds());
  const create=ev=>{
   const text=(ev.overdue?'PRAZO ULTRAPASSADO: ':'PRAZO PRÓXIMO: ')+
    ev.plate+' · '+ev.label+' · '+format(ev.date);
   const b=button(text,()=>{
    controls.vehicle.value=ev.vehicleId;controls.status.value='';
    openView('fines');render();
   },'fleet-ptran-entry');
   b.dataset.xrmFineAlert='true';return b;
  };
  for(const ev of events.slice(0,30)){
   alerts?.append(create(ev));
   if(preview&&preview.children.length<6)preview.append(create(ev));
  }
  for(const id of ['nav-alert-count','alerts-total','alert-preview-count'])if(byId(id)){
   byId(id).textContent=String(base+events.length);
  }
  const count=byId('fleet-kpis')?.querySelectorAll('.fleet-kpi-value')[2];
  if(count)count.textContent=String(base+events.length);
 }
 async function refresh(){
  const cid=getCompany()?.id||null,ticket=++requestId;
  if(!cid)return reset();
  say('Consultando multas da empresa...');
  try{
   const result=await rpc('traffic_fines_list',{cid});
   if(ticket!==requestId||getCompany()?.id!==cid)return;
   records=Array.isArray(result)?result:[];loadedCid=cid;
   render();renderAlerts();say(records.length+' multa(s) cadastrada(s) nesta empresa.');
  }catch(error){
   if(ticket!==requestId)return;
   records=[];loadedCid=cid;render();renderAlerts();
   say('Falha ao consultar multas: '+String(error?.message||'Tente atualizar os dados.'));
  }
 }
 function reset(){
  ++requestId;records=[];loadedCid=null;controls.query.value='';
  controls.status.value='';controls.from.value='';controls.to.value='';
  resetFilterOptions();render();
  for(const x of [...document.querySelectorAll('[data-xrm-fine-alert]')])x.remove();
 }
 function openForVehicle(id){
  resetFilterOptions();controls.vehicle.value=id||'';controls.query.value='';controls.status.value='';
  openView('fines');render();
 }
 async function documents(fine){
  if(getCompany()?.id!==loadedCid)return;
  try{
   await refreshCatalog();
   if(getCompany()?.id!==loadedCid)return;
   openDocument('fine',fine);
  }catch(error){notify('Não foi possível consultar os documentos: '+error.message)}
 }

 const modal=document.createElement('section');
 modal.className='xrm-fines-modal';modal.hidden=true;
 modal.setAttribute('role','presentation');
 modal.innerHTML='<div class="xrm-fines-modal-panel" role="dialog" aria-modal="true" aria-labelledby="xrm-fines-dialog-title">'+
  '<div class="xrm-fines-modal-header"><h3 id="xrm-fines-dialog-title">Registrar multa</h3>'+
  '<button type="button" class="xrm-fines-modal-close" id="xrm-fines-close" aria-label="Fechar">×</button></div>'+
  '<p class="xrm-fines-note">Dados extraídos da notificação, informados manualmente. O XRMOVI não consulta nem protocola recursos nos órgãos públicos.</p>'+
  '<form class="xrm-fines-form" id="xrm-fines-form"></form></div>';
 document.body.append(modal);
 const form=modal.querySelector('#xrm-fines-form');
 const closeButton=modal.querySelector('#xrm-fines-close');
 let closing=false;
 function closeForm(){
  if(busy||closing)return;
  closing=true;modal.hidden=true;formRecord=null;
  previousFocus?.focus?.({preventScroll:true});
  closing=false;
 }
 closeButton.onclick=closeForm;
 modal.addEventListener('click',e=>{if(e.target===modal)closeForm()});
 modal.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeForm();}
  if(e.key!=='Tab')return;
  const focusable=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary')].filter(x=>x.getClientRects().length);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 });
 const add=(name,label,type='text',value='',required=false,options=null,wide=false)=>{
  const node=document.createElement('label');if(wide)node.className='wide';
  node.textContent=label+(required?' *':'');
  const control=options?document.createElement('select'):type==='textarea'?document.createElement('textarea'):document.createElement('input');
  control.name=name;control.required=required;
  if(options)selectOptions(control,options,String(value??''));
  else if(type==='textarea')control.value=String(value??'');
  else {control.type=type;control.value=String(value??'');}
  node.append(control);form.append(node);return control;
 };
 let paidField=null;
 function updatePaidField(){
  const paid=form.elements.status?.value==='paid';
  if(paidField){
   paidField.closest('label').hidden=!paid;
   paidField.required=paid;
   if(!paid)paidField.value='';
   else if(!paidField.value)paidField.value=today();
  }
 }
 function fillForm(record){
  form.replaceChildren();
  add('vehicle','Veículo','text',record?.vehicle_id||'',true,
   getVehicles().map(x=>[x.id,x.plate+' · '+(x.model||x.category||'')]));
  add('driver','Motorista na data da infração (opcional)','text',record?.driver_id||'',false,
   [['','Não identificado / condutor não informado'],...getDrivers().map(d=>[d.id,d.name])]);
  add('notice','Número do auto de infração','text',record?.notice_number||'',true).maxLength=120;
  add('authority','Órgão autuador','text',record?.authority||'',true).maxLength=120;
  add('code','Código da infração (opcional)','text',record?.infraction_code||'').maxLength=40;
  add('points','Pontos informados na notificação (opcional)','number',record?.points??'').min='0';
  add('description','Descrição da infração','textarea',record?.description||'',true,null,true).maxLength=500;
  add('infraction_date','Data da infração','date',record?.infraction_date||today(),true);
  add('notice_date','Data de recebimento / notificação','date',record?.notice_date||'');
  add('location','Local da infração','text',record?.location||'',false,null,true).maxLength=300;
  const price=add('amount','Valor da multa (R$)','number',record?.amount??'',true);
  price.step='0.01';price.min='0.01';
  add('due','Vencimento para pagamento','date',record?.due_date||'');
  add('nomination_due','Prazo para indicar condutor','date',record?.driver_nomination_deadline||'');
  add('defense_due','Prazo para defesa / recurso','date',record?.defense_deadline||'');
  add('responsibility','Responsável pelo pagamento','text',record?.responsibility||'undetermined',
   true,Object.entries(responsibilityLabels));
  const st=add('status','Situação','text',record?.status||'pending',true,Object.entries(fineStatusLabels));
  paidField=add('paid','Data do pagamento','date',record?.paid_on||'');
  if(record?.status==='paid'){
   for(const opt of [...st.options])if(opt.value!=='paid')opt.disabled=true;
  }
  st.addEventListener('change',updatePaidField);updatePaidField();
  add('notes','Observações / andamento do recurso','textarea',record?.notes||'',false,null,true).maxLength=2000;
  if(record){
   const reason=add('reason','Motivo da alteração','text','',true,null,true);
   reason.minLength=3;reason.maxLength=500;
   const history=document.createElement('details');history.className='xrm-fines-history';
   const heading=document.createElement('summary');heading.textContent='Histórico de alterações auditadas';
   const content=document.createElement('div');content.textContent='Abra para consultar o histórico.';
   history.append(heading,content);form.append(history);
   let loaded=false;
   history.addEventListener('toggle',async()=>{
    if(!history.open||loaded)return;loaded=true;content.textContent='Consultando...';
    try{
     const data=await rpc('traffic_fine_history',{cid:getCompany().id,fid:record.id});
     content.replaceChildren();
     for(const change of data||[]){
      const p=document.createElement('p');
      p.textContent=new Date(change.date).toLocaleString('pt-BR')+' · '+
       (change.actor||'Usuário')+' · '+change.reason+
       ' · Situação: '+(change.before?.status||'novo')+' → '+(change.after?.status||'—')+
       ' · Valor: '+money(change.after?.amount||0);
      content.append(p);
     }
     if(!data?.length)content.textContent='Sem alterações registradas.';
    }catch(err){loaded=false;content.textContent='Não foi possível consultar o histórico: '+err.message;}
   });
  }
  const actions=document.createElement('div');actions.className='xrm-fines-actions';
  const cancel=button('Cancelar',closeForm);
  const save=document.createElement('button');save.type='submit';save.className='fleet-button primary';save.textContent=record?'Salvar alterações':'Registrar multa';
  const feedback=textNode('p','','xrm-fines-form-feedback');feedback.id='xrm-fines-form-feedback';
  form.append(feedback,actions);actions.append(cancel,save);
 }
 function openForm(record=null,showHistory=false){
  if(!canWrite())return notify('Somente proprietário ou gestor pode registrar ou alterar multas.');
  if(!getVehicles()?.length)return notify('Cadastre um veículo antes de registrar multas.');
  formRecord=record?{...record}:null;
  fillForm(formRecord);previousFocus=document.activeElement;
  modal.hidden=false;byId('xrm-fines-dialog-title').textContent=record?'Editar multa '+record.notice_number:'Registrar multa';
  form.elements.notice?.focus?.({preventScroll:true});
  if(showHistory)form.querySelector('details')?.setAttribute('open','');
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!canWrite()||!getCompany())return;
  const cid=getCompany().id;
  const data=new FormData(form);
  const string=k=>String(data.get(k)||'').trim();
  const statusValue=string('status');
  const amount=Number(string('amount'));
  const points=string('points')===''?null:Number(string('points'));
  const payload={
   cid,p_id:formRecord?.id||null,p_vehicle:string('vehicle'),p_driver:string('driver')||null,
   p_number:string('notice'),p_authority:string('authority'),p_code:string('code'),
   p_description:string('description'),p_infraction_date:string('infraction_date'),
   p_notice_date:string('notice_date')||null,p_location:string('location'),
   p_amount:amount,p_due:string('due')||null,p_nomination_due:string('nomination_due')||null,
   p_defense_due:string('defense_due')||null,p_points:points,
   p_responsibility:string('responsibility'),p_status:statusValue,
   p_paid:statusValue==='paid'?string('paid')||null:null,p_notes:string('notes'),
   p_expected_revision:formRecord?.revision??null,p_reason:formRecord?string('reason'):null
  };
  const feedback=byId('xrm-fines-form-feedback');
  if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(points??0)||points!=null&&(points<0||points>30)){
   feedback.textContent='Informe valor válido e pontos entre 0 e 30.';return;
  }
  if(statusValue==='paid'&&!payload.p_paid){
   feedback.textContent='Informe a data do pagamento para marcar como paga.';return;
  }
  if(statusValue==='paid'&&!formRecord?.expense_id){
   if(!window.confirm('Confirmar pagamento desta multa? Será criada UMA despesa vinculada na gestão financeira, sem duplicar lançamentos.'))return;
  }
  busy=true;const submit=form.querySelector('button[type=submit]');submit.disabled=true;
  feedback.textContent='Salvando multa e atualizando dados...';
  try{
   const result=await rpc('traffic_fine_save',payload);
   if(getCompany()?.id!==cid)throw Error('A empresa foi alterada durante o cadastro.');
   const wasNew=!formRecord;
   busy=false;modal.hidden=true;formRecord=null;
   await refresh();if(statusValue==='paid')await refreshFinances?.();
   notify((wasNew?'Multa cadastrada.':'Multa atualizada.')+(statusValue==='paid'?' Despesa financeira vinculada.':''));
   const saved=records.find(x=>x.id===result);
   if(saved&&wasNew&&window.confirm('Deseja anexar a notificação ou o comprovante agora?')){
    await documents(saved);
   }
  }catch(err){feedback.textContent='Não foi possível salvar: '+String(err?.message||err);}
  finally{busy=false;submit.disabled=false;}
 });
 // Finances are reloaded through the existing host callback, not direct writes from this module.
 let refreshFinances=null;
 function onFinanceRefresh(callback){refreshFinances=callback}
 for(const node of Object.values(controls))node?.addEventListener(node.tagName==='INPUT'?'input':'change',render);
 const create=byId('xrm-fines-add');
 if(create)create.onclick=()=>openForm();
 const refreshButton=byId('xrm-fines-refresh');
 if(refreshButton)refreshButton.onclick=()=>void refresh();
 const exportCsv=byId('xrm-fines-csv');
 if(exportCsv)exportCsv.onclick=()=>{
  const data=fineCsv(scopedRecords());
  const blob=new Blob([data],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='xrmovi-multas-'+today()+'.csv';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 async function printReport(includeImages=false){
  const popup=window.open('','_blank');
  if(!popup)return notify('Autorize pop-ups para imprimir o relatório.');
  popup.document.open();popup.document.write('<p style="font:16px Arial;padding:40px">Preparando o relatório de multas...</p>');popup.document.close();
  const cid=getCompany()?.id;
  try{
   await refreshCatalog();
   if(getCompany()?.id!==cid)throw Error('Empresa alterada durante a geração.');
   const rows=scopedRecords(),docs=(getCatalog()||[]).filter(d=>d.kind==='fine'&&rows.some(r=>r.id===d.record_id));
   const images=[];
   if(includeImages){
    for(const doc of docs.filter(d=>/\.(png|jpg|jpeg|webp)$/i.test(d.name||'')).slice(0,20)){
     try{
      const {data,error}=await client().storage.from('xrmovi-record-attachments').createSignedUrl(doc.path,180);
      if(error||!data?.signedUrl)continue;
      const url=new URL(data.signedUrl),base=new URL(client().supabaseUrl);
      if(url.protocol!=='https:'||url.origin!==base.origin)continue;
      const response=await fetch(url.href);if(!response.ok)continue;
      const blob=await response.blob();
      if(!blob.type.startsWith('image/')||blob.size>10485760)continue;
      const dataUrl=await new Promise((resolve,reject)=>{
       const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);
      });
      images.push({dataUrl,plate:rows.find(r=>r.id===doc.record_id)?.plate,fileName:doc.name});
     }catch{/* A failed attachment must not prevent the report of fines. */}
    }
   }
   popup.document.open();popup.document.write(fineReportHtml(rows,getCompany()?.name||'',{docCatalog:docs,images}));popup.document.close();
   popup.focus();popup.setTimeout(()=>popup.print(),400);
  }catch(error){
   popup.document.open();popup.document.write('<p>Não foi possível gerar o relatório. Volte ao XRMOVI e tente novamente.</p>');popup.document.close();
   notify('Relatório indisponível: '+error.message);
  }
 }
 byId('xrm-fines-pdf')?.addEventListener('click',()=>void printReport(false));
 byId('xrm-fines-pdf-docs')?.addEventListener('click',()=>void printReport(true));
 resetFilterOptions();
 render();
 return {refresh,reset,render,renderAlerts,openForVehicle,onFinanceRefresh,getRows:()=>records.slice()};
}
