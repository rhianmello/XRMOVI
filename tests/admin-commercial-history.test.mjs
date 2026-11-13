import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261113175000_xrmovi_commercial_label_history_rpc.sql',import.meta.url),'utf8');

test('history RPC only reads audit and protects it with a platform-admin guard',()=>{
 assert.match(sql,/create or replace function public\.xrmovi_admin_commercial_label_history/);
 assert.match(sql,/caller uuid := \(select auth\.uid\(\)\)/);
 assert.match(sql,/from xrmovi\.platform_admins pa where pa\.user_id = caller/);
 assert.match(sql,/errcode = '42501'/);
 assert.match(sql,/from xrmovi\.account_commercial_label_audit/);
 assert.match(sql,/join auth\.users actor_user on actor_user\.id = h\.actor_id/);
 assert.match(sql,/least\(greatest\(coalesce\(p_limit, 100\), 1\), 200\)/);
 assert.match(sql,/revoke all on function public\.xrmovi_admin_commercial_label_history\(uuid, integer\)/);
 assert.doesNotMatch(sql,/\b(?:update|delete from|truncate|insert into)\s+xrmovi\./i);
});
test('history UI is read-only, searchable and renders reason with textContent',()=>{
 for(const id of ['commercial-history-body','commercial-history-search'])assert.match(ui,new RegExp('id="'+id+'"'));
 for(const name of ['previous_classification','classification','account_email','actor_email','reason','changed_at'])assert.ok(ui.includes('entry.'+name),name);
 assert.match(ui,/rpc\('admin_commercial_label_history',\{p_account:null,p_limit:100\}\)/);
 assert.match(ui,/el\('commercial-history-search'\)\.oninput=renderCommercialHistory/);
 const fn=ui.slice(ui.indexOf('function renderCommercialHistory(){'),ui.indexOf('function renderSignups(){'));
 assert.ok(fn.startsWith('function renderCommercialHistory(){'));
 assert.match(fn,/cell\(tr,entry\.reason\|\|'—'\)/);
 assert.doesNotMatch(fn,/innerHTML|insertAdjacentHTML/);
});
function renderFixture(history,search=''){
 const fn=ui.slice(ui.indexOf('function renderCommercialHistory(){'),ui.indexOf('function renderSignups(){'));
 const lines=[
  "const classes={external:'Cliente externo',internal:'Interno',homologation:'Homologação',unclassified:'A classificar'};",
  'const info={commercialHistory:history};',
  'const root={children:[],replaceChildren(){this.children=[]},append(x){this.children.push(x)}};',
  "const el=id=>id==='commercial-history-body'?root:{value:search};",
  "const node=(type,value='')=>({type,textContent:value,children:[],append(child){this.children.push(child)}});",
  'const cell=(tr,value)=>tr.append({textContent:value});',
  'const emptyRows=(parent,cols,message)=>parent.append({children:[{textContent:message}]});',
  fn,
  'renderCommercialHistory();',
  'return root.children.map(row=>row.children.map(col=>String(col.textContent)));'
 ];
 return Function('history','search',lines.join('\n'))(history,search);
}
test('history shows responsible admin, prior/new classification, time and reason',()=>{
 const rows=renderFixture([{
  account_email:'cliente@example.invalid',actor_email:'admin@example.invalid',
  previous_classification:'unclassified',classification:'external',
  reason:'Pagamento e aquisição verificados por auditoria',
  changed_at:'2026-11-13T14:00:00.000Z'
 }]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].length,6);
 assert.equal(rows[0][1],'cliente@example.invalid');
 assert.equal(rows[0][2],'A classificar');
 assert.equal(rows[0][3],'Cliente externo');
 assert.equal(rows[0][4],'admin@example.invalid');
 assert.match(rows[0][5],/Pagamento e aquisição verificados/);
});
test('history search filters without inventing rows',()=>{
 const entries=[{account_email:'empresa@exemplo.com',actor_email:'admin@xrmovi.com.br',previous_classification:'internal',classification:'external',reason:'Revisão COMPROVADA da contratação',changed_at:'2026-11-13T10:00:00Z'}];
 assert.equal(renderFixture(entries,'comprovada').length,1);
 assert.match(renderFixture(entries,'desconhecido')[0][0],/Nenhuma alteração corresponde/);
 assert.match(renderFixture([])[0][0],/Nenhuma alteração de classificação/);
});
