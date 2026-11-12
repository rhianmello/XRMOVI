/* XRMOVI | Controle de KM e revisões; funções públicas limitadas à empresa autenticada. */
export function setupMileage({client,getCompany,getVehicles,getFilteredIds,onReload,onEditVehicle,canWrite,onAlertsChange}){
 const id=x=>document.getElementById(x);
 const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const km=n=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
 const day=date=>{if(!date)return 'Nunca';const text=String(date);return new Date(/^\d{4}-\d{2}-\d{2}$/.test(text)?text+'T12:00:00':text).toLocaleDateString('pt-BR')};
 const dateTime=date=>date?new Date(date).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Não registrado';
 const days=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
 let state=null,stateCompanyId=null,companyId=null,request=0,loadError='',busy=false,flash='',flashKind='';
 const rpc=async(name,args)=>{const {data,error}=await client.rpc('xrmovi_'+name,args);if(error)throw Error(error.message);return data};
 const add=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
 const btn=(label,fn,cls='')=>{const b=add('button','xrm-mileage-btn '+cls,label);b.type='button';b.onclick=fn;return b};
 const company=()=>getCompany();
 const rows=()=>stateCompanyId===company()?.id?state?.vehicles||[]:[];
 const scoped=()=>{const ids=getFilteredIds();return ids?rows().filter(v=>ids.has(v.id)):rows()};
 const toStatus=v=>v.oil_status==='overdue'?'Vencida':v.oil_status==='soon'?'Próxima':v.oil_status==='ok'?'Em dia':'Não configurada';
 const toStatusClass=v=>'xrm-oil-'+(v.oil_status||'unconfigured');
 const weekStart=()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(d.getDay()-(state?.weekday??1)+7)%7);return d};
 const weeklyDue=v=>{const latest=v.last_report_at||v.last_meter_at;return !latest||new Date(latest)<weekStart()};
 const owned=()=>!!canWrite();
 function status(message,type=''){flash=message;flashKind=type;const notice=id('xrm-mileage-message');if(notice){notice.textContent=message;notice.dataset.type=type}}
 async function refresh(cid=company()?.id){
  if(!cid)return;
  const current=++request;companyId=cid;
  try{const data=await rpc('mileage_dashboard',{cid});if(current!==request||company()?.id!==cid)return;stateCompanyId=cid;state=data||{vehicles:[],pending:[],weekday:1};loadError='';render();onAlertsChange?.()}
  catch(error){if(current!==request||company()?.id!==cid)return;loadError=error.message;stateCompanyId=cid;state={vehicles:[],pending:[],weekday:1};render();onAlertsChange?.();status('Falha ao consultar KM: '+error.message,'error')}
 }
 function oilAlerts(){return scoped().filter(v=>v.oil_status==='overdue'||v.oil_status==='soon')}
 function planFor(vid){return rows().find(v=>v.id===vid)||null}
 function render(){
  const consoleRoot=id('xrm-mileage-console');
  const dboard=id('xrm-mileage-dashboard'),alerts=id('xrm-mileage-alerts');
  if(!consoleRoot||!dboard||!alerts)return;
  const all=scoped();
  const oil=oilAlerts();
  const reminders=all.filter(weeklyDue);
  const pending=(stateCompanyId===company()?.id?state?.pending||[]:[]).filter(r=>!getFilteredIds()||getFilteredIds().has(r.vehicle_id));
  dboard.replaceChildren();
  const head=add('div','xrm-mileage-dash-head');
  const text=add('div');text.append(add('strong','','Quilometragem e óleo'),add('small','','Alertas vinculados ao hodômetro informado'));
  head.append(text);
  if(owned())head.append(btn('Histórico de leituras',()=>void showAuditHistory(),'subtle'));
  head.append(btn('Gerenciar KM →',()=>{document.querySelector('[data-view="mileage"]')?.click();id('xrm-mileage-console')?.scrollIntoView({behavior:'smooth',block:'start'})}));
  dboard.append(head);
  const chips=add('div','xrm-mileage-dash-chips');
  for(const [label,count,tone] of [['Troca de óleo',oil.length,'oil'],['KM semanal pendente',reminders.length,'weekly'],['Leituras para conferir',pending.length,'pending']]){
   const chip=add('div','xrm-mileage-dash-chip '+tone);chip.append(add('span','',label),add('strong','',String(count)));chips.append(chip);
  }
  dboard.append(chips);
  const summary=add('div','xrm-mileage-dash-lines');
  const notable=[...oil.map(v=>({label:v.plate+' · '+(v.oil_status==='overdue'?'Troca de óleo vencida':'Próxima troca: '+km(v.next_due_km)+' km'),tone:v.oil_status})),...reminders.filter(v=>!oil.some(o=>o.id===v.id)).map(v=>({label:v.plate+' · Atualização semanal do KM pendente',tone:'weekly'})),...pending.map(p=>({label:p.plate+' · KM informado requer conferência',tone:'pending'}))].slice(0,4);
  if(!notable.length)summary.append(add('small','','Nenhum alerta de óleo ou leitura pendente.'));
  else for(const item of notable)summary.append(add('div','xrm-mileage-line '+item.tone,item.label));
  dboard.append(summary);
  alerts.replaceChildren();
  if(oil.length||reminders.length||pending.length){
   const header=add('header');header.append(add('h2','','Quilometragem e trocas de óleo'),btn('Abrir controle',()=>{document.querySelector('[data-view="mileage"]')?.click();id('xrm-mileage-console')?.scrollIntoView({behavior:'smooth'})}));
   alerts.append(header);
   for(const v of oil)alerts.append(add('p',toStatusClass(v),v.plate+' — '+toStatus(v)+' · '+km(v.meter)+' / '+km(v.next_due_km)+' km'));
   if(reminders.length)alerts.append(add('p','',reminders.length+' veículo(s) aguardam atualização semanal de KM ('+days[state.weekday]+').'));
   if(pending.length)alerts.append(add('p','xrm-oil-overdue',pending.length+' leitura(s) suspeita(s) aguardam conferência do gestor.'));
  }
  renderConsole();
 }
 function renderConsole(){
  const root=id('xrm-mileage-console');if(!root)return;
  root.replaceChildren();
  const header=add('div','xrm-mileage-heading');const copy=add('div');
  copy.append(add('span','xrm-mileage-eyebrow','CONTROLE DE HODÔMETRO'),add('h2','','Quilometragem, troca de óleo e QR Code'),add('p','','Registre KM total por veículo, programe revisões e confira leituras enviadas pelos motoristas.'));
  header.append(copy,btn('Histórico geral / origem',()=>void showAuditHistory(),'subtle'),btn('Atualizar dados',()=>refresh(),'subtle'));
  root.append(header);
  if(loadError){root.append(add('p','xrm-mileage-empty','Não foi possível carregar os dados: '+loadError));return}
  const toolbar=add('div','xrm-mileage-toolbar');
  const week=add('label');week.textContent='Lembrete semanal';
  const weekday=add('select');weekday.setAttribute('aria-label','Dia da semana para lembrar atualização de KM');
  days.forEach((label,value)=>{const o=add('option','',label);o.value=String(value);weekday.append(o)});
  weekday.value=String(state?.weekday??1);weekday.disabled=!owned();
  weekday.onchange=async()=>{try{await rpc('mileage_settings_save',{cid:companyId,weekday:Number(weekday.value)});status('Dia do lembrete salvo.');await refresh()}catch(error){status(error.message,'error')}};
  week.append(weekday);toolbar.append(week);
  toolbar.append(add('p','','O lembrete aparece na Visão Geral a partir do dia escolhido, até uma leitura ser confirmada na semana.'));
  root.append(toolbar);
  const tools=add('div','xrm-mileage-bulk');
  tools.append(add('strong','','Atualização em lote'));
  const common=add('label','xrm-mileage-common');common.append(add('span','','KM TOTAL (hodômetro, não acréscimo) igual para a seleção'),Object.assign(add('input'),{type:'number',min:'0',step:'1',placeholder:'Ex.: 18000',id:'xrm-mileage-common-km'}));
  const choices=add('div','xrm-mileage-actions');
  choices.append(btn('Selecionar todos',()=>{root.querySelectorAll('.xrm-mileage-selected').forEach(i=>{i.checked=true})},'subtle'),btn('Limpar seleção',()=>{root.querySelectorAll('.xrm-mileage-selected').forEach(i=>{i.checked=false})},'subtle'));
  choices.append(btn('Salvar KM dos selecionados',()=>void saveBulk(),'primary'));
  tools.append(common,choices,add('small','','Deixe o KM comum vazio para informar uma leitura diferente na coluna “Novo KM” de cada veículo.'));
  if(owned())root.append(tools);
  const wrap=add('div','xrm-mileage-table-wrap'),table=add('table','xrm-mileage-table'),thead=add('thead'),row=add('tr');
  for(const label of ['','Veículo','KM atual','Troca de óleo','Próxima troca','Última leitura','Novo KM TOTAL','Ações'])row.append(add('th','',label));
  thead.append(row);table.append(thead);
  const tbody=add('tbody');
  for(const v of scoped()){
   const tr=add('tr'),checkTd=add('td'),check=add('input','xrm-mileage-selected');
   check.type='checkbox';check.dataset.vid=v.id;check.disabled=!owned();checkTd.append(check);tr.append(checkTd);
   const identity=add('td');identity.append(add('strong','',v.plate));identity.append(add('small','',v.model||v.category||''));tr.append(identity);
   tr.append(add('td','',km(v.meter)+' km'));
   tr.append(add('td',toStatusClass(v),toStatus(v)));
   tr.append(add('td','',v.next_due_km==null?'—':km(v.next_due_km)+' km'));
   const last=add('td','',v.last_report_at?day(v.last_report_at):'Sem registro');if(weeklyDue(v))last.append(add('small','xrm-mileage-warn','Atualizar esta semana'));tr.append(last);
   const reading=add('td');const input=add('input','xrm-mileage-input');input.type='number';input.min='0';input.step='1';input.placeholder='KM TOTAL, não + KM';input.dataset.vid=v.id;input.disabled=!owned();reading.append(input);tr.append(reading);
   const actions=add('td','xrm-mileage-actions');
   if(owned()){
    actions.append(btn('Salvar KM',()=>void saveOne(v.id,Number(input.value),input.value),'small'));
    actions.append(btn('Configurar',()=>onEditVehicle(v.id),'subtle small'));
    if(v.qr_token)actions.append(btn('QR Code',()=>showQr(v),'subtle small'));
    actions.append(btn('Histórico KM',()=>void showReadingHistory(v),'subtle small'));
    if(v.interval_km)actions.append(btn('Concluir óleo',()=>showOil(v),'subtle small'));
    if(v.interval_km)actions.append(btn('Histórico de óleo',()=>void showOilHistory(v),'subtle small'));
   }
   tr.append(actions);tbody.append(tr);
  }
  if(!rows().length){const tr=add('tr');const td=add('td','', 'Nenhum ativo cadastrado. Cadastre um veículo primeiro.');td.colSpan=8;tr.append(td);tbody.append(tr)}
  table.append(tbody);wrap.append(table);root.append(wrap);
  const pending=state?.pending||[];
  if(pending.length){
   const box=add('div','xrm-mileage-review');
   const head=add('div','xrm-mileage-review-head');
   head.append(add('h3','','Leituras suspeitas aguardando conferência'));
   head.append(add('small','','Rejeitar remove da fila, mas preserva o registro no histórico. Consulte a origem pelo botão ao lado de cada leitura.'));
   box.append(head);
   const toolbar=add('div','xrm-mileage-review-toolbar');
   const chooseAll=add('label','xrm-mileage-review-select-all');
   const allBox=add('input');allBox.type='checkbox';
   allBox.setAttribute('aria-label','Selecionar todas as leituras pendentes');
   chooseAll.append(allBox,add('span','','Selecionar todas'));
   const selectionSummary=add('span','xrm-mileage-review-summary','0 selecionadas');
   const approve=btn('Aprovar selecionadas',()=>void reviewSelected('accept'),'primary');
   const reject=btn('Rejeitar selecionadas',()=>void reviewSelected('reject'),'danger');
   approve.disabled=true;reject.disabled=true;
   toolbar.append(chooseAll,selectionSummary,approve,reject);
   if(owned())box.append(toolbar);
   const list=add('div','xrm-mileage-review-list');
   const updateSelection=()=>{
    const all=[...list.querySelectorAll('.xrm-review-selected')],selected=all.filter(check=>check.checked);
    const invalid=selected.filter(check=>{
     const record=pending.find(r=>String(r.id)===check.dataset.reportId);
     return record&&Number(record.meter)<Number(record.current_meter);
    });
    const checked=selected.length;
    allBox.checked=checked>0&&checked===all.length;
    allBox.indeterminate=checked>0&&checked<all.length;
    selectionSummary.textContent=checked+' selecionada(s)'+(invalid.length?' · '+invalid.length+' abaixo do KM confirmado':'');
    approve.disabled=!owned()||checked===0||busy;
    reject.disabled=!owned()||checked===0||busy;
    approve.title=invalid.length?'Leituras abaixo do KM atual precisam ser corrigidas individualmente ou rejeitadas.':'Aprovar quilometragens selecionadas';
   };
   allBox.onchange=()=>{list.querySelectorAll('.xrm-review-selected').forEach(check=>{check.checked=allBox.checked});updateSelection()};
   for(const r of pending){
    const line=add('div','xrm-mileage-review-row');
    if(owned()){
     const selector=add('input','xrm-review-selected');
     selector.type='checkbox';selector.dataset.reportId=r.id;
     selector.setAttribute('aria-label','Selecionar leitura '+r.plate+' de '+km(r.meter)+' km');
     selector.onchange=updateSelection;line.append(selector);
    }
    const info=add('div','xrm-mileage-review-info');
    info.append(add('strong','',r.plate+' · '+km(r.meter)+' km'),add('small','',r.reason||'Leitura pendente'),add('small','',(r.driver_name||'Enviado pelo painel')+' · '+day(r.submitted_at)));
    if(Number(r.meter)<Number(r.current_meter))info.append(add('small','xrm-review-lower','KM confirmado: '+km(r.current_meter)+' — menor leitura exige conferência individual'));
    line.append(info);
    const actions=add('div','xrm-mileage-review-actions');
    if(r.photo&&owned())actions.append(btn('Ver foto',()=>void openProof(r.photo),'subtle small'));
    if(owned())actions.append(btn('Origem / histórico',()=>void showReadingHistory({id:r.vehicle_id,plate:r.plate}),'subtle small'));
    if(owned()){
     actions.append(btn('Rejeitar',()=>void rejectOne(r),'danger small'));
     actions.append(btn('Conferir',()=>showReview(r),'primary small'));
    }
    line.append(actions);list.append(line);
   }
   box.append(list);
   if(owned())updateSelection();
   root.append(box);
  }
  root.append(add('p','xrm-mileage-message',flash));const notice=root.lastChild;notice.id='xrm-mileage-message';notice.dataset.type=flashKind;
 }
 async function saveOne(vid,value,raw){
  if(!owned())return;
  if(raw===''||!Number.isFinite(value)||value<0){status('Informe o KM total do veículo.','error');return}
  const current=Number(planFor(vid)?.meter??0);
  if(value<current){
   const total=current+value;
   if(!window.confirm('ATENÇÃO: '+km(value)+' km é MENOR que o hodômetro confirmado ('+km(current)+' km).\n\nVocê quis informar um ACRÉSCIMO de +'+km(value)+' km?\n\nOK: somar e registrar '+km(total)+' km TOTAL.\nCancelar: não gravar nada.')){status('Operação cancelada. Nenhuma quilometragem foi alterada.','warn');return}
   value=total;
  }
  try{const data=await rpc('mileage_submit_admin',{cid:companyId,vid,p_meter:value,p_note:'Leitura registrada no painel'});status(data.status==='pending'?'Leitura acima do limite: enviada para conferência.':'Quilometragem atualizada.',data.status==='pending'?'warn':'');await onReload();await refresh()}
  catch(error){status(error.message,'error')}
 }
 async function saveBulk(){
  if(busy)return;
  const selected=[...id('xrm-mileage-console').querySelectorAll('.xrm-mileage-selected:checked')];
  if(!selected.length){status('Selecione ao menos um veículo.','error');return}
  const shared=id('xrm-mileage-common-km').value;const records=selected.map(input=>{
   const individual=id('xrm-mileage-console').querySelector('.xrm-mileage-input[data-vid="'+input.dataset.vid+'"]');
   return {vid:input.dataset.vid,raw:shared!==''?shared:individual.value,plate:rows().find(v=>v.id===input.dataset.vid)?.plate||'Veículo'}
  });
  if(records.some(x=>x.raw===''||!Number.isFinite(Number(x.raw))||Number(x.raw)<0)){status('Informe o KM total de cada veículo selecionado ou preencha o KM comum.','error');return}
  const lower=records.filter(x=>Number(x.raw)<Number(planFor(x.vid)?.meter??0));
  if(lower.length){
   status('BLOQUEADO: '+lower.map(x=>x.plate+' (digitado '+km(x.raw)+' / atual '+km(planFor(x.vid)?.meter)+')').join('; ')+'. Informe o KM TOTAL, não a quantidade percorrida. Nenhum veículo foi atualizado.','error');
   return;
  }
  if(shared!==''&&!confirm('Confirmar o mesmo KM total ('+km(shared)+') para '+records.length+' veículo(s)?'))return;
  busy=true;let saved=0,pending=0,failed=[];
  for(const x of records){
   try{const result=await rpc('mileage_submit_admin',{cid:companyId,vid:x.vid,p_meter:Number(x.raw),p_note:'Atualização em lote'});
    if(result?.status==='pending')pending++;else saved++;
   }catch(error){failed.push(x.plate+': '+error.message)}
  }
  busy=false;
  await onReload();await refresh();
  status(saved+' confirmada(s), '+pending+' pendente(s) de conferência.'+(failed.length?' Erros: '+failed.join(' / '):''),failed.length?'error':pending?'warn':'');
 }
 async function reviewSelected(decision){
  if(!owned()||busy)return;
  const chosen=[...id('xrm-mileage-console').querySelectorAll('.xrm-review-selected:checked')];
  if(!chosen.length){status('Selecione uma ou mais conferências.','error');return}
  const records=chosen.map(node=>(state?.pending||[]).find(row=>String(row.id)===node.dataset.reportId)).filter(Boolean);
  if(records.length!==chosen.length){status('A lista de conferências mudou. Atualize antes de continuar.','error');return}
  if(decision==='accept'){
   const lower=records.filter(r=>Number(r.meter)<Number(r.current_meter));
   if(lower.length){
    status('Não é seguro aprovar em lote: '+lower.length+' leitura(s) informam KM menor que o confirmado. Rejeite-as em lote ou use Conferir para corrigir uma por uma. Nenhum KM foi alterado.','error');
    return;
   }
  }
  const label=decision==='accept'?'APROVAR':'REJEITAR';
  const message=decision==='reject'?'As leituras sairão da fila, mas continuarão no histórico.':'A quilometragem dos veículos será atualizada com os valores selecionados.';
  if(!confirm(label+' '+records.length+' leitura(s)? '+message))return;
  busy=true;
  try{
   const result=await rpc('mileage_bulk_review',{
    cid:companyId,report_ids:records.map(r=>r.id),p_decision:decision,
    p_reason:decision==='reject'?'Leituras descartadas pelo gestor em conferência em lote':'Leituras aprovadas pelo gestor em conferência em lote'
   });
   await onReload();await refresh();
   status((result?.reviewed??records.length)+' leitura(s) '+(decision==='reject'?'rejeitadas e removidas das pendências':'aprovadas e aplicadas')+'. O histórico foi preservado.');
  }catch(error){status('Falha na operação em lote: '+error.message,'error')}
  finally{busy=false}
 }
 async function rejectOne(record){
  if(!owned()||busy)return;
  if(!confirm('Rejeitar a leitura de '+km(record.meter)+' km do veículo '+record.plate+'? Ela sairá das pendências e permanecerá no histórico.'))return;
  busy=true;
  try{
   await rpc('mileage_review',{cid:companyId,p_report:record.id,p_decision:'reject',p_corrected:null,p_reason:'Leitura rejeitada pelo gestor na fila de conferência'});
   await onReload();await refresh();
   status('Leitura de '+record.plate+' rejeitada e removida das pendências. Histórico preservado.');
  }catch(error){status('Não foi possível rejeitar: '+error.message,'error')}
  finally{busy=false}
 }
 function makeDialog(title){
  const modal=add('dialog','xrm-mileage-modal');
  const head=add('div','xrm-mileage-modal-head');head.append(add('h2','',title),btn('×',()=>modal.close(),'close'));
  modal.append(head);document.body.append(modal);modal.addEventListener('close',()=>modal.remove());modal.showModal();return modal;
 }
 function labelInput(label,type,value=''){
  const labelEl=add('label');labelEl.append(add('span','',label));const inp=add('input');inp.type=type;inp.value=value==null?'':String(value);labelEl.append(inp);return {label:labelEl,input:inp};
 }
 function showOil(vehicle){
  const modal=makeDialog('Concluir troca de óleo · '+vehicle.plate);
  const form=add('form','xrm-mileage-modal-form');form.method='dialog';
  const today=new Date(),localISO=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  const meter=labelInput('KM da troca','number',vehicle.meter),date=labelInput('Data do serviço','date',localISO),oil=labelInput('Óleo utilizado','text',vehicle.oil_type||''),cost=labelInput('Custo realizado (R$)','number','0'),notes=labelInput('Serviço realizado / observações','text','');
  for(const x of [meter,date,oil,cost,notes])form.append(x.label);
  meter.input.required=true;meter.input.min='0';date.input.required=true;cost.input.min='0';cost.input.step='.01';
  const message=add('p','xrm-mileage-modal-help','A próxima troca será calculada automaticamente após salvar a conclusão.');form.append(message);
  const submit=btn('Concluir serviço',async()=>{
   if(!meter.input.reportValidity()||!date.input.reportValidity())return;
   submit.disabled=true;
   try{await rpc('oil_complete',{cid:companyId,vid:vehicle.id,p_meter:Number(meter.input.value),p_date:date.input.value,p_oil_type:oil.input.value,p_cost:Number(cost.input.value)||0,p_notes:notes.input.value});modal.close();await onReload();await refresh();status('Troca de óleo concluída. Próximo vencimento atualizado.')}
   catch(error){message.textContent=error.message;submit.disabled=false}
  },'primary');form.append(submit);modal.append(form);
 }
 const sourceName=r=>r.source==='qr'?'QR Code do veículo':r.source==='bulk'?'Lote pelo painel':r.source==='admin'?'Painel administrativo':r.source||'Origem não informada';
 const statusName=r=>r.status==='accepted'?'Confirmada':r.status==='pending'?'Aguardando conferência':r.status==='rejected'?'Rejeitada':r.status||'Desconhecido';
 function addReadingDetails(host,r){
  const row=add('article','xrm-mileage-history-row xrm-audit-record');
  const original=Number(r.meter);
  const applied=r.applied_meter!=null?Number(r.applied_meter):null;
  const label=add('strong','',String(r.plate||'Veículo')+' · '+km(original)+' km enviados · '+statusName(r));
  row.append(label);
  if(r.baseline_meter!=null)row.append(add('span','','KM antes do envio: '+km(r.baseline_meter)+' km'));
  else row.append(add('span','xrm-audit-muted','KM antes do envio: não registrado na versão anterior.'));
  if(r.review_from_meter!=null)row.append(add('span','','KM confirmado antes da decisão: '+km(r.review_from_meter)+' km'));
  if(applied!==null)row.append(add('span','xrm-audit-applied','KM total aplicado: '+km(applied)+' km'+(applied!==original?' (corrigido de '+km(original)+' km)':'')));
  if(r.status==='rejected')row.append(add('span','xrm-audit-rejected','Leitura rejeitada: não alterou o hodômetro.'));
  const via=r.source==='qr'?(r.driver_name?'Motorista informado: '+r.driver_name:'Motorista não identificado'):
    (r.submitter_email?'Usuário: '+r.submitter_email:'Usuário que enviou: não registrado no histórico antigo');
  row.append(add('span','','Origem: '+sourceName(r)+' · '+via));
  row.append(add('span','','Recebida em: '+dateTime(r.submitted_at)));
  if(r.reviewed_at)row.append(add('span','','Decidida em: '+dateTime(r.reviewed_at)+' · '+(r.reviewer_email||'Responsável não registrado')));
  if(r.reason)row.append(add('span','','Alerta original: '+r.reason));
  if(r.review_note)row.append(add('span','','Observação / justificativa: '+r.review_note));
  if(r.id)row.append(add('small','xrm-audit-muted','Referência de auditoria: '+r.id));
  if(r.photo)row.append(btn('Ver comprovante original',()=>void openProof(r.photo),'subtle small'));
  host.append(row);
 }
 async function showReadingHistory(vehicle){
  const modal=makeDialog('Histórico e origem do KM · '+vehicle.plate);
  modal.classList.add('xrm-audit-modal');
  const box=add('div','xrm-mileage-history');box.append(add('p','xrm-mileage-modal-help','Consultando leituras registradas…'));modal.append(box);
  try{
   const records=await rpc('mileage_readings',{cid:companyId,vid:vehicle.id});
   if(!modal.isConnected)return;
   box.replaceChildren();
   box.append(add('p','xrm-mileage-modal-help','Leituras enviadas, aprovadas e rejeitadas. Registros anteriores podem não identificar o usuário ou KM inicial.'));
   if(!records?.length){box.append(add('p','xrm-mileage-modal-help','Nenhuma leitura registrada.'));return}
   for(const r of records)addReadingDetails(box,{...r,plate:vehicle.plate});
  }catch(error){box.textContent='Falha ao consultar histórico: '+error.message}
 }
 async function showAuditHistory(){
  if(!owned()){status('Apenas o gestor pode consultar a auditoria das leituras.','error');return}
  const modal=makeDialog('Histórico geral e origem das leituras');
  modal.classList.add('xrm-audit-modal');
  const box=add('div','xrm-mileage-history');
  box.append(add('p','xrm-mileage-modal-help','Consultando até 200 registros recentes da empresa ativa no Supabase…'));
  modal.append(box);
  try{
   const records=await rpc('mileage_audit',{cid:companyId,p_limit:200});
   if(!modal.isConnected)return;
   box.replaceChildren();
   box.append(add('p','xrm-mileage-modal-help','Veja de onde veio cada informação, o KM original, correções, decisão, usuário e foto (quando houver). A consulta é limitada aos 200 registros mais recentes.'));
   const controls=add('div','xrm-audit-filters');
   const search=add('input');search.type='search';search.placeholder='Buscar placa, usuário, motorista ou referência…';search.setAttribute('aria-label','Pesquisar histórico');
   const statusFilter=add('select');statusFilter.setAttribute('aria-label','Filtrar situação');
   for(const [value,label] of [['','Todas as situações'],['accepted','Confirmadas'],['pending','Pendentes'],['rejected','Rejeitadas']]){
    const opt=add('option','',label);opt.value=value;statusFilter.append(opt);
   }
   const sourceFilter=add('select');sourceFilter.setAttribute('aria-label','Filtrar origem');
   for(const [value,label] of [['','Todas as origens'],['qr','QR Code'],['admin','Painel'],['bulk','Lote']]){
    const opt=add('option','',label);opt.value=value;sourceFilter.append(opt);
   }
   controls.append(search,statusFilter,sourceFilter);box.append(controls);
   const summary=add('p','xrm-mileage-modal-help');box.append(summary);
   const listing=add('div','xrm-audit-results');box.append(listing);
   function draw(){
    const q=search.value.trim().toLocaleLowerCase('pt-BR');
    const data=(records||[]).filter(r=>(!statusFilter.value||r.status===statusFilter.value)
      &&(!sourceFilter.value||r.source===sourceFilter.value)
      &&(!q||[r.plate,r.driver_name,r.submitter_email,r.reviewer_email,r.id,r.review_note,r.reason]
       .some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(q))));
    summary.textContent=data.length+' de '+(records||[]).length+' leitura(s) exibida(s).';
    listing.replaceChildren();
    if(!data.length)listing.append(add('p','xrm-mileage-modal-help','Nenhuma leitura encontrada para os filtros.'));
    for(const r of data)addReadingDetails(listing,r);
   }
   for(const filter of [search,statusFilter,sourceFilter])filter.addEventListener('input',draw);
   draw();
  }catch(error){box.textContent='Não foi possível consultar a auditoria: '+error.message}
 }
 async function showOilHistory(vehicle){
  const modal=makeDialog('Trocas de óleo · '+vehicle.plate);
  const box=add('div','xrm-mileage-history');box.append(add('p','xrm-mileage-modal-help','Consultando trocas registradas no Supabase…'));modal.append(box);
  try{
   const records=await rpc('oil_history',{cid:companyId,vid:vehicle.id});
   box.replaceChildren();
   if(!records?.length){box.append(add('p','xrm-mileage-modal-help','Nenhuma troca concluída neste veículo.'));return}
   for(const item of records){
    const line=add('div','xrm-mileage-history-row');
    line.append(add('strong','',day(item.completed_on)+' · '+km(item.completed_meter)+' km'));
    line.append(add('span','',(item.oil_type||'Óleo não informado')+' · '+km(item.interval_km)+' km por troca'));
    line.append(add('span','','Custo: '+money(item.cost)+' · '+(item.notes||'Sem observações')));
    box.append(line);
   }
  }catch(error){box.textContent='Erro ao consultar histórico: '+error.message}
 }
 function showReview(record){
  const modal=makeDialog('Conferir leitura · '+record.plate);
  const form=add('div','xrm-mileage-modal-form');
  const original=Number(record.meter),current=Number(record.current_meter);
  form.append(add('p','xrm-mileage-modal-help','Leitura recebida: '+km(original)+' km · KM TOTAL atualmente confirmado: '+km(current)+' km. '+(record.reason||'')));
  const value=labelInput('Novo KM TOTAL confirmado (NÃO é acréscimo)','number',record.meter),reason=labelInput('Motivo da decisão / correção','text','');
  value.input.min=String(current);value.input.max='10000000';value.input.step='1';value.input.required=true;
  reason.input.required=true;reason.input.minLength=4;reason.input.maxLength=500;
  form.append(value.label,reason.label);
  const warning=add('div','xrm-mileage-guard');warning.setAttribute('role','alert');form.append(warning);
  if(original<current){
   const example=btn('Somar +'+km(original)+' km ao KM atual = '+km(current+original)+' km TOTAL',()=>{
    value.input.value=String(current+original);validate();
   },'subtle xrm-mileage-sum-example');
   form.append(example);
  }
  const message=add('p','xrm-mileage-modal-help','Aprovar altera o KM total; rejeitar mantém o valor confirmado. Ambas as decisões ficam no histórico.');
  form.append(message);
  const actions=add('div','xrm-mileage-actions');
  const reject=btn('Rejeitar',()=>void act('reject'),'subtle');
  const accept=btn('Aprovar / corrigir',()=>void act('accept'),'primary');
  const validate=()=>{
   const raw=value.input.value.trim();
   const typed=Number(raw);
   const invalid=!raw||!Number.isFinite(typed)||typed<0||typed>10000000;
   const lower=!invalid&&typed<current;
   accept.disabled=invalid||lower||busy;
   warning.className='xrm-mileage-guard'+(lower||invalid?' danger':' ok');
   warning.textContent=lower?
     'BLOQUEADO: '+km(typed)+' km é MENOR que os '+km(current)+' km confirmados. Se você quis dizer +'+km(typed)+' km percorridos, o novo KM TOTAL seria '+km(current+typed)+' km. Use o botão de soma acima ou digite o hodômetro correto.':
     invalid?'Informe o KM TOTAL válido do hodômetro.':
     'KM TOTAL a confirmar: '+km(typed)+' km · Variação: +'+km(typed-current)+' km. O valor anterior não será apagado do histórico.';
  };
  value.input.addEventListener('input',validate);validate();
  let saving=false;
  async function act(decision){
   if(saving)return;
   if(!reason.input.value.trim()||reason.input.value.trim().length<4){message.textContent='Informe o motivo da conferência (mínimo 4 caracteres).';return}
   const typed=Number(value.input.value),raw=value.input.value.trim();
   if(decision==='accept'&&(!raw||!Number.isFinite(typed)||typed<current||typed>10000000)){
    message.textContent='A aprovação foi bloqueada porque o KM TOTAL está inválido ou é menor que o confirmado.';
    validate();return;
   }
   if(decision==='accept'&&!window.confirm('Confirmar '+km(typed)+' km TOTAIS para '+record.plate+'?\n\nAntes: '+km(current)+' km\nDepois: '+km(typed)+' km\nDiferença: +'+km(typed-current)+' km\n\nEsta decisão ficará registrada no histórico.'))return;
   saving=true;accept.disabled=true;reject.disabled=true;
   try{
    await rpc('mileage_review',{cid:companyId,p_report:record.id,p_decision:decision,p_corrected:decision==='accept'?typed:null,p_reason:reason.input.value.trim()});
    modal.close();await onReload();await refresh();
    status(decision==='accept'?'Leitura conferida. KM TOTAL e histórico de origem atualizados.':'Leitura rejeitada. KM atual preservado no histórico.');
   }catch(error){message.textContent='Não foi possível concluir: '+error.message}
   finally{saving=false;if(modal.isConnected){reject.disabled=false;validate()}}
  }
  actions.append(reject,accept);form.append(actions);modal.append(form);
 }
 async function openProof(path){
  try{const {data,error}=await client.storage.from('xrmovi-odometer-proof').createSignedUrl(path,90);
   if(error||!data?.signedUrl)throw Error(error?.message||'Acesso à imagem indisponível');
   window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }catch(error){status('Não foi possível abrir foto: '+error.message,'error')}
 }
 function showQr(vehicle){
  const token=vehicle.qr_token;
  if(!token)return status('Cadastre as configurações do veículo para gerar o QR.','warn');
  const url=new URL('/km/',location.origin);url.searchParams.set('token',token);
  const modal=makeDialog('QR Code · '+vehicle.plate);
  const content=add('div','xrm-mileage-qr');
  const qrHost=add('div','xrm-mileage-qr-display');
  qrHost.setAttribute('role','img');qrHost.setAttribute('aria-label','QR Code de '+vehicle.plate);
  content.append(qrHost);
  const help=add('p','xrm-mileage-modal-help','Gerando QR Code seguro…');
  content.append(help);
  content.append(add('p','',vehicle.plate+' · Acesso para motorista informar KM com foto.'));
  const link=labelInput('Link de leitura','text',url.href);
  link.input.readOnly=true;content.append(link.label);
  const actions=add('div','xrm-mileage-actions');
  const copy=btn('Copiar link',async()=>{
   try{await navigator.clipboard.writeText(url.href);help.textContent='Link copiado para compartilhar com o motorista.'}
   catch{link.input.select();const copied=document.execCommand('copy');help.textContent=copied?'Link copiado.':'Selecione e copie o link manualmente.'}
  });
  const download=btn('Baixar QR',()=>{const data=imageData();if(!data){help.textContent='O QR Code ainda não está disponível. Não é possível baixar uma imagem em branco.';return}
   const a=add('a');a.download='xrmovi-'+vehicle.plate.replace(/[^a-z0-9-]/gi,'')+'-qr.png';a.href=data;a.click();
  },'primary');
  const print=btn('Imprimir',()=>{
   const data=imageData();if(!data){help.textContent='O QR Code ainda não está pronto para impressão.';return}
   const popup=window.open('','_blank');if(!popup){help.textContent='Permita pop-ups para imprimir.';return}
   const title=vehicle.plate.replace(/[^a-zA-Z0-9 -]/g,'');
   popup.document.write('<!doctype html><html><head><title>QR - '+title+'</title></head><body style="text-align:center;font-family:sans-serif"><h1>'+title+'</h1><img alt="QR Code" width="260" height="260" src="'+data+'"><p>Escaneie para atualizar a quilometragem no XRMOVI.</p></body></html>');
   popup.document.close();popup.onload=()=>popup.print();
  });
  // Add the mandatory white quiet zone to downloaded and printed QR images.
  // A QR without a white margin may display correctly but fail to scan.
  const imageData=()=>{
   const source=qrHost.querySelector('canvas')||qrHost.querySelector('img');
   if(!source)return '';
   try{
    const image=document.createElement('canvas');image.width=320;image.height=320;
    const context=image.getContext('2d');if(!context)return '';
    context.fillStyle='#ffffff';context.fillRect(0,0,320,320);
    context.drawImage(source,32,32,256,256);
    return image.toDataURL('image/png');
   }catch{return ''}
  };
  download.disabled=true;print.disabled=true;
  actions.append(copy,download,print);
  actions.append(btn('Revogar e gerar outro',async()=>{
   if(!confirm('O QR Code anterior deixará de funcionar. Continuar?'))return;
   try{await rpc('mileage_qr_rotate',{cid:companyId,vid:vehicle.id});modal.close();await refresh();status('QR Code substituído. Imprima o novo código.')}
   catch(error){help.textContent=error.message}
  },'subtle'));
  content.append(actions);modal.append(content);
  try{
   if(typeof window.QRCode!=='function')throw Error('O módulo de geração não carregou. O link acima continua funcionando.');
   new window.QRCode(qrHost,{
    text:url.href,width:256,height:256,colorDark:'#061726',colorLight:'#ffffff',
    correctLevel:window.QRCode.CorrectLevel.M
   });
   window.requestAnimationFrame(()=>{
    if(!modal.isConnected)return;
    const data=imageData();
    if(data&&data.length>80){download.disabled=false;print.disabled=false;help.textContent='QR Code pronto para baixar, imprimir ou compartilhar.'}
    else help.textContent='Não foi possível desenhar o QR Code. Copie o link ou atualize a página.';
   });
  }catch(error){help.textContent='Falha ao gerar o QR Code: '+error.message+' O link continua disponível.'}
 }

 return {refresh,render,planFor,oilAlerts};
}
