import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const fn=source.match(/function visiblePayments\(\)\{[^\n]*\}/)?.[0];
assert.ok(fn,'commercial payment filter must exist');
function displayed(showTestAccounts){
 const info={
  accounts:[{email:'owner@example.invalid',companies:[]},{email:'tester@example.invalid',companies:[{name:'Empresa Teste'}]},{email:'client@example.invalid',companies:[{name:'Empresa Real'}]}],
  payments:[{email:'owner@example.invalid',amount:19.9},{email:'tester@example.invalid',amount:19.9},{email:'client@example.invalid',amount:39.9}]
 };
 const excludedTestEmails=()=>new Set(['tester@example.invalid']);
 const isOwnerAccount=p=>p.email==='owner@example.invalid';
 return Function('info','showTestAccounts','excludedTestEmails','isOwnerAccount',fn+';return visiblePayments();')(
   info,showTestAccounts,excludedTestEmails,isOwnerAccount);
}
test('owner receipts are excluded from commercial KPIs in default view',()=>{
 assert.deepEqual(displayed(false).map(p=>p.email),['client@example.invalid']);
});
test('showing homologation receipts never turns owner payments into commercial sales',()=>{
 assert.deepEqual(displayed(true).map(p=>p.email),['tester@example.invalid','client@example.invalid']);
});
