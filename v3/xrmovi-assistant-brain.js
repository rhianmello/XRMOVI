/* XRMOVI V4 deterministic copilot: no generative API and no direct database access. */
(function(root){
'use strict';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const count=v=>Number(v).toLocaleString('pt-BR');
const sum=rows=>rows.reduce((t,v)=>t+Number(v.amount||0),0);
const valued=rows=>rows.filter(r=>r.amount!==null&&r.amount!==undefined&&Number.isFinite(Number(r.amount)));
const plate=(d,id)=>d.vehicles.find(v=>v.id===id)?.plate||'veículo sem placa disponível';
let state={companyId:null,contractId:null,intent:'',topic:'',vehicleId:null,period:null,lessonId:null,recent:[]};
function reset(){state={companyId:null,contractId:null,intent:'',topic:'',vehicleId:null,period:null,lessonId:null,recent:[]};}
function respond(question,answer,intent,extra={}){
 state.intent=intent;Object.assign(state,extra);
 state.recent.push({question:String(question).slice(0,160),intent});if(state.recent.length>6)state.recent.shift();
 return {matched:true,text:answer,lessonId:extra.lessonId||null};
}
function getTools(){
 const tools=root.XrmoviAssistantTools;const data=tools?.snapshot?.();
 if(!data)return null;
 if(state.companyId!==data.companyId||state.contractId!==data.contractId){
  reset();state.companyId=data.companyId;state.contractId=data.contractId;
 }
 return {tools,data};
}
function month(offset=0){
 const today=new Date(),first=new Date(today.getFullYear(),today.getMonth()+offset,1),last=new Date(today.getFullYear(),today.getMonth()+offset+1,0);
 const date=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 return {from:date(first),to:date(last),name:date(first).slice(0,7)};
}
function grouped(rows){
 const group=new Map();
 for(const row of valued(rows))group.set(row.vehicleId,(group.get(row.vehicleId)||0)+Number(row.amount));
 return [...group].map(([vehicleId,amount])=>({vehicleId,amount})).sort((a,b)=>b.amount-a.amount);
}
function scope(data){return data.contractId?'contrato '+data.contractName+' e filtros selecionados':'empresa e filtros selecionados';}
function moduleFor(q){
 if(/relatorio|financeir|exportar|pdf/.test(q))return'financial';
 if(/motorista|cnh/.test(q))return'drivers';
 if(/abastec|combustivel|diesel/.test(q))return'fuel';
 if(/manutencao|revisao|servico/.test(q))return'maintenance';
 if(/historico/.test(q))return'history';
 if(/alerta|vencid/.test(q))return'alerts';
 if(/plano|assinatura|contrato/.test(q))return'subscription';
 if(/veiculo|carro|caminhao|frota|ativo|status/.test(q))return'assets';
 return null;
}
function formFor(q){
 if(/abastec|combustivel/.test(q))return'fuel';
 if(/motorista/.test(q))return'driver';
 if(/manutencao|revisao/.test(q))return'maintenance';
 if(/despesa|multa|ipva/.test(q))return'expense';
 if(/veiculo|carro|caminhao|ativo/.test(q))return'vehicle';
 return null;
}
function highlight(view){
 const selectors={assets:'#assets-actions',maintenance:'#maintenance-new',fuel:'#fuel-actions',drivers:'#driver-new',financial:'#xrm-report-apply'};
 const element=root.document?.querySelector(selectors[view]||'#view-'+view+' h2');
 if(!element)return;
 element.scrollIntoView?.({behavior:'smooth',block:'center'});
 element.classList.add('xrm-assistant-highlight');
 setTimeout(()=>element.classList.remove('xrm-assistant-highlight'),3700);
}
function describe(items,data){
 return items.length?items.slice(0,10).map(v=>v.plate+' ('+(v.model||v.category||'sem modelo')+')').join(', ')+(items.length>10?' e mais '+(items.length-10):'')+'.':'Nenhum veículo nessa situação nos filtros atuais.';
}
async function financial(question,tools,data,follow=false){
 const q=norm(question),previous=/mes passado|mes anterior/.test(q),compare=/compar|ultimos dois meses|dois ultimos meses/.test(q);
 const last=state.intent;
 const kind=/custo total|frota cust|custou a frota|quanto minha frota|gasto total/.test(q)||follow&&last==='finance:all'?'all':/manutencao|revisao/.test(q)||follow&&last==='finance:maintenanceCosts'?'maintenanceCosts':/despesas? pag/.test(q)||follow&&last==='finance:paidExpenses'?'paidExpenses':'fuel';
 const caption=kind==='all'?'custo total da frota':kind==='fuel'?'combustível':kind==='maintenanceCosts'?'manutenção realizada':'despesas pagas';
 const rowsOf=report=>kind==='all'?[...(report.fuel||[]),...(report.maintenanceCosts||[]),...(report.paidExpenses||[])]:report[kind]||[];
 const ask=(offset)=>{const range=month(offset);return tools.financePeriod({from:range.from,to:range.to,requestedCompanyId:data.companyId});};
 try{
  if(compare){
   const [lastMonth,prior]=await Promise.all([ask(-1),ask(-2)]);
   const a=valued(rowsOf(lastMonth)),b=valued(rowsOf(prior));
   const delta=sum(a)-sum(b),pct=sum(b)?(delta/sum(b)*100).toFixed(1).replace('.',',')+'%':'percentual indisponível (base zero)';
   return respond(question,'Comparação de '+caption+': '+month(-2).name+' teve '+money(sum(b))+' e '+month(-1).name+' teve '+money(sum(a))+'. Diferença '+(delta>=0?'+':'')+money(delta)+'; '+pct+'. Os valores consideram apenas lançamentos com custos informados nos filtros atuais.','finance:'+kind,{topic:'financial',period:month(-1).name});
  }
  const offset=previous?-1:0, period=month(offset);
  const rows=valued(rowsOf(await ask(offset)));
  const missing=rows.length===0?' Não há lançamentos com valor informado nesse período.':'';
  if(/diesel/.test(q)){
   if(kind!=='fuel')return null;
   if(rows.some(r=>!r.fuelType))return respond(question,'Não consigo calcular somente diesel: o tipo de combustível não está informado em todos os abastecimentos desse período.','finance:fuel',{topic:'fuel'});
   const diesel=rows.filter(r=>norm(r.fuelType).includes('diesel'));
   return respond(question,'Total de diesel em '+period.name+': '+money(sum(diesel))+' nos '+diesel.length+' lançamentos identificados.','finance:fuel',{topic:'fuel',period:period.name});
  }
  if(/qual.*mais|maior gasto|ranking|cinco maiores|top ?5/.test(q)){
   const sorted=grouped(rows),top=sorted.slice(0,/cinco|top ?5/.test(q)?5:1);
   return respond(question,top.length?'Ranking de '+caption+' em '+period.name+': '+top.map((r,i)=>(i+1)+'º '+plate(data,r.vehicleId)+' '+money(r.amount)).join('; ')+'.':'Não existem lançamentos com valores para esse ranking em '+period.name+'.','finance:'+kind,{topic:kind==='fuel'?'fuel':'financial',period:period.name});
  }
  return respond(question,'Gastos registrados com '+caption+' em '+period.name+': '+money(sum(rows))+' em '+rows.length+' lançamentos com valor informado.'+missing,'finance:'+kind,{topic:kind==='fuel'?'fuel':'financial',period:period.name});
 }catch(error){
  return respond(question,'Não consegui consultar o período no Supabase. '+String(error?.message||'Verifique sua conexão.').slice(0,130),'finance:error',{topic:'financial'});
 }
}
async function handle(question,{course}={}){
 const found=getTools();if(!found)return null;
 const {tools,data}=found,q=norm(question);
 if(!q)return null;
 if(/(drop table|sql livre|api key|chave secreta|senha do admin|excluir todos|burlar permissao)/.test(q))
  return respond(question,'Não executo comandos livres, acesso a senhas ou operações não autorizadas.','blocked');
 const currentPlate=data.vehicles.find(v=>v.plate&&q.includes(norm(v.plate)));
 if(currentPlate)state.vehicleId=currentPlate.id;
 const vehicle=data.vehicles.find(v=>v.id===state.vehicleId);
 const follow=/^(e depois|onde fica|onde encontro|me mostra|mostra ai|me explica melhor|como faco isso|e como faco para mudar isso|e como faco|e se eu colocar em manutencao|e o mes passado|e no mes passado|por que|porque|qual o proximo passo)\??$/.test(q);
 if(follow){
  if(/mes passado/.test(q)&&state.intent.startsWith('finance:'))return financial(q,tools,data,true);
  if(/colocar em manutencao/.test(q)&&(['operational','change-status'].includes(state.topic)||state.lessonId==='vehicle-edit'))
   return respond(question,'Ao marcar Em manutenção, o veículo deixa de ser contado entre os Operacionais. O status muda no cadastro e fica registrado no histórico. A revisão vencida é um alerta separado.','status-impact',{topic:'operational',lessonId:'vehicle-edit'});
  if(/como faco para mudar|como faco isso/.test(q)&&['operational','change-status'].includes(state.topic)){
   return respond(question,'Abra Ativos / Veículos, localize a placa, clique em Editar e altere Situação operacional para Ativo, Em manutenção ou Inativo. Salve. Só um proprietário ou gestor pode fazer isso.','course',{topic:'change-status',lessonId:'vehicle-edit'});
  }
  if(/me mostra|onde fica|onde encontro/.test(q)){
   if(state.topic==='operational'||state.lessonId==='vehicle-edit'){
    const action=tools.navigate({view:'assets'});if(action.ok)highlight('assets');
    return respond(question,action.message+' Localize a placa, clique em Editar e procure Situação operacional.','navigation',{topic:'assets',lessonId:'vehicle-edit'});
   }
   const view=state.topic&&['assets','maintenance','fuel','drivers','financial','history','alerts'].includes(state.topic)?state.topic:course?.getById(state.lessonId)?.view;
   if(view){const action=tools.navigate({view});if(action.ok)highlight(view);return respond(question,action.message,'navigation',{topic:view,lessonId:state.lessonId});}
  }
  if(state.lessonId&&course?.getById(state.lessonId)){
   const lesson=course.getById(state.lessonId);
   return respond(question,course.answer(lesson,'steps'),'course',{lessonId:lesson.id,topic:lesson.view||state.topic});
  }
  if(state.topic==='operational')return respond(question,'Para mudar a situação operacional, abra Ativos / Veículos, clique em Editar, escolha Ativo, Em manutenção ou Inativo e salve. É necessário perfil autorizado.','course',{topic:'operational',lessonId:'vehicle-edit'});
  return respond(question,'A que assunto você se refere? Diga o módulo ou a placa do veículo.','clarify');
 }
 if(/(qual erro|por que nao salvou|nao consigo salvar|erro no formulario|falha ao salvar)/.test(q)){
  if(data.validationNotice)return respond(question,'A tela está informando: '+data.validationNotice+'. Confira os campos obrigatórios e não tente gravar novamente sem revisar o aviso.','validation',{topic:data.view});
  return respond(question,'Não há mensagem de validação visível no momento. Abra o formulário e informe exatamente o erro exibido, sem compartilhar senhas ou documentos sensíveis.','validation',{topic:data.view});
 }
 if(/^(qual tela|onde estou|qual pagina|o que estou vendo)/.test(q))
  return respond(question,'Você está no módulo '+data.view+' da empresa '+data.companyName+'. '+(data.contractName||'Todos os contratos')+'. '+(data.filters||'Sem filtros adicionais descritos')+'.','screen',{topic:data.view});
 const nav=/^(abra|abrir|abre|me leva|ir para|mostre onde|me mostra onde|quero abrir|quero cadastrar|quero registrar|inicie o cadastro)/.test(q);
 if(nav){
  const kind=/(cadastr|registr|formulario|programar)/.test(q)?formFor(q):null;
  if(kind){
   const action=tools.openForm({kind});if(action.ok)highlight(moduleFor(q));
   return respond(question,action.message,'navigation',{topic:moduleFor(q)});
  }
  const view=moduleFor(q);
  if(view){const action=tools.navigate({view});if(action.ok)highlight(view);return respond(question,action.message,'navigation',{topic:view});}
 }
 const cat=/filt(?:re|rar) (?:so |apenas )?(caminhoes|caminhao|vans|van|motos|moto|leves|leve|utilitarios|utilitario|maquinas|maquina|onibus)/.exec(q);
 if(cat){
  const names={caminhoes:'Caminhão',caminhao:'Caminhão',vans:'Van',van:'Van',motos:'Moto',moto:'Moto',leves:'Leve',leve:'Leve',utilitarios:'Utilitário',utilitario:'Utilitário',maquinas:'Máquina',maquina:'Máquina',onibus:'Ônibus'};
  const action=tools.navigate({view:'assets',filter:'category',value:names[cat[1]]});
  return respond(question,action.message,'navigation',{topic:'assets'});
 }
 if(/^(filtre|filtrar|mostre) (?:so |apenas )?(inativos|ativos|veiculos em manutencao)/.test(q)){
  const value=q.includes('inativ')?'Inativo':q.includes('manutencao')?'Manutenção':'Ativo';
  const action=tools.navigate({view:'assets',filter:'status',value});
  return respond(question,action.message,'navigation',{topic:'assets'});
 }
 if(/(o que e|o que significa|qual a diferenca|significa|como funciona)/.test(q)&&/operacion|status de veiculo/.test(q)){
  const topic=course?.getById('operational');
  return respond(question,topic?.intro||'Operacional é o veículo com status Ativo; Inativo ou Em manutenção não são operacionais.','course',{topic:'operational',lessonId:'operational'});
 }
 if(vehicle&&/(qual (e|a) (situacao|status)|esse carro.*(operacion|inativo|manutencao)|esse veiculo.*(operacion|status))/.test(q))
  return respond(question,'A situação cadastrada do veículo '+vehicle.plate+' é '+(vehicle.status||'não informada')+'. Uma revisão vencida é um alerta separado.','fleet',{topic:'assets',vehicleId:vehicle.id});
 if(/quantos? (caminhoes|caminhao|vans|van|motos|moto|inativos|ativos)/.test(q)){
  const selected=q.includes('caminhao')?data.vehicles.filter(v=>norm(v.category)==='caminhao'):
    q.includes('van')?data.vehicles.filter(v=>norm(v.category)==='van'):
    q.includes('moto')?data.vehicles.filter(v=>norm(v.category)==='moto'):
    q.includes('inativ')?data.vehicles.filter(v=>v.status==='Inativo'):data.vehicles.filter(v=>v.status==='Ativo');
  return respond(question,'São '+count(selected.length)+' veículo(s) nessa categoria/situação, entre os veículos dos filtros atuais.','fleet',{topic:'assets'});
 }
 if(/quantos? (veiculos|carros)|qual a quantidade de veiculos|tamanho da frota/.test(q))
  return respond(question,'Há '+count(data.vehicles.length)+' veículos na '+scope(data)+'. '+count(data.vehicles.filter(v=>v.status==='Ativo').length)+' estão ativos (operacionais).','fleet',{topic:'assets'});
 if(/quais? (veiculos |carros )?(estao )?(inativos|em manutencao|ativos)|liste (os )?(inativos|ativos)/.test(q)){
  const status=q.includes('inativ')?'Inativo':q.includes('manutencao')?'Manutenção':'Ativo',items=data.vehicles.filter(v=>v.status===status);
  return respond(question,count(items.length)+' veículos '+status+'. '+describe(items,data),'fleet',{topic:'assets'});
 }
 if(/maior km|maior quilometragem|mais quilometros|qual veiculo tem mais km/.test(q)){
  const sorted=[...data.vehicles].filter(v=>Number.isFinite(v.odometer)).sort((a,b)=>b.odometer-a.odometer);
  return respond(question,sorted.length?'O veículo '+sorted[0].plate+' tem o maior hodômetro informado: '+count(sorted[0].odometer)+' km.':'Não existem leituras de KM nos veículos selecionados.','mileage',{topic:'assets',vehicleId:sorted[0]?.id||null});
 }
 if(/ultimo km|ultima quilometragem|historico do km|quem (alterou|registrou) (a |o )?(quilometragem|km)|leitura inconsistente/.test(q)){
  if(!vehicle)return respond(question,'De qual placa? Preciso identificar o veículo antes de consultar seu KM.','clarify',{topic:'assets'});
  if(/quem|historico|inconsisten/.test(q)){
   try{
    const readings=await tools.mileageHistory({vehicleId:vehicle.id});
    if(!readings.length)return respond(question,'Não há leituras de KM registradas para '+vehicle.plate+'. O hodômetro atual é '+count(vehicle.odometer)+' km.','mileage',{topic:'assets',vehicleId:vehicle.id});
    const chosen=readings.find(r=>r.status==='accepted')||readings[0];
    if(/inconsisten/.test(q)){
     const pending=readings.filter(r=>r.status==='pending');
     const lower=readings.filter(r=>r.meter!=null&&r.appliedMeter!=null&&Number(r.meter)!==Number(r.appliedMeter));
     return respond(question,'Para '+vehicle.plate+' encontrei '+pending.length+' leitura(s) pendente(s) e '+lower.length+' leitura(s) com KM aplicado diferente do informado, nas últimas '+readings.length+' leituras disponíveis. Revise no Histórico KM.','mileage',{topic:'assets',vehicleId:vehicle.id});
    }
    return respond(question,'Leitura de '+vehicle.plate+': '+(chosen.appliedMeter??chosen.meter??'não informada')+' km; situação '+(chosen.status||'não informada')+'; origem '+(chosen.source||'não informada')+'; data '+(chosen.submittedAt||'não informada')+'. Quem enviou: '+(chosen.submitter||'não registrado')+'. Quem conferiu: '+(chosen.reviewer||'não registrado')+'. A trilha completa está em Histórico KM.','mileage',{topic:'assets',vehicleId:vehicle.id});
   }catch(error){
    return respond(question,'O histórico do KM de '+vehicle.plate+' não pôde ser consultado com sua permissão atual: '+String(error?.message||'erro de consulta').slice(0,100)+'. Abra KM e Troca de Óleo > Histórico KM.','mileage',{topic:'assets',vehicleId:vehicle.id});
   }
  }
  return respond(question,'O hodômetro atual de '+vehicle.plate+' é '+count(vehicle.odometer)+' km. Para confirmar data e autoria, abra Histórico KM.','mileage',{topic:'assets',vehicleId:vehicle.id});
 }
 if(/empresa.*mais gast|comparar empresas/.test(q))
  return respond(question,'Só consulto a empresa ativa e autorizada. Para comparar empresas diferentes, consulte cada uma pela conta e empresa correspondente.','scope');
 if(/despesas? .*em aberto|despesas? vencidas/.test(q)){
  const records=data.expenses.filter(x=>!x.paidOn);
  return respond(question,records.length?'Há '+records.length+' despesas em aberto: '+records.slice(0,8).map(x=>plate(data,x.vehicleId)+' · '+x.description+(x.amount!=null?' · '+money(x.amount):'')).join('; ')+'.':'Não foram encontradas despesas em aberto nos filtros selecionados.','expenses',{topic:'maintenance'});
 }
 if(/(quais|qual).*?(manutencoes|revisoes|servicos).*?(vencid|pendente|proxim)|veiculos.*proxim.*revisao/.test(q)){
  const mode=q.includes('penden')?'open':q.includes('proxim')?'soon':'overdue';
  const records=data.maintenance.filter(m=>mode==='open'?m.status!=='done':m.alert===mode);
  return respond(question,records.length?'Há '+records.length+' serviços. '+records.slice(0,8).map(m=>plate(data,m.vehicleId)+' · '+m.title+(m.dueDate?' · vence '+m.dueDate:'')).join('; ')+'.':'Nenhum serviço dessa situação foi encontrado nos filtros atuais.','maintenance',{topic:'maintenance'});
 }
 if(/qual contrato.*(maior|mais).*(despesa|custo|gast)/.test(q)){
  if(data.contractId)return respond(question,'O painel está filtrado por um único contrato. Selecione Todos os contratos para fazer a comparação dentro da empresa ativa.','scope',{topic:'financial'});
  const groups=new Map();
  for(const row of valued([...data.fuel,...data.maintenanceCosts,...data.paidExpenses])){
   const contractId=data.vehicles.find(v=>v.id===row.vehicleId)?.contractId;
   if(contractId)groups.set(contractId,(groups.get(contractId)||0)+Number(row.amount));
  }
  const ordered=[...groups].sort((a,b)=>b[1]-a[1]);
  if(!ordered.length)return respond(question,'Não há vínculo de contrato e lançamentos realizados suficientes para essa classificação nos dados carregados.','finance:contract',{topic:'financial'});
  const best=ordered[0],name=data.contracts?.find(c=>c.id===best[0])?.name||'Contrato sem nome';
  return respond(question,'O maior gasto entre os contratos com registros carregados é de '+name+': '+money(best[1])+'. Soma combustível, manutenção realizada e outras despesas pagas; exclui despesas em aberto.','finance:contract',{topic:'financial'});
 }
 if(/qual veiculo.*(mais caro|maior gasto|mais despesa)/.test(q)&&/manutencao|despesa/.test(q)){
  const ranks=grouped([...data.maintenanceCosts,...data.paidExpenses]);
  return respond(question,ranks.length?plate(data,ranks[0].vehicleId)+' teve o maior gasto realizado de manutenção e outras despesas pagas no período consultado: '+money(ranks[0].amount)+'.':'Não há gastos realizados suficientes para classificar os veículos.','finance:maintenanceCosts',{topic:'financial'});
 }
 if(/gastei|quanto.*(cust|despesa|combustivel|diesel|manutencao)|maior.*gasto|gastou mais|veiculo.*mais.*combustivel|ranking.*combustivel|compar.*(mes|gasto)|ultimos meses|mes passado|cinco maiores gastos|top ?5/.test(q))
  return financial(question,tools,data,false);
 if(/como |onde |ensina|tutorial|passo a passo|criar |cadastrar |registrar |gerar |alterar |concluir |configurar |exportar |recuperar |vincular |explica/.test(q)&&course){
  const lesson=course.find(question);
  if(lesson){
   return respond(question,course.answer(lesson,/(o que e|significa|qual a diferenca)/.test(q)?'meaning':'steps'),'course',{lessonId:lesson.id,topic:lesson.view||'course'});
  }
 }
 return null;
}
root.XrmoviAssistantBrain=Object.freeze({handle,reset,getState:()=>({...state,recent:state.recent.slice()})});
})(window);
