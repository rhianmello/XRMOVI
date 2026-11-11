import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buildFuelEvidenceGroups,buildFuelEvidenceHtml,reportEscape
} from '../v3/finance-receipts-report.js';

const cid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const v1='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const v2='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const f1='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const f2='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const sample={
 companyId:cid,
 vehicles:[{id:v1,plate:'RXX1A23',model:'SUV'},{id:v2,plate:'RXX4B56',model:'Van'}],
 fuelEntries:[
  {id:f2,vehicle_id:v2,date:'2026-11-04',liters:20,cost:125.50},
  {id:f1,vehicle_id:v1,date:'2026-11-02',liters:35,cost:210.40,station:'Posto Centro'}
 ],
 catalog:[
  {id:'doc1',kind:'fuel',vehicle_id:v1,record_id:f1,path:cid+'/fuel/'+f1+'/receipt.jpg',name:'Comprovante.jpg'},
  {id:'doc2',kind:'fuel',vehicle_id:v2,record_id:f1,path:cid+'/fuel/'+f1+'/wrong-vehicle.jpg',name:'Errado.jpg'},
  {id:'doc3',kind:'vehicle',vehicle_id:v1,record_id:f1,path:cid+'/fuel/'+f1+'/not-fuel.jpg',name:'CRLV.jpg'},
  {id:'doc4',kind:'fuel',vehicle_id:v1,record_id:f1,path:'ffffffff-ffff-4fff-8fff-ffffffffffff/fuel/'+f1+'/foreign.jpg',name:'Outra empresa.jpg'}
 ]
};
test('document is linked to exact company, fuel and vehicle IDs',()=>{
 const grouped=buildFuelEvidenceGroups(sample);
 assert.equal(grouped.length,2);
 assert.equal(grouped[0].plate,'RXX1A23');
 assert.equal(grouped[0].entries[0].documents.length,1);
 assert.equal(grouped[0].entries[0].documents[0].name,'Comprovante.jpg');
 assert.equal(grouped[1].entries[0].documents.length,0);
});
test('does not include hidden, out-of-scope vehicle receipts',()=>{
 const groups=buildFuelEvidenceGroups({...sample,scopeIds:new Set([v1])});
 assert.equal(groups.length,1);
 assert.equal(groups[0].id,v1);
});
test('deduplicates receipt paths and excludes unrelated attachments',()=>{
 const groups=buildFuelEvidenceGroups({...sample,catalog:[sample.catalog[0],sample.catalog[0],sample.catalog[3]]});
 assert.equal(groups[0].entries[0].documents.length,1);
});
test('preserves per-vehicle cost and liters',()=>{
 const groups=buildFuelEvidenceGroups(sample);
 assert.equal(groups[0].total,210.4);
 assert.equal(groups[0].liters,35);
 assert.equal(groups[1].total,125.5);
});
test('report embeds approved image as data URL, not a signed storage link',()=>{
 const groups=buildFuelEvidenceGroups(sample);
 groups[0].entries[0].documents[0].pages=['data:image/jpeg;base64,AA=='];
 const html=buildFuelEvidenceHtml({
  companyName:'Frota Demonstração',range:'01/11/2026 a 05/11/2026',
  rows:[['2026-11-02','RXX1A23','Combustível','Abastecimento',210.4]],
  groups,emittedAt:'05/11/2026'
 });
 assert.match(html,/data:image\/jpeg;base64,AA==/);
 assert.match(html,/RXX1A23/);
 assert.match(html,/Posto Centro/);
 assert.match(html,/Sem comprovante/);
 assert.doesNotMatch(html,/Bearer |X-Idempotency|APP_USR-/);
 assert.match(html,/Imprimir \/ Salvar como PDF/);
});
test('escaped user input cannot inject HTML into report',()=>{
 const groups=buildFuelEvidenceGroups({...sample, catalog:[]});
 const html=buildFuelEvidenceHtml({
  companyName:'<script>alert("x")</script>',
  range:'05/11/2026',
  rows:[['2026-11-05','RXX1A23','Combustível','<img src=x onerror=alert(1)>',50]],
  groups
 });
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>alert/);
 assert.match(html,/&lt;img src=x onerror/);
 assert.equal(reportEscape('&<"'), '&amp;&lt;&quot;');
});
test('refuses forged inline image scheme',()=>{
 const groups=buildFuelEvidenceGroups(sample);
 groups[0].entries[0].documents[0].pages=['javascript:alert(1)'];
 assert.throws(()=>buildFuelEvidenceHtml({groups,rows:[]}),/imagem inválida/);
});
test('invalid company scope fails closed',()=>{
 assert.throws(()=>buildFuelEvidenceGroups({...sample,companyId:'not-a-uuid'}),/Empresa inválida/);
});
