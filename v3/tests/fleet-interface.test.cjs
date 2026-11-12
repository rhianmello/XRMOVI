const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');

// Pass PLAYWRIGHT_MODULE when the package is supplied by a workspace runtime.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const output = process.env.BRANDING_SCREENSHOT_DIR;
const companyA = '11111111-1111-4111-8111-111111111111';
const companyB = '22222222-2222-4222-8222-222222222222';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
let browser, base;

before(async () => {
  // All requests are fulfilled from disk; no external network or account is used.
  base = 'https://xrmovi.test';
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
});

after(async () => {
  await browser?.close();
});

async function open({ role = 'owner', existing = false, viewport = { width: 1440, height: 1000 } } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ role, existing, a, b, png64 }) => {
    const bytes = Uint8Array.from(atob(png64), character => character.charCodeAt(0));
    const state = window.brandingTest = {
      uploads: [], saves: [], downloads: [], downloadsCompleted: 0, databaseError: false, uploadError: false, downloadError: false,
      holdUpload: false, holdDownload: false,
      companies: [
        { id: a, name: 'Empresa de Teste — Operação e Transportes', role, logo_path: existing ? a + '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png' : null, logo_url: existing ? 'https://example.test/logo.png' : null },
        { id: b, name: 'Segunda Empresa', role: 'viewer', logo_path: null, logo_url: null }
      ]
    };
    const today=new Date().toLocaleDateString('en-CA'),old='2020-01-01';
    state.drivers=[];state.expenses=[];state.failVehicle=false;state.writes=[];state.failCost=false;state.failComplete=false;state.changes=[];state.costRequests=[];state.costError=false;state.costMultiplier=1;state.fixture={vehicles:[{id:'v1',plate:'AAA1111',category:'Leve',contract_id:'c1',status:'Ativo',odometer_value:100},{id:'v2',plate:'BBB2222',category:'Caminhão',contract_id:'c2',status:'Manutenção',odometer_value:100}],maintenance:[{id:'m1',vehicle_id:'v1',plate:'AAA1111',title:'Revisão A',due_date:old,status:'open',created_at:today},{id:'m2',vehicle_id:'v2',plate:'BBB2222',title:'Revisão B',due_date:old,status:'open',created_at:today}],fuel:[{vehicle_id:'v1',fueled_on:today,liters:10,total_cost:100},{vehicle_id:'v2',fueled_on:today,liters:20,total_cost:200}]};
    state.client = {
      auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
      functions: { invoke: async () => ({ data: { enabled: false }, error: null }) },
      rpc: async (name, args) => {
        if(name==='xrmovi_access_status')return {data:{allowed:true,billing_required:false,status:'active'}};
        if(name==='xrmovi_drivers_list')return {data:state.drivers};
        if(name==='xrmovi_expenses_list')return {data:state.expenses.map(e=>({...e,plate:state.fixture.vehicles.find(v=>v.id===e.vehicle_id)?.plate}))};
        if(name==='xrmovi_driver_save'){state.writes.push({name,args});const old=state.drivers.find(d=>d.id===args.p_id);const driver={id:old?.id||'d'+(state.drivers.length+1),name:args.p_name,phone:args.p_phone,cnh_number:args.p_cnh,cnh_category:args.p_category,cnh_expires_on:args.p_expires,active:args.p_active,notes:args.p_notes,revision:old?(old.revision??0)+1:0};if(old)Object.assign(old,driver);else state.drivers.push(driver);return {data:driver.id};}
        if(name==='xrmovi_vehicle_save_with_driver'){state.writes.push({name,args});if(state.failVehicle)return {error:{message:'Falha ao salvar veículo'}};const old=state.fixture.vehicles.find(v=>v.id===args.p_id),driver=state.drivers.find(d=>d.id===args.p_driver);const vehicle={...(old||{}),id:old?.id||'v'+(state.fixture.vehicles.length+1),plate:args.p_plate,brand:args.p_brand,model:args.p_model,category:args.p_category,driver_id:args.p_driver,driver_name:driver?.name||null,odometer_value:args.p_odometer,status:old?.status||'Ativo'};if(old)Object.assign(old,vehicle);else state.fixture.vehicles.push(vehicle);return {data:vehicle.id};}
        if(name==='xrmovi_expense_save'){state.writes.push({name,args});const old=state.expenses.find(e=>e.id===args.p_id);const expense={id:old?.id||'e'+(state.expenses.length+1),vehicle_id:args.p_vehicle,category:args.p_category,description:args.p_description,expense_date:args.p_date,due_date:args.p_due,amount:args.p_amount,paid_on:args.p_paid,notes:args.p_notes,revision:old?(old.revision??0)+1:0};if(old)Object.assign(old,expense);else state.expenses.push(expense);return {data:expense.id};}
        if(name==='xrmovi_maintenance_history')return {data:state.changes.filter(row=>row.task_id===args.tid)};
        if(name==='xrmovi_maintenance_update'||name==='xrmovi_maintenance_record'){
          state.writes.push({name,args});const task=state.fixture.maintenance.find(m=>m.id===args.tid);
          if((task.revision??0)!==args.expected_revision)return {error:{code:'40001',message:'Registro alterado por outro usuário. Atualize os detalhes antes de salvar.'}};
          if(name==='xrmovi_maintenance_record'&&(state.failCost||args.finish&&state.failComplete))return {error:{message:state.failComplete?'Conclusão indisponível':'Custo indisponível'}};
          const before={...task};if(name==='xrmovi_maintenance_update')Object.assign(task,{title:args.task_title,due_date:args.deadline,due_meter:args.deadline_meter,notes:args.detail});else Object.assign(task,{estimated_cost:args.forecast,actual_cost:args.spent,completed_meter:args.final_meter,...(args.finish?{status:'done'}:{})});task.revision=(task.revision??0)+1;
          state.changes.push({task_id:args.tid,actor_id:'test-user',changed_at:new Date().toISOString(),reason:args.p_reason||'Atualização registrada',before_data:before,after_data:{...task}});return {data:{...task}};
        }
        if(name==='xrmovi_maintenance_save'){state.writes.push({name,args});const id='m'+(state.fixture.maintenance.length+1);state.fixture.maintenance.push({id,vehicle_id:args.vid,plate:state.fixture.vehicles.find(v=>v.id===args.vid)?.plate,title:args.task_title,due_date:args.deadline,due_meter:args.deadline_meter,status:'open'});return {data:id};}
        if(name==='xrmovi_maintenance_set_cost'){state.writes.push({name,args});if(state.failCost)return {error:{message:'Custo indisponível'}};Object.assign(state.fixture.maintenance.find(m=>m.id===args.tid),{estimated_cost:args.forecast,actual_cost:args.spent,completed_meter:args.final_meter});return {data:null};}
        if(name==='xrmovi_maintenance_complete'){state.writes.push({name,args});if(state.failComplete)return {error:{message:'Conclusão indisponível'}};state.fixture.maintenance.find(m=>m.id===args.task_id).status='done';return {data:null};}
        if(name==='xrmovi_my_vehicles')return {data:state.fixture.vehicles.map(v=>({...v,driver_name:state.drivers.find(d=>d.id===v.driver_id)?.name||v.driver_name}))};
        if(name==='xrmovi_maintenance_list')return {data:state.fixture.maintenance};
        if(name==='xrmovi_contracts_list')return {data:[{id:'c1',name:'Contrato A'},{id:'c2',name:'Contrato B'}]};
        if(name==='xrmovi_my_vehicle_documents')return {data:[{name:args.vid+' documento',path:'test.pdf'}]};
        if(name==='xrmovi_cost_report'){state.costRequests.push(args);if(state.costError)return {error:{message:'Falha de teste'}};return {data:{expenses:state.expenses.filter(e=>e.paid_on&&e.paid_on>=args.from_date&&e.paid_on<=args.to_date).map(e=>({...e,date:e.paid_on})),fuel:state.fixture.fuel.map(f=>({...f,total_cost:f.total_cost*state.costMultiplier})),maintenance:[{id:'m1',vehicle_id:'v1',title:'Revisão A',date:today,actual_cost:50},{id:'m2',vehicle_id:'v2',title:'Revisão B',date:today,actual_cost:75}]}};}
        if(name==='xrmovi_os_list')return {data:[{id:'o1',category:'frota',code:'OS1',title:'Troca óleo',status:'aberta',priority:'baixa'},{id:'o2',category:'frota',code:'OS2',title:'Pneus',status:'concluida',priority:'baixa'},{id:'o3',category:'predial',code:'OS3',title:'Predial legado',status:'aberta',priority:'baixa'}]};
        if(name==='xrmovi_operations_list')return {data:[{id:'p1',title:'Filtro de óleo',code:'P1',status:'aberto',quantity:2,min_quantity:3,cost:10},{id:'p2',title:'Pneu',code:'P2',status:'concluido',quantity:5,min_quantity:1,cost:100}]};
        if(name==='xrmovi_stock_history')return {data:[{created_at:'2026-10-29',kind:'entrada',quantity:2}]};
        if (name === 'xrmovi_my_companies') return { data: state.companies, error: null };
        if (name === 'xrmovi_company_logo_save') {
          state.saves.push(args);
          if (state.databaseError) return { data: null, error: { message: 'Banco indisponível' } };
          return { data: { id: args.cid, logo_path: args.p_path, logo_url: 'https://example.test/storage/' + args.p_path }, error: null };
        }
        if (name === 'xrmovi_financial_intelligence') return { data: { vehicles: [] }, error: null };
        if (name === 'xrmovi_cost_report') return { data: { fuel: [], maintenance: [] }, error: null };
        return { data: [], error: null };
      },
      storage: { from: bucket => ({
        upload: async (objectPath, file, options) => {
          state.uploads.push({ bucket, path: objectPath, type: file.type, size: file.size, options });
          if (state.holdUpload) await new Promise(resolve => state.releaseUpload = resolve);
          return { data: { path: objectPath }, error: state.uploadError ? { message: 'Storage indisponível' } : null };
        },
        download: async objectPath => {
          state.downloads.push(objectPath);
          if (state.holdDownload) await new Promise(resolve => state.releaseDownload = resolve);
          state.downloadsCompleted++;
          if (state.downloadError) return { data: null, error: { message: 'Download indisponível' } };
          return { data: new Blob([bytes], { type: 'image/png' }), error: null };
        }
      }) }
    };
  }, { role, existing, a: companyA, b: companyB, png64: png.toString('base64') });
  await page.route(base + '/**', route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '');
    const filename = path.resolve(root, relative || 'v3/index.html');
    if (!filename.startsWith(root + path.sep)) return route.fulfill({ status: 403, body: '' });
    try {
      const contentType = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' })[path.extname(filename)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: fs.readFileSync(filename) });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await page.route('https://esm.sh/**', route => route.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'export const createClient = () => window.brandingTest.client;' }));
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.lucide = { createIcons() {
      document.querySelectorAll('i[data-lucide="pencil"]').forEach(icon => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = '<path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/>';
        icon.replaceWith(svg);
      });
    } };
  ` }));
  await page.goto(base + '/v3/index.html');
  await page.waitForFunction(() => document.getElementById('company-name').textContent.startsWith('Empresa de Teste'));
  await page.waitForFunction(() => document.getElementById('v3-company'));
  if (viewport.width <= 760) {
    // User has an explicit choice; decline optional analytics before interacting
    // with mobile footer controls so its genuine consent panel cannot intercept.
    await page.evaluate(() => {
      const consent=document.querySelector('#xrm-ga4-consent');
      if(consent&&!consent.hidden)consent.querySelector('.ga4-deny')?.click();
    });
  }
  return { page, errors };
}

async function selectFile(page, file = { name: 'logo.png', mimeType: 'image/png', buffer: png }) {
  const picker = page.waitForEvent('filechooser');
  await page.locator('#company-logo-edit').click();
  await (await picker).setFiles(file);
}

async function waitIdle(page) {
  await page.waitForFunction(() => document.getElementById('company-logo-area').getAttribute('aria-busy') === 'false');
}

test('fleet controls have no legacy modules or dead exports',async()=>{
 const {page,errors}=await open();await page.waitForSelector('#fleet-table-body tr',{state:'attached'});
 assert.equal(await page.locator('#view-quality,#analytics-toggle,#export-button,#table-next,#fleet-import-file').count(),0);
 assert.doesNotMatch(await page.locator('body').innerText(),/CPL|Somente leitura|senha master|Qualidade da Base/i);
 assert.equal(await page.locator('.fleet-breadcrumb #xrm-contract-filter').count(),1);
 assert.match(await page.locator('.fleet-main-nav').innerText(),/Relatórios financeiros/);
 await page.locator('.fleet-main-nav [data-view="maintenance"]').click();assert.equal(await page.locator('#maintenance-panel').isVisible(),true);
 assert.deepEqual(errors,[]);await page.close();
});

test('contract and combined filters scope KPIs charts alerts maintenance documents fuel and costs',async()=>{
 const {page,errors}=await open();await page.waitForFunction(()=>document.querySelectorAll('#vehicle-documents tbody tr').length===2);
 await page.selectOption('#xrm-contract-filter','c1');
 assert.equal(await page.locator('.fleet-kpi-value').first().textContent(),'1');
 assert.equal(await page.locator('#v3-situation-donut').innerText(),'1');
 assert.match(await page.locator('#fleet-table-body').innerText(),/AAA1111/);assert.doesNotMatch(await page.locator('#fleet-table-body').innerText(),/BBB2222/);
 assert.doesNotMatch(await page.locator('#alerts-content').innerText(),/Revisão B/);
 assert.doesNotMatch(await page.locator('#v3-maintenance-list').innerText(),/Revisão B/);
 await page.locator('.fleet-main-nav [data-view="documents"]').click();await page.selectOption('#xrm-doc-link','vehicle:v1');assert.equal(await page.locator('#vehicle-documents tbody tr').count(),1);assert.doesNotMatch(await page.locator('#vehicle-documents tbody').innerText(),/BBB2222/);await page.locator('.fleet-main-nav [data-view="dashboard"]').click();
 assert.equal(await page.locator('#fleet-fuel-records tbody tr').count(),1);
 assert.match(await page.locator('#xrm-contract-finance').innerText(),/150,00/);
 await page.selectOption('#xrm-filter-category','Caminhão');assert.equal(await page.locator('.fleet-kpi-value').first().textContent(),'0');assert.equal(await page.locator('#fleet-fuel-records tbody tr').count(),0);
 await page.locator('#xrm-clear-filters').click();assert.equal(await page.locator('#xrm-contract-filter').inputValue(),'');assert.equal(await page.locator('.fleet-kpi-value').first().textContent(),'2');
 await page.locator('#fleet-search').fill('BBB2222');await page.locator('.fleet-main-nav [data-view="history"]').click();assert.doesNotMatch(await page.locator('#history-content').innerText(),/AAA1111/);assert.match(await page.locator('#history-content').innerText(),/BBB2222/);
 assert.deepEqual(errors,[]);await page.close();
});

test('order search updates counters and excludes unrelated categories without deleting records',async()=>{
 const {page,errors}=await open();await page.goto(base+'/v3/os.html');await page.waitForFunction(()=>document.querySelectorAll('#rows tr').length===2);
 assert.equal(await page.locator('#total').innerText(),'2');assert.equal(await page.locator('#category').count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/Predial legado|Patrimônio|Help Desk/);
 await page.locator('#search').fill('Pneus');assert.equal(await page.locator('#total').innerText(),'1');assert.equal(await page.locator('#done').innerText(),'1');assert.equal(await page.locator('#open').innerText(),'0');
 assert.deepEqual(errors,[]);await page.close();
});

test('financial period reloads both costs and records; failure never retains another period totals',async()=>{
 const {page,errors}=await open();await page.waitForSelector('#fleet-fuel-records tbody tr',{state:'attached'});await page.locator('.fleet-main-nav [data-view="fuel"]').click();await page.selectOption('#xrm-contract-filter','c1');
 await page.evaluate(()=>{brandingTest.costMultiplier=3});
 await page.locator('#fuel-ranking-month').fill('2026-09');await page.locator('#fuel-ranking-month').dispatchEvent('change');
 await page.waitForFunction(()=>document.querySelector('#xrm-contract-finance').innerText.includes('350,00'));
 // Parallel background cost queries may occur; validate the requested month rather than the last network call.
 const args=await page.evaluate(()=>brandingTest.costRequests.find(x=>x.from_date==='2026-09-01'&&x.to_date==='2026-09-30'));
 assert.ok(args,'O relatório deve consultar setembro completo');
 await page.evaluate(()=>{brandingTest.costError=true});await page.locator('#fuel-ranking-month').fill('2026-08');await page.locator('#fuel-ranking-month').dispatchEvent('change');
 await page.waitForFunction(()=>document.querySelector('#xrm-contract-finance').innerText.includes('Não foi possível'));
 assert.doesNotMatch(await page.locator('#xrm-contract-finance').innerText(),/350,00/);assert.equal(await page.locator('#fleet-fuel-records tbody tr').count(),0);
 assert.deepEqual(errors,[]);await page.close();
});

test('reports combine type, vehicle and linked driver in the table and CSV',async()=>{
 const {page,errors}=await open();
 await page.waitForSelector('#fleet-table-body tr',{state:'attached'});
 await page.evaluate(()=>{
  brandingTest.drivers.push({id:'d1',name:'Ana',active:true},{id:'d2',name:'Bruno',active:true});
  brandingTest.fixture.vehicles[0].driver_id='d1';
  brandingTest.fixture.vehicles[1].driver_id='d2';
 });
 await page.locator('#refresh-button').click();
 await page.locator('.fleet-main-nav [data-view="financial"]').click();
 await page.locator('#xrm-report-driver option[value="d1"]').waitFor({state:'attached'});
 const records=page.locator('#financial-entries tbody tr');
 await page.selectOption('#xrm-report-kind','maintenance');
 assert.equal(await records.count(),2);
 await page.selectOption('#xrm-report-driver','d1');
 assert.equal(await records.count(),1);
 assert.match(await records.first().innerText(),/AAA1111/);
 await page.selectOption('#xrm-report-vehicle','v2');
 assert.equal(await records.count(),0);
 await page.selectOption('#xrm-report-vehicle','v1');
 assert.equal(await records.count(),1);
 const [download]=await Promise.all([
  page.waitForEvent('download'),page.locator('#financial-export-csv').click()
 ]);
 const csv=fs.readFileSync(await download.path(),'utf8');
 assert.match(csv,/AAA1111.*Manutenção realizada/);
 assert.doesNotMatch(csv,/BBB2222|Combustível|Despesa paga/);
 assert.deepEqual(errors,[]);
 await page.close();
});

test('stock movements remain inside the warehouse and search scopes counters',async()=>{
 const {page,errors}=await open();await page.goto(base+'/v3/operacoes.html#movimentacoes');await page.waitForFunction(()=>document.querySelectorAll('#rows tr').length===2);
 assert.equal(await page.locator('#modules [data-module="movimentacoes"]').count(),0);assert.equal(await page.locator('#title').innerText(),'Estoque de peças');
 await page.locator('#search').fill('Pneu');assert.equal(await page.locator('#total').innerText(),'1');assert.equal(await page.locator('#attention').innerText(),'0');
 await page.getByText('Histórico de movimentações',{exact:true}).click();assert.match(await page.locator('dialog[open]').innerText(),/entrada/);
 assert.deepEqual(errors,[]);await page.close();
});

test('each navigation button opens one dedicated workspace with hash, active item and browser back',async()=>{
 const {page,errors}=await open();await page.waitForSelector('#fleet-table-body tr',{state:'attached'});
 for(const name of ['assets','maintenance','documents','alerts','history','fuel','financial','dashboard']){
  await page.locator('.fleet-main-nav [data-view="'+name+'"]').click();
  assert.equal(await page.locator('.fleet-view:visible').count(),1);
  assert.equal(await page.locator('#view-'+name).isVisible(),true);
  assert.equal(await page.locator('.fleet-main-nav [aria-current="page"]').getAttribute('data-view'),name);
  assert.equal(new URL(page.url()).hash,'#'+name);
  assert.equal(await page.evaluate(()=>window.scrollY),0);
  assert.equal(await page.locator('.xrm-company-header').isVisible(),true);if(output&&['assets','maintenance'].includes(name)){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'xrmovi-'+name+'-desktop.png'),fullPage:false})}
 }
 await page.locator('.fleet-main-nav [data-view="assets"]').click();await page.locator('.fleet-main-nav [data-view="maintenance"]').click();await page.goBack();await page.waitForFunction(()=>!document.querySelector('#view-assets').classList.contains('hidden'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('.fleet-main-nav [aria-current="page"]')?.dataset.view==='assets');assert.equal(await page.locator('#view-assets').isVisible(),true);
 assert.deepEqual(errors,[]);await page.close();
});

test('maintenance schedule, register costs, conclude and view completed services',async()=>{
 const {page,errors}=await open();await page.locator('.fleet-main-nav [data-view="maintenance"]').click();
 await page.locator('#maintenance-new').click();const form=page.locator('#v3-edit-form');await form.locator('[name="title"]').fill('Troca de óleo');await form.locator('[name="due_meter"]').fill('250');await form.locator('[name="estimate"]').fill('120');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);
 await page.locator('#maintenance-search').fill('Troca de óleo');assert.equal(await page.locator('#v3-maintenance-list tbody tr').count(),1);
 await page.getByRole('button',{name:'Registrar custos',exact:true}).click();await form.locator('[name="actual"]').fill('110');await form.locator('[name="completed_meter"]').fill('250');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);
 await page.getByRole('button',{name:'Concluir serviço',exact:true}).click();await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);
 await page.selectOption('#maintenance-status','done');assert.equal(await page.locator('#v3-maintenance-list tbody tr').count(),1);assert.match(await page.locator('#v3-maintenance-list').innerText(),/110,00/);
 const writes=await page.evaluate(()=>brandingTest.writes);assert.equal(writes.filter(w=>w.name==='xrmovi_maintenance_save').length,1);assert.equal(writes.at(-1).name,'xrmovi_maintenance_record');assert.equal(writes.at(-1).args.finish,true);
 assert.deepEqual(errors,[]);await page.close();
});

test('maintenance failed cost save can be retried without creating a duplicate task; viewers cannot write',async()=>{
 const {page,errors}=await open();await page.locator('.fleet-main-nav [data-view="maintenance"]').click();await page.evaluate(()=>brandingTest.failCost=true);await page.locator('#maintenance-new').click();const form=page.locator('#v3-edit-form');await form.locator('[name="title"]').fill('Serviço de teste');await form.locator('[name="due_meter"]').fill('1000');await form.locator('[name="estimate"]').fill('30');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-feedback').innerText.includes('serviço foi criado'));
 await page.evaluate(()=>brandingTest.failCost=false);await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);assert.equal(await page.evaluate(()=>brandingTest.writes.filter(w=>w.name==='xrmovi_maintenance_save').length),1);
 assert.deepEqual(errors,[]);await page.close();
 const viewer=await open({role:'viewer'});await viewer.page.locator('.fleet-main-nav [data-view="maintenance"]').click();assert.equal(await viewer.page.locator('#maintenance-new').isVisible(),false);assert.equal(await viewer.page.getByRole('button',{name:'Concluir serviço',exact:true}).count(),0);assert.equal(await viewer.page.evaluate(()=>brandingTest.writes.length),0);assert.deepEqual(viewer.errors,[]);await viewer.page.close();
});

test('failed atomic completion saves neither costs nor completion and allows retry',async()=>{
 const {page,errors}=await open();await page.locator('.fleet-main-nav [data-view="maintenance"]').click();await page.evaluate(()=>brandingTest.failComplete=true);
 await page.locator('[data-task-id="m1"]').getByRole('button',{name:'Concluir serviço'}).click();const form=page.locator('#v3-edit-form');await form.locator('[name="actual"]').fill('80');await form.locator('[name="completed_meter"]').fill('100');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-feedback').innerText.includes('Conclusão indisponível'));
 assert.equal(await page.evaluate(()=>brandingTest.fixture.maintenance[0].status),'open');assert.equal(await page.evaluate(()=>brandingTest.fixture.maintenance[0].actual_cost??null),null);await page.evaluate(()=>brandingTest.failComplete=false);await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);assert.equal(await page.evaluate(()=>brandingTest.fixture.maintenance[0].status),'done');assert.deepEqual(errors,[]);await page.close();
});

test('mobile navigation opens maintenance and keeps its controls usable',async()=>{
 const {page,errors}=await open({viewport:{width:390,height:844}});await page.locator('.xrm-mobile-bottom-nav [data-mobile-view="maintenance"]').click();assert.equal(await page.locator('#view-maintenance').isVisible(),true);assert.equal(await page.locator('#maintenance-new').isVisible(),true);assert.equal(await page.locator('#view-dashboard').isVisible(),false);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'xrmovi-maintenance-mobile.png'),fullPage:false})}assert.deepEqual(errors,[]);await page.close();
});

test('specific alerts open their exact service inline despite duplicate titles; planning edits preserve source and history',async()=>{
 const {page,errors}=await open();await page.evaluate(()=>brandingTest.fixture.maintenance.forEach(m=>m.title='Troca de óleo'));await page.locator('#refresh-button').click();await page.waitForFunction(()=>document.querySelector('#alert-preview').innerText.includes('Troca de óleo'));
 await page.locator('#alert-preview button').first().click();assert.equal(await page.locator('#v3-edit-overlay').getAttribute('data-task-id'),'m1');assert.equal(await page.locator('.fleet-main-nav [aria-current="page"]').getAttribute('data-view'),'dashboard');await page.locator('#v3-edit-close').click();
 await page.locator('.fleet-main-nav [data-view="alerts"]').click();await page.locator('#alerts-content button').nth(1).click();assert.equal(await page.locator('#v3-edit-overlay').getAttribute('data-task-id'),'m2');assert.match(await page.locator('#v3-edit-form h3').innerText(),/BBB2222/);
 await page.getByRole('button',{name:'Editar programação',exact:true}).click();const form=page.locator('#v3-edit-form');await form.locator('[name="title"]').fill('Revisão reprogramada');await form.locator('[name="due_date"]').fill('2099-01-01');await form.locator('[name="reason"]').fill('Mudança de operação');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);
 assert.equal(await page.locator('.fleet-main-nav [aria-current="page"]').getAttribute('data-view'),'alerts');assert.equal(await page.locator('#alerts-content button').count(),1);const titles=await page.evaluate(()=>brandingTest.fixture.maintenance.map(m=>m.title));assert.deepEqual(titles,['Troca de óleo','Revisão reprogramada']);
 await page.locator('.fleet-main-nav [data-view="maintenance"]').click();await page.locator('[data-task-id="m2"]').getByRole('button',{name:'Detalhes',exact:true}).click();await page.getByRole('button',{name:'Ver histórico de alterações',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.fleet-change-history').innerText.includes('Mudança de operação'));await page.locator('.fleet-change-history summary').click();assert.match(await page.locator('.fleet-change-history').innerText(),/Troca de óleo/);
 if(output)await page.screenshot({path:path.join(output,'xrmovi-service-details-desktop.png'),fullPage:false});assert.deepEqual(errors,[]);await page.close();
});

test('pending KPI resets stale maintenance-local filters and retains the selected contract',async()=>{
 const {page,errors}=await open();await page.selectOption('#xrm-contract-filter','c1');await page.locator('.fleet-main-nav [data-view="maintenance"]').click();await page.selectOption('#maintenance-status','done');await page.locator('#maintenance-search').fill('Não existe');await page.locator('.fleet-main-nav [data-view="dashboard"]').click();await page.locator('.fleet-kpi').filter({hasText:'Revisões pendentes'}).click();
 assert.equal(await page.locator('#maintenance-status').inputValue(),'open');assert.equal(await page.locator('#maintenance-search').inputValue(),'');assert.equal(await page.locator('#xrm-contract-filter').inputValue(),'c1');assert.equal(await page.locator('#v3-maintenance-list tbody tr').count(),1);assert.deepEqual(errors,[]);await page.close();
});

test('local maintenance clearing preserves the global contract filter',async()=>{
 const {page,errors}=await open();await page.selectOption('#xrm-contract-filter','c1');await page.locator('.fleet-main-nav [data-view="maintenance"]').click();await page.locator('#maintenance-search').fill('Revisão A');await page.selectOption('#maintenance-status','done');assert.match(await page.locator('#active-filter-summary').innerText(),/Contrato A/);assert.match(await page.locator('#active-filter-summary').innerText(),/Concluídas/);
 await page.locator('#maintenance-clear').click();assert.equal(await page.locator('#xrm-contract-filter').inputValue(),'c1');assert.equal(await page.locator('#maintenance-status').inputValue(),'open');assert.equal(await page.locator('#maintenance-search').inputValue(),'');await page.locator('.fleet-main-nav [data-view="dashboard"]').click();await page.locator('#xrm-clear-filters').click();assert.equal(await page.locator('#xrm-contract-filter').inputValue(),'');assert.match(await page.locator('#active-filter-summary').innerText(),/Contrato: Todos/);assert.deepEqual(errors,[]);await page.close();
});

test('financial totals reveal exactly their scoped entries and maintenance opens inline',async()=>{
 const {page,errors}=await open();await page.selectOption('#xrm-contract-filter','c1');await page.locator('.fleet-main-nav [data-view="financial"]').click();await page.locator('[data-financial-kind="all"]').click();assert.equal(await page.locator('#financial-entries tbody tr').count(),2);assert.match(await page.locator('#financial-entries').innerText(),/150,00/);assert.doesNotMatch(await page.locator('#financial-entries tbody').innerText(),/BBB2222/);
 await page.locator('[data-financial-kind="maintenance"]').click();assert.equal(await page.locator('#financial-entries tbody tr').count(),1);await page.getByRole('button',{name:'Ver manutenção',exact:true}).click();assert.equal(await page.locator('#v3-edit-overlay').getAttribute('data-task-id'),'m1');assert.equal(await page.locator('.fleet-main-nav [aria-current="page"]').getAttribute('data-view'),'financial');assert.deepEqual(errors,[]);await page.close();
});

test('concurrent edits cannot overwrite new data and readers can consult the same details',async()=>{
 const {page,errors}=await open();await page.locator('.fleet-main-nav [data-view="alerts"]').click();await page.locator('#alerts-content button').first().click();await page.getByRole('button',{name:'Editar programação',exact:true}).click();await page.evaluate(()=>{brandingTest.fixture.maintenance[0].revision=1;brandingTest.fixture.maintenance[0].title='Alteração de outro gestor'});const form=page.locator('#v3-edit-form');await form.locator('[name="title"]').fill('Minha alteração');await form.locator('[name="reason"]').fill('Tentativa com versão antiga');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-feedback').innerText.includes('outro usuário'));assert.equal(await page.evaluate(()=>brandingTest.fixture.maintenance[0].title),'Alteração de outro gestor');await page.getByRole('button',{name:'Atualizar detalhes',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#v3-edit-form h3')?.innerText.includes('Alteração de outro gestor'));assert.deepEqual(errors,[]);await page.close();
 const viewer=await open({role:'viewer'});await viewer.page.locator('.fleet-main-nav [data-view="alerts"]').click();await viewer.page.locator('#alerts-content button').first().click();assert.equal(await viewer.page.getByRole('button',{name:'Editar programação',exact:true}).count(),0);assert.equal(await viewer.page.getByRole('button',{name:'Concluir serviço',exact:true}).count(),0);assert.equal(await viewer.page.getByRole('button',{name:'Ver histórico de alterações',exact:true}).count(),1);assert.deepEqual(viewer.errors,[]);await viewer.page.close();
});

test('mobile details stay on alerts, fit the viewport and close with Escape',async()=>{
 const {page,errors}=await open({viewport:{width:390,height:844}});await page.locator('#xrm-mobile-header-menu').click();await page.locator('.xrm-mobile-more-sheet [data-mobile-view="alerts"]').click();await page.locator('#alerts-content button').first().click();assert.equal(await page.locator('#v3-edit-overlay').getAttribute('data-layout'),'drawer');const box=await page.locator('.v3-edit-dialog').boundingBox();assert.ok(box.width<=390&&box.x>=0);assert.equal(await page.locator('#fleet-mobile-view').inputValue(),'alerts');
 if(output)await page.screenshot({path:path.join(output,'xrmovi-service-details-mobile.png'),fullPage:false});await page.keyboard.press('Escape');assert.equal(await page.locator('#v3-edit-overlay').isVisible(),false);assert.equal(await page.locator('#view-alerts').isVisible(),true);assert.deepEqual(errors,[]);await page.close();
});

test('driver registration is searchable and vehicle registration saves its selected driver atomically',async()=>{
 const {page,errors}=await open();await page.locator('.fleet-main-nav [data-view="drivers"]').click();assert.equal(await page.locator('.fleet-commandbar').isVisible(),false);await page.locator('#driver-new').click();const form=page.locator('#v3-edit-form');await form.locator('[name="name"]').fill('Ana Motorista');await form.locator('[name="phone"]').fill('11999999999');await form.locator('[name="cnh"]').fill('CNH-TESTE');await form.locator('[name="cnh_category"]').selectOption('B');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);assert.match(await page.locator('#driver-list').innerText(),/Ana Motorista/);
 await page.locator('.fleet-main-nav [data-view="assets"]').click();await page.locator('#assets-actions button').click();await form.locator('[name="plate"]').fill('DRV9999');await form.locator('[name="brand"]').fill('Marca Teste');await form.locator('[name="model"]').fill('Modelo Teste');await form.locator('[name="driver_search"]').fill('Ana');await form.locator('[name="driver"]').selectOption('d1');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);assert.match(await page.locator('#fleet-table-body').innerText(),/Ana Motorista/);const call=await page.evaluate(()=>brandingTest.writes.find(write=>write.name==='xrmovi_vehicle_save_with_driver'));assert.equal(call.args.p_driver,'d1');assert.equal(call.args.p_plate,'DRV9999');assert.deepEqual(errors,[]);
 if(output)await page.screenshot({path:path.join(output,'xrmovi-drivers-vehicle.png'),fullPage:false});await page.close();
});

test('inactive drivers remain linked to existing vehicles and can be explicitly unlinked',async()=>{
 const {page,errors}=await open();await page.evaluate(()=>{brandingTest.drivers.push({id:'d1',name:'Motorista Inativo',active:false});Object.assign(brandingTest.fixture.vehicles[0],{driver_id:'d1',brand:'Marca Teste',model:'Modelo Teste'})});await page.locator('#refresh-button').click();await page.locator('.fleet-main-nav [data-view="assets"]').click();await page.locator('#fleet-table-body tr').first().getByRole('button',{name:'Editar',exact:true}).click();const form=page.locator('#v3-edit-form');assert.equal(await form.locator('[name="driver"]').inputValue(),'d1');assert.match(await form.locator('[name="driver"]').innerText(),/inativo/);await form.locator('[name="driver"]').selectOption('');await form.locator('[name="driver_search"]').fill('qualquer');assert.equal(await form.locator('[name="driver"]').inputValue(),'');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);assert.equal(await page.evaluate(()=>brandingTest.fixture.vehicles[0].driver_id),null);assert.deepEqual(errors,[]);await page.close();
});

test('IPVA expenses become alerts while unpaid and enter financial totals only when paid',async()=>{
 const {page,errors}=await open();await page.locator('.fleet-main-nav [data-view="maintenance"]').click();await page.locator('[data-maintenance-mode="expenses"]').click();assert.equal(await page.locator('#maintenance-panel').isVisible(),false);await page.locator('#expense-new').click();const form=page.locator('#v3-edit-form');await form.locator('[name="vehicle"]').selectOption('v1');await form.locator('[name="expense_category"]').selectOption('ipva');await form.locator('[name="description"]').fill('IPVA do veículo A');await form.locator('[name="due_date"]').fill('2020-01-01');await form.locator('[name="amount"]').fill('1000.25');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);assert.match(await page.locator('#expense-list').innerText(),/IPVA do veículo A/);
 await page.selectOption('#xrm-contract-filter','c1');await page.locator('.fleet-main-nav [data-view="financial"]').click();assert.match(await page.locator('[data-financial-kind="all"]').innerText(),/150,00/);assert.match(await page.locator('[data-financial-kind="expense"]').innerText(),/0,00/);await page.locator('.fleet-main-nav [data-view="alerts"]').click();await page.locator('#alerts-content button').filter({hasText:'IPVA do veículo A'}).click();assert.equal(await page.locator('#v3-edit-overlay').getAttribute('data-expense-id'),'e1');await page.getByRole('button',{name:'Registrar pagamento',exact:true}).click();assert.equal(await form.locator('[name="payment_status"]').inputValue(),'paid');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);assert.doesNotMatch(await page.locator('#alerts-content').innerText(),/IPVA do veículo A/);
 await page.locator('.fleet-main-nav [data-view="financial"]').click();assert.match(await page.locator('[data-financial-kind="all"]').innerText(),/1\.150,25/);await page.locator('[data-financial-kind="expense"]').click();assert.equal(await page.locator('#financial-entries tbody tr').count(),1);assert.match(await page.locator('#financial-entries').innerText(),/IPVA/);assert.deepEqual(errors,[]);await page.close();
});

test('driver and expense queries, role restrictions and mobile module selection remain usable',async()=>{
 const {page,errors}=await open({viewport:{width:390,height:844}});await page.locator('#xrm-mobile-header-menu').click();await page.locator('.xrm-mobile-more-sheet [data-mobile-view="drivers"]').click();assert.equal(await page.locator('#view-drivers').isVisible(),true);await page.locator('#driver-search').fill('Inexistente');await page.locator('#driver-clear').click();assert.equal(await page.locator('#driver-search').inputValue(),'');await page.locator('.xrm-mobile-bottom-nav [data-mobile-view="maintenance"]').click();await page.locator('[data-maintenance-mode="expenses"]').click();assert.equal(await page.locator('#expense-panel').isVisible(),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(output)await page.screenshot({path:path.join(output,'xrmovi-expenses-mobile.png'),fullPage:false});assert.deepEqual(errors,[]);await page.close();
 const viewer=await open({role:'viewer'});await viewer.page.locator('.fleet-main-nav [data-view="drivers"]').click();assert.equal(await viewer.page.locator('#driver-new').isVisible(),false);await viewer.page.locator('.fleet-main-nav [data-view="maintenance"]').click();await viewer.page.locator('[data-maintenance-mode="expenses"]').click();assert.equal(await viewer.page.locator('#expense-new').isVisible(),false);assert.equal(await viewer.page.evaluate(()=>brandingTest.writes.length),0);assert.deepEqual(viewer.errors,[]);await viewer.page.close();
});

test('expense and maintenance entry actions are visible together and saving a standalone service reveals its record',async()=>{
 const {page,errors}=await open();await page.locator('.fleet-main-nav [data-view="maintenance"]').click();assert.equal(await page.locator('#expense-new').isVisible(),true);assert.equal(await page.locator('#maintenance-new').isVisible(),true);assert.equal(await page.locator('#expense-panel').isVisible(),false);
 await page.locator('#expense-new').click();const form=page.locator('#v3-edit-form');assert.equal(await form.locator('[name="expense_category"]').inputValue(),'outros');await form.locator('[name="vehicle"]').selectOption('v1');await form.locator('[name="description"]').fill('Lavagem adicional');await form.locator('[name="amount"]').fill('80');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);assert.equal(await page.locator('#expense-panel').isVisible(),true);assert.match(await page.locator('#expense-list').innerText(),/Lavagem adicional/);assert.equal(await page.locator('#maintenance-new').isVisible(),true);const write=await page.evaluate(()=>brandingTest.writes.find(w=>w.name==='xrmovi_expense_save'));assert.equal(write.args.p_category,'outros');assert.equal(write.args.p_amount,80);
 const action=await page.locator('#expense-new').boundingBox();assert.ok(action&&action.x+action.width<=1440);if(output)await page.screenshot({path:path.join(output,'xrmovi-expense-entry-desktop.png'),fullPage:false});assert.deepEqual(errors,[]);await page.close();
});


test('expired CNH saved on a driver appears immediately in dashboard, counts and alerts and can be corrected inline',async()=>{
 const {page,errors}=await open();await page.locator('.fleet-main-nav [data-view="drivers"]').click();await page.locator('#driver-new').click();let form=page.locator('#v3-edit-form');await form.locator('[name="name"]').fill('Motorista CNH teste');await form.locator('[name="cnh_expires"]').fill('2025-01-01');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);
 assert.equal(await page.locator('#nav-alert-count').innerText(),'3');assert.equal(await page.locator('#alerts-total').innerText(),'3');assert.equal(await page.locator('#alert-preview-count').innerText(),'3');assert.equal(await page.locator('.fleet-kpi-value').nth(2).innerText(),'3');
 await page.locator('.fleet-main-nav [data-view="dashboard"]').click();await page.locator('#alert-preview [data-driver-alert-id="d1"]').click();assert.match(await page.locator('#v3-edit-form').innerText(),/Motorista CNH teste/);assert.equal(await page.locator('.fleet-main-nav [aria-current="page"]').getAttribute('data-view'),'dashboard');await page.getByRole('button',{name:'Editar motorista',exact:true}).click();form=page.locator('#v3-edit-form');await form.locator('[name="cnh_expires"]').fill('2099-01-01');await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#v3-edit-overlay').hidden);assert.equal(await page.locator('[data-driver-alert-id]').count(),0);assert.equal(await page.locator('#nav-alert-count').innerText(),'2');assert.deepEqual(errors,[]);await page.close();
});

test('CNH alerts include the 30-day boundary and unlinked active drivers, respect vehicle filters and do not duplicate on refresh',async()=>{
 const {page,errors}=await open({role:'viewer'});await page.evaluate(()=>{const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};brandingTest.drivers=[{id:'d1',name:'Vencida',active:true,cnh_expires_on:'2025-01-01'},{id:'d2',name:'Limite 30 dias',active:true,cnh_expires_on:day(30)},{id:'d3',name:'Futura',active:true,cnh_expires_on:day(31)},{id:'d4',name:'Inativa',active:false,cnh_expires_on:'2025-01-01'},{id:'d5',name:'Sem validade',active:true,cnh_expires_on:null}];brandingTest.fixture.vehicles[0].driver_id='d2'});await page.locator('#refresh-button').click();await page.waitForFunction(()=>document.querySelectorAll('#alerts-content [data-driver-alert-id]').length===2);assert.match(await page.locator('#alerts-content').innerText(),/CNH VENCIDA: Vencida/);assert.match(await page.locator('#alerts-content').innerText(),/CNH A VENCER: Limite 30 dias/);assert.equal(await page.locator('#nav-alert-count').innerText(),'4');
 await page.selectOption('#xrm-contract-filter','c1');assert.equal(await page.locator('#alerts-content [data-driver-alert-id]').count(),1);assert.equal(await page.locator('#nav-alert-count').innerText(),'2');await page.locator('.fleet-main-nav [data-view="alerts"]').click();await page.locator('#alerts-content [data-driver-alert-id="d2"]').click();assert.equal(await page.getByRole('button',{name:'Editar motorista',exact:true}).count(),0);await page.locator('#v3-edit-close').click();await page.selectOption('#xrm-contract-filter','c2');assert.equal(await page.locator('#alerts-content [data-driver-alert-id]').count(),0);await page.selectOption('#xrm-contract-filter','');await page.locator('#refresh-button').click();await page.waitForFunction(()=>document.querySelectorAll('#alerts-content [data-driver-alert-id]').length===2);assert.equal(await page.locator('#nav-alert-count').innerText(),'4');assert.deepEqual(errors,[]);await page.close();
});


test('mobile navigation and filters load with or without the V4 feature',async()=>{
 const {page,errors}=await open({viewport:{width:390,height:844}});
 await page.waitForSelector('#fleet-kpis .fleet-kpi:nth-child(5)');
 const v4Enabled=await page.locator('script[src*="mobile-experience.js"]').count()>0;
 if(!v4Enabled){
  assert.equal(await page.locator('.xrm-mobile-bottom-nav').count(),0);
  assert.equal(await page.locator('.xrm-hero-filters').isVisible(),true);
  assert.equal(await page.locator('#fleet-kpis .fleet-kpi-value').first().textContent(),'2');
  assert.deepEqual(errors,[]);
  await page.close();
  return;
 }
 assert.equal(await page.locator('.xrm-mobile-bottom-nav').isVisible(),true);
 assert.equal(await page.locator('.xrm-mobile-dashboard-toolbar').isVisible(),true);
 assert.equal(await page.locator('#xrm-mobile-filters').getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('.xrm-hero-filters').isVisible(),false);
 assert.equal(await page.locator('.fleet-mobile-navigation').isVisible(),false);
 assert.equal(await page.locator('#refresh-button svg').isVisible(),true);
 assert.equal(await page.locator('#v3-company-mobile').inputValue(),companyA);
 assert.equal(await page.locator('#fleet-kpis .fleet-kpi').count(),5);
 assert.equal(await page.locator('#fleet-kpis .fleet-kpi-label svg').count(),5);
 const cols=await page.locator('#fleet-kpis').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
 assert.equal(cols,2);
 await page.locator('#xrm-mobile-filters').click();
 assert.equal(await page.locator('.xrm-hero-filters').isVisible(),true);
 assert.equal(await page.locator('.xrm-hero-filters #xrm-contract-filter').count(),1);
 await page.locator('#xrm-contract-filter').selectOption('c1');
 assert.equal(await page.locator('#fleet-kpis .fleet-kpi-value').first().textContent(),'1');
 await page.locator('#xrm-mobile-filters').click();
 assert.equal(await page.locator('.xrm-hero-filters').isVisible(),false);
 assert.equal(await page.locator('#fleet-kpis .fleet-kpi-value').first().textContent(),'1');
 await page.locator('.xrm-mobile-bottom-nav [data-mobile-view="assets"]').click();
 assert.equal(await page.locator('#view-assets').isVisible(),true);
 assert.equal(await page.locator('.xrm-mobile-dashboard-toolbar').isVisible(),false);
 await page.locator('#xrm-mobile-more').click();
 assert.equal(await page.locator('.xrm-mobile-more-sheet').isVisible(),true);
 await page.locator('.xrm-mobile-more-sheet [data-mobile-view="documents"]').click();
 assert.equal(await page.locator('#view-documents').isVisible(),true);
 assert.equal(await page.locator('.xrm-mobile-more-sheet').isVisible(),false);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 assert.ok(overflow<=3,'mobile viewport should not overflow horizontally');
 assert.deepEqual(errors,[]);
 await page.close();
});

test('mobile V4 does not alter desktop navigation and dashboard filter placement',async()=>{
 const {page,errors}=await open({viewport:{width:1440,height:900}});
 await page.waitForSelector('#fleet-kpis .fleet-kpi:nth-child(5)');
 assert.equal(await page.locator('.xrm-mobile-bottom-nav').isVisible(),false);
 assert.equal(await page.locator('.xrm-mobile-dashboard-toolbar').isVisible(),false);
 assert.equal(await page.locator('.fleet-breadcrumb #xrm-contract-filter').count(),1);
 assert.equal(await page.locator('.xrm-hero-filters').isVisible(),true);
 assert.deepEqual(errors,[]);
 await page.close();
});
