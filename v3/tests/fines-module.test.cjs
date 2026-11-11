const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const importCore=()=>import('data:text/javascript;base64,'+
 Buffer.from(read('v3/fines-core.js')).toString('base64'));
const make=(id,vehicle,status='pending',extra={})=>({
 id,company_id:'11111111-1111-4111-8111-111111111111',
 vehicle_id:vehicle,plate:vehicle==='v1'?'ABC1D23':'XYZ2E45',notice_number:'AUT-'+id,
 authority:'DETRAN RJ',description:'Excesso de velocidade',
 infraction_date:'2026-11-01',amount:195.23,status,
 responsibility:'undetermined',...extra
});
test('fine KPIs never count pending/appeal fines as paid revenue/cost',async()=>{
 const {fineSummary}=await importCore();
 const rows=[
  make('a','v1','pending',{due_date:'2026-11-08'}),
  make('b','v1','appeal',{amount:100,driver_nomination_deadline:'2026-11-05'}),
  make('c','v2','paid',{amount:150,paid_on:'2026-11-02'}),
  make('d','v2','canceled',{amount:5000})
 ];
 const result=fineSummary(rows,'2026-11-06');
 assert.equal(result.total,4);assert.equal(result.outstanding,2);
 assert.equal(result.amountOpen,295.23);
 assert.equal(result.amountPaid,150);
 assert.equal(result.dueSoon,2);assert.equal(result.overdue,1);
});
test('manual due dates and scope cannot mix vehicles',async()=>{
 const {fineDeadlineEvents}=await importCore();
 const rows=[
 make('a','v1','pending',{due_date:'2026-11-07',defense_deadline:'2026-11-19'}),
 make('b','v2','paid',{due_date:'2026-11-05'}),
 make('c','v2','appeal',{driver_nomination_deadline:'2026-11-11'}),
 make('d','v1','canceled',{due_date:'2026-11-06'})
 ];
 assert.deepEqual(fineDeadlineEvents(rows,'2026-11-06',7).map(x=>x.fineId),['a','c']);
 assert.deepEqual(fineDeadlineEvents(rows,'2026-11-06',7,new Set(['v1'])).map(x=>x.fineId),['a']);
});
test('vehicle/status/text/date filters exclude unrelated records',async()=>{
 const {filterTrafficFines}=await importCore();
 const a=make('a','v1','pending',{infraction_date:'2026-10-01'});
 const b=make('b','v2','paid',{infraction_date:'2026-11-01'});
 const c=make('c','v1','appeal',{infraction_date:'2026-11-03'});
 assert.deepEqual(filterTrafficFines([a,b,c],{vehicleId:'v1',from:'2026-11-01'}).map(x=>x.id),['c']);
 assert.deepEqual(filterTrafficFines([a,b,c],{status:'paid',query:'XYZ2E45'}).map(x=>x.id),['b']);
});
test('CSV is Excel-compatible and rejects formula injection',async()=>{
 const {fineCsv}=await importCore();
 const data=fineCsv([make('f','v1','pending',{description:'=HYPERLINK("https://malicious.invalid")'})]);
 assert.ok(data.startsWith('\uFEFF'));
 assert.ok(data.includes('"\u0027=HYPERLINK('));
 assert.match(data,/ABC1D23/);
});
test('PDF escapes untrusted text and references secure documents',async()=>{
 const {fineReportHtml}=await importCore();
 const html=fineReportHtml([make('f','v1','pending',{description:'<script>alert(1)</script>'})],
  'Empresa teste & parceiros',{docCatalog:[{kind:'fine',record_id:'f',name:'defesa.pdf'}]});
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(html.includes('defesa.pdf'));
 assert.ok(html.includes('Empresa teste &amp; parceiros'));
 assert.match(html,/não são realizados automaticamente/);
});
test('browser module links only to authenticated APIs and secured file center',()=>{
 const adapter=read('v3/xrmovi-adapter.js'),html=read('v3/index.html'),module=read('v3/fines-module.js'),
       docs=read('v3/document-center.js'),migration=read('supabase/migrations/20261106_xrmovi_traffic_fines.sql');
 for(const x of ['setupTrafficFines','trafficFines?.openForVehicle(v.id)','trafficFines?.refresh()',
  "fines:'Multas e Infrações'",'trafficFines?.renderAlerts()'])assert.ok(adapter.includes(x),x);
 for(const x of ['data-view="fines"','value="fines">Multas e Infrações','id="view-fines"',
  'xrm-fines-vehicle','xrm-fines-pdf-docs'])assert.ok(html.includes(x),x);
 for(const x of ['traffic_fines_list','traffic_fine_save','traffic_fine_history',"openDocument('fine',fine)"])
  assert.ok(module.includes(x),x);
 assert.ok(docs.includes("['driver','vehicle','fuel','fine']"));
 assert.ok(migration.includes("enable row level security"));
 assert.ok(migration.includes("m.role in ('owner','manager')"));
 assert.ok(migration.includes("expense_id uuid unique"));
 assert.ok(migration.includes("if newer.status='paid' then"));
 assert.ok(migration.includes("if old.status='paid' and p_status<>'paid'"));
 assert.ok(!module.includes("service_role"));
});
