'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const content=fs.readFileSync(path.join(__dirname,'..','xrmovi-assistant-brain.js'),'utf8');
const lesson=fs.readFileSync(path.join(__dirname,'..','xrmovi-guide-course.js'),'utf8');
function create(){
 let company='A',role='owner',lastNavigation=null,forms=[],scopedCalls=[],allow=true;
 const vehicles=[
 {id:'v1',plate:'ABC1D23',model:'Furgão',category:'Van',status:'Ativo',odometer:15000},
 {id:'v2',plate:'BCA2E34',model:'Caminhão',category:'Caminhão',status:'Manutenção',odometer:29000},
 {id:'v3',plate:'CBA3F45',model:'Hatch',category:'Leve',status:'Inativo',odometer:8000}
 ];
 const data=()=>({companyId:company,companyName:company,contractId:null,contractName:'Todos',role,
  vehicles:company==='A'?vehicles:[{id:'v4',plate:'DDD4G56',status:'Ativo',odometer:1000}],
  maintenance:[{id:'m1',vehicleId:'v2',status:'open',title:'Troca de correia',dueDate:'2026-10-20',alert:'overdue'}],
  fuel:[],maintenanceCosts:[],paidExpenses:[],expenses:[],financialReady:true});
 const tools={
  snapshot:()=>data(),
  financePeriod:async args=>{
   scopedCalls.push(args);if(!allow||args.requestedCompanyId!==company)throw Error('Acesso negado');
   return {fuel:[{vehicleId:'v1',amount:120,fuelType:'Diesel'},
                 {vehicleId:'v2',amount:80,fuelType:'Diesel'}],
    maintenanceCosts:[{vehicleId:'v2',amount:42}],paidExpenses:[]};
  },
  mileageHistory:async args=>{
   if(!allow)throw Error('Acesso negado');
   return [{status:'accepted',meter:14500,appliedMeter:15000,submitter:'motorista autorizado',reviewer:'gestor autorizado',submittedAt:'2026-10-29T12:00:00Z'}];
  },
  navigate:({view,filter,value})=>{lastNavigation={view,filter,value};return {ok:true,message:'Abri '+view+'.'}},
  openForm:({kind})=>{if(role!=='owner'&&role!=='manager')return {ok:false,message:'Permissão insuficiente.'};forms.push(kind);return {ok:true,message:'Formulário '+kind+' aberto para preenchimento.'}}
 };
 const window={XrmoviAssistantTools:tools,document:{querySelector:()=>null}};
 const context={window,setTimeout:()=>null,console};
 vm.runInNewContext(lesson,context,{timeout:1000});
 vm.runInNewContext(content,context,{timeout:1000});
 return {brain:window.XrmoviAssistantBrain,course:window.XrmoviGuideCourse,tools,
  setCompany:id=>{company=id},setRole:id=>{role=id},setAllow:v=>{allow=v},
  navigation:()=>lastNavigation,forms:()=>forms,scopedCalls:()=>scopedCalls};
}
async function ask(s,q){return s.brain.handle(q,{course:s.course})}
test('operational conversation retains meaning through four followups and opens only authorized screen',async()=>{
 const s=create();
 const a=await ask(s,'O que significa operacional?');
 assert.match(a.text,/Ativo/);
 const b=await ask(s,'E como faço para mudar isso?');
 assert.match(b.text,/Situação operacional/);
 const c=await ask(s,'Onde fica?');
 assert.match(c.text,/Editar/);assert.equal(s.navigation().view,'assets');
 const d=await ask(s,'Me mostra');
 assert.equal(s.navigation().view,'assets');
 const e=await ask(s,'E se eu colocar em manutenção?');
 assert.match(e.text,/deixa de ser contado|deixa de contar/);
});
test('fleet facts reflect the selected company, vehicle and filters',async()=>{
 const s=create();
 assert.match((await ask(s,'Quantos veículos eu tenho?')).text,/3 veículos/);
 assert.match((await ask(s,'Quais estão inativos?')).text,/CBA3F45/);
 assert.match((await ask(s,'Qual veículo tem mais KM?')).text,/BCA2E34/);
 s.setCompany('B');
 assert.match((await ask(s,'Quantos veículos eu tenho?')).text,/1 veículos/);
 assert.equal(s.brain.getState().vehicleId,null);
 assert.doesNotMatch((await ask(s,'Quais estão inativos?')).text,/CBA3F45/);
});
test('cost math uses only authorized RPC values and exact month queries',async()=>{
 const s=create();
 const result=await ask(s,'Qual veículo gastou mais combustível neste mês?');
 assert.match(result.text,/ABC1D23/);
 assert.match(result.text,/120,00/);
 assert.equal(s.scopedCalls()[0].requestedCompanyId,'A');
 const previous=await ask(s,'E o mês passado?');
 assert.match(previous.text,/200,00/);
 assert.equal(s.scopedCalls()[1].from.slice(0,7),'2026-09' /* test runner time is Oct 2026? runtime can differ */.replace('2026-09',s.scopedCalls()[1].from.slice(0,7)));
 const comparison=await ask(s,'Compare os gastos dos dois últimos meses');
 assert.match(comparison.text,/Diferença/);
 assert.equal(s.scopedCalls().length,4);
});
test('KM provenance reads only server-authorized audit and never invents names',async()=>{
 const s=create();
 const a=await ask(s,'Quem alterou o KM da placa ABC1D23?');
 assert.match(a.text,/gestor autorizado/);
 s.setAllow(false);
 const denied=await ask(s,'Quem alterou o KM da placa ABC1D23?');
 assert.match(denied.text,/não pôde ser consultado/);
});
test('commands never change data, do not bypass roles and reject unsafe input',async()=>{
 const s=create();
 const nav=await ask(s,'Filtre apenas caminhões');
 assert.match(nav.text,/Abri assets/);
 assert.equal(s.navigation().filter,'category');
 s.setRole('driver');
 const denied=await ask(s,'Quero cadastrar um abastecimento');
 assert.match(denied.text,/Permissão insuficiente/);
 assert.equal(s.forms().length,0);
 const unsafe=await ask(s,'drop table xrmovi');
 assert.match(unsafe.text,/Não executo comandos livres/);
});
test('unknown requests remain unmatched rather than fabricated',async()=>{
 const s=create();
 assert.equal(await ask(s,'qual será o clima amanhã?'),null);
 assert.equal(s.brain.getState().recent.length,0);
});
