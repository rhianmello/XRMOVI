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
  const browserLogs=[];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if(message.type()==='error') browserLogs.push('console: '+message.text());});
  page.on('requestfailed', request => browserLogs.push('failed '+request.url()+': '+request.failure()?.errorText));
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
    state.drivers=[];state.expenses=[];state.fines=[];state.failVehicle=false;state.writes=[];state.failCost=false;state.failComplete=false;state.changes=[];state.costRequests=[];state.costError=false;state.costMultiplier=1;state.fixture={vehicles:[{id:'v1',plate:'AAA1111',category:'Leve',contract_id:'c1',status:'Ativo',odometer_value:100},{id:'v2',plate:'BBB2222',category:'Caminhão',contract_id:'c2',status:'Manutenção',odometer_value:100}],maintenance:[{id:'m1',vehicle_id:'v1',plate:'AAA1111',title:'Revisão A',due_date:old,status:'open',created_at:today},{id:'m2',vehicle_id:'v2',plate:'BBB2222',title:'Revisão B',due_date:old,status:'open',created_at:today}],fuel:[{vehicle_id:'v1',fueled_on:today,liters:10,total_cost:100},{vehicle_id:'v2',fueled_on:today,liters:20,total_cost:200}]};
    state.client = {
      auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
      functions: { invoke: async () => ({ data: { enabled: false }, error: null }) },
      rpc: async (name, args) => {
        if(name==='xrmovi_access_status')return {data:{allowed:true,billing_required:false,status:'active'}};
        if(name==='xrmovi_drivers_list')return {data:state.drivers};
        if(name==='xrmovi_expenses_list')return {data:state.expenses.map(e=>({...e,plate:state.fixture.vehicles.find(v=>v.id===e.vehicle_id)?.plate}))};
        if(name==='xrmovi_traffic_fines_list')return {data:state.fines.map(f=>({...f,plate:state.fixture.vehicles.find(v=>v.id===f.vehicle_id)?.plate||'Veículo'}))};
        if(name==='xrmovi_traffic_fine_history')return {data:state.writes.filter(x=>x.name==='xrmovi_traffic_fine_save'&&x.args.p_id===args.fid).map(x=>({date:new Date().toISOString(),actor:'Responsável teste',reason:x.args.p_reason||'Cadastro',before:null,after:{status:x.args.p_status,amount:x.args.p_amount}}))};
        if(name==='xrmovi_traffic_fine_save'){
          state.writes.push({name,args});const old=state.fines.find(x=>x.id===args.p_id);
          if(old&&old.revision!==args.p_expected_revision)return {error:{message:'Registro atualizado por outra pessoa'}};
          const record={...old,id:old?.id||'fine-'+(state.fines.length+1),company_id:args.cid,
            vehicle_id:args.p_vehicle,driver_id:args.p_driver,notice_number:args.p_number,authority:args.p_authority,
            infraction_code:args.p_code,description:args.p_description,infraction_date:args.p_infraction_date,
            notice_date:args.p_notice_date,location:args.p_location,amount:args.p_amount,due_date:args.p_due,
            driver_nomination_deadline:args.p_nomination_due,defense_deadline:args.p_defense_due,points:args.p_points,
            responsibility:args.p_responsibility,status:args.p_status,paid_on:args.p_paid,notes:args.p_notes,revision:(old?.revision||0)+1};
          if(record.status==='paid'&&!record.expense_id){record.expense_id='expense-fine-'+record.id;
            state.expenses.push({id:record.expense_id,vehicle_id:record.vehicle_id,category:'multa',
              description:'Multa '+record.notice_number,amount:record.amount,expense_date:record.infraction_date,
              paid_on:record.paid_on,due_date:record.due_date,revision:1});}
          if(old)Object.assign(old,record);else state.fines.push(record);
          return {data:record.id};
        }
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
  try{
    await page.waitForFunction(() => document.getElementById('company-name')?.textContent.startsWith('Empresa de Teste'),{timeout:6500});
  }catch(error){
    const snapshot=await page.evaluate(()=>({
      title:document.title,
      company:document.querySelector('#company-name')?.textContent,
      login:document.querySelector('#v3login')?.textContent?.slice(0,700),
      visibleViews:[...document.querySelectorAll('.fleet-view')].filter(x=>!x.classList.contains('hidden')).map(x=>x.id),
      kpis:document.querySelectorAll('#fleet-kpis .fleet-kpi').length,
      notice:document.querySelector('#page-notice')?.textContent?.slice(0,450),
      scripts:[...document.scripts].map(s=>({src:s.src?.slice(0,150),type:s.type})).filter(x=>x.src.includes('xrmovi')||x.src.includes('mobile')),
      mobileNav:!!document.querySelector('.xrm-mobile-bottom-nav')
    }));
    console.log('DIAGNOSTIC_BROWSER',JSON.stringify({errors,browserLogs,snapshot}));
    throw error;
  }
  await page.waitForFunction(() => document.getElementById('v3-company'),{timeout:6500});
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


test('diagnostic desktop: authenticated mock reaches saved vehicles',async()=>{const {page,errors}=await open({viewport:{width:1366,height:850}});await page.waitForSelector('#fleet-kpis .fleet-kpi',{timeout:7500});console.log('DESKTOP_LOADED',await page.locator('#fleet-kpis .fleet-kpi-value').allTextContents());assert.deepEqual(errors,[]);await page.close()});
test('diagnostic mobile: authenticated mock reaches saved vehicles',async()=>{const {page,errors}=await open({viewport:{width:390,height:844}});await page.waitForSelector('#fleet-kpis .fleet-kpi',{timeout:7500});console.log('MOBILE_LOADED',await page.locator('#fleet-kpis .fleet-kpi-value').allTextContents());assert.deepEqual(errors,[]);await page.close()});

test('fines desktop: vehicle shortcut, auditable registration and paid-only expense mirror',async()=>{
 const {page,errors}=await open({viewport:{width:1366,height:850}});
 await page.waitForSelector('#fleet-table-body tr',{state:'attached'});
 await page.locator('.fleet-main-nav [data-view="assets"]').click();
 await page.locator('#fleet-table-body tr').first().getByRole('button',{name:'Multas'}).click();
 assert.equal(new URL(page.url()).hash,'#fines');
 assert.equal(await page.locator('#xrm-fines-vehicle').inputValue(),'v1');
 await page.locator('#xrm-fines-add').click();
 await page.locator('#xrm-fines-form [name="notice"]').fill('AUTO-12345');
 await page.locator('#xrm-fines-form [name="authority"]').fill('DER RJ');
 await page.locator('#xrm-fines-form [name="description"]').fill('Infração para teste sem cobrança real');
 await page.locator('#xrm-fines-form [name="amount"]').fill('195.23');
 await page.locator('#xrm-fines-form button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#xrm-fines-list')?.textContent.includes('AUTO-12345'));
 assert.equal(await page.locator('#xrm-fines-open').textContent(),'1');
 assert.equal(await page.evaluate(()=>brandingTest.expenses.length),0);
 await page.locator('.xrm-fines-table').getByRole('button',{name:'Editar'}).click();
 await page.selectOption('#xrm-fines-form [name="status"]','paid');
 await page.locator('#xrm-fines-form [name="reason"]').fill('Pagamento confirmado com comprovante');
 page.on('dialog',dlg=>dlg.accept());
 await page.locator('#xrm-fines-form button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#xrm-fines-open')?.textContent==='0');
 const result=await page.evaluate(()=>({fines:brandingTest.fines.length,expenses:brandingTest.expenses.length}));
 assert.deepEqual(result,{fines:1,expenses:1});
 assert.deepEqual(errors,[]);await page.close();
});
test('fines mobile: dedicated screen appears in navigation and fits the viewport',async()=>{
 const {page,errors}=await open({viewport:{width:390,height:844}});
 await page.waitForSelector('#fleet-kpis .fleet-kpi',{state:'attached'});
 await page.evaluate(()=>{const panel=document.querySelector('#xrm-ga4-consent');if(panel&&!panel.hidden)panel.querySelector('.ga4-deny')?.click();});
 await page.locator('#xrm-mobile-more').click();
 await page.locator('.xrm-mobile-more-sheet [data-mobile-view="fines"]').click();
 assert.equal(await page.locator('#view-fines').isVisible(),true);
 assert.equal(await page.locator('#xrm-fines-add').isVisible(),true);
 assert.deepEqual(errors,[]);
 await page.close();
});
