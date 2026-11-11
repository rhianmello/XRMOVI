const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const script=path.join(root,'v3/fuel-quality.js');
const report=path.join(root,'v3/finance-receipts-report.js');
const importer=p=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(p,'utf8')).toString('base64'));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const company='33333333-3333-4333-8333-333333333333';
const make=(id,vehicle,date,meter,liters,extra={})=>({id,vehicle_id:vehicle,date,meter,liters,...extra});
test('missing liters suppresses potentially misleading km/L for the affected vehicle',async()=>{
 const {analyzeFuelQuality}=await importer(script);
 const values=analyzeFuelQuality([
  make('1',A,'2026-11-01',82000,10),
  make('2',A,'2026-11-02',82200,null,{liters_declined:true}),
  make('3',A,'2026-11-03',82400,25),
  make('4',B,'2026-11-01',34000,10),
  make('5',B,'2026-11-02',34100,10)
 ]);
 assert.equal(values.missing,1);assert.equal(values.vehiclesAffected,1);
 assert.equal(values.perVehicle.find(x=>x.vehicleId===A).referenceKmL,null);
 assert.equal(values.perVehicle.find(x=>x.vehicleId===B).referenceKmL,10);
 assert.equal(values.perVehicle.find(x=>x.vehicleId===A).status,'Dados incompletos');
});
test('readings and odometer must form a valid pair; no fabricated zero-liter fuelings',async()=>{
 const {analyzeFuelQuality}=await importer(script);
 const one=analyzeFuelQuality([make('1',A,'2026-11-01',82000,12)]);
 assert.equal(one.perVehicle[0].referenceKmL,null);
 const outOfOrder=analyzeFuelQuality([make('1',A,'2026-11-01',82200,12),make('2',A,'2026-11-02',82000,10)]);
 assert.equal(outOfOrder.perVehicle[0].referenceKmL,null);
});
test('the evidence report labels missing liters and explicitly records actor and date',async()=>{
 const {buildFuelEvidenceGroups,buildFuelEvidenceHtml}=await importer(report);
 const groups=buildFuelEvidenceGroups({companyId:company,vehicles:[{id:A,plate:'ABC1D23'}],
  fuelEntries:[make('44444444-4444-4444-8444-444444444444',A,'2026-11-05',82000,null,{
   liters_declined:true,liters_declined_at:'2026-11-05T18:20:00Z',
   liters_declined_email:'colaborador@example.com',cost:50,station:'Posto teste'})],catalog:[]});
 assert.equal(groups[0].entries[0].liters,null);
 assert.equal(groups[0].liters,0);
 const html=buildFuelEvidenceHtml({companyName:'Teste',range:'Novembro',rows:[],groups});
 assert.match(html,/Não informado/);
 assert.match(html,/colaborador@example.com/);
 assert.ok(html.includes('abastecimento(s) com litros omitidos'));
 assert.doesNotMatch(html,/0 litros · Total/);
});
test('vehicle dashboard does not reference the fuel row variable',()=>{
 const adapter=read('v3/xrmovi-adapter.js');
 const start=adapter.indexOf('function applyVehicleFilters(){');
 const end=adapter.indexOf("for(const id of ['fleet-search'",start);
 assert.ok(start>0&&end>start,'dashboard filter section must be present');
 const dashboard=adapter.slice(start,end);
 assert.ok(!dashboard.includes('litersMissing(row)'), 'vehicle rows must never access undefined fuel row');
 assert.ok(dashboard.includes("edit.textContent='Editar';edit.onclick=()=>openWrite('vehicle',v)"));
 const fuelTable=adapter.slice(adapter.indexOf('function renderFuelRecords('),adapter.indexOf('function renderMaintenanceWorkspace('));
 assert.ok(fuelTable.includes("edit.textContent=litersMissing(row)?'Corrigir litros':'Editar'"));
});
test('the V3 forms send explicit choice to protected RPCs, reports label omissions',()=>{
 const adapter=read('v3/xrmovi-adapter.js');
 for(const text of ['fuel_save_v2','fuel_update_v2','p_decline:omitted','liters_ack',
  'Falta a quantidade de litros','renderFuelQuality(entries)',
  'LITROS NÃO INFORMADOS'])assert.ok(adapter.includes(text),text);
 const migration=read('supabase/migrations/20261105_xrmovi_fuel_liters_explicit_omission_audit.sql');
 assert.ok(migration.includes('auth.uid()'));
 assert.ok(migration.includes('fuel_liter_omissions'));
 assert.ok(migration.includes('qty is null'));
 assert.ok(migration.includes('before_data,after_data'));
});
