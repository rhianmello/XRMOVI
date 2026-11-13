import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const begin=source.indexOf('let showTestAccounts=false;');
const end=source.indexOf('function status(',begin);
assert.ok(begin>0&&end>begin,'account classification source must be available');
const helpers=source.slice(begin,end)+source.slice(source.indexOf('function commercialAccounts(){'),source.indexOf('function render(){'));
const fixtures={
 accounts:[
  {id:'a-owner',email:'rhian.udm@gmail.com',commercial_classification:'external'},
  {id:'a-external',email:'cliente@example.invalid',commercial_classification:'external'},
  {id:'a-unknown',email:'pendente@example.invalid',commercial_classification:'unclassified'},
  {id:'a-test',email:'teste@example.invalid',commercial_classification:'homologation'},
  {id:'a-internal',email:'colaborador@example.invalid',commercial_classification:'internal'}],
 payments:[
  {account_id:'a-owner',email:'rhian.udm@gmail.com',amount:10},
  {account_id:'a-external',email:'cliente@example.invalid',amount:39.9},
  {account_id:'a-unknown',email:'pendente@example.invalid',amount:29.9},
  {account_id:'a-test',email:'teste@example.invalid',amount:19.9},
  {account_id:'a-internal',email:'colaborador@example.invalid',amount:12},
  {email:'cliente@example.invalid',amount:9999} // Must never attribute by email alone.
 ]
};
function evaluate(show){
 const run=Function('info','requestedShow',`
  const el=()=>({textContent:''});
  ${helpers}
  showTestAccounts=requestedShow;
  return {
   external:classifiedExternalAccounts().map(a=>a.id),
   visibleAccounts:commercialAccounts().map(a=>a.id),
   commercialPayments:commercialPayments().map(p=>p.amount),
   visiblePayments:visiblePayments().map(p=>p.amount),
   unclassified:(info.accounts||[]).filter(a=>!isOwnerAccount(a)&&classificationOf(a)==='unclassified').length
  };
 `);
 return run(fixtures,show);
}
test('commercial KPIs count only explicitly classified external accounts',()=>{
 assert.deepEqual(evaluate(false).external,['a-external']);
 assert.deepEqual(evaluate(false).commercialPayments,[39.9]);
 assert.equal(evaluate(false).unclassified,1);
});
test('showing homologation never changes commercial revenue or credits the owner',()=>{
 assert.deepEqual(evaluate(true).external,['a-external']);
 assert.deepEqual(evaluate(true).commercialPayments,[39.9]);
 assert.deepEqual(evaluate(true).visiblePayments,[39.9,29.9,19.9,12]);
});
test('unclassified remain visible for manual review, while internal rows are opt-in',()=>{
 assert.deepEqual(evaluate(false).visibleAccounts,['a-external','a-unknown']);
 assert.deepEqual(evaluate(true).visibleAccounts,['a-external','a-unknown','a-test','a-internal']);
});
test('admin classification requires justification and persists through privileged RPC',()=>{
 assert.match(source,/admin_commercial_labels/);
 assert.match(source,/admin_commercial_receipts/);
 assert.match(source,/admin_commercial_label_set/);
 assert.match(source,/reason\.trim\(\)\.length<10/);
 assert.match(source,/classificationOf\(c\)/);
});
