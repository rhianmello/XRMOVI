import{createClient}from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { setupSubscriptionPanel } from './subscription-panel.js?v=20261105-syntax-fix-2';
import { renewalNotice } from './renewal-reminder.js?v=20261103-reminders-2';
import { showXrmoviOnboarding } from './onboarding.js?v=20261110-resume-account-1';
import { createCompanyBranding } from './company-branding.js?v=20261110-company-name-1';
import { setupMileage } from './mileage.js?v=20261106-mileage-page-1';
import { setupVehicleExport } from './vehicle-export.js?v=20261106-vehicle-xlsx-1';
import { createDocumentCenter } from './document-center.js?v=20261106-fine-attachments-1';
import { printFuelEvidenceReport } from './finance-receipts-report.js?v=20261105-liter-audit-2';
import { analyzeFuelQuality, litersMissing } from './fuel-quality.js?v=20261105-liter-audit-1';
import { setupTrafficFines } from './fines-module.js?v=20261106-fines-1';
let branding;
let mileage=null;
let subscriptionPanel=null;
let trafficFines=null;
let paymentRequired=false;
let drivers=[],vehicleExpenses=[],paidExpenses=[],historyExpenses=[];
let driversState='',expensesState='',maintenanceMode='services';
const expenseCategories={ipva:'IPVA',multa:'Multa',seguro:'Seguro',licenciamento:'Licenciamento',pedagio:'Pedágio',outros:'Outros serviços / despesas'};
let financialDetailsOpen=false,financialDetailsKind='all';
let lastWriteFocus=null;
let filteredVehicleIds=null;
let documentRows=[],historyFuelRows=[];
let xrmDocumentCatalog=[],xrmDocumentCatalogRequest=0;
let documentCenter=null;
let documentRequest=0;
let loadRequest=0;
let financialState='';
let fuelConsumptionEntries=[],consumptionRequest=0,consumptionState='loading';
let xrmReportRange=null;
let financeRequest=0;
const el=id=>document.getElementById(id),all=q=>[...document.querySelectorAll(q)];
let sb,company,companies=[],vehicles=[],maintenance=[],contracts=[],fuelRows=[],fuelEntries=[],maintenanceExpenses=[];
const login=document.createElement('section');login.style.cssText='position:fixed;inset:0;background:#07111ff5;z-index:999;display:grid;place-items:center';
login.innerHTML='<form id="v3login" style="display:grid;gap:12px;width:min(440px,92vw);padding:25px;background:#122a41;border:1px solid #31536d;border-radius:16px;color:white"></form>';document.body.append(login);const authStyle=document.createElement('style');authStyle.textContent='.v3-login[hidden]{display:none!important}';document.head.append(authStyle);login.classList.add('v3-login');login.hidden=true;
const rpc=async(name,args)=>{const{data,error}=await sb.rpc('xrmovi_'+name,args);if(error)throw error;return data};
function put(id,t){if(el(id))el(id).textContent=String(t)}
const viewLabels={dashboard:'Visão Geral',assets:'Ativos / Veículos',mileage:'KM e Troca de Óleo',maintenance:'Manutenção / Despesas',drivers:'Motoristas',documents:'Central de Documentos',alerts:'Alertas',history:'Histórico',fuel:'Abastecimentos',fines:'Multas e Infrações',financial:'Relatórios financeiros',subscription:'Minha assinatura'};
// Voice assistant only reads summaries already authorized and rendered for the current company.
// No user records, credentials or data are transmitted to an external AI endpoint.
function xrmAssistClear(){window.dispatchEvent(new Event('xrmovi:assistant-clear'))}
function xrmAssistRefresh(){
 if(!company||paymentRequired){xrmAssistClear();return}
 const kpis=[...document.querySelectorAll('#fleet-kpis .fleet-kpi')].map(node=>({
  label:node.querySelector('.fleet-kpi-label')?.textContent?.trim()||'',
  value:node.querySelector('.fleet-kpi-value')?.textContent?.trim()||'—'
 })).filter(item=>item.label);
 window.dispatchEvent(new CustomEvent('xrmovi:assistant-context',{detail:{
  companyId:company.id,companyName:company.name,role:company.role,view:currentView(),kpis,
  filters:(el('active-filter-summary')?.textContent||'').trim().slice(0,340),
  fuelCost:(el('fleet-insight-fuel-cost')?.textContent||'—').trim(),
  maintCost:(el('fleet-insight-maint-cost')?.textContent||'—').trim(),
  costPeriod:(el('fleet-insight-period')?.textContent||'').trim().slice(0,140),
  financialReady:!financialState,
  healthy:!String(el('connection-status')?.textContent||'').includes('parcial'),
  statusCounts:(()=>{const scope=vehicles.filter(v=>!filteredVehicleIds||filteredVehicleIds.has(v.id));return{
   operational:scope.filter(v=>v.status==='Ativo').length,
   maintenance:scope.filter(v=>v.status==='Manutenção').length,
   inactive:scope.filter(v=>v.status==='Inativo').length
  }})()
 }}));
}

function page(name,push=true){if(!viewLabels[name])name='dashboard';if(paymentRequired&&name!=='subscription')name='subscription';all('.fleet-view').forEach(x=>x.classList.toggle('hidden',x.id!=='view-'+name));all('.fleet-main-nav [data-view]').forEach(x=>{const active=x.dataset.view===name;x.classList.toggle('active',active);if(active)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});const onlyDashboard=name==='dashboard';
const headerFilters=document.querySelector('.fleet-commandbar');
if(headerFilters){headerFilters.classList.toggle('hidden',!onlyDashboard);headerFilters.style.display=onlyDashboard?'':'none';}
const filterWrapper=document.querySelector('.xrm-hero-filters');
if(filterWrapper){filterWrapper.hidden=!onlyDashboard;filterWrapper.style.display=onlyDashboard?'':'none';}
const filterSummary=el('active-filter-summary');
if(filterSummary){filterSummary.hidden=!onlyDashboard;filterSummary.style.display=onlyDashboard?'':'none';}document.querySelector('.xrm-header-contract')?.classList.toggle('hidden',name==='drivers');put('fleet-view-label',viewLabels[name]);document.title='XRMOVI | '+viewLabels[name];document.querySelector('.fleet-hero')?.classList.toggle('hidden',name!=='dashboard');if(el('fleet-mobile-view'))el('fleet-mobile-view').value=name;const month=el('fuel-ranking-month')?.closest('label');if(month)(name==='financial'?el('financial-period-slot'):document.querySelector('.fleet-ranking-filters'))?.append(month);if(push&&location.hash!=='#'+name)history.pushState(null,'','#'+name);window.scrollTo({top:0,behavior:'instant'});el('view-'+name)?.querySelector('h2')?.focus({preventScroll:true});renderFilterSummary();window.dispatchEvent(new CustomEvent('xrmovi:assistant-view',{detail:{view:name}}))}
all('[data-view]').forEach(x=>x.onclick=()=>page(x.dataset.view));window.addEventListener('popstate',()=>page(location.hash.slice(1),false));if(el('fleet-mobile-view'))el('fleet-mobile-view').onchange=e=>page(e.target.value);
async function load(){if(paymentRequired){page('subscription');return;}void branding?.render();if(!company)return;const id=company.id,request=++loadRequest;documentRows=[];xrmDocumentCatalog=[];filteredVehicleIds=null;++financeRequest;const results=await Promise.allSettled([rpc('my_vehicles',{cid:id}),rpc('maintenance_list',{cid:id}),rpc('financial_intelligence',{cid:id,days_back:30}),rpc('contracts_list',{cid:id}),rpc('team_list',{cid:id}),rpc('cost_report',{cid:id,from_date:new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10),to_date:new Date().toISOString().slice(0,10),vid:null}),rpc('drivers_list',{cid:id}),rpc('expenses_list',{cid:id})]);if(company?.id!==id||request!==loadRequest)return;drivers=results[6].status==='fulfilled'?results[6].value||[]:[];driversState=results[6].status==='fulfilled'?'':'error';vehicleExpenses=results[7].status==='fulfilled'?results[7].value||[]:[];expensesState=results[7].status==='fulfilled'?'':'error';vehicles=results[0].status==='fulfilled'?results[0].value||[]:[];maintenance=results[1].status==='fulfilled'?results[1].value||[]:[];void loadFleetDocuments(id);const finance=results[2].status==='fulfilled'?results[2].value?.vehicles||[]:[];contracts=results[3].status==='fulfilled'?results[3].value||[]:[];fuelRows=finance;fuelEntries=results[5].status==='fulfilled'?results[5].value?.fuel||[]:[];historyFuelRows=fuelEntries;historyExpenses=results[5].status==='fulfilled'?results[5].value?.expenses||[]:[];paidExpenses=results[5].status==='fulfilled'?results[5].value?.expenses||[]:[];financialState=results[5].status==='fulfilled'?'':'error';maintenanceExpenses=results[5].status==='fulfilled'?results[5].value?.maintenance||[]:[];const overdue=maintenance.filter(x=>alertKind(x)==='overdue').length;const upcoming=maintenance.filter(x=>alertKind(x)==='soon').length;const queryErrors=results.filter(x=>x.status==='rejected').map(x=>x.reason?.message||'Consulta indisponível');if(queryErrors.length)msg('Algumas consultas falharam: '+queryErrors.join(' / '));put('connection-status',queryErrors.length?'Conexão parcial':'Banco XRMOVI conectado');put('nav-alert-count',overdue+upcoming);put('tab-alert-count',overdue+upcoming);put('alerts-total',overdue+upcoming);put('table-count',vehicles.length);put('last-update',new Date().toLocaleString('pt-BR'));put('table-page-info',vehicles.length+' ativos');const items=[['Frota Total',vehicles.length,'cyan'],['Operacionais',vehicles.filter(v=>v.status==='Ativo').length,'green'],['Em alerta',overdue+upcoming,'yellow'],['Itens vencidos',overdue,'red'],['Revisões pendentes',maintenance.filter(m=>m.status==='open').length,'purple']];el('fleet-kpis')?.replaceChildren(...items.map(([name,n,tone])=>{const b=document.createElement('button');b.className='fleet-kpi';b.dataset.tone=tone;b.onclick=()=>{if(name==='Frota Total')page('assets');else if(name==='Operacionais'){el('xrm-filter-status').value='Ativo';applyVehicleFilters();page('assets')}else if(name==='Em alerta'||name==='Itens vencidos')page('alerts');else{setMaintenanceMode('services');el('maintenance-search').value='';el('maintenance-status').value='open';renderMaintenanceWorkspace();page('maintenance')}};b.innerHTML='<div class="fleet-kpi-label"></div><strong class="fleet-kpi-value"></strong><div class="fleet-kpi-sub">Dados do XRMOVI</div>';b.querySelector('.fleet-kpi-label').textContent=name;b.querySelector('strong').textContent=n;return b}));const kpiGrid=el('fleet-kpis');if(kpiGrid){const count=kpiGrid.children.length;const width=kpiGrid.getBoundingClientRect().width||window.innerWidth;const maxCols=width>=1800?7:width>=1450?6:5;kpiGrid.style.setProperty('--xrmovi-kpi-count',String(count));kpiGrid.style.setProperty('--xrmovi-kpi-cols',String(Math.max(1,Math.min(count,maxCols))))}const rows=el('fleet-table-body');if(rows){rows.replaceChildren();for(const v of vehicles){const tr=document.createElement('tr');for(const a of [v.plate,v.category||'Veículo',v.unit_name||'—',v.status||'—','—','—','—',v.odometer_value||0,'']){const td=document.createElement('td');td.textContent=a;tr.append(td)}rows.append(tr)}}const rank=el('fleet-fuel-ranking');if(rank){rank.replaceChildren();for(const v of finance.slice().sort((a,b)=>Number(b.fuel_cost||0)-Number(a.fuel_cost||0)).slice(0,10)){const row=document.createElement('div');row.className='fleet-fuel-bar';row.textContent=v.plate+' — '+Number(v.fuel_cost||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});rank.append(row)}}renderExtras();renderOverviewCharts();renderFuelMonth();renderWriteUI();syncContractFilter();applyVehicleFilters();void trafficFines?.refresh();void mileage?.refresh(id);void refreshConsumptionHistory();if(el('fuel-ranking-month')?.value!==new Date().toISOString().slice(0,7))void updateFuelMonth();window.lucide?.createIcons?.()}
function showLoadFailure(error){
 login.hidden=false;
 const box=login.querySelector('#v3login');
 box.replaceChildren();
 const heading=document.createElement('h2');
 heading.textContent='Não foi possível carregar o painel';
 const intro=document.createElement('p');
 intro.textContent='Sua sessão já foi verificada. Não é necessário fazer login novamente.';
 const message=document.createElement('p');message.id='v3message';message.style.cssText='color:#ffd1a0;font-size:13px;line-height:1.5;overflow-wrap:anywhere';
 message.textContent=error?.message||'Falha ao carregar os dados da empresa.';
 const retry=document.createElement('button');retry.type='button';retry.textContent='Tentar novamente';retry.style.cssText='padding:12px;background:#30d3b6;border:0;border-radius:8px;font-weight:700;cursor:pointer';
 retry.onclick=()=>{login.hidden=true;if(!sb)window.location.reload();else void init()};
 const back=document.createElement('a');back.href='../';back.textContent='Voltar à página inicial';back.style.cssText='color:#7de9d3;text-align:center;padding:8px';
 const support=document.createElement('a');support.href='../cliente/';support.textContent='Minha conta e mensagens com o administrador';support.style.cssText='color:#77eccc;text-align:center;padding:8px;border:1px solid #33726a;border-radius:8px;font-size:12px';
 box.append(heading,intro,message,retry,support,back);
}

function updatePaymentGateUI(){
 let hint=el('xrm-payment-gate-message');
 if(!hint){
  hint=document.createElement('section');hint.id='xrm-payment-gate-message';
  hint.style.cssText='border:1px solid #e8b859;background:linear-gradient(115deg,#3a3020,#202a32);color:#ffe9ba;border-radius:14px;padding:18px 22px;margin:0 0 20px;display:grid;gap:9px';
  const target=el('xrm-subscription-content');
  if(target)target.before(hint);
 }
 hint.hidden=!paymentRequired;
 hint.style.display=paymentRequired?'grid':'none';
 if(paymentRequired){
  hint.replaceChildren();
  const title=document.createElement('strong');title.textContent='Assinatura necessária para liberar sua frota';title.style.cssText='font-size:19px;color:#ffe2a0';
  const details=document.createElement('span');details.textContent='Sua empresa está cadastrada, mas contratos, veículos, motoristas, manutenção, abastecimentos e relatórios só são liberados após a confirmação do pagamento pelo Mercado Pago. Escolha o plano abaixo.';
  hint.append(title,details);
 }
 for(const id of ['xrm-bill-company-form','xrm-bill-contract-form','xrm-bill-member-form']){
  const group=el(id)?.closest('.xrm-group');
  if(group){group.hidden=paymentRequired;group.style.display=paymentRequired?'none':'';}
 }
 document.querySelectorAll('.fleet-main-nav [data-view]').forEach(node=>{
  const blocked=paymentRequired&&node.dataset.view!=='subscription';
  node.setAttribute('aria-disabled',String(blocked));
  node.style.opacity=blocked?'.45':'';
  node.title=blocked?'Libere a assinatura para usar esta função.':'';
 });
 if(el('fleet-mobile-view'))for(const option of el('fleet-mobile-view').options)option.disabled=paymentRequired&&option.value!=='subscription';
}
async function refreshRenewalBanner(){
 const node=el('xrm-renewal-banner');
 if(!node)return;
 node.hidden=true;
 const id=company?.id;
 if(!id||!sb)return;
 try{
  const {data,error}=await sb.rpc('xrmovi_subscription_reminder',{cid:id});
  if(error||company?.id!==id)return;
  const notice=renewalNotice(data);
  if(!notice)return;
  const title=el('xrm-renewal-title'),detail=el('xrm-renewal-detail'),button=el('xrm-renewal-action');
  if(title)title.textContent=notice.title+' · '+notice.date;
  if(detail)detail.textContent=notice.detail;
  if(button){button.hidden=!notice.owner;button.onclick=()=>page('subscription');}
  node.dataset.tone=notice.tone;
  node.hidden=false;
 }catch{node.hidden=true;}
}
async function checkSubscriptionAccess(){
 if(!company)return;
 const state=await rpc('access_status',{cid:company.id});
 paymentRequired=!state?.allowed;
 updatePaymentGateUI();
 void refreshRenewalBanner();
 if(paymentRequired){
  xrmAssistClear();
  ++loadRequest;
  vehicles=[];maintenance=[];contracts=[];fuelRows=[];fuelEntries=[];drivers=[];
  page('subscription');
  void subscriptionPanel?.refresh();
  return;
 }
 await load();
}
async function xrmLogout(){
 if(!sb){window.location.replace(new URL('../?login=1',location.href));return;}
 const {error}=await sb.auth.signOut();
 if(error){msg('Não foi possível encerrar a sessão: '+error.message);return;}
 window.location.replace(new URL('../?login=1',location.href));
}
for(const id of ['xrm-fleet-logout','xrm-fleet-logout-mobile'])el(id)?.addEventListener('click',()=>void xrmLogout());
async function init({skipWizard=false,companyId=null}={}){
 try{
  if(!sb)throw Error('Serviço de autenticação ainda não inicializado.');
  const {data,error:authError}=await sb.auth.getUser();
  if(authError||!data?.user){window.location.replace(new URL('../?login=1',location.href));return}
  companies=await rpc('my_companies');
  if(!companies?.length){showCompanyOnboarding();return}
  company=companies.find(c=>c.id===companyId)||companies.find(c=>c.name.includes('DEMONSTRAÇÃO'))||companies[0];
  if(!skipWizard&&company.role==='owner'){
   const access=await rpc('access_status',{cid:company.id});
   if(access?.billing_required&&access?.status==='pending'){
    showCompanyOnboarding(company);
    return;
   }
  }
  setupCompanySwitcher();login.hidden=true;
  if(!subscriptionPanel){
    subscriptionPanel=setupSubscriptionPanel({
      client:sb,getCompany:()=>company,
      onCompanyCreated:async id=>{
        companies=await rpc('my_companies');
        company=companies.find(c=>c.id===id)||company;
        setupCompanySwitcher();
        await checkSubscriptionAccess();
      },
      onDataChanged:()=>checkSubscriptionAccess()
    });
  }
  await checkSubscriptionAccess();
  void subscriptionPanel?.refresh();
 }catch(err){showLoadFailure(err)}
}
if(el('refresh-button'))el('refresh-button').onclick=load;
if(el('new-asset-button'))el('new-asset-button').onclick=()=>openWrite('vehicle');

function alertKind(m){if(m.status==='done')return'done';const vehicle=vehicles.find(v=>v.id===m.vehicle_id),today=new Date();today.setHours(0,0,0,0);const days=m.due_date?Math.ceil((new Date(m.due_date+'T00:00:00')-today)/86400000):null;const remaining=m.due_meter==null?null:Number(m.due_meter)-Number(vehicle?.odometer_value||0);return(days!==null&&days<0)||(remaining!==null&&remaining<=0)?'overdue':(days!==null&&days<=30)||(remaining!==null&&remaining<=1000)?'soon':'open'}
function setupCompanySwitcher(){
 let box=el('v3-company-switch');
 if(!box){box=document.createElement('div');box.id='v3-company-switch';box.style.cssText='padding:12px;color:#a9c7df;font:11px system-ui';document.querySelector('.fleet-sidebar .main-nav')?.before(box)}
 box.replaceChildren();
 const label=document.createElement('label');label.textContent='EMPRESA ATIVA';label.htmlFor='v3-company';label.style.display='block';
 const desktop=document.createElement('select');desktop.id='v3-company';
 desktop.style.cssText='max-width:100%;width:100%;padding:9px;margin-top:6px;background:#112a42;color:#e8f7ff;border:1px solid #365470;border-radius:8px';
 const mobile=el('v3-company-mobile');mobile?.replaceChildren();
 for(const c of companies){
  for(const target of [desktop,mobile].filter(Boolean)){
   const option=document.createElement('option');option.value=c.id;option.textContent=c.name;target.append(option);
  }
 }
 desktop.value=company.id;
 if(mobile)mobile.value=company.id;
 const switchCompany=async id=>{
  if(!id||company?.id===id)return;
  const selected=companies.find(c=>c.id===id);if(!selected)return;
  xrmAssistClear();closeWrite(true);documentCenter?.close(true);company=selected;vehicles=[];maintenance=[];contracts=[];fuelRows=[];trafficFines?.reset();
  drivers=[];vehicleExpenses=[];paidExpenses=[];historyExpenses=[];
  desktop.value=id;if(mobile)mobile.value=id;
  await checkSubscriptionAccess();void subscriptionPanel?.refresh();
 };
 desktop.onchange=()=>void switchCompany(desktop.value);
 if(mobile)mobile.onchange=()=>void switchCompany(mobile.value);
 box.append(label,desktop);
}
function renderExtras(){const alerts=el('alerts-content');if(alerts){alerts.replaceChildren();const attention=maintenance.filter(x=>['overdue','soon'].includes(alertKind(x)));for(const m of attention){const item=document.createElement('button');item.type='button';item.className='fleet-ptran-entry';item.onclick=()=>openMaintenanceDetails(m.id);item.textContent=(alertKind(m)==='overdue'?'VENCIDA: ':'PRÓXIMA: ')+(m.plate||vehicles.find(v=>v.id===m.vehicle_id)?.plate||'Ativo')+' — '+m.title+' · '+(m.due_date||'Por quilometragem');alerts.append(item)}if(!attention.length)alerts.textContent='Nenhuma manutenção vencida ou próxima.'}
const preview=el('alert-preview');if(preview){preview.replaceChildren();for(const m of maintenance.filter(x=>['overdue','soon'].includes(alertKind(x))).slice(0,6)){const item=document.createElement('button');item.type='button';item.className='fleet-ptran-entry';item.textContent=(m.plate||'Veículo')+' — '+m.title;item.onclick=()=>openMaintenanceDetails(m.id);preview.append(item)}}
el('v3-contract-overview')?.remove();
renderMaintenanceWorkspace();}


function renderFuelMonth(){const select=el('fuel-ranking-category'),month=el('fuel-ranking-month');if(!select||!month)return;if(!month.value)month.value=new Date().toISOString().slice(0,7);const prev=select.value;select.replaceChildren();const any=document.createElement('option');any.value='';any.textContent='Todas as categorias';select.append(any);for(const category of [...new Set(vehicles.map(v=>v.category).filter(Boolean))].sort()){const o=document.createElement('option');o.value=category;o.textContent=category;select.append(o)}select.value=[...select.options].some(o=>o.value===prev)?prev:'';renderFuelBars()}
function renderFuelBars(){const root=el('fleet-fuel-ranking');if(!root)return;root.replaceChildren();if(financialState){root.textContent=financialState==='loading'?'Consultando abastecimentos…':'Não foi possível consultar os abastecimentos do mês selecionado.';renderFuelRecords([]);return}const cat=el('fuel-ranking-category')?.value||'',group=new Map();const entries=fuelEntries.filter(f=>{const v=vehicles.find(v=>v.id===f.vehicle_id);return v&&(!filteredVehicleIds||filteredVehicleIds.has(v.id))&&(!cat||v.category===cat)});for(const record of entries){const v=vehicles.find(v=>v.id===record.vehicle_id),prev=group.get(v.id)||{name:v.plate+' · '+(v.model||v.category||'Veículo'),cost:0};prev.cost+=Number(record.cost??record.total_cost??0);group.set(v.id,prev)}const rows=[...group.values()].sort((a,b)=>b.cost-a.cost);const peak=Math.max(1,...rows.map(r=>r.cost));for(let i=0;i<rows.length;i++){const v=rows[i],row=document.createElement('div');row.className='fleet-fuel-bar';const name=document.createElement('span');name.className='fleet-fuel-name';name.textContent=(i+1)+'º  '+v.name;const track=document.createElement('span');track.className='fleet-fuel-track';const fill=document.createElement('span');fill.style.width=100*v.cost/peak+'%';track.append(fill);const cost=document.createElement('strong');cost.textContent=v.cost.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});row.append(name,track,cost);root.append(row)}if(!rows.length){const p=document.createElement('p');p.className='fleet-history-note';p.textContent='Sem abastecimentos no mês e categoria selecionados.';root.append(p)}renderFuelRecords(entries);renderFuelQuality(entries)}
async function updateFuelMonth(){if(!company)return;const month=el('fuel-ranking-month')?.value;if(!/^\d{4}-\d{2}$/.test(month||''))return;const [year,m]=month.split('-').map(Number),from=month+'-01',to=new Date(year,m,0).toISOString().slice(0,10),id=company.id,request=++financeRequest;try{financialState='loading';fuelEntries=[];maintenanceExpenses=[];paidExpenses=[];applyVehicleFilters();const data=await rpc('cost_report',{cid:id,from_date:from,to_date:to,vid:null});if(company?.id!==id||el('fuel-ranking-month')?.value!==month||request!==financeRequest)return;financialState='';fuelEntries=data?.fuel||[];maintenanceExpenses=data?.maintenance||[];paidExpenses=data?.expenses||[];applyVehicleFilters()}catch(err){if(company?.id!==id||request!==financeRequest)return;financialState='error';fuelEntries=[];maintenanceExpenses=[];paidExpenses=[];applyVehicleFilters();msg('Falha ao consultar abastecimentos: '+err.message)}}
if(el('fuel-ranking-month'))el('fuel-ranking-month').onchange=()=>{void updateFuelMonth();void refreshConsumptionHistory();};
if(el('fuel-ranking-category'))el('fuel-ranking-category').onchange=()=>{renderFuelBars();renderFilterSummary()};

let v3Editing=null;
const v3Overlay=document.createElement('div');v3Overlay.id='v3-edit-overlay';v3Overlay.hidden=true;v3Overlay.innerHTML='<div class="v3-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="v3-edit-title"><div class="v3-edit-heading"><h2 id="v3-edit-title">Registro</h2><button id="v3-edit-close" type="button" aria-label="Fechar">×</button></div><form id="v3-edit-form"></form><p id="v3-edit-feedback" role="status"></p></div>';
document.body.append(v3Overlay);
const v3Style=document.createElement('style');v3Style.textContent='#v3-edit-overlay{position:fixed;inset:0;z-index:1000;background:#07111fe8;display:grid;place-items:center;padding:20px}#v3-edit-overlay[hidden]{display:none!important}.v3-edit-dialog{width:min(610px,96vw);max-height:91vh;overflow:auto;background:#10273c;border:1px solid #40617c;border-radius:16px;padding:23px;color:#edf7ff;font:13px system-ui;box-shadow:0 20px 70px #0008}.v3-edit-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.v3-edit-heading h2{font-size:21px}.v3-edit-heading button{background:#1c4058;color:#fff;border:1px solid #426980;border-radius:8px;font-size:24px;padding:0 10px}.v3-edit-dialog form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.v3-edit-dialog label{display:grid;gap:5px;font-size:11px;color:#afc8da}.v3-edit-dialog input,.v3-edit-dialog select{width:100%;min-width:0;padding:10px;border-radius:8px;background:#091b2e;color:#fff;border:1px solid #43647a}.v3-edit-dialog .wide{grid-column:1/-1}.v3-edit-dialog form button{border:0;border-radius:9px;background:#34cdb5;color:#052128;font-weight:800;padding:12px;grid-column:1/-1}.v3-write-actions{display:flex;flex-wrap:wrap;gap:9px;margin:14px 0}.v3-write-actions button{background:#143951;color:#daf1fc;border:1px solid #36617b;border-radius:8px;padding:10px 13px;font:600 12px system-ui}.v3-write-actions button:disabled{opacity:.45;cursor:not-allowed}@media(max-width:530px){.v3-edit-dialog form{grid-template-columns:1fr}.v3-edit-dialog label{grid-column:1}}';
const fuelStyle=document.createElement('style');
fuelStyle.textContent='.v3-edit-dialog .xrm-fuel-acknowledgement{display:flex;flex-direction:row;align-items:flex-start;gap:11px;padding:13px;border:1px solid #b8754e;border-radius:10px;background:#3c2a24;color:#ffdecb;font-size:12px;line-height:1.5}.v3-edit-dialog .xrm-fuel-acknowledgement[hidden]{display:none!important}.v3-edit-dialog .xrm-fuel-acknowledgement input{flex:none;width:19px;height:19px;margin-top:2px;accent-color:#34cdb5}.v3-edit-dialog .xrm-fuel-data-helper{margin:0;color:#b7d7e6;font-size:11px;line-height:1.5}.xrm-fuel-quality-note{border:1px solid #a57f46;background:rgba(101,70,27,.16);border-radius:10px;padding:12px 14px;margin:10px 0;color:#ffdf9c;font:12px/1.6 system-ui}.xrm-fuel-quality-note[data-ok="true"]{border-color:#357764;background:#12352b;color:#b9f6de}.xrm-liters-missing{display:block;color:#ffd28b;font-weight:700;font-size:11px;margin-top:5px}';
document.head.append(v3Style,fuelStyle);
const v3DriverStyle=document.createElement('style');
v3DriverStyle.textContent=`
.v3-edit-dialog .v3-driver-search{position:relative;align-content:start}
.v3-edit-dialog .v3-driver-search input[role="combobox"]{background:#091b2e}
.v3-edit-dialog .v3-driver-results{border:1px solid #426b82;border-radius:10px;background:#0c293d;max-height:226px;overflow-y:auto;box-shadow:0 12px 28px #0005;margin-top:3px}
.v3-edit-dialog .v3-driver-results[hidden]{display:none!important}
.v3-edit-dialog .v3-driver-option{display:flex;flex-direction:column;align-items:flex-start;gap:3px;width:100%;padding:10px 12px!important;grid-column:auto!important;background:transparent!important;color:#eaf6fd!important;border:0!important;border-radius:0!important;text-align:left;cursor:pointer;font-weight:400!important}
.v3-edit-dialog .v3-driver-option+.v3-driver-option{border-top:1px solid #23485d!important}
.v3-edit-dialog .v3-driver-option:hover,.v3-edit-dialog .v3-driver-option:focus-visible{background:#154d5e!important;outline:2px solid #56dbc0;outline-offset:-2px}
.v3-edit-dialog .v3-driver-option[aria-selected="true"]{background:#15463e!important}
.v3-edit-dialog .v3-driver-option strong{font-size:12px;font-weight:700}
.v3-edit-dialog .v3-driver-option small{font-size:10px;color:#a6c4d0}
.v3-edit-dialog .v3-driver-empty{padding:12px;color:#a6c4d0;font-size:11px}
.v3-edit-dialog .v3-driver-helper{margin:0;font-size:11px;line-height:1.5;color:#a8c5d4}
`;
document.head.append(v3DriverStyle);

const field=(name,label,type='text',value='',required=false)=>{const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.name=name;i.type=type;i.value=value??'';i.required=required;if(type==='number'){i.min='0';i.step='any'}l.append(i);return l};
const pick=(name,label,options,value='')=>{const l=document.createElement('label');l.textContent=label;const s=document.createElement('select');s.name=name;s.required=true;for(const [id,text]of options){const o=document.createElement('option');o.value=id;o.textContent=text;s.append(o)}s.value=value||options[0]?.[0]||'';l.append(s);return l};
function canWrite(){return !!company&&['owner','manager'].includes(company.role)}
function closeWrite(force=false){if(v3Editing?.saving&&!force)return;v3Overlay.hidden=true;v3Editing=null;document.body.classList.remove('fleet-dialog-open');if(lastWriteFocus?.isConnected)lastWriteFocus.focus({preventScroll:true})}
el('v3-edit-close').onclick=()=>closeWrite();
v3Overlay.addEventListener('click',event=>{if(event.target===v3Overlay)closeWrite()});
function openWrite(kind,record=null){if(!canWrite()){window.alert('Somente proprietário ou gestor autorizado pode alterar registros.');return}if(v3Overlay.hidden)lastWriteFocus=document.activeElement;record=record?{...record}:null;v3Overlay.dataset.layout=record&&(kind.startsWith('maintenance-')||['driver','expense'].includes(kind))?'drawer':'modal';v3Overlay.dataset.taskId=record?.id||'';v3Overlay.dataset.expenseId=kind==='expense'?record?.id||'':'';v3Overlay.dataset.driverId=kind==='driver'?record?.id||'':'';v3Editing={kind,record,companyId:company.id};const form=el('v3-edit-form');form.replaceChildren();put('v3-edit-feedback','');put('v3-edit-title',kind==='driver'?(record?'Editar motorista':'Cadastrar motorista'):kind==='expense'?(record?'Editar despesa':'Nova despesa'):kind==='vehicle'?(record?'Editar ativo':'Cadastrar ativo'):kind==='maintenance'?'Programar manutenção':kind==='maintenance-edit'?'Editar programação':kind==='maintenance-cost'?'Registrar custos da manutenção':kind==='maintenance-complete'?'Concluir manutenção':kind==='fuel'&&record?'Editar abastecimento':'Registrar abastecimento');
if(kind==='driver'){buildDriverForm(form,record)}
else if(kind==='expense'){buildExpenseForm(form,record)}
else if(kind==='maintenance-edit'){const vehicle=document.createElement('p');vehicle.className='wide';vehicle.textContent=record.plate||vehicles.find(v=>v.id===record.vehicle_id)?.plate||'Veículo';form.append(vehicle,field('title','Serviço','text',record.title,true),field('due_date','Vencimento por data','date',record.due_date||''),field('due_meter','Vencimento por KM/horímetro','number',record.due_meter??''),field('notes','Observações','text',record.notes||''),field('reason','Motivo da alteração','text','',true));form.elements.title.maxLength=150;form.elements.reason.minLength=3;form.elements.reason.maxLength=500;form.elements.notes.maxLength=1000}
else if(kind==='maintenance-cost'||kind==='maintenance-complete'){const description=document.createElement('p');description.className='wide';description.textContent=(record.plate||vehicles.find(v=>v.id===record.vehicle_id)?.plate||'Veículo')+' · '+record.title;form.append(description,field('estimate','Custo previsto (R$)','number',record.estimated_cost??''),field('actual','Custo realizado (R$)','number',record.actual_cost??'',kind==='maintenance-complete'),field('completed_meter','KM/horímetro na execução','number',record.completed_meter??'',kind==='maintenance-complete'));if(kind==='maintenance-complete'){const note=document.createElement('p');note.className='wide';note.textContent='Confirme os valores e a leitura na execução. O serviço será marcado como concluído.';form.append(note)}}
else if(kind==='vehicle'){form.append(field('plate','Placa / identificação','text',record?.plate||'',true),pick('category','Categoria',['Leve','Utilitário','Caminhão','Van','Trator','Máquina','Ônibus','Moto','Implemento','Equipamento','Outro'].map(value=>[value,value]),record?.category),pick('status','Situação operacional',[['Ativo','Ativo — operacional'],['Manutenção','Em manutenção — não operacional'],['Inativo','Inativo — não operacional']],record?.status||'Ativo'),field('brand','Marca','text',record?.brand||'',true),field('model','Modelo','text',record?.model||'',true),field('manufacture_year','Ano fabricação','number',record?.manufacture_year||''),field('model_year','Ano modelo','number',record?.model_year||''),field('odometer','KM/H','number',record?.odometer_value||0),field('unit','Unidade / local','text',record?.unit_name||''),field('notes','Observações','text',record?.notes||''));buildVehicleDriverSelect(form,record);
 const statusInfo=document.createElement('p');
 statusInfo.className='wide xrm-oil-vehicle-note';
 statusInfo.textContent='Operacional significa status Ativo. Revisão vencida gera alerta, mas não altera automaticamente o status. Apenas proprietários e gestores podem modificar esta situação.';
 form.append(statusInfo);
 if(record?.id){
  const reason=field('status_reason','Motivo da mudança de situação (opcional)','text','');
  reason.classList.add('wide');reason.querySelector('input').maxLength=240;form.append(reason);
  const log=document.createElement('details');log.className='wide xrm-oil-vehicle-note';
  const title=document.createElement('summary');title.textContent='Histórico de mudanças de situação';
  const content=document.createElement('div');content.textContent='Carregando histórico…';
  log.append(title,content);form.append(log);
  void rpc('vehicle_status_history',{cid:company.id,vid:record.id}).then(entries=>{
   if(v3Overlay.hidden||v3Editing?.record?.id!==record.id||v3Editing?.companyId!==company.id)return;
   content.replaceChildren();
   if(!entries?.length){content.textContent='Nenhuma mudança de situação registrada até agora.';return}
   for(const e of entries){const line=document.createElement('p');line.textContent=new Date(e.changed_at).toLocaleString('pt-BR')+' · '+e.old_status+' → '+e.new_status+' · '+(e.reason||'Alteração registrada');content.append(line)}
  }).catch(()=>{content.textContent='Histórico temporariamente indisponível.'});
 }
 const rule=mileage?.planFor(record?.id)||null;
 const enabled=pick('oil_enabled','Controle de óleo por quilometragem',[['no','Não configurar agora'],['yes','Sim — controlar trocas de óleo']],rule?.interval_km?'yes':'no');
 enabled.classList.add('wide');form.append(enabled);
 const details=document.createElement('fieldset');details.className='wide xrm-oil-fields';
 const legend=document.createElement('legend');legend.textContent='Plano de troca de óleo e alerta por KM';details.append(legend);
 const interval=field('oil_interval','Trocar óleo a cada (KM)','number',rule?.interval_km||'');
 const next=field('oil_next_due','Próxima troca aos (KM total)','number',rule?.next_due_km||'');
 const last=field('oil_last_change','KM da última troca (se souber)','number',rule?.last_change_km||'');
 const warn=field('oil_warning','Avisar quantos KM antes?','number',rule?.warn_before_km??2000);
 const weekly=field('weekly_max','Máximo de KM esperado por semana','number',rule?.weekly_max_km??2500);
 const oil=field('oil_type','Óleo utilizado / especificação (opcional)','text',rule?.oil_type||'');
 details.append(interval,next,last,warn,weekly,oil);
 const hint=document.createElement('small');hint.className='wide';hint.textContent='Exemplo: óleo a cada 2.000 km e próxima troca aos 20.000 km; o alerta inicia aos 18.000 km. Use o intervalo recomendado para este veículo e este óleo.';details.append(hint);
 const sync=()=>{const on=enabled.querySelector('select').value==='yes';details.hidden=!on;for(const input of details.querySelectorAll('input'))input.disabled=!on;interval.querySelector('input').required=on;next.querySelector('input').required=on};
 enabled.querySelector('select').onchange=sync;form.append(details);sync();
 const odometerInput=form.elements.odometer;
 if(record?.id&&odometerInput){
  odometerInput.readOnly=true;odometerInput.title='Atualize o KM pela área de Quilometragem e QR Code';
  const notice=document.createElement('p');notice.className='wide xrm-oil-vehicle-note';
  notice.textContent='A quilometragem confirmada não pode ser alterada na edição do cadastro. Use o controle de KM abaixo da lista de ativos para registrar ou corrigir leituras com histórico.';
  form.insertBefore(notice,enabled);
 }
 const warningInput=warn.querySelector('input'),intervalInput=interval.querySelector('input');
 let warningEdited=Boolean(rule?.interval_km);
 warningInput.addEventListener('input',()=>{warningEdited=true});
 intervalInput.addEventListener('input',()=>{
  if(warningEdited)return;
  const value=Number(intervalInput.value);
  if(value>0)warningInput.value=String(Math.min(2000,Math.max(100,Math.round(value*.2))));
 });
}
else{
 const opts=vehicles.map(v=>[v.id,v.plate+' — '+v.model]);
 if(!opts.length){
   put('v3-edit-feedback','Cadastre primeiro um veículo na tela Ativos / Veículos.');
   v3Overlay.hidden=false;return;
 }
 form.append(pick('vehicle','Veículo',opts,record?.vehicle_id));
 if(kind==='maintenance'){
   form.append(field('title','Serviço de manutenção','text','',true),
    field('due_date','Próxima data','date'),field('due_meter','Próxima KM/H','number'),
    field('estimate','Custo previsto (R$)','number'),field('notes','Observações','text'));
 }else{
   form.append(
    field('date','Data','date',String(record?.date||record?.fueled_on||localDay(new Date())).slice(0,10),true),
    field('liters','Quantidade de litros *','number',record?.liters??'',true),
    field('cost','Valor total (R$)','number',record?.cost??'',true),
    field('meter','KM/H no abastecimento','number',record?.meter??''),
    field('station','Posto','text',record?.station||''),
    field('notes','Observações','text',record?.notes||'')
   );
   form.elements.liters.min='0.001';form.elements.liters.step='0.001';
    const choice=document.createElement('label');choice.className='wide';choice.textContent='Como deseja registrar os litros? *';
    const mode=document.createElement('select');mode.name='liters_mode';mode.required=true;
    for(const [value,label] of [['informed','Informar a quantidade de litros'],['declined','Não vou informar — assumo responsabilidade']]){
      const option=document.createElement('option');option.value=value;option.textContent=label;mode.append(option);
    }
    mode.value=record?.liters==null&&record?.liters_declined?'declined':'informed';
    choice.append(mode);
    const acknowledgement=document.createElement('label');acknowledgement.className='wide xrm-fuel-acknowledgement';
    const check=document.createElement('input');check.type='checkbox';check.name='liters_ack';check.value='accepted';
    check.checked=Boolean(record?.liters_declined);
    const acknowledgeText=document.createElement('span');
    acknowledgeText.textContent='Confirmo que optei por NÃO informar os litros e assumo responsabilidade pela ausência desse dado. Minha decisão, usuário e data ficarão registrados e o indicador de consumo será sinalizado como incompleto.';
    acknowledgement.append(check,acknowledgeText);
    const helper=document.createElement('p');helper.className='wide xrm-fuel-data-helper';
    helper.textContent='Os litros são obrigatórios. A opção de não informar exige confirmação expressa e ficará visível no histórico e nos relatórios. É possível corrigir depois.';
    form.elements.liters.closest('label').after(choice,acknowledgement,helper);
    const syncFuelMode=()=>{
      const declined=mode.value==='declined';
      acknowledgement.hidden=!declined;check.required=declined;
      form.elements.liters.required=!declined;form.elements.liters.disabled=declined;
      if(declined)form.elements.liters.value='';
      if(!declined)check.checked=false;
    };
    mode.addEventListener('change',syncFuelMode);syncFuelMode();
   form.elements.cost.min='0';form.elements.cost.step='0.01';
   form.elements.station.maxLength=120;form.elements.notes.maxLength=1000;
   if(kind==='fuel'&&record?.id){
     const reason=field('change_reason','Motivo da alteração dos dados','text','');
     reason.classList.add('wide');reason.querySelector('input').maxLength=500;
     const info=document.createElement('p');info.className='wide xrm-oil-vehicle-note';
     info.textContent='Para corrigir valores, informe o motivo da alteração (mínimo 3 caracteres). Para anexar somente um comprovante, mantenha os dados e selecione o arquivo abaixo.';
     form.append(reason,info);
     const history=document.createElement('details');history.className='wide xrm-oil-vehicle-note';
     const heading=document.createElement('summary');heading.textContent='Histórico de edições do abastecimento';
     const entries=document.createElement('div');entries.textContent='Abra para consultar alterações registradas.';
     let requested=false;
     history.append(heading,entries);form.append(history);
     history.addEventListener('toggle',async()=>{
       if(!history.open||requested)return;requested=true;entries.textContent='Consultando histórico...';
       try{
         const changes=await rpc('fuel_history',{cid:company.id,fid:record.id});
         if(v3Editing?.record?.id!==record.id)return;
         entries.replaceChildren();
         for(const item of changes||[]){
           const p=document.createElement('p');
           const fields=[['vehicle_id','Veículo'],['date','Data'],['liters','Litros'],['liters_declined','Omissão declarada'],
             ['cost','Valor (R$)'],['meter','KM/H'],['station','Posto'],['notes','Observações']];
           const differences=fields.flatMap(([key,label])=>{
             const oldValue=item.before?.[key]??'',newValue=item.after?.[key]??'';
             return String(oldValue)===String(newValue)?[]:
               [label+': '+String(oldValue||'—').slice(0,150)+' → '+String(newValue||'—').slice(0,150)];
           });
           p.textContent=new Date(item.date).toLocaleString('pt-BR')+' · '+item.reason+
             (differences.length?' · '+differences.join(' | '):' · Edição registrada');
           entries.append(p);
         }
         if(!changes?.length)entries.textContent='Nenhuma edição anterior registrada.';
       }catch(error){entries.textContent='Não foi possível consultar o histórico: '+error.message;requested=false;}
     });
   }
 }
}
if(['driver','vehicle','maintenance','maintenance-cost','maintenance-complete','fuel','expense'].includes(kind)){const label=document.createElement('label');label.className='wide';label.textContent=kind==='driver'?'Anexar CNH (PDF ou imagem)':kind==='vehicle'?'Anexar CRLV / documento do veículo':kind==='fuel'?'Anexar comprovante do abastecimento':kind==='expense'?'Anexar nota fiscal / comprovante':kind==='maintenance'?'Anexar documento da manutenção':'Anexar nota fiscal da manutenção';const file=document.createElement('input');file.type='file';file.name='record_attachment';file.accept='.pdf,.jpg,.jpeg,.png,.webp';label.append(file);const hint=document.createElement('small');hint.textContent='Opcional · Máximo 10 MB · PDF, JPG, PNG ou WEBP. O arquivo será vinculado ao cadastro salvo.';label.append(hint);form.append(label)}
const save=document.createElement('button');save.type='submit';save.textContent=kind==='maintenance-complete'?'Confirmar conclusão':'Salvar';form.append(save);v3Overlay.hidden=false;document.body.classList.add('fleet-dialog-open');form.querySelector('input,select')?.focus()}
el('v3-edit-form').onsubmit=async e=>{e.preventDefault();if(!canWrite()||!v3Editing||['maintenance-detail','registry-detail'].includes(v3Editing.kind))return;const draft=v3Editing;if(draft.companyId!==company?.id){put('v3-edit-feedback','A empresa ativa mudou. Feche e abra o formulário novamente.');return}const {kind,record,companyId}=draft,form=new FormData(e.target),str=k=>String(form.get(k)||'').trim(),num=k=>str(k)===''?null:Number(str(k));const button=e.target.querySelector('button[type=submit]');draft.saving=true;button.disabled=true;put('v3-edit-feedback','Salvando...');try{for(const [key,value]of form.entries()){if(['estimate','actual','completed_meter','due_meter','cost','liters','meter','odometer','amount'].includes(key)&&String(value).trim()!==''&&(!Number.isFinite(Number(value))||Number(value)<0))throw Error('Informe valores numéricos válidos e não negativos.')}
if(kind==='driver'){draft.savedRecordId=await rpc('driver_save',{cid:companyId,p_id:record?.id||null,p_name:str('name'),p_phone:str('phone'),p_cnh:str('cnh'),p_category:str('cnh_category'),p_expires:str('cnh_expires')||null,p_active:str('active')==='true',p_notes:str('notes'),expected_revision:record?.revision??null})}
if(kind==='expense'){draft.savedRecordId=await rpc('expense_save',{cid:companyId,p_id:record?.id||null,p_vehicle:str('vehicle'),p_category:str('expense_category'),p_description:str('description'),p_date:str('expense_date'),p_due:str('due_date')||null,p_amount:num('amount'),p_paid:str('payment_status')==='paid'?str('paid_on')||null:null,p_notes:str('notes'),expected_revision:record?.revision??null})}
if(kind==='maintenance-edit'){if(!str('due_date')&&num('due_meter')===null)throw Error('Informe data ou KM/horímetro de vencimento.');await rpc('maintenance_update',{cid:companyId,tid:record.id,expected_revision:record.revision??0,task_title:str('title'),deadline:str('due_date')||null,deadline_meter:num('due_meter'),detail:str('notes'),p_reason:str('reason')})}
if(kind==='maintenance-cost'||kind==='maintenance-complete'){if(kind==='maintenance-complete'&&(num('actual')===null||num('completed_meter')===null))throw Error('Informe custo realizado e KM/horímetro.');await rpc('maintenance_record',{cid:companyId,tid:record.id,expected_revision:record.revision??0,forecast:num('estimate'),spent:num('actual'),final_meter:num('completed_meter'),finish:kind==='maintenance-complete'})}

if(kind==='vehicle'){
 const plate=str('plate').toUpperCase();if(plate.length<3)throw Error('Identificação inválida.');
 if(str('oil_enabled')==='yes'){
  if(!(num('oil_interval')>=100)||num('oil_next_due')===null)throw Error('Informe intervalo de troca (mínimo 100 km) e KM total da próxima revisão.');
  if(num('oil_warning')===null||num('oil_warning')<0||num('weekly_max')<100)throw Error('Confira a margem de aviso e o limite semanal.');
 }
 draft.savedRecordId=await rpc('vehicle_save_with_driver',{cid:companyId,p_id:record?.id||draft.savedRecordId||null,p_plate:plate,p_brand:str('brand'),p_model:str('model'),p_category:str('category'),p_manufacture_year:num('manufacture_year'),p_model_year:num('model_year'),p_odometer:num('odometer')||0,p_unit:str('unit'),p_notes:str('notes'),p_driver:str('driver')||null});
 if(str('status')!==(record?.status||'Ativo')){
  await rpc('vehicle_status_update',{cid:companyId,vid:draft.savedRecordId,p_status:str('status'),
   p_expected_status:record?.status||'Ativo',p_reason:str('status_reason')||'Alteração pelo cadastro'});
 }
 await rpc('mileage_rule_save',{
  cid:companyId,vid:draft.savedRecordId,p_interval:str('oil_enabled')==='yes'?num('oil_interval'):null,
  p_next_due:str('oil_enabled')==='yes'?num('oil_next_due'):null,p_last_change:str('oil_enabled')==='yes'?num('oil_last_change'):null,
  p_oil_type:str('oil_enabled')==='yes'?str('oil_type'):'',p_warning:str('oil_enabled')==='yes'?num('oil_warning'):2000,
  p_weekly_max:str('oil_enabled')==='yes'?num('weekly_max'):2500
 });
}
if(kind==='maintenance'){if(!str('due_date')&&num('due_meter')===null)throw Error('Informe data ou KM/H de vencimento.');const taskId=draft.savedTaskId||await rpc('maintenance_save',{cid:companyId,vid:str('vehicle'),task_title:str('title'),deadline:str('due_date')||null,deadline_meter:num('due_meter'),detail:str('notes')});draft.savedTaskId=taskId;draft.savedRecordId=taskId;if(num('estimate')!==null)await rpc('maintenance_set_cost',{cid:companyId,tid:taskId,forecast:num('estimate'),spent:null,final_meter:null})}
if(kind==='fuel'){
 const omitted=str('liters_mode')==='declined';
  if(omitted){if(str('liters_ack')!=='accepted')throw Error('Confirme expressamente a decisão de não informar os litros.');}
  else if(!(num('liters')>0))throw Error('A quantidade de litros é obrigatória e deve ser maior que zero.');
  if(num('cost')===null)throw Error('Informe um valor de abastecimento válido.');
 if(record?.id){
   const selectedAttachment=form.get('record_attachment');
   const hasFile=selectedAttachment instanceof File&&selectedAttachment.size>0;
   const changed=str('vehicle')!==record.vehicle_id
     ||str('date')!==String(record.date||record.fueled_on).slice(0,10)
     ||num('liters')!==(record.liters==null?null:Number(record.liters))
      ||omitted!==Boolean(record.liters_declined)
     ||num('cost')!==Number(record.cost)
     ||num('meter')!==(record.meter==null?null:Number(record.meter))
     ||str('station')!==String(record.station||'').trim()
     ||str('notes')!==String(record.notes||'').trim();
   if(!changed&&!hasFile)throw Error('Nenhuma alteração identificada. Para anexar um comprovante, selecione um arquivo.');
   if(changed){
     if(str('change_reason').length<3)throw Error('Informe o motivo da alteração (mínimo 3 caracteres).');
     await rpc('fuel_update_v2',{
        p_decline:omitted,       cid:companyId,fid:record.id,p_vehicle:str('vehicle'),p_date:str('date'),
       p_liters:num('liters'),p_cost:num('cost'),p_meter:num('meter'),
       p_station:str('station'),p_notes:str('notes'),
       p_expected_revision:record.revision,p_reason:str('change_reason')
     });
   }
   draft.savedRecordId=record.id;
 }else{
   draft.savedRecordId=await rpc('fuel_save_v2',{
      p_decline:omitted,     cid:companyId,vid:str('vehicle'),f_date:str('date'),
     qty:num('liters'),cost:num('cost'),meter:num('meter'),
     station_name:str('station'),detail:str('notes')
   });
 }
}
let attachmentWarning='';const attached=form.get('record_attachment');
if(attached instanceof File&&attached.size>0){
 const entityKind=kind.startsWith('maintenance')?'maintenance':kind;
 const recordId=draft.savedRecordId||record?.id;
 if(!recordId)attachmentWarning='O cadastro foi salvo, mas não foi possível identificar o registro para anexar o arquivo.';
 else try{await uploadXrmRecordAttachment(companyId,entityKind,recordId,attached)}catch(error){attachmentWarning='O cadastro foi salvo, mas o anexo falhou: '+error.message}
}
closeWrite(true);if(company?.id===companyId){await load();if(attachmentWarning)msg(attachmentWarning);if(currentView()==='maintenance'&&!record&&kind==='expense'){el('expense-month').value=str('expense_date').slice(0,7);el('expense-search').value='';el('expense-category').value='';el('expense-status').value='all';setMaintenanceMode('expenses');renderRegistries()}else if(currentView()==='maintenance'&&!record&&kind==='maintenance'){el('maintenance-search').value='';el('maintenance-status').value='open';setMaintenanceMode('services');renderMaintenanceWorkspace()}document.querySelector('.fleet-view:not(.hidden) h2')?.focus({preventScroll:true});if(!attachmentWarning)msg(kind==='maintenance-complete'?'Manutenção concluída. Custos e KM/horímetro registrados.':'Registro salvo com sucesso.')}}catch(err){put('v3-edit-feedback',(draft.savedTaskId?'O serviço foi criado, mas o custo não foi salvo. Tente novamente: ':'Erro ao salvar: ')+err.message);if(err.code==='40001'){const refresh=document.createElement('button');refresh.type='button';refresh.className='wide';refresh.textContent='Atualizar detalhes';refresh.onclick=async()=>{await load();if(company?.id===companyId)(kind==='driver'||kind==='expense'?openRegistryAfterRefresh(kind,record.id):openMaintenanceDetails(record.id))};e.target.append(refresh)}}finally{draft.saving=false;button.disabled=false}};
function renderWriteUI(){for(const [id,label,kind]of [['assets-actions','+ Novo ativo','vehicle'],['fuel-actions','+ Registrar abastecimento','fuel']]){const root=el(id);if(!root)continue;root.replaceChildren();if(canWrite()){const button=document.createElement('button');button.type='button';button.className='fleet-button primary';button.textContent=label;button.onclick=()=>openWrite(kind);root.append(button)}}if(el('maintenance-new')){el('maintenance-new').hidden=!canWrite();el('maintenance-new').onclick=()=>openWrite('maintenance')}}
function updateMaintenanceCost(task){openWrite('maintenance-cost',task)}
function completeMaintenance(task){openWrite('maintenance-complete',task)}

function showCompanyOnboarding(existing=null){
 void showXrmoviOnboarding({
  login,client:sb,existing,
  onCreated:async data=>{await init({skipWizard:true,companyId:data.company_id});},
  onLogout:async()=>{const {error}=await sb.auth.signOut();if(error){msg(error.message);return;}window.location.replace(new URL('../?login=1',location.href))}
 }).catch(showLoadFailure);
}

function renderOverviewCharts(){
 const expiryCanvas=el('expiry-chart'),expiryEmpty=el('expiry-empty'),statusCanvas=el('situation-chart'),statusEmpty=el('situation-empty'),legend=el('situation-legend'),center=el('situation-center');
 const today=new Date();today.setHours(0,0,0,0);
 const periods=[{label:'Vencidos',count:0,color:'#e66a77'},{label:'Até 7 dias',count:0,color:'#f3b55e'},{label:'8 a 30 dias',count:0,color:'#f0d87d'},{label:'31 a 90 dias',count:0,color:'#5fbfd8'}];
 const upcoming=[];
 for(const task of maintenance){if(task.status==='done')continue;const due=task.due_date?new Date(task.due_date+'T00:00:00'):null;if(!due||Number.isNaN(+due))continue;const days=Math.round((due-today)/86400000);if(days>90)continue;const index=days<0?0:days<=7?1:days<=30?2:3;periods[index].count++;upcoming.push({task,days})}
 if(expiryCanvas){expiryCanvas.style.display='none';let graph=el('v3-expiry-bars');if(!graph){graph=document.createElement('div');graph.id='v3-expiry-bars';graph.style.cssText='display:grid;gap:14px;padding:20px 16px 12px;width:100%;align-content:center;min-height:200px';expiryCanvas.parentElement.append(graph)}graph.replaceChildren();const max=Math.max(1,...periods.map(p=>p.count));for(const item of periods){const row=document.createElement('div');row.style.cssText='display:grid;grid-template-columns:95px 1fr 26px;align-items:center;gap:10px;font:12px system-ui;color:#bdd3e4';const label=document.createElement('span');label.textContent=item.label;const track=document.createElement('div');track.style.cssText='height:15px;background:#173147;border-radius:5px;overflow:hidden';const fill=document.createElement('div');fill.style.cssText='height:100%;border-radius:5px;background:'+item.color+';width:'+(item.count/max*100)+'%';track.append(fill);const value=document.createElement('strong');value.textContent=item.count;row.append(label,track,value);graph.append(row)}if(expiryEmpty)expiryEmpty.style.display='none';const summary=el('filter-result');if(summary)summary.textContent=upcoming.length+' manutenção(ões) com data até 90 dias'}
 const stats=[{label:'Operacionais (Ativo)',count:0,color:'#27ccad'},{label:'Em manutenção',count:0,color:'#f0ba5f'},{label:'Inativos',count:0,color:'#ea7382'}];
 for(const v of vehicles){if(v.status==='Ativo')stats[0].count++;else if(v.status==='Manutenção')stats[1].count++;else stats[2].count++}
 if(statusCanvas){statusCanvas.style.display='none';let donut=el('v3-situation-donut');if(!donut){donut=document.createElement('div');donut.id='v3-situation-donut';donut.style.cssText='width:min(170px,100%);aspect-ratio:1;border-radius:50%;margin:14px auto;display:grid;place-items:center';statusCanvas.parentElement.append(donut)}const total=vehicles.length;let accumulated=0;const segments=stats.map(x=>{const start=accumulated;accumulated+=total?x.count/total*100:0;return x.color+' '+start+'% '+accumulated+'%'});donut.style.background=total?'conic-gradient('+segments.join(',')+')':'#244057';donut.replaceChildren();const hole=document.createElement('div');hole.style.cssText='width:72%;aspect-ratio:1;border-radius:50%;background:#0a2033;display:grid;place-items:center;text-align:center;font:700 30px system-ui;color:#e9f7ff';hole.textContent=total;donut.append(hole);if(statusEmpty)statusEmpty.style.display='none';if(center)center.style.display='none';if(legend){legend.replaceChildren();for(const x of stats){const item=document.createElement('div');item.className='xrm-status-legend-item';const dot=document.createElement('span');dot.className='xrm-status-legend-dot';dot.style.backgroundColor=x.color;const label=document.createElement('span');label.textContent=x.label;const count=document.createElement('strong');count.textContent=x.count;item.append(dot,label,count);legend.append(item)}}}
}

function refreshOverdueKpi(){
 const card=[...document.querySelectorAll('#fleet-kpis .fleet-kpi')].find(node=>node.querySelector('.fleet-kpi-label')?.textContent==='Itens vencidos');
 if(!card)return;
 const today=localDay(new Date()),filtered=filteredVehicleIds;
 const maintenanceCount=maintenance.filter(m=>alertKind(m)==='overdue'&&(!filtered||filtered.has(m.vehicle_id))).length;
 const expenseCount=expensesState?0:vehicleExpenses.filter(e=>!e.paid_on&&e.due_date&&e.due_date<today&&(!filtered||filtered.has(e.vehicle_id))).length;
 const hasFilters=['fleet-search','xrm-filter-category','xrm-filter-status','xrm-filter-expiry','xrm-contract-filter'].some(id=>Boolean(el(id)?.value));
 const driverCount=driversState?0:drivers.filter(d=>d.active&&d.cnh_expires_on&&d.cnh_expires_on<today&&(!hasFilters||vehicles.some(v=>v.driver_id===d.id&&filtered?.has(v.id)))).length;
 const count=maintenanceCount+expenseCount+driverCount;
 const number=card.querySelector('.fleet-kpi-value');if(number)number.textContent=count;
 card.classList.toggle('xrm-overdue-active',count>0);
 card.setAttribute('aria-label',count+' itens vencidos; abrir central de alertas');
}
/**
 * Dashboard snapshots use only data already fetched for the active company.
 * Financial figures come from the selected cost-report period, never demo data.
 */
function renderFleetInsights(){
 const root=el('fleet-insight-cost-ranking'),driversRoot=el('fleet-insight-drivers');
 if(!root||!driversRoot||!company)return;
 const selected=filteredVehicleIds||new Set(vehicles.map(v=>v.id));
 const scopedVehicles=vehicles.filter(v=>selected.has(v.id));
 const scopeMaintenance=maintenance.filter(m=>selected.has(m.vehicle_id));
 const open=scopeMaintenance.filter(m=>m.status==='open').length;
 const overdue=scopeMaintenance.filter(m=>m.status!=='done'&&alertKind(m)==='overdue').length;
 put('fleet-insight-open',open);
 put('fleet-insight-overdue',overdue);
 const month=el('fuel-ranking-month')?.value||localDay(new Date()).slice(0,7);
 const [year,number]=month.split('-').map(Number);
 const period=(year&&number)?new Date(year,number-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}):month;
 put('fleet-insight-period',period+' · '+scopedVehicles.length+' veículo(s) nos filtros');
 const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const amount=(record,fields)=>{for(const field of fields){if(record[field]!=null&&record[field]!==''){const n=Number(record[field]);if(Number.isFinite(n))return n}}return 0};
 root.replaceChildren();
 if(financialState){
  put('fleet-insight-fuel-cost','—');
  put('fleet-insight-maint-cost','—');
  const empty=document.createElement('p');
  empty.className='fleet-insight-empty';
  empty.textContent=financialState==='loading'?'Consultando custos do período…':'Não foi possível consultar os custos. Atualize para tentar novamente.';
  root.append(empty);
 }else{
  const fuels=fuelEntries.filter(row=>selected.has(row.vehicle_id));
  const maint=maintenanceExpenses.filter(row=>selected.has(row.vehicle_id));
  const expenses=paidExpenses.filter(row=>selected.has(row.vehicle_id));
  put('fleet-insight-fuel-cost',money(fuels.reduce((sum,row)=>sum+amount(row,['cost','total_cost']),0)));
  put('fleet-insight-maint-cost',money(maint.reduce((sum,row)=>sum+amount(row,['actual_cost']),0)));
  const group=new Map();
  for(const row of [...fuels.map(value=>({value,fields:['cost','total_cost']})),...maint.map(value=>({value,fields:['actual_cost']})),...expenses.map(value=>({value,fields:['amount']}))]){
   const vid=row.value.vehicle_id;
   group.set(vid,(group.get(vid)||0)+amount(row.value,row.fields));
  }
  const ranking=scopedVehicles.map(v=>({id:v.id,plate:v.plate||'Ativo',model:v.model||v.category||'',value:group.get(v.id)||0})).filter(v=>v.value>0).sort((a,b)=>b.value-a.value).slice(0,3);
  if(!ranking.length){
   const empty=document.createElement('p');empty.className='fleet-insight-empty';empty.textContent='Nenhum custo registrado para os veículos e período selecionados.';root.append(empty);
  }else{
   const max=Math.max(1,...ranking.map(v=>v.value));
   for(const [i,item] of ranking.entries()){
    const row=document.createElement('div');row.className='fleet-insight-rank';
    const name=document.createElement('span');name.className='fleet-insight-rank-name';name.textContent=(i+1)+'º '+(item.model?item.model+' · ':'')+item.plate;
    row.dataset.vehicleId=item.id;
    const track=document.createElement('span');track.className='fleet-insight-rank-track';
    const fill=document.createElement('span');fill.style.width=(item.value/max*100).toFixed(1)+'%';track.append(fill);
    const value=document.createElement('strong');value.textContent=money(item.value);
    const efficiency=document.createElement('strong');efficiency.className='fleet-insight-rank-efficiency';efficiency.textContent='— km/L';efficiency.title='Consultando média estimada de consumo';
    row.append(name,track,value,efficiency);root.append(row);
   }
  }
 }
 renderConsumptionDashboard();
 driversRoot.replaceChildren();
 const hasFilters=['fleet-search','xrm-filter-category','xrm-filter-status','xrm-filter-expiry','xrm-contract-filter'].some(id=>Boolean(el(id)?.value));
 const scopedIds=hasFilters?new Set(scopedVehicles.map(v=>v.driver_id).filter(Boolean)):null;
 const activeDrivers=drivers.filter(d=>d.active!==false&&d.active!=='false'&&(!scopedIds||scopedIds.has(d.id)));
 put('fleet-insight-drivers-period',hasFilters?'Motoristas vinculados aos veículos filtrados':'Próximos vencimentos dos motoristas ativos');
 if(driversState){
  const empty=document.createElement('p');empty.className='fleet-insight-empty';empty.textContent='Não foi possível consultar os motoristas. Atualize para tentar novamente.';driversRoot.append(empty);return;
 }
 if(!activeDrivers.length){
  const empty=document.createElement('p');empty.className='fleet-insight-empty';empty.textContent=hasFilters?'Nenhum motorista vinculado aos veículos filtrados.':'Nenhum motorista ativo cadastrado na empresa.';driversRoot.append(empty);return;
 }
 const today=new Date();today.setHours(0,0,0,0);
 const dateValue=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))?new Date(String(d)+'T00:00:00').getTime():Number.POSITIVE_INFINITY;
 const sorted=activeDrivers.slice().sort((a,b)=>dateValue(a.cnh_expires_on)-dateValue(b.cnh_expires_on)||String(a.name).localeCompare(String(b.name),'pt-BR'));
 for(const driver of sorted.slice(0,4)){
  const row=document.createElement('div');row.className='fleet-insight-driver';
  const avatar=document.createElement('span');avatar.className='fleet-insight-avatar';avatar.textContent=String(driver.name||'?').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toLocaleUpperCase('pt-BR');
  const identity=document.createElement('span');identity.className='fleet-insight-driver-identity';
  const name=document.createElement('strong');name.textContent=driver.name||'Motorista';
  const category=document.createElement('small');category.textContent='CNH '+(driver.cnh_category||'não informada');
  identity.append(name,category);
  const expires=document.createElement('span');expires.className='fleet-insight-expiry';
  const ts=dateValue(driver.cnh_expires_on);
  if(Number.isFinite(ts)){
   const days=Math.round((ts-today.getTime())/86400000);
   expires.textContent=days<0?'Vencida · '+formatRegistryDate(driver.cnh_expires_on):'Vence '+formatRegistryDate(driver.cnh_expires_on);
   if(days<0)expires.classList.add('overdue');else if(days<=30)expires.classList.add('soon');
  }else expires.textContent='Sem validade';
  row.append(avatar,identity,expires);
  driversRoot.append(row);
 }
 if(sorted.length>4){const more=document.createElement('p');more.className='fleet-insight-more';more.textContent='Mostrando 4 de '+sorted.length+' motoristas. Consulte a lista completa no módulo Motoristas.';driversRoot.append(more)}
}

function applyVehicleFilters(){
 const category=el('xrm-filter-category'),status=el('xrm-filter-status'),expiry=el('xrm-filter-expiry'),search=el('fleet-search');
 if(!category||!status||!expiry||!search)return;
 const selected=category.value;category.replaceChildren();const allOption=document.createElement('option');allOption.value='';allOption.textContent='Todas';category.append(allOption);
 for(const value of [...new Set(vehicles.map(v=>v.category).filter(Boolean))].sort()){const option=document.createElement('option');option.value=value;option.textContent=value;category.append(option)}category.value=[...category.options].some(o=>o.value===selected)?selected:'';
 const q=search.value.trim().toLocaleLowerCase('pt-BR');
 function maintenanceMatches(v,filter){const tasks=maintenance.filter(m=>m.vehicle_id===v.id&&m.status!=='done');if(!filter)return true;if(filter==='overdue')return tasks.some(m=>alertKind(m)==='overdue');const daysLimit=Number(filter),today=new Date();today.setHours(0,0,0,0);return tasks.some(m=>{if(m.due_date){const days=Math.round((new Date(m.due_date+'T00:00:00')-today)/86400000);if(days>=0&&days<=daysLimit)return true}return false})}
 const contractId=el('xrm-contract-filter')?.value||'';const filtered=vehicles.filter(v=>(!contractId||v.contract_id===contractId)&&(!q||[v.plate,v.brand,v.model,v.unit_name,v.category,v.driver_name].some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(q)))&&(!category.value||v.category===category.value)&&(!status.value||(status.value==='alerta'?maintenance.some(m=>m.vehicle_id===v.id&&alertKind(m)==='overdue'):v.status===status.value))&&maintenanceMatches(v,expiry.value));
 const filteredIds=new Set(filtered.map(v=>v.id));
 const scopedMaintenance=maintenance.filter(m=>filteredIds.has(m.vehicle_id));
 const oldVehicles=vehicles,oldMaintenance=maintenance;filteredVehicleIds=filteredIds;
 try{vehicles=filtered;maintenance=scopedMaintenance;renderOverviewCharts();renderExtras();renderWriteUI()}finally{vehicles=oldVehicles;maintenance=oldMaintenance}
 const overdue=scopedMaintenance.filter(m=>alertKind(m)==='overdue').length;
 const upcoming=scopedMaintenance.filter(m=>alertKind(m)==='soon').length;
 const kpiValues=[filtered.length,filtered.filter(v=>v.status==='Ativo').length,overdue+upcoming,overdue,scopedMaintenance.filter(m=>m.status==='open').length];
 const kpiNodes=el('fleet-kpis')?.querySelectorAll('.fleet-kpi-value')||[];
 kpiNodes.forEach((node,i)=>{if(i<kpiValues.length)node.textContent=kpiValues[i]});
 const preview=el('alert-preview');if(preview){preview.replaceChildren();for(const m of scopedMaintenance.filter(m=>['overdue','soon'].includes(alertKind(m))).slice(0,6)){const item=document.createElement('button');item.type='button';item.className='fleet-ptran-entry';item.textContent=(m.plate||oldVehicles.find(v=>v.id===m.vehicle_id)?.plate||'Ativo')+' — '+m.title;item.onclick=()=>openMaintenanceDetails(m.id);preview.append(item)}if(!preview.children.length)preview.textContent='Nenhuma manutenção em atenção para o filtro selecionado.'}
 put('alert-preview-count',overdue+upcoming);
 renderConsumptionDashboard();
 const root=el('fleet-table-body');if(root){root.replaceChildren();for(const v of filtered){const tr=document.createElement('tr');for(const value of [v.plate,v.category||'Veículo',v.driver_name||'Não vinculado',v.status||'—',nextRevision(v.id),Number(v.odometer_value||0).toLocaleString('pt-BR')]){const td=document.createElement('td');td.textContent=value;tr.append(td)}const action=document.createElement('td');
const actions=document.createElement('div');actions.className='xrm-doc-actions';
const documents=document.createElement('button');documents.type='button';documents.className='fleet-button';
documents.textContent='Documentos';documents.onclick=()=>documentCenter?.openRecord('vehicle',v);
actions.append(documents);
const fineLink=document.createElement('button');fineLink.type='button';fineLink.className='fleet-button';fineLink.textContent='Multas';fineLink.onclick=()=>trafficFines?.openForVehicle(v.id);actions.append(fineLink);
if(canWrite()){const edit=document.createElement('button');edit.type='button';edit.className='fleet-button';edit.textContent='Editar';edit.onclick=()=>openWrite('vehicle',v);actions.append(edit);}
action.append(actions);tr.append(action);root.append(tr)}}
 put('table-count',filtered.length);put('table-page-info',filtered.length+' de '+vehicles.length+' ativos');const caption=el('filter-result');if(caption)caption.textContent=filtered.length+' de '+vehicles.length+' veículos exibidos';renderContractFinance(filtered);renderFuelBars();renderFleetHistory();renderVehicleDocuments(filtered);put('nav-alert-count',overdue+upcoming);put('alerts-total',overdue+upcoming);renderRegistries();appendExpenseAlerts();appendDriverAlerts();refreshOverdueKpi();trafficFines?.renderAlerts();renderFilterSummary();renderFleetInsights();mileage?.render();xrmAssistRefresh();
}
for(const id of ['fleet-search','xrm-filter-category','xrm-filter-status','xrm-filter-expiry']){const control=el(id);if(control)control.addEventListener(id==='fleet-search'?'input':'change',applyVehicleFilters)}
if(el('xrm-clear-filters'))el('xrm-clear-filters').onclick=()=>{for(const id of ['fleet-search','xrm-filter-category','xrm-filter-status','xrm-filter-expiry','xrm-contract-filter','fuel-ranking-category','maintenance-search','driver-search','expense-search','expense-category'])if(el(id))el(id).value='';el('maintenance-status').value='open';el('driver-status').value='active';el('expense-status').value='all';el('expense-month').value=localDay(new Date()).slice(0,7);const month=el('fuel-ranking-month'),changed=month.value!==localDay(new Date()).slice(0,7);month.value=localDay(new Date()).slice(0,7);el('history-filters').reset();applyVehicleFilters();if(changed)void updateFuelMonth()};
if(el('view-clear-filters'))el('view-clear-filters').onclick=()=>{const view=currentView();if(view==='drivers'){el('driver-search').value='';el('driver-status').value='active';renderRegistries()}else if(view==='maintenance'&&maintenanceMode==='expenses'){el('expense-search').value='';el('expense-category').value='';el('expense-status').value='all';el('expense-month').value=localDay(new Date()).slice(0,7);renderRegistries()}else if(view==='maintenance'){el('maintenance-search').value='';el('maintenance-status').value='open';renderMaintenanceWorkspace()}else if(view==='fuel'||view==='financial'){el('fuel-ranking-category').value='';el('fuel-ranking-month').value=localDay(new Date()).slice(0,7);void updateFuelMonth()}else if(view==='history')el('history-filters').reset();renderFilterSummary()};


function syncContractFilter(){const select=el('xrm-contract-filter');if(!select)return;const current=select.value;select.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='Todos os contratos';select.append(all);for(const c of contracts){const opt=document.createElement('option');opt.value=c.id;opt.textContent=c.name;select.append(opt)}select.value=contracts.some(c=>c.id===current)?current:''}

if(el('xrm-contract-filter'))el('xrm-contract-filter').onchange=applyVehicleFilters;

function msg(text){const notice=el('page-notice');if(notice){notice.textContent=text;notice.classList.toggle('hidden',!text)}}
function nextRevision(id){const dates=maintenance.filter(m=>m.vehicle_id===id&&m.status!=='done'&&m.due_date).map(m=>m.due_date).sort();return dates[0]||'—'}

async function loadFleetDocuments(id){
 const request=++documentRequest;
 const results=await Promise.allSettled(vehicles.map(async vehicle=>({vehicleId:vehicle.id,documents:await rpc('my_vehicle_documents',{cid:id,vid:vehicle.id})})));
 if(company?.id!==id||request!==documentRequest)return;
 documentRows=results.filter(r=>r.status==='fulfilled').flatMap(r=>(r.value.documents||[]).map(d=>({...d,vehicle_id:r.value.vehicleId})));
 const root=el('vehicle-documents');if(root)root.dataset.failed=String(results.some(r=>r.status==='rejected'));
 renderVehicleDocuments(vehicles.filter(v=>!filteredVehicleIds||filteredVehicleIds.has(v.id)));await xrmLoadDocumentCatalog(id);
}
async function xrmLoadDocumentCatalog(cid){
 const req=++xrmDocumentCatalogRequest;
 try{const rows=await rpc('company_document_catalog',{cid});if(company?.id!==cid||req!==xrmDocumentCatalogRequest)return;xrmDocumentCatalog=rows||[];renderVehicleDocuments(vehicles.filter(v=>!filteredVehicleIds||filteredVehicleIds.has(v.id)))}catch(error){if(req===xrmDocumentCatalogRequest)msg('Não foi possível atualizar os anexos: '+error.message)}
}
function renderVehicleDocuments(_selected){
 documentCenter?.renderCentral();
}
function renderFleetHistory(){
 const root=el('history-content'),form=el('history-filters');if(!root||!form)return;if(!form.elements.from.value&&!form.elements.to.value){form.elements.from.value=localDay(new Date(new Date().getFullYear(),new Date().getMonth(),1));form.elements.to.value=localDay(new Date())}renderFilterSummary();const from=form.elements.from.value,to=form.elements.to.value,kind=form.elements.kind.value;
 const rows=[...historyExpenses.map(e=>({vehicle_id:e.vehicle_id,kind:'expense',date:String(e.date||e.paid_on||'').slice(0,10),title:(expenseCategories[e.category]||'Despesa')+' · '+e.description+' · '+registryMoney(e.amount)})),...maintenance.map(m=>({vehicle_id:m.vehicle_id,kind:'maintenance',date:String(m.completed_at||m.created_at||m.due_date||'').slice(0,10),title:m.title+' · '+(m.status==='done'?'Concluída':'Programada')})),...historyFuelRows.map(f=>({vehicle_id:f.vehicle_id,kind:'fuel',date:String(f.fueled_on||f.fuel_date||f.date||f.created_at||'').slice(0,10),title:'Abastecimento · '+Number(f.cost??f.total_cost??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+(litersMissing(f)?' · ⚠ Falta a quantidade de litros (não informado por decisão do usuário'+(f.liters_declined_email?' '+f.liters_declined_email:'')+')':'')}))].filter(r=>(!filteredVehicleIds||filteredVehicleIds.has(r.vehicle_id))&&(!kind||r.kind===kind)&&(!from||r.date>=from)&&(!to||r.date<=to)).sort((a,b)=>b.date.localeCompare(a.date));
 root.replaceChildren();for(const row of rows){const line=document.createElement('p');line.textContent=(row.date||'Sem data')+' · '+(vehicles.find(v=>v.id===row.vehicle_id)?.plate||'Veículo')+' · '+row.title;root.append(line)}put('history-count',rows.length);if(!rows.length)root.textContent='Nenhum registro no período e nos filtros selecionados.';
}
let historyRequest=0;
async function queryFleetHistory(){if(!company)return;renderFleetHistory();const form=el('history-filters'),id=company.id,request=++historyRequest;const from=form.elements.from.value||localDay(new Date(new Date().getFullYear(),new Date().getMonth(),1)),to=form.elements.to.value||localDay(new Date());if(from>to){msg('A data inicial deve ser anterior à data final.');return}try{const data=await rpc('cost_report',{cid:id,from_date:from,to_date:to,vid:null});if(company?.id!==id||request!==historyRequest)return;historyFuelRows=data?.fuel||[];historyExpenses=data?.expenses||[];renderFleetHistory()}catch(e){msg('Falha ao consultar o histórico: '+e.message)}}
if(el('history-filters')){el('history-filters').onsubmit=e=>{e.preventDefault();void queryFleetHistory()};el('history-filters').onreset=()=>{setTimeout(()=>void queryFleetHistory(),0)}}

function localDay(date){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')}
async function openFuelEditor(row){
 if(!canWrite()||!company?.id||!row?.id)return;
 const cid=company.id;
 try{
   const data=await rpc('fuel_details',{cid,fid:row.id});
   if(company?.id!==cid)return;
   if(!data?.id||data.id!==row.id)throw Error('Cadastro divergente.');
   openWrite('fuel',data);
 }catch(error){msg('Não foi possível editar este abastecimento: '+error.message);}
}

function renderConsumptionDashboard(){
 const root=el('fleet-insight-cost-ranking');if(!root)return;
 const rows=[...root.querySelectorAll('.fleet-insight-rank[data-vehicle-id]')];
 if(!rows.length)return;
 const selected=filteredVehicleIds||new Set(vehicles.map(v=>v.id));
 const quality=consumptionState===''?
   analyzeFuelQuality(fuelConsumptionEntries.filter(item=>selected.has(item.vehicle_id))):null;
 const byVehicle=new Map((quality?.perVehicle||[]).map(item=>[String(item.vehicleId),item]));
 for(const row of rows){
  const value=row.querySelector('.fleet-insight-rank-efficiency');if(!value)continue;
  value.classList.remove('is-unavailable');
  if(consumptionState==='loading'){value.textContent='… km/L';value.title='Consultando consumo';continue;}
  if(consumptionState==='error'){value.textContent='— km/L';value.classList.add('is-unavailable');value.title='Não foi possível consultar o consumo';continue;}
  const result=byVehicle.get(row.dataset.vehicleId);
  if(result?.referenceKmL!=null){
   value.textContent=result.referenceKmL.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' km/L';
   value.title='Média estimada nos últimos 6 meses; abastecimentos parciais podem distorcer o cálculo';
  }else{
   value.textContent='— km/L';value.classList.add('is-unavailable');
   value.title=result?.hasOmission?'Há abastecimentos sem quantidade de litros':'É necessário registrar pelo menos dois abastecimentos com quilometragem e litros válidos';
  }
 }
}
async function refreshConsumptionHistory(){
 if(!company?.id)return;
 const cid=company.id,ticket=++consumptionRequest;
 const month=el('fuel-ranking-month')?.value||localDay(new Date()).slice(0,7);
 if(!/^\d{4}-\d{2}$/.test(month))return;
 const [year,number]=month.split('-').map(Number);
 const from=localDay(new Date(year,number-6,1));
 const to=localDay(new Date(year,number,0));
 consumptionState='loading';renderConsumptionDashboard();
 try{
  const result=await rpc('cost_report',{cid,from_date:from,to_date:to,vid:null});
  if(company?.id!==cid||ticket!==consumptionRequest||el('fuel-ranking-month')?.value!==month)return;
  fuelConsumptionEntries=Array.isArray(result?.fuel)?result.fuel:[];
  consumptionState='';renderConsumptionDashboard();
 }catch(error){
  if(company?.id!==cid||ticket!==consumptionRequest)return;
  fuelConsumptionEntries=[];consumptionState='error';renderConsumptionDashboard();
 }
}

function renderFuelQuality(entries){
 const analysis=analyzeFuelQuality(entries);
 let fuelNote=el('xrm-fuel-quality-note');
 if(!fuelNote){fuelNote=document.createElement('div');fuelNote.id='xrm-fuel-quality-note';fuelNote.className='xrm-fuel-quality-note';fuelNote.setAttribute('role','status');el('fleet-fuel-records')?.before(fuelNote);}
 let dashboardNote=el('xrm-dashboard-fuel-quality-note');
 if(!dashboardNote){dashboardNote=document.createElement('div');dashboardNote.id='xrm-dashboard-fuel-quality-note';dashboardNote.className='xrm-fuel-quality-note';document.querySelector('.fleet-insight-stats')?.after(dashboardNote);}
 const plates=analysis.perVehicle.filter(x=>x.hasOmission).map(x=>vehicles.find(v=>v.id===x.vehicleId)?.plate||'Veículo').slice(0,5);
 const problem=analysis.missing>0;
 const warning=problem?'Atenção: '+analysis.missing+' abastecimento(s) sem quantidade de litros em '+analysis.vehiclesAffected+' veículo(s)'+(plates.length?' ('+plates.join(', ')+')':'')+'. Consumo km/L pode estar incompleto. Corrija os registros no histórico de abastecimentos.':
 analysis.total?'Litros preenchidos neste período. A média km/L é apenas indicativa: sem controle de tanque cheio, abastecimentos parciais podem distorcer o resultado.':
 'Sem abastecimentos no período. O consumo km/L não pode ser calculado.';
 for(const element of [fuelNote,dashboardNote])if(element){element.textContent=warning;element.dataset.ok=String(!problem);}
 const summaries=analysis.perVehicle.filter(x=>x.total>0).slice(0,12).map(x=>{
  const name=vehicles.find(v=>v.id===x.vehicleId)?.plate||'Veículo';
  return name+': '+(x.hasOmission?'litros pendentes':x.referenceKmL!=null?x.referenceKmL.toLocaleString('pt-BR',{maximumFractionDigits:2})+' km/L (estimativa)':'sem leituras suficientes');
 });
 let detail=el('xrm-fuel-quality-by-vehicle');
 if(!detail){detail=document.createElement('p');detail.id='xrm-fuel-quality-by-vehicle';detail.className='fleet-history-note';fuelNote?.after(detail);}
 if(detail)detail.textContent=summaries.length?'Referência de consumo por veículo: '+summaries.join(' · '):'';
}
function renderFuelRecords(entries){
 let root=el('fleet-fuel-records');
 if(!root){root=document.createElement('div');root.id='fleet-fuel-records';root.className='fleet-table-wrap';el('fleet-fuel-ranking')?.after(root);}
 root.replaceChildren();
 const table=document.createElement('table');table.className='fleet-table';
 const header=document.createElement('thead'),headRow=document.createElement('tr');
 for(const label of ['Veículo','Data','Litros','Valor','Posto','Comprovantes','Ações']){
   const cell=document.createElement('th');cell.textContent=label;headRow.append(cell);
 }
 header.append(headRow);
 const body=document.createElement('tbody');
 for(const row of entries){
   const tr=document.createElement('tr');
   const plate=row.plate||vehicles.find(v=>v.id===row.vehicle_id)?.plate||'Veículo';
   for(const value of [plate,row.fueled_on||row.date||'—',
     litersMissing(row)?'Não informado':Number(row.liters).toLocaleString('pt-BR'),
     Number(row.cost??row.total_cost??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),
     row.station||'—']){
     const cell=document.createElement('td');cell.textContent=value;tr.append(cell);
   }
   if(litersMissing(row)){
      const badge=document.createElement('small');badge.className='xrm-liters-missing';
      badge.textContent='⚠ Falta a quantidade de litros';
      badge.title='O usuário optou por não informar os litros. Registro auditado e corrigível.';
      tr.children[2]?.append(badge);
      const date=String(row.liters_declined_at||'');
      if(date){const meta=document.createElement('small');meta.style.display='block';meta.textContent='Omissão: '+new Date(date).toLocaleString('pt-BR')+' · '+(row.liters_declined_email||'usuário registrado');tr.children[2]?.append(meta);}
    }
    const docs=document.createElement('td');
   const receipt=document.createElement('button');receipt.type='button';
   receipt.className='fleet-button';receipt.textContent='Ver / anexar';
   receipt.onclick=async()=>{
     if(!company?.id)return;
     const cid=company.id;
     await xrmLoadDocumentCatalog(cid);
     if(company?.id!==cid)return;
     documentCenter?.openRecord('fuel',row);
   };
   docs.append(receipt);tr.append(docs);
   const action=document.createElement('td');
   if(canWrite()){
     const edit=document.createElement('button');edit.type='button';
     edit.className='fleet-button';edit.textContent=litersMissing(row)?'Corrigir litros':'Editar';
     edit.onclick=()=>void openFuelEditor(row);
     action.append(edit);
   }else action.textContent='Consulta';
   tr.append(action);body.append(tr);
 }
 table.append(header,body);root.append(table);
 if(!entries.length){
   const empty=document.createElement('p');empty.className='fleet-workspace-note';
   empty.textContent='Nenhum abastecimento no período selecionado.';
   root.append(empty);
 }
}

function renderMaintenanceWorkspace(){
 const root=el('v3-maintenance-list'),summary=el('maintenance-summary');if(!root||!summary)return;
 const query=(el('maintenance-search')?.value||'').trim().toLocaleLowerCase('pt-BR'),status=el('maintenance-status')?.value||'open';
 const plate=task=>task.plate||vehicles.find(v=>v.id===task.vehicle_id)?.plate||'Veículo';
 const scope=maintenance.filter(task=>(!filteredVehicleIds||filteredVehicleIds.has(task.vehicle_id))&&(!query||[plate(task),task.title,task.notes].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(query))));
 const buckets=[['overdue','Vencidas'],['soon','Próximas'],['scheduled','Programadas'],['done','Concluídas']];
 const kind=task=>{const value=alertKind(task);return value==='open'?'scheduled':value};
 summary.replaceChildren();for(const [key,label]of buckets){const button=document.createElement('button');button.type='button';button.className='fleet-maintenance-metric';button.dataset.kind=key;button.setAttribute('aria-pressed',String(status===key));const labelEl=document.createElement('span'),value=document.createElement('strong');labelEl.textContent=label;value.textContent=scope.filter(task=>kind(task)===key).length;button.append(labelEl,value);button.onclick=()=>{el('maintenance-status').value=key;renderMaintenanceWorkspace()};summary.append(button)}
 const rows=scope.filter(task=>status==='all'||(status==='open'?task.status!=='done':kind(task)===status)).sort((a,b)=>{const order={overdue:0,soon:1,scheduled:2,done:3};return order[kind(a)]-order[kind(b)]||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))});
 root.replaceChildren();const table=document.createElement('table');table.className='fleet-table';const head=document.createElement('thead'),heading=document.createElement('tr');for(const name of ['Veículo / Serviço','Vencimento','Situação','Previsto','Realizado','Ações']){const cell=document.createElement('th');cell.scope='col';cell.textContent=name;heading.append(cell)}head.append(heading);const body=document.createElement('tbody');const currency=value=>value==null?'—':Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 for(const task of rows){const tr=document.createElement('tr');tr.dataset.taskId=task.id;const service=document.createElement('td'),vehicle=document.createElement('strong'),title=document.createElement('span');vehicle.textContent=plate(task);title.textContent=task.title;service.append(vehicle,title);if(task.notes){const notes=document.createElement('small');notes.textContent=task.notes;service.append(notes)}tr.append(service);
 const due=document.createElement('td');due.textContent=task.due_date?new Date(task.due_date+'T12:00:00').toLocaleDateString('pt-BR'):'Sem data';if(task.due_meter!=null){const meter=document.createElement('small');meter.textContent='KM/H: '+Number(task.due_meter).toLocaleString('pt-BR');due.append(meter)}tr.append(due);
 const state=document.createElement('td'),badge=document.createElement('span');badge.className='fleet-maintenance-badge';badge.dataset.kind=kind(task);badge.textContent=buckets.find(([key])=>key===kind(task))?.[1]||'Programada';state.append(badge);tr.append(state);
 for(const value of [task.estimated_cost,task.actual_cost]){const cell=document.createElement('td');cell.textContent=currency(value);tr.append(cell)}const actions=document.createElement('td');const details=document.createElement('button');details.type='button';details.className='fleet-button';details.textContent='Detalhes';details.onclick=()=>openMaintenanceDetails(task.id);actions.append(details);if(canWrite()){for(const [text,handler]of [['Registrar custos',()=>updateMaintenanceCost(task)],...(task.status==='done'?[]:[['Concluir serviço',()=>completeMaintenance(task)]])]){const button=document.createElement('button');button.type='button';button.className='fleet-button';button.textContent=text;button.onclick=handler;actions.append(button)}}tr.append(actions);body.append(tr)}table.append(head,body);root.append(table);
 renderFilterSummary();put('maintenance-result',rows.length?rows.length+' de '+scope.length+' serviços exibidos.':'Nenhuma manutenção corresponde aos filtros. Programe um serviço ou ajuste os filtros.');
}
for(const id of ['maintenance-search','maintenance-status'])el(id)?.addEventListener(id==='maintenance-search'?'input':'change',renderMaintenanceWorkspace);
if(el('maintenance-clear'))el('maintenance-clear').onclick=()=>{el('maintenance-search').value='';el('maintenance-status').value='open';renderMaintenanceWorkspace()};
document.addEventListener('keydown',event=>{if(v3Overlay.hidden)return;if(event.key==='Escape')closeWrite();if(event.key==='Tab'){const items=[...v3Overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary')].filter(x=>!x.hidden&&x.getClientRects().length);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}});

function currentView(){return document.querySelector('.fleet-main-nav [aria-current="page"]')?.dataset.view||location.hash.slice(1)||'dashboard'}
function renderFilterSummary(){
 const root=el('active-filter-summary');if(!root)return;const view=currentView(),chips=[];
 const selected=id=>el(id)?.selectedOptions?.[0]?.textContent||'';if(view==='drivers'){root.textContent='Motoristas da empresa ativa · '+selected('driver-status')+(el('driver-search')?.value?' · Busca: '+el('driver-search').value:'');if(el('view-clear-filters'))el('view-clear-filters').hidden=false;return}
 chips.push(['Contrato',el('xrm-contract-filter')?.value?selected('xrm-contract-filter'):'Todos']);
 for(const [id,label]of [['fleet-search','Busca'],['xrm-filter-category','Categoria'],['xrm-filter-status','Situação do veículo'],['xrm-filter-expiry','Vencimento da revisão']]){const node=el(id);if(node?.value)chips.push([label,node.tagName==='SELECT'?selected(id):node.value])}
 if(view==='maintenance'&&maintenanceMode==='services'){chips.push(['Serviços',selected('maintenance-status')]);if(el('maintenance-search')?.value)chips.push(['Serviço/placa',el('maintenance-search').value])}
 if(view==='maintenance'&&maintenanceMode==='expenses'){chips.push(['Despesas',selected('expense-status')],['Tipo',selected('expense-category')],['Mês da despesa',el('expense-month')?.value||'Mês atual']);if(el('expense-search')?.value)chips.push(['Busca de despesa',el('expense-search').value])}
 if(['fuel','financial'].includes(view)){chips.push(['Período',el('fuel-ranking-month')?.value||'Mês atual']);if(view==='fuel'&&el('fuel-ranking-category')?.value)chips.push(['Categoria do ranking',selected('fuel-ranking-category')])}
 if(view==='history'){const form=el('history-filters');chips.push(['Histórico',(form?.elements.from.value||'Início do mês')+' a '+(form?.elements.to.value||'Hoje')]);if(form?.elements.kind.value)chips.push(['Tipo',form.elements.kind.selectedOptions[0].textContent])}
 root.replaceChildren();for(const [label,value]of chips){const chip=document.createElement('span');chip.className='fleet-filter-chip';chip.textContent=label+': '+value;root.append(chip)}
 if(el('view-clear-filters'))el('view-clear-filters').hidden=!['drivers','maintenance','fuel','financial','history'].includes(view);
}

function openMaintenanceDetails(taskId){
 const found=maintenance.find(task=>task.id===taskId);if(!found){msg('O serviço não está disponível. Atualize os dados e tente novamente.');return}
 if(v3Overlay.hidden)lastWriteFocus=document.activeElement;
 const task={...found};v3Editing={kind:'maintenance-detail',record:task,companyId:company.id};const draft=v3Editing;
 v3Overlay.dataset.layout='drawer';v3Overlay.dataset.taskId=task.id;put('v3-edit-title','Detalhes da manutenção');put('v3-edit-feedback','');const form=el('v3-edit-form');form.replaceChildren();
 const heading=document.createElement('h3');heading.className='wide';heading.textContent=(task.plate||vehicles.find(v=>v.id===task.vehicle_id)?.plate||'Veículo')+' · '+task.title;form.append(heading);
 const definition=document.createElement('dl');definition.className='wide fleet-maintenance-details';const money=n=>n==null?'Não informado':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const values=[['Situação',task.status==='done'?'Concluída':alertKind(task)==='overdue'?'Vencida':alertKind(task)==='soon'?'Próxima':'Programada'],['Data prevista',task.due_date?new Date(task.due_date+'T12:00:00').toLocaleDateString('pt-BR'):'Sem data'],['KM/horímetro previsto',task.due_meter==null?'Não informado':Number(task.due_meter).toLocaleString('pt-BR')],['Custo previsto',money(task.estimated_cost)],['Custo realizado',money(task.actual_cost)],['Leitura na execução',task.completed_meter==null?'Não informada':Number(task.completed_meter).toLocaleString('pt-BR')],['Observações',task.notes||'Sem observações']];
 for(const [label,value]of values){const group=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');term.textContent=label;description.textContent=value;group.append(term,description);definition.append(group)}form.append(definition);
 const actions=document.createElement('div');actions.className='wide fleet-detail-actions';if(canWrite()){for(const [label,kind]of [...(task.status==='done'?[]:[['Editar programação','maintenance-edit']]),['Registrar custos','maintenance-cost'],...(task.status==='done'?[]:[['Concluir serviço','maintenance-complete']])]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.action=kind;button.onclick=()=>openWrite(kind,task);actions.append(button)}}form.append(actions);
 const historyButton=document.createElement('button');historyButton.type='button';historyButton.className='wide fleet-history-toggle';historyButton.textContent='Ver histórico de alterações';const historyRoot=document.createElement('div');historyRoot.className='wide fleet-change-history';historyRoot.setAttribute('role','status');
 historyButton.onclick=async()=>{historyButton.disabled=true;historyRoot.textContent='Consultando histórico…';try{const rows=await rpc('maintenance_history',{cid:draft.companyId,tid:task.id});if(v3Editing!==draft||company?.id!==draft.companyId)return;historyRoot.replaceChildren();const note=document.createElement('p');note.textContent='Últimas 50 alterações registradas a partir desta atualização do sistema.';historyRoot.append(note);
 for(const row of rows||[]){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=new Date(row.changed_at).toLocaleString('pt-BR')+' · '+(row.reason||'Atualização registrada');details.append(summary);const actor=document.createElement('p');actor.textContent='Responsável: '+(row.actor_id||'Sistema');details.append(actor);for(const [key,label]of [['title','Serviço'],['due_date','Data prevista'],['due_meter','KM/H previsto'],['notes','Observações'],['estimated_cost','Custo previsto'],['actual_cost','Custo realizado'],['completed_meter','Leitura na execução'],['status','Situação']]){const before=row.before_data?.[key],after=row.after_data?.[key];if((before??null)!==(after??null)){const format=value=>value==null||value===''?'Não informado':key==='status'?(value==='done'?'Concluída':'Pendente'):key==='due_date'?new Date(value+'T12:00:00').toLocaleDateString('pt-BR'):['estimated_cost','actual_cost'].includes(key)?Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):String(value);const line=document.createElement('p');line.textContent=label+': '+format(before)+' → '+format(after);details.append(line)}}historyRoot.append(details)}if(!rows?.length){const empty=document.createElement('p');empty.textContent='Nenhuma alteração registrada para este serviço.';historyRoot.append(empty)}}catch(error){if(v3Editing===draft)historyRoot.textContent='Não foi possível consultar o histórico: '+error.message}finally{historyButton.disabled=false}};
 form.append(historyButton,historyRoot);v3Overlay.hidden=false;document.body.classList.add('fleet-dialog-open');el('v3-edit-close').focus();
}

function renderContractFinance(filtered){
 let panel=el('xrm-contract-finance');if(!panel){panel=document.createElement('section');panel.id='xrm-contract-finance';panel.className='fleet-panel';el('view-financial')?.append(panel)}if(!panel)return;panel.replaceChildren();
 if(financialState){panel.textContent=financialState==='loading'?'Consultando custos do mês selecionado…':'Não foi possível consultar os custos do mês selecionado. Atualize para tentar novamente.';return}
 const ids=new Set(filtered.map(v=>v.id));const rows=[...paidExpenses.filter(row=>ids.has(row.vehicle_id)).map(row=>({...row,kind:'expense',amount:row.amount,description:(expenseCategories[row.category]||'Despesa')+' · '+row.description})),...fuelEntries.filter(row=>ids.has(row.vehicle_id)).map(row=>({...row,kind:'fuel',amount:row.cost??row.total_cost,description:'Abastecimento'+(row.station?' · '+row.station:'')})),...maintenanceExpenses.filter(row=>ids.has(row.vehicle_id)).map(row=>({...row,kind:'maintenance',amount:row.actual_cost,description:row.title||'Manutenção concluída'}))];
 const title=document.createElement('h2');title.textContent='Custos da frota filtrada';panel.append(title);const caption=document.createElement('p');caption.className='fleet-financial-caption';caption.textContent='Período: '+(xrmReportRange?.from&&xrmReportRange?.to?xrmReportRange.from+' a '+xrmReportRange.to:el('fuel-ranking-month')?.value||'Mês atual')+' · '+filtered.length+' veículo(s). Clique nos valores para consultar os lançamentos.';panel.append(caption);
 const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const sum=list=>list.reduce((total,row)=>total+Number(row.amount||0),0);
 const cards=document.createElement('div');cards.className='fleet-financial-cards';for(const [key,label]of [['all','Total'],['fuel','Combustível'],['maintenance','Manutenção realizada'],['expense','Despesas pagas']]){const list=rows.filter(row=>key==='all'||row.kind===key),button=document.createElement('button'),name=document.createElement('span'),value=document.createElement('strong');button.type='button';button.dataset.financialKind=key;button.setAttribute('aria-expanded',String(financialDetailsOpen&&financialDetailsKind===key));button.setAttribute('aria-controls','financial-entries');name.textContent=label;value.textContent=money(sum(list));button.append(name,value);button.onclick=()=>{financialDetailsOpen=true;financialDetailsKind=key;renderContractFinance(vehicles.filter(v=>!filteredVehicleIds||filteredVehicleIds.has(v.id)))};cards.append(button)}panel.append(cards);
 const missing=rows.filter(row=>row.amount==null).length;if(missing){const note=document.createElement('p');note.className='fleet-financial-caption';note.textContent=missing+' lançamento(s) sem custo informado. Esses valores não compõem o total.';panel.append(note)}
 const detail=document.createElement('div');detail.id='financial-entries';detail.hidden=!financialDetailsOpen;const heading=document.createElement('h3');heading.textContent='Lançamentos · '+(financialDetailsKind==='fuel'?'Combustível':financialDetailsKind==='maintenance'?'Manutenção':financialDetailsKind==='expense'?'Despesas pagas':'Todos');detail.append(heading);const selected=rows.filter(row=>financialDetailsKind==='all'||row.kind===financialDetailsKind).sort((a,b)=>String(b.date||b.fueled_on||'').localeCompare(String(a.date||a.fueled_on||'')));const wrapper=document.createElement('div');wrapper.className='fleet-table-wrap';const table=document.createElement('table');table.className='fleet-table';const head=document.createElement('thead'),tr=document.createElement('tr');for(const text of ['Data','Veículo','Tipo','Descrição','Valor','Ação']){const cell=document.createElement('th');cell.scope='col';cell.textContent=text;tr.append(cell)}head.append(tr);const body=document.createElement('tbody');for(const row of selected){const line=document.createElement('tr');for(const text of [row.date||row.fueled_on||'—',row.plate||vehicles.find(v=>v.id===row.vehicle_id)?.plate||'Veículo',row.kind==='fuel'?'Combustível':row.kind==='expense'?'Despesa':'Manutenção',row.description,row.amount==null?'Não informado':money(row.amount)]){const cell=document.createElement('td');cell.textContent=text;line.append(cell)}const action=document.createElement('td');if(row.kind==='maintenance'&&row.id){const button=document.createElement('button');button.type='button';button.className='fleet-button';button.textContent='Ver manutenção';button.onclick=()=>openMaintenanceDetails(row.id);action.append(button)}else if(row.kind==='expense'&&row.id){const button=document.createElement('button');button.type='button';button.className='fleet-button';button.textContent='Ver despesa';button.onclick=()=>openExpenseDetails(row.id);action.append(button)}line.append(action);body.append(line)}table.append(head,body);wrapper.append(table);detail.append(wrapper);const count=document.createElement('p');count.className='fleet-financial-caption';count.textContent=selected.length+' lançamento(s) · Total dos valores informados: '+money(sum(selected));detail.append(count);panel.append(detail);
}

function setMaintenanceMode(mode){maintenanceMode=mode==='expenses'?'expenses':'services';el('maintenance-panel').hidden=maintenanceMode!=='services';el('expense-panel').hidden=maintenanceMode!=='expenses';all('[data-maintenance-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.maintenanceMode===maintenanceMode)));renderFilterSummary()}
all('[data-maintenance-mode]').forEach(button=>button.onclick=()=>setMaintenanceMode(button.dataset.maintenanceMode));


async function uploadXrmRecordAttachment(cid,kind,recordId,file){
 const formats={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
 const ext=formats[file.type];
 if(!ext||file.size>10485760||file.size<1||file.name.length>200)throw Error('Arquivo inválido. Use PDF ou imagem com até 10 MB.');
 const path=[cid,kind,recordId,crypto.randomUUID()+'.'+ext].join('/');
 const {error}=await sb.storage.from('xrmovi-record-attachments').upload(path,file,{contentType:file.type,upsert:false});
 if(error)throw error;
 await rpc('attachment_register',{cid,kind,rid:recordId,p_path:path,p_name:file.name,p_type:file.type,p_size:file.size});
}
async function showXrmRecordAttachments(cid,kind,id,container){
 if(!cid||!id||!container)return;
 const rows=await rpc('attachment_list',{cid,kind,rid:id});
 for(const attachment of rows||[]){
  const button=document.createElement('button');button.type='button';button.className='fleet-button';
  button.textContent='📎 '+attachment.name;
  button.onclick=async()=>{
   try{const {data,error}=await sb.storage.from('xrmovi-record-attachments').createSignedUrl(attachment.path,60);
    if(error)throw error;const url=new URL(data.signedUrl);if(url.protocol!=='https:')throw Error('Link inválido');window.open(url.href,'_blank','noopener,noreferrer')
   }catch(error){msg('Não foi possível abrir o arquivo: '+error.message)}
  };container.append(button);
 }
}
documentCenter=createDocumentCenter({
 client:()=>sb,
 rpc,
 getCompany:()=>company,
 getVehicles:()=>vehicles,
 getDrivers:()=>drivers,
 getLegacyDocs:()=>documentRows,
 getCatalog:()=>xrmDocumentCatalog,
 canWrite,
 upload:uploadXrmRecordAttachment,
 refresh:async()=>{if(company?.id)await loadFleetDocuments(company.id)},
 notify:msg
});
 const dash=el('view-dashboard');
 if(dash&&!el('xrm-fines-quick')){
  const quick=document.createElement('div');quick.className='xrm-fines-quick';quick.id='xrm-fines-quick';const heading=dash.querySelector('.fleet-section-label');if(heading)heading.after(quick);else dash.prepend(quick);
 }
 trafficFines=setupTrafficFines({
  rpc,client:()=>sb,getCompany:()=>company,
  getVehicles:()=>vehicles,getDrivers:()=>drivers,getFilteredIds:()=>filteredVehicleIds,
  canWrite,openView:name=>page(name),getCatalog:()=>xrmDocumentCatalog,
  refreshCatalog:async()=>{if(company?.id)await xrmLoadDocumentCatalog(company.id)},
  openDocument:(kind,record)=>documentCenter?.openRecord(kind,record),
  notify:msg
 });
 trafficFines.onFinanceRefresh(()=>load());
function buildDriverForm(form,record){form.append(field('name','Nome do motorista','text',record?.name||'',true),field('phone','Telefone (opcional)','tel',record?.phone||''),field('cnh','Número da CNH (opcional)','text',record?.cnh_number||''),pick('cnh_category','Categoria da CNH',[['','Não informada'],...['A','B','AB','C','AC','D','AD','E','AE'].map(value=>[value,value])],record?.cnh_category||''),field('cnh_expires','Validade da CNH (opcional)','date',record?.cnh_expires_on||''),pick('active','Situação',[['true','Ativo'],['false','Inativo']],record?.active===false?'false':'true'),field('notes','Observações (opcional)','text',record?.notes||''));form.elements.cnh_category.required=false;form.elements.name.maxLength=160;form.elements.phone.maxLength=40;form.elements.cnh.maxLength=30;form.elements.notes.maxLength=1000;const note=document.createElement('p');note.className='wide';note.textContent='Motoristas inativos deixam de aparecer para novos vínculos. Veículos já vinculados são preservados.';form.append(note)}

function buildVehicleDriverSelect(form,record){
 const search=field('driver_search','Buscar motorista','search','');
 const label=pick('driver','Motorista responsável',[['','Sem motorista vinculado']],'');
 const select=label.querySelector('select');
 const input=search.querySelector('input');
 const results=document.createElement('div');
 const helper=document.createElement('p');
 search.classList.add('wide','v3-driver-search');
 label.classList.add('wide');
 helper.classList.add('wide','v3-driver-helper');
 results.className='v3-driver-results';
 results.id='v3-driver-results';
 results.hidden=true;
 input.placeholder='Digite o nome, número da CNH ou categoria';
 input.autocomplete='off';
 input.setAttribute('role','combobox');
 input.setAttribute('aria-autocomplete','list');
 input.setAttribute('aria-controls',results.id);
 input.setAttribute('aria-expanded','false');
 select.required=false;
 let selectedId=record?.driver_id||'';
 let resultsOpen=false;
 const normalize=value=>String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('pt-BR');
 const active=driver=>driver.active!==false&&driver.active!=='false'&&driver.active!==0;
 const candidates=()=>drivers.filter(driver=>active(driver)||driver.id===record?.driver_id);
 const driverLabel=driver=>driver.name+(driver.cnh_category?' · CNH '+driver.cnh_category:'')+(driver.cnh_number?' · final '+String(driver.cnh_number).slice(-4):'')+(!active(driver)?' (inativo)':'');
 const matches=(driver,query)=>[driver.name,driver.cnh_number,driver.cnh_category].some(value=>normalize(value).includes(query));
 function updateHelper(){
  const selected=candidates().find(driver=>driver.id===selectedId);
  helper.textContent=driversState
   ? 'Não foi possível carregar os motoristas da empresa. Atualize a página para tentar novamente.'
   : selected?'Selecionado: '+selected.name+'. Você pode buscar outro motorista ou deixar sem vínculo.'
   : candidates().some(active)?'Digite para localizar um motorista e clique no resultado para vinculá-lo.'
   :'Nenhum motorista ativo cadastrado. Cadastre um na área Motoristas antes de vinculá-lo.';
 }
 function updateSelect(){
  const query=normalize(input.value.trim());
  const available=candidates().filter(driver=>!query||matches(driver,query)||driver.id===selectedId);
  if(selectedId&&!available.some(driver=>driver.id===selectedId)){
   available.push({id:selectedId,name:record?.driver_name||'Motorista vinculado',active:false});
  }
  select.replaceChildren();
  const empty=document.createElement('option');
  empty.value='';empty.textContent='Sem motorista vinculado';select.append(empty);
  for(const driver of available){const option=document.createElement('option');option.value=driver.id;option.textContent=driverLabel(driver);select.append(option)}
  select.value=selectedId;
  if(select.selectedIndex<0){selectedId='';select.value=''}
  updateHelper();
 }
 function toggleResults(open){
  resultsOpen=!!open;
  results.hidden=!resultsOpen;
  input.setAttribute('aria-expanded',String(resultsOpen));
 }
 function choose(driver){
  selectedId=driver.id;
  input.value=driver.name;
  updateSelect();
  input.focus({preventScroll:true});
  toggleResults(false);
 }
 function showMatches(){
  updateSelect();
  const query=normalize(input.value.trim());
  const matchesList=candidates().filter(driver=>!query||matches(driver,query));
  results.replaceChildren();
  if(driversState||!matchesList.length){
   const empty=document.createElement('div');
   empty.className='v3-driver-empty';
   empty.textContent=driversState?'Falha ao consultar os motoristas.':'Nenhum motorista encontrado para essa busca.';
   results.append(empty);
  }else{
   for(const driver of matchesList.slice(0,25)){
    const button=document.createElement('button');
    button.type='button';
    button.className='v3-driver-option';
    button.setAttribute('role','option');
    button.setAttribute('aria-selected',String(driver.id===selectedId));
    const name=document.createElement('strong');name.textContent=driver.name;
    const meta=document.createElement('small');meta.textContent=(driver.cnh_category?'CNH '+driver.cnh_category:'Categoria não informada')+(!active(driver)?' · Inativo':'')+(driver.cnh_number?' · final '+String(driver.cnh_number).slice(-4):'');
    button.append(name,meta);
    button.addEventListener('click',()=>choose(driver));
    results.append(button);
   }
   if(matchesList.length>25){
    const more=document.createElement('div');more.className='v3-driver-empty';
    more.textContent='Exibindo 25 de '+matchesList.length+' motoristas. Refine a busca.';
    results.append(more);
   }
  }
  toggleResults(true);
 }
 input.addEventListener('focus',showMatches);
 input.addEventListener('input',showMatches);
 input.addEventListener('keydown',event=>{
  if(event.key==='Escape'){toggleResults(false);return}
  if(event.key==='ArrowDown'){
   if(!resultsOpen)showMatches();
   const first=results.querySelector('.v3-driver-option');
   if(first){event.preventDefault();first.focus()}
  }
 });
 results.addEventListener('keydown',event=>{
  const buttons=[...results.querySelectorAll('.v3-driver-option')];
  const index=buttons.indexOf(document.activeElement);
  if(event.key==='Escape'){event.preventDefault();toggleResults(false);input.focus({preventScroll:true})}
  else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();
   const next=event.key==='ArrowDown'?Math.min(index+1,buttons.length-1):Math.max(index-1,0);
   buttons[next]?.focus();
  }
 });
 select.addEventListener('change',()=>{
  selectedId=select.value;
  const driver=candidates().find(item=>item.id===selectedId);
  input.value=driver?.name||'';
  updateSelect();
  toggleResults(false);
 });
 document.addEventListener('pointerdown',event=>{
  if(!search.isConnected)return;
  if(!search.contains(event.target))toggleResults(false);
 },{signal:(()=>{const controller=new AbortController();const observer=new MutationObserver(()=>{
  if(!search.isConnected){controller.abort();observer.disconnect()}
 });observer.observe(form,{childList:true});return controller.signal})()});
 search.append(results);
 form.append(search,label,helper);
 updateSelect();
}

function buildExpenseForm(form,record){const options=vehicles.map(vehicle=>[vehicle.id,vehicle.plate+' · '+(vehicle.model||vehicle.category||'Veículo')]);form.append(pick('vehicle','Veículo',options,record?.vehicle_id),pick('expense_category','Tipo de despesa',Object.entries(expenseCategories),record?.category||'outros'),field('description','Despesa ou serviço','text',record?.description||'',true),field('expense_date','Data da despesa','date',record?.expense_date||localDay(new Date()),true),field('due_date','Vencimento (opcional)','date',record?.due_date||''),field('amount','Valor (R$)','number',record?.amount??'',true),pick('payment_status','Pagamento',[['open','Em aberto'],['paid','Pago']],record?.paid_on?'paid':'open'),field('paid_on','Data do pagamento','date',record?.paid_on||localDay(new Date())),field('notes','Observações (opcional)','text',record?.notes||''));form.elements.description.maxLength=180;form.elements.description.placeholder='Ex.: lavagem, borracharia, serviço extra, IPVA…';const guidance=document.createElement('p');guidance.className='wide';guidance.textContent='Para custos de uma manutenção já cadastrada, use Registrar custos no próprio serviço. Aqui você lança despesas e serviços avulsos do veículo.';form.append(guidance);form.elements.notes.maxLength=1000;form.elements.amount.min='0.01';form.elements.amount.step='0.01';form.elements.paid_on.max=localDay(new Date());const sync=()=>{const paid=form.elements.payment_status.value==='paid';form.elements.paid_on.closest('label').hidden=!paid;form.elements.paid_on.required=paid};form.elements.payment_status.onchange=sync;sync();if(!options.length){const note=document.createElement('p');note.className='wide';note.textContent='Cadastre um veículo na tela Ativos / Veículos antes de lançar uma despesa.';form.append(note)}}

function registryDetail(kind,record,values){if(v3Overlay.hidden)lastWriteFocus=document.activeElement;v3Editing={kind:'registry-detail',record:{...record},companyId:company.id};v3Overlay.dataset.layout='drawer';v3Overlay.dataset.expenseId=kind==='expense'?record.id:'';v3Overlay.dataset.driverId=kind==='driver'?record.id:'';put('v3-edit-title',kind==='expense'?'Detalhes da despesa':'Motorista');put('v3-edit-feedback','');const form=el('v3-edit-form');form.replaceChildren();const dl=document.createElement('dl');dl.className='wide fleet-maintenance-details';for(const [label,value]of values){const group=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value??'Não informado';group.append(dt,dd);dl.append(group)}form.append(dl);const attachments=document.createElement('div');attachments.className='wide';attachments.style.cssText='display:flex;gap:8px;flex-wrap:wrap';form.append(attachments);void showXrmRecordAttachments(company.id,kind,record.id,attachments).catch(()=>{});if(canWrite()){const edit=document.createElement('button');edit.type='button';edit.className='wide';edit.textContent=kind==='expense'?'Editar despesa':'Editar motorista';edit.onclick=()=>openWrite(kind,record);form.append(edit);if(kind==='expense'&&!record.paid_on){const pay=document.createElement('button');pay.type='button';pay.className='wide';pay.textContent='Registrar pagamento';pay.onclick=()=>openWrite('expense',{...record,paid_on:localDay(new Date())});form.append(pay)}}v3Overlay.hidden=false;document.body.classList.add('fleet-dialog-open');el('v3-edit-close').focus()}
function openDriverDetails(id){const record=drivers.find(driver=>driver.id===id);if(!record){msg('Motorista não disponível. Atualize os dados.');return}registryDetail('driver',record,[['Nome',record.name],['Situação',record.active?'Ativo':'Inativo'],['Categoria CNH',record.cnh_category||'Não informada'],['Validade CNH',formatRegistryDate(record.cnh_expires_on)],...(canWrite()?[['Telefone',record.phone||'Não informado'],['CNH',record.cnh_number||'Não informada'],['Observações',record.notes||'Sem observações']]:[])])}
function openExpenseDetails(id){const record=vehicleExpenses.find(expense=>expense.id===id);if(!record){msg('Despesa não disponível. Atualize os dados.');return}registryDetail('expense',record,[['Veículo',record.plate||vehicles.find(vehicle=>vehicle.id===record.vehicle_id)?.plate],['Tipo',expenseCategories[record.category]||'Despesa'],['Descrição',record.description],['Data da despesa',formatRegistryDate(record.expense_date)],['Vencimento',formatRegistryDate(record.due_date)],['Valor',registryMoney(record.amount)],['Pagamento',record.paid_on?'Pago em '+formatRegistryDate(record.paid_on):'Em aberto'],['Observações',record.notes||'Sem observações']])}
function openRegistryAfterRefresh(kind,id){if(kind==='driver')openDriverDetails(id);else openExpenseDetails(id)}
function formatRegistryDate(date){return date?new Date(date+'T12:00:00').toLocaleDateString('pt-BR'):'Não informada'}
function registryMoney(value){return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function registryTable(headers,rows){const table=document.createElement('table');table.className='fleet-table';const head=document.createElement('thead'),tr=document.createElement('tr');for(const text of headers){const cell=document.createElement('th');cell.scope='col';cell.textContent=text;tr.append(cell)}head.append(tr);const body=document.createElement('tbody');for(const row of rows){const line=document.createElement('tr');for(const value of row){const cell=document.createElement('td');if(value instanceof Node)cell.append(value);else cell.textContent=String(value??'—');line.append(cell)}body.append(line)}table.append(head,body);return table}

function renderRegistries(){
 const driverRoot=el('driver-list'),expenseRoot=el('expense-list');if(!driverRoot||!expenseRoot)return;
 el('driver-new').hidden=!canWrite();el('driver-new').onclick=()=>openWrite('driver');el('expense-new').hidden=!canWrite();el('expense-new').onclick=()=>openWrite('expense');
 const query=(el('driver-search').value||'').trim().toLocaleLowerCase('pt-BR'),status=el('driver-status').value;
 const selected=drivers.filter(driver=>(status==='all'||(status==='active'?driver.active:!driver.active))&&(!query||[driver.name,driver.cnh_category].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(query))));driverRoot.replaceChildren();
 if(driversState)driverRoot.textContent='Não foi possível consultar os motoristas. Atualize para tentar novamente.';
 else{const rows=selected.map(driver=>{const actions=document.createElement('div');actions.className='xrm-doc-actions';
const detail=document.createElement('button');detail.type='button';detail.className='fleet-button';
detail.textContent='Detalhes';detail.onclick=()=>openDriverDetails(driver.id);actions.append(detail);
if(canWrite()){
 const edit=document.createElement('button');edit.type='button';edit.className='fleet-button';
 edit.textContent='Editar';edit.onclick=()=>openWrite('driver',driver);actions.append(edit);
 const docs=document.createElement('button');docs.type='button';docs.className='fleet-button';
 docs.textContent='Documentos';docs.onclick=()=>documentCenter?.openRecord('driver',driver);actions.append(docs);
}
const plates=vehicles.filter(vehicle=>vehicle.driver_id===driver.id).map(vehicle=>vehicle.plate).join(', ');
return [driver.name,driver.cnh_category||'—',formatRegistryDate(driver.cnh_expires_on),driver.active?'Ativo':'Inativo',plates||'Sem veículo vinculado',actions]});driverRoot.append(registryTable(['Motorista','Categoria CNH','Validade CNH','Situação','Veículos','Ação'],rows));if(!rows.length){const empty=document.createElement('p');empty.className='fleet-workspace-note';empty.textContent='Nenhum motorista corresponde aos filtros.';driverRoot.append(empty)}}put('driver-count',selected.length+' de '+drivers.length+' motoristas exibidos.');
 const month=el('expense-month');if(!month.value)month.value=localDay(new Date()).slice(0,7);const search=(el('expense-search').value||'').trim().toLocaleLowerCase('pt-BR'),category=el('expense-category').value,payment=el('expense-status').value,today=localDay(new Date());
 const expenses=vehicleExpenses.filter(expense=>(!filteredVehicleIds||filteredVehicleIds.has(expense.vehicle_id))&&(!month.value||String(expense.expense_date).startsWith(month.value))&&(!category||expense.category===category)&&(!search||[expense.plate,expense.description].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(search)))&&(payment==='all'||(payment==='paid'?!!expense.paid_on:payment==='open'?!expense.paid_on:!expense.paid_on&&expense.due_date&&expense.due_date<today)));
 expenseRoot.replaceChildren();if(expensesState){expenseRoot.textContent='Não foi possível consultar as despesas. Atualize para tentar novamente.';put('expense-summary','');}
 else{const rows=expenses.map(expense=>{const actions=document.createElement('div');const detail=document.createElement('button');detail.type='button';detail.className='fleet-button';detail.textContent='Detalhes';detail.onclick=()=>openExpenseDetails(expense.id);actions.append(detail);if(canWrite()&&!expense.paid_on){const pay=document.createElement('button');pay.type='button';pay.className='fleet-button';pay.textContent='Pagar';pay.onclick=()=>openWrite('expense',{...expense,paid_on:today});actions.append(pay)}return [expense.plate||vehicles.find(vehicle=>vehicle.id===expense.vehicle_id)?.plate,expenseCategories[expense.category]||'Despesa',expense.description,formatRegistryDate(expense.expense_date),formatRegistryDate(expense.due_date),registryMoney(expense.amount),expense.paid_on?'Pago em '+formatRegistryDate(expense.paid_on):expense.due_date&&expense.due_date<today?'Vencida':'Em aberto',actions]});expenseRoot.append(registryTable(['Veículo','Tipo','Descrição','Data','Vencimento','Valor','Pagamento','Ações'],rows));if(!rows.length){const empty=document.createElement('p');empty.className='fleet-workspace-note';empty.textContent='Nenhuma despesa no mês e nos filtros selecionados.';expenseRoot.append(empty)}const sum=paid=>expenses.filter(expense=>!!expense.paid_on===paid).reduce((total,expense)=>total+Number(expense.amount),0);put('expense-summary',expenses.length+' despesas neste filtro · Em aberto: '+registryMoney(sum(false))+' · Pagas: '+registryMoney(sum(true)))}
 renderFilterSummary();
}

function appendExpenseAlerts(){if(expensesState)return;const today=localDay(new Date()),limit=new Date();limit.setDate(limit.getDate()+30);const until=localDay(limit);const items=vehicleExpenses.filter(expense=>!expense.paid_on&&expense.due_date&&expense.due_date<=until&&(!filteredVehicleIds||filteredVehicleIds.has(expense.vehicle_id))).sort((a,b)=>a.due_date.localeCompare(b.due_date));if(!items.length)return;
 const alerts=el('alerts-content'),preview=el('alert-preview');if(alerts&&!alerts.children.length)alerts.textContent='';if(preview&&!preview.children.length)preview.textContent='';for(const expense of items){const make=()=>{const button=document.createElement('button');button.type='button';button.className='fleet-ptran-entry';button.textContent=(expense.due_date<today?'VENCIDA: ':'PRÓXIMA: ')+(expense.plate||'Veículo')+' · '+(expenseCategories[expense.category]||'Despesa')+' · '+expense.description+' · '+formatRegistryDate(expense.due_date);button.onclick=()=>openExpenseDetails(expense.id);return button};alerts?.append(make());if(preview&&preview.children.length<6)preview.append(make())}
 const total=Number(el('nav-alert-count')?.textContent||0)+items.length;put('nav-alert-count',total);put('alerts-total',total);put('alert-preview-count',total);const value=el('fleet-kpis')?.querySelectorAll('.fleet-kpi-value')[2];if(value)value.textContent=total;
}
function appendDriverAlerts(){
 if(driversState)return;
 const today=localDay(new Date()),limit=new Date();limit.setDate(limit.getDate()+30);const until=localDay(limit);
 const scoped=['fleet-search','xrm-filter-category','xrm-filter-status','xrm-filter-expiry','xrm-contract-filter'].some(id=>Boolean(el(id)?.value));
 const items=drivers.filter(driver=>driver.active&&driver.cnh_expires_on&&driver.cnh_expires_on<=until&&(!scoped||vehicles.some(vehicle=>vehicle.driver_id===driver.id&&filteredVehicleIds?.has(vehicle.id)))).sort((a,b)=>a.cnh_expires_on.localeCompare(b.cnh_expires_on));
 if(!items.length)return;
 const alerts=el('alerts-content'),preview=el('alert-preview'),priority=document.createDocumentFragment();
 if(alerts&&!alerts.children.length)alerts.textContent='';if(preview&&!preview.children.length)preview.textContent='';
 for(const driver of items){const make=()=>{const button=document.createElement('button');button.type='button';button.className='fleet-ptran-entry';button.dataset.driverAlertId=driver.id;button.textContent=(driver.cnh_expires_on<today?'CNH VENCIDA: ':'CNH A VENCER: ')+driver.name+' · '+formatRegistryDate(driver.cnh_expires_on);button.onclick=()=>openDriverDetails(driver.id);return button};alerts?.append(make());priority.append(make())}
 if(preview){preview.prepend(priority);while(preview.children.length>6)preview.lastElementChild.remove()}
 const total=Number(el('nav-alert-count')?.textContent||0)+items.length;for(const id of ['nav-alert-count','alerts-total','alert-preview-count','tab-alert-count'])put(id,total);const value=el('fleet-kpis')?.querySelectorAll('.fleet-kpi-value')[2];if(value)value.textContent=total;
}
for(const id of ['driver-search','driver-status','expense-search','expense-category','expense-status','expense-month'])el(id)?.addEventListener(id.endsWith('search')?'input':'change',renderRegistries);
if(el('driver-clear'))el('driver-clear').onclick=()=>{el('driver-search').value='';el('driver-status').value='active';renderRegistries()};

function xrmDate(value){return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-')}
function xrmResolveRange(){
 const preset=el('xrm-report-period')?.value||'monthly';
 const anchor=new Date((el('xrm-report-anchor')?.value||xrmDate(new Date()))+'T12:00:00');
 const year=anchor.getFullYear(),month=anchor.getMonth(),day=anchor.getDate();
 let first,last;
 if(preset==='daily'){first=last=anchor}
 else if(preset==='fortnight'){first=new Date(year,month,day<=15?1:16);last=new Date(year,month,day<=15?15:new Date(year,month+1,0).getDate())}
 else if(preset==='monthly'){first=new Date(year,month,1);last=new Date(year,month+1,0)}
 else if(preset==='quarterly'){const m=Math.floor(month/3)*3;first=new Date(year,m,1);last=new Date(year,m+3,0)}
 else if(preset==='semiannual'){const m=month<6?0:6;first=new Date(year,m,1);last=new Date(year,m+6,0)}
 else return {from:el('xrm-report-from').value,to:el('xrm-report-to').value};
 return {from:xrmDate(first),to:xrmDate(last)};
}
function xrmSyncReportDates(){const range=xrmResolveRange(),custom=el('xrm-report-period').value==='custom';for(const [id,value] of [['xrm-report-from',range.from],['xrm-report-to',range.to]]){const node=el(id);if(!custom)node.value=value;node.readOnly=!custom}put('xrm-report-range-label',range.from+' a '+range.to)}
async function xrmApplyReportRange(){
 if(!company)return;const {from,to}=xrmResolveRange();if(!from||!to||from>to){msg('Selecione um período válido.');return}
 const id=company.id,request=++financeRequest;xrmReportRange={from,to};financialState='loading';renderContractFinance(vehicles.filter(v=>!filteredVehicleIds||filteredVehicleIds.has(v.id)));
 try{const data=await rpc('cost_report',{cid:id,from_date:from,to_date:to,vid:null});if(company?.id!==id||request!==financeRequest)return;fuelEntries=data?.fuel||[];maintenanceExpenses=data?.maintenance||[];paidExpenses=data?.expenses||[];financialState='';applyVehicleFilters()}catch(error){if(request!==financeRequest)return;financialState='error';applyVehicleFilters();msg('Não foi possível consultar o período: '+error.message)}
}
if(el('xrm-report-anchor'))el('xrm-report-anchor').value=xrmDate(new Date());
for(const id of ['xrm-report-period','xrm-report-anchor'])el(id)?.addEventListener('change',xrmSyncReportDates);
el('xrm-report-apply')?.addEventListener('click',()=>void xrmApplyReportRange());
xrmSyncReportDates();
/* Finance exports use the same currently loaded, company-scoped records as the report cards. */
function xrmFinancialExportRows(){
 const ids=new Set(vehicles.filter(v=>!filteredVehicleIds||filteredVehicleIds.has(v.id)).map(v=>v.id));
 const plate=id=>vehicles.find(v=>v.id===id)?.plate||'Veículo';
 return [
  ...fuelEntries.filter(x=>ids.has(x.vehicle_id)).map(x=>[x.fueled_on||x.date||'',plate(x.vehicle_id),'Combustível','Abastecimento'+(x.station?' - '+x.station:'')+(litersMissing(x)?' · LITROS NÃO INFORMADOS (declaração do usuário em '+(x.liters_declined_at?new Date(x.liters_declined_at).toLocaleString('pt-BR'):'data não informada')+(x.liters_declined_email?' por '+x.liters_declined_email:'')+')':''),Number(x.cost??x.total_cost??0)]),
  ...maintenanceExpenses.filter(x=>ids.has(x.vehicle_id)).map(x=>[x.completed_at||x.date||'',plate(x.vehicle_id),'Manutenção realizada',x.title||'Manutenção',Number(x.actual_cost||0)]),
  ...paidExpenses.filter(x=>ids.has(x.vehicle_id)).map(x=>[x.paid_on||x.date||'',plate(x.vehicle_id),'Despesa paga',(expenseCategories[x.category]||'Despesa')+' - '+(x.description||''),Number(x.amount||0)])
 ].sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
}
if(el('financial-export-csv'))el('financial-export-csv').onclick=()=>{
 if(financialState){msg('Relatório indisponível: consulte os dados do período novamente.');return}
 const rows=xrmFinancialExportRows(),month=xrmReportRange?xrmReportRange.from+'_'+xrmReportRange.to:el('fuel-ranking-month')?.value||'periodo';
 const escapeCsv=value=>'"'+String(value??'').replaceAll('"','""')+'"';
 const data=[['Data','Veículo','Tipo','Descrição','Valor (R$)'],...rows].map(row=>row.map(escapeCsv).join(';')).join('\r\n');
 const blob=new Blob(['\uFEFF'+data],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='xrmovi-financeiro-'+month+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
if(el('financial-print'))el('financial-print').onclick=async()=>{
 if(financialState){msg('Consulte os dados financeiros antes de imprimir.');return}
 const records=xrmFinancialExportRows(),money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const safe=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const sum=kind=>records.filter(r=>!kind||r[2]===kind).reduce((acc,r)=>acc+Number(r[4]||0),0);
 const range=xrmReportRange?xrmReportRange.from+' a '+xrmReportRange.to:el('fuel-ranking-month')?.value||'Mês atual';
 const rows=records.map(r=>'<tr>'+r.map((v,i)=>'<td'+(i===4?' class="value"':'')+'>'+safe(i===4?money(v):v)+'</td>').join('')+'</tr>').join('');
 let brandImage='';
 try{
  const pdfBrand=await branding?.forPdf();
  if(pdfBrand?.companyId===company?.id&&pdfBrand.logoDataUrl?.startsWith('data:image/png;base64,')){
   brandImage='<img class="report-company-logo" alt="Logo da empresa" src="'+pdfBrand.logoDataUrl+'">';
  }
 }catch(error){msg('Não foi possível carregar a logo da empresa; o relatório será impresso sem imagem.')}

 const markup='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório financeiro XRMOVI</title><style>@page{size:A4 landscape;margin:15mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#1b3042;margin:0;background:white}h1{font-size:21px;margin:0 0 7px}header{border-bottom:2px solid #177c91;padding-bottom:13px;margin-bottom:16px;display:flex;gap:14px;align-items:center;min-height:76px}.report-company-logo{width:65px;height:65px;object-fit:contain;border-radius:8px;flex:none}.report-company-heading{flex:1;min-width:0}.muted{color:#567084;font-size:11px}.totals{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 19px}.total{border:1px solid #c8d7dd;padding:12px;border-radius:6px}.total strong{display:block;font-size:15px;margin-top:6px;color:#126e7d}table{width:100%;border-collapse:collapse;table-layout:fixed}th{text-align:left;background:#e5eff2;color:#17374b;font-size:10px;text-transform:uppercase}td,th{padding:8px 7px;border-bottom:1px solid #d6e0e5;overflow-wrap:anywhere}tr{break-inside:avoid}thead{display:table-header-group}.value{text-align:right;white-space:nowrap}td:nth-child(1){width:12%}td:nth-child(2){width:13%}td:nth-child(3){width:17%}td:nth-child(5){width:15%}.footer{border-top:1px solid #d6e0e5;margin-top:20px;padding-top:8px;font-size:10px;color:#567084}</style></head><body><header>'+brandImage+'<div class="report-company-heading"><h1>Relatório financeiro da frota</h1><div class="muted">XRMOVI | Empresa: '+safe(company?.name||'')+' | Período: '+safe(range)+' | Veículos filtrados: '+(filteredVehicleIds?.size??vehicles.length)+' | Emitido em '+safe(new Date().toLocaleString('pt-BR'))+'</div></div></header><div class="totals">'+[['Total',sum()],['Combustível',sum('Combustível')],['Manutenção realizada',sum('Manutenção realizada')],['Despesas pagas',sum('Despesa paga')]].map(([label,value])=>'<div class="total">'+safe(label)+'<strong>'+safe(money(value))+'</strong></div>').join('')+'</div><table><thead><tr><th>Data</th><th>Veículo</th><th>Tipo</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>'+rows+'</tbody></table><div class="footer">'+records.length+' lançamento(s) · Valores em reais (R$)</div></body></html>';
 const popup=window.open('','_blank');if(!popup){msg('Permita a abertura de pop-ups para imprimir o relatório.');return}popup.document.open();popup.document.write(markup);popup.document.close();popup.focus();popup.setTimeout(()=>popup.print(),350);
};


// Financial PDF mode with private receipts, grouped by vehicle.
if(el('financial-print-evidence'))el('financial-print-evidence').onclick=async()=>{
 if(financialState||!company||paymentRequired){
  msg('Consulte os dados financeiros e confirme seu acesso antes de gerar o PDF.');
  return;
 }
 const button=el('financial-print-evidence'), status=el('financial-print-status');
 const selectedCompany=company,selectedCompanyId=company.id;
 const scopeIds=filteredVehicleIds?new Set(filteredVehicleIds):null;
 const rows=xrmFinancialExportRows();
 const range=xrmReportRange?xrmReportRange.from+' a '+xrmReportRange.to:
  el('fuel-ranking-month')?.value||'Mês atual';
 button.disabled=true;
 if(status)status.textContent='Iniciando geração do relatório com comprovantes...';
 try{
  const result=await printFuelEvidenceReport({
   client:sb,
   company:{id:selectedCompanyId,name:selectedCompany.name||''},
   vehicles:vehicles.map(v=>({id:v.id,plate:v.plate,model:v.model||''})),
   fuelEntries:fuelEntries.map(f=>({...f})),
   rows,range,scopeIds,
   stillCurrent:()=>company?.id===selectedCompanyId&&!paymentRequired,
   getLogo:async()=>{
    const pdfBrand=await branding?.forPdf();
    return pdfBrand?.companyId===selectedCompanyId?pdfBrand.logoDataUrl||'':'';
   },
   onProgress:text=>{if(status&&company?.id===selectedCompanyId)status.textContent=text;}
  });
  if(status&&company?.id===selectedCompanyId){
   status.textContent='Impressão preparada: '+result.vehicles+' veículo(s), '+
    result.receipts+' comprovante(s) carregado(s). Selecione “Salvar como PDF”.';
  }
 }catch(error){
  if(company?.id===selectedCompanyId){
   const explanation='Não foi possível gerar o PDF com comprovantes: '+(error?.message||'Erro desconhecido');
   if(status)status.textContent=explanation;
   msg(explanation);
  }
 }finally{button.disabled=false;}
};

/* XRMOVI V4 read-only assistant bridge. Same authenticated data and RPC as the current screen. */
const xrmAssistantBridge=Object.freeze({
 snapshot(){
  if(!company||paymentRequired)return null;
  const currentId=company.id;
  const scopeIds=new Set(vehicles.filter(v=>!filteredVehicleIds||filteredVehicleIds.has(v.id)).map(v=>v.id));
  const vehiclesInView=vehicles.filter(v=>scopeIds.has(v.id)).map(v=>({
   id:v.id,plate:v.plate,model:v.model||'',category:v.category||'',status:v.status||'',
   odometer:Number(v.odometer_value||0),contractId:v.contract_id||null
  }));
  const scoped=(items)=>items.filter(x=>scopeIds.has(x.vehicle_id));
  const month=el('fuel-ranking-month')?.value||localDay(new Date()).slice(0,7);
  const range=xrmReportRange?.from&&xrmReportRange?.to
   ?{from:xrmReportRange.from,to:xrmReportRange.to}
   :{from:month+'-01',to:localDay(new Date())};
  return {
   companyId:currentId,companyName:company.name,role:company.role,view:currentView(),
   contractId:el('xrm-contract-filter')?.value||null,
   contractName:el('xrm-contract-filter')?.selectedOptions?.[0]?.textContent||'Todos',
   filters:(el('active-filter-summary')?.textContent||'').trim().slice(0,300),
   financialReady:!financialState,financialPeriod:range,
   activeForm:!v3Overlay.hidden?{kind:v3Editing?.kind||'formulário',vehicleId:v3Editing?.record?.vehicle_id||null}:null,
   validationNotice:(el('v3-edit-feedback')?.textContent||el('page-notice')?.textContent||'').trim().slice(0,220),
   financialNote:financialState?'Dados financeiros não carregados.':'Valores registrados no período consultado (sem estimar lançamentos ausentes).',
   contracts:contracts.map(c=>({id:c.id,name:c.name||'Contrato sem nome'})),
   vehicles:vehiclesInView,
   maintenance:scoped(maintenance).map(m=>({
     id:m.id,vehicleId:m.vehicle_id,title:m.title||'',status:m.status,
     dueDate:m.due_date||null,dueMeter:m.due_meter==null?null:Number(m.due_meter),
     alert:alertKind(m),estimatedCost:m.estimated_cost,actualCost:m.actual_cost
   })),
   fuel:scoped(fuelEntries).map(x=>({
     id:x.id||null,vehicleId:x.vehicle_id,amount:x.cost??x.total_cost??null,
     liters:x.liters??null,fuelType:x.fuel_type||x.fuel||null,date:x.fueled_on||x.date||null
   })),
   maintenanceCosts:scoped(maintenanceExpenses).map(x=>({
     vehicleId:x.vehicle_id,amount:x.actual_cost??null,date:x.completed_at||x.date||null
   })),
   expenses:scoped(vehicleExpenses).map(x=>({
     vehicleId:x.vehicle_id,description:x.description||'',category:x.category||'',amount:x.amount??null,
     dueDate:x.due_date||null,paidOn:x.paid_on||null,expenseDate:x.expense_date||null
   })),
   paidExpenses:scoped(paidExpenses).map(x=>({
     vehicleId:x.vehicle_id,amount:x.amount??null,date:x.paid_on||x.date||null
   }))
  };
 },
 async financePeriod({from,to,requestedCompanyId}){
  if(!company||paymentRequired||requestedCompanyId!==company.id)throw Error('Empresa alterada. Repita a consulta.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)throw Error('Período inválido.');
  // Bound the query; do not allow free-form SQL, clients or other company identifiers.
  const windowDays=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
  if(!Number.isFinite(windowDays)||windowDays>366)throw Error('O intervalo máximo é de 367 dias.');
  const cid=company.id;
  const startingContract=el('xrm-contract-filter')?.value||'';
  const startingFilters=(el('active-filter-summary')?.textContent||'').trim();
  const ids=new Set(vehicles.filter(v=>!filteredVehicleIds||filteredVehicleIds.has(v.id)).map(v=>v.id));
  const data=await rpc('cost_report',{cid,from_date:from,to_date:to,vid:null});
  if(!company||paymentRequired||company.id!==cid)throw Error('Empresa mudou durante a consulta.');
  if((el('xrm-contract-filter')?.value||'')!==startingContract||(el('active-filter-summary')?.textContent||'').trim()!==startingFilters)throw Error('Os filtros mudaram durante a consulta. Repita a pergunta.');
  const subset=(a)=>Array.isArray(a)?a.filter(r=>ids.has(r.vehicle_id)):[];
  return {from,to,companyId:cid,contractId:el('xrm-contract-filter')?.value||null,
    fuel:subset(data?.fuel).map(r=>({vehicleId:r.vehicle_id,amount:r.cost??r.total_cost??null,
      fuelType:r.fuel_type||r.fuel||null,liters:r.liters??null,date:r.fueled_on||r.date||null})),
    maintenanceCosts:subset(data?.maintenance).map(r=>({vehicleId:r.vehicle_id,amount:r.actual_cost??null,date:r.completed_at||r.date||null})),
    paidExpenses:subset(data?.expenses).map(r=>({vehicleId:r.vehicle_id,amount:r.amount??null,date:r.paid_on||r.date||null}))};
 },
 async mileageHistory({vehicleId}={}){
  if(!company||paymentRequired)throw Error('Acesso indisponível.');
  if(!vehicles.some(v=>v.id===vehicleId&&(!filteredVehicleIds||filteredVehicleIds.has(v.id))))
    throw Error('Veículo fora da empresa ou dos filtros autorizados.');
  const cid=company.id;
  const records=await rpc('mileage_readings',{cid,vid:vehicleId});
  if(company?.id!==cid||paymentRequired)throw Error('Empresa alterada. Repita a consulta.');
  return (Array.isArray(records)?records:[]).slice(0,15).map(r=>({
   submittedAt:r.submitted_at||null,status:r.status||'',source:r.source||'',
   meter:r.meter??null,appliedMeter:r.applied_meter??null,
   submitter:r.submitter_email||r.driver_name||null,
   reviewer:r.reviewer_email||null,reviewedAt:r.reviewed_at||null,
   reason:r.review_note||r.reason||null
  }));
 },
 navigate({view:target,filter,value}={}){
  if(!company||paymentRequired)return {ok:false,message:'Acesso operacional indisponível para esta conta.'};
  if(!viewLabels[target])return {ok:false,message:'Esta tela não existe no painel.'};
  if(filter==='status'){
   if(!['Ativo','Manutenção','Inativo',''].includes(value))return {ok:false,message:'Situação inválida.'};
   el('xrm-filter-status').value=value;applyVehicleFilters();
  }else if(filter==='category'){
   const options=[...el('xrm-filter-category').options];
   const found=options.find(o=>o.value.toLowerCase()===String(value||'').toLowerCase());
   if(!found)return {ok:false,message:'Categoria indisponível nesta frota.'};
   el('xrm-filter-category').value=found.value;applyVehicleFilters();
  }else if(filter==='plate'){
   const needle=String(value||'').trim().toUpperCase();
   if(needle.length<3||needle.length>30||!/^[A-Z0-9 -]+$/.test(needle))return {ok:false,message:'Informe uma placa ou identificação válida.'};
   el('fleet-search').value=needle;applyVehicleFilters();
  }else if(filter)return {ok:false,message:'Filtro não autorizado.'};
  page(target);
  return {ok:true,message:'Abri '+viewLabels[target]+(filter?' e apliquei o filtro solicitado.':'.')};
 },
 openForm({kind}={}){
  if(!company||paymentRequired)return {ok:false,message:'Acesso indisponível.'};
  if(!canWrite())return {ok:false,message:'Somente proprietário ou gestor pode abrir este formulário.'};
  if(!['vehicle','maintenance','fuel','driver','expense'].includes(kind))return {ok:false,message:'Formulário indisponível.'};
  page(kind==='vehicle'?'assets':kind==='driver'?'drivers':kind==='fuel'?'fuel':'maintenance');
  openWrite(kind);
  return {ok:true,message:'Abri o formulário de '+({vehicle:'veículo',maintenance:'manutenção',fuel:'abastecimento',driver:'motorista',expense:'despesa'}[kind])+'. Preencha e confirme os dados manualmente.'};
 },
 showMaintenance({id}={}){
  if(!company||paymentRequired)return {ok:false,message:'Acesso indisponível.'};
  const task=maintenance.find(m=>m.id===id && (!filteredVehicleIds||filteredVehicleIds.has(m.vehicle_id)));
  if(!task)return {ok:false,message:'Manutenção não encontrada nos filtros atuais.'};
  openMaintenanceDetails(task.id);
  return {ok:true,message:'Abri os detalhes da manutenção.'};
 },
 selectVehicle({plate}={}){
  if(!company||paymentRequired)return {ok:false,message:'Acesso indisponível.'};
  const query=String(plate||'').trim().toUpperCase();
  const matches=vehicles.filter(v=>v.plate?.toUpperCase()===query);
  if(matches.length!==1)return {ok:false,message:matches.length?'Há mais de um veículo com essa identificação.':'Não encontrei essa placa nesta empresa.'};
  el('fleet-search').value=query;applyVehicleFilters();page('assets');
  return {ok:true,vehicleId:matches[0].id,message:'Localizei '+matches[0].plate+' em Ativos / Veículos. Se tiver permissão, use Editar para consultar o cadastro.'};
 }
});
Object.defineProperty(window,'XrmoviAssistantTools',{value:xrmAssistantBridge,configurable:false,writable:false});

/* Initialize only after all module lexical state exists. */
async function startXrmovi(){
 try{
  page(location.hash.slice(1)||'dashboard',false);
  window.lucide?.createIcons?.();
  const response=await fetch('./config.json',{cache:'no-store'});
  if(!response.ok)throw Error('Não foi possível carregar a configuração do painel.');
  const config=await response.json();
  if(!config?.supabaseUrl||!config?.supabaseAnonKey)throw Error('Configuração do Supabase incompleta.');
  sb=createClient(config.supabaseUrl,config.supabaseAnonKey);
  branding=createCompanyBranding({
   client:sb,getCompany:()=>company,
   onSave:(id,data)=>{
    const record=companies.find(c=>c.id===id);
    if(!record||!data)return;
    if('logo_path' in data){record.logo_path=data.logo_path;record.logo_url=data.logo_url;}
    if(typeof data.name==='string'&&record.name!==data.name){
     record.name=data.name;
     for(const selector of [el('v3-company'),el('v3-company-mobile')]){
      const option=Array.from(selector?.options||[]).find(item=>item.value===id);
      if(option)option.textContent=data.name;
     }
     void subscriptionPanel?.refresh();
    }
   }
  });
  window.XrmoviCompanyBranding=Object.freeze({forPdf:()=>branding.forPdf()});
  mileage=setupMileage({
   client:sb,getCompany:()=>company,getVehicles:()=>vehicles,getFilteredIds:()=>filteredVehicleIds,
   onReload:()=>load(),canWrite:()=>canWrite(),
   onEditVehicle:vid=>{const record=vehicles.find(v=>v.id===vid);if(record)openWrite('vehicle',record)}
  });
  setupVehicleExport({
   getCompany:()=>company,getVehicles:()=>vehicles,getContracts:()=>contracts,notify:msg
  });
  await init();
 }catch(error){showLoadFailure(error)}
}
void startXrmovi();
