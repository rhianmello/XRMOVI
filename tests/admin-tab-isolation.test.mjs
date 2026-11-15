import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const position=id=>ui.indexOf('id="'+id+'"');

test('Visão executiva owns the KPI cards and service diagnostics',()=>{
 const overview=position('view-overview');
 const customers=position('view-customers');
 assert.ok(overview>=0&&customers>overview);
 for(const id of ['k-online','k-accounts','k-paid','xrm-billing-health','xrm-billing-setup','xrm-mail-health','xrm-mail-setup','portfolio-breakdown','revenue-chart']){
  assert.ok(position(id)>overview&&position(id)<customers,id+' must appear only in the overview');
  assert.equal(ui.split('id="'+id+'"').length-1,1,id+' should have a unique ID');
 }
 assert.match(ui, /<div id="view-overview" class="tab-view">/);
 assert.match(ui,/document\.querySelectorAll\('\.tab-view'\)\.forEach\(view=>view\.hidden=view\.id!=='view-'\+name\)/);
});

test('Clientes displays its own search, controls, table and dedicated presence column',()=>{
 const from=position('view-customers'),to=position('view-signups');
 assert.ok(from>=0&&to>from);
 const section=ui.slice(from,to);
 for(const id of ['customer-search','commercial-filter-notice','commercial-filter-label','commercial-filter-toggle','customers-body'])assert.ok(section.includes('id="'+id+'"'),id);
 assert.match(section, /<th>Cliente \/ empresas<\/th><th>Plano<\/th>/);
 assert.match(section,/class="table-wrap customer-table-wrap"/);
 assert.doesNotMatch(section,/id="k-online"|id="xrm-billing-health"|id="xrm-mail-health"/);
 assert.match(ui,/identity\.append\(bold,makePresenceBadge\(c\.owner_id\)\)/);
 assert.match(ui,/emptyRows\(root,7,message\)/);
 assert.match(ui,/Nenhuma conta externa visível\. Clique em "Mostrar internos e testes" para visualizar as contas classificadas como internas\./);
 assert.match(ui,/Nenhuma conta corresponde à pesquisa\. Limpe a busca ou revise os filtros\./);
 assert.match(ui,/identity\.append\(node\('span',u\.email\),makePresenceBadge\(u\.id\)\)/);
 assert.doesNotMatch(section,/<th>Presença<\/th>/);
});

test('Payments keeps its own commercial toggle and presence uses existing owner-only mechanism',()=>{
 const start=position('view-payments'),end=position('view-requests');
 const section=ui.slice(start,end);
 assert.ok(section.includes('id="commercial-filter-toggle-payments"'));
 assert.match(ui,/el\('commercial-filter-toggle'\)\.onclick=\(\)=>\{/);
 assert.match(ui,/el\('commercial-filter-toggle-payments'\)\.onclick=\(\)=>\{showTestAccounts=!showTestAccounts;render\(\)\}/);
 assert.match(ui,/let showCustomerTests=true;/);
 assert.match(ui,/let showTestAccounts=false;/);
 assert.match(ui,/rpc\('admin_presence_list'\)/);
 assert.match(ui,/function updatePresenceBadge\(badge\)/);
 assert.match(ui,/if\(name!==tab\)status\(''\)/);
});

test('mobile retains horizontal client table access and responsive filter controls',()=>{
 assert.match(ui,/\.customer-table-wrap\{[^}]*overflow-x:auto/);
 assert.match(ui,/\.customers-table\{min-width:930px/);
 assert.match(ui,/\.customer-identity-line\{display:flex;align-items:center;gap:7px;flex-wrap:wrap/);
 assert.match(ui,/@media\(max-width:620px\)\{\.xrm-admin-page \.customer-filter-bar/);
});

test('menu Clientes inclui contagem online/offline sem repetir usuários',()=>{
 assert.match(ui,/data-tab="customers"[^>]*title="Clientes"/);
 for(const id of ['customers-presence-summary','customers-presence-online','customers-presence-offline'])assert.ok(position(id)>=0,id);
 assert.match(ui,/function updatePresenceBadges\(\)\{[\s\S]*?updateCustomerNavPresence\(\)/);
 assert.match(ui,/function render\(\)\{\s*refreshFilterLabel\(\);\s*updateCustomerNavPresence\(\)/);
 assert.match(ui,/\.owner-layout\.is-collapsed \.owner-sidebar \.owner-nav-presence\{display:none\}/);
 const controller=ui.slice(ui.indexOf('function updateCustomerNavPresence(){'),ui.indexOf('async function loadAccountPresence(){'));
 assert.ok(controller.startsWith('function updateCustomerNavPresence(){'));
 function exercise(accounts,rows,loaded=true){
  const nodes={
   'customers-presence-online':{textContent:''},
   'customers-presence-offline':{textContent:''}
  };
  const classes=new Set();
  const button={classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)},title:''};
  const document={querySelector:selector=>selector==='.owner-sidebar [data-tab="customers"]'?button:null};
  const el=id=>nodes[id]||null;
  const customerAccounts=()=>accounts;
  const presenceByUser=new Map(rows);
  const go=Function('document','el','customerAccounts','presenceByUser','presenceLoaded',controller+'\nreturn updateCustomerNavPresence()');
  go(document,el,customerAccounts,presenceByUser,loaded);
  return {online:nodes['customers-presence-online'].textContent,offline:nodes['customers-presence-offline'].textContent,classes,title:button.title};
 }
 const now=new Date().toISOString();
 const online=exercise([{owner_id:'a'},{owner_id:'a'},{owner_id:'b'}],[['a',now]]);
 assert.equal(online.online,'1');
 assert.equal(online.offline,'1');
 assert.equal(online.classes.has('has-online'),true);
 const missing=exercise([{owner_id:'a'}],[],false);
 assert.equal(missing.online,'—');
 assert.equal(missing.offline,'—');
 assert.equal(missing.classes.has('has-online'),false);
 const offline=exercise([{owner_id:'a'}],[],true);
 assert.equal(offline.online,'0');
 assert.equal(offline.offline,'1');
 assert.equal(offline.classes.has('has-online'),false);
});

test('client rows include internal and homologation by default without changing commercial reporting',()=>{
 assert.match(ui,/let showCustomerTests=true;/);
 assert.match(ui,/function customerAccounts\(\)\{/);
 assert.match(ui,/const accounts=customerAccounts\(\)/);
 assert.match(ui,/const owners=new Set\(customerAccounts\(\)/);
 assert.match(ui,/const customerList=classifiedExternalAccounts\(\)/);
 assert.match(ui,/const payments=commercialPayments\(\)/);
 assert.match(ui,/function visiblePayments\(\)\{/);
 const scope=ui.slice(ui.indexOf('function customerAccounts(){'),ui.indexOf('function classifiedExternalAccounts(){'));
 assert.ok(scope.startsWith('function customerAccounts(){'));
 const classificationOf=a=>a.commercial_classification||'unclassified';
 const isOwnerAccount=a=>a.email==='owner@example.com';
 const info={accounts:[
  {email:'owner@example.com',owner_id:'owner',commercial_classification:'internal'},
  {email:'user1@example.com',owner_id:'1',commercial_classification:'internal'},
  {email:'user2@example.com',owner_id:'2',commercial_classification:'homologation'},
  {email:'user3@example.com',owner_id:'3',commercial_classification:'external'}
 ]};
 const getter=Function('info','showCustomerTests','isOwnerAccount','classificationOf',scope+'\nreturn customerAccounts()');
 const all=getter(info,true,isOwnerAccount,classificationOf);
 assert.equal(all.length,3,'all non-owner accounts appear by default, including internal and homologation');
 const external=getter(info,false,isOwnerAccount,classificationOf);
 assert.deepEqual(external.map(x=>x.owner_id),['3'],'button hides internal/homologation without changing classifications');
});

test('visible internal accounts also appear in recent registrations and messaging',()=>{
 assert.match(ui,/customerAccounts\(\)\.slice\(0,7\)\.forEach\(c=>recent\.append\(rowCustomer\(c\)\)\)/);
 assert.match(ui,/const ordered=\[\.\.\.customerAccounts\(\)\]\.sort/);
 assert.match(ui,/const a=customerAccounts\(\)\.find\(x=>x\.id===threadId\)/);
 assert.match(ui,/identity\.append\(bold,makePresenceBadge\(c\.owner_id\)\)/);
 assert.match(ui,/identity\.append\(node\('span',u\.email\),makePresenceBadge\(u\.id\)\)/);
});