const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});

async function load(urlPath, viewport={width:1365,height:900}){
  const page=await browser.newPage({viewport});
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='xrmovi.test')return route.abort();
    const pathname=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
    const resolved=path.resolve(root,'.'+pathname);
    if(!resolved.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
    const ext=path.extname(resolved);
    const type={'.html':'text/html','.css':'text/css','.js':'text/javascript',
      '.json':'application/json','.svg':'image/svg+xml','.png':'image/png',
      '.webmanifest':'application/manifest+json'}[ext]||'application/octet-stream';
    try{return route.fulfill({status:200,contentType:type,body:fs.readFileSync(resolved)});}
    catch{return route.fulfill({status:404,body:''});}
  });
  await page.goto('https://xrmovi.test'+urlPath,{waitUntil:'domcontentloaded'});
  return page;
}
async function colors(page,selector){
  return page.locator(selector).first().evaluate(el=>{
    const c=getComputedStyle(el);
    return {bg:c.backgroundColor,fg:c.color};
  });
}
test('landings, frota, admin, SEO e portal do motorista carregam a paleta clara',async()=>{
  for(const [url,selector,background] of [
    ['/','body','rgb(255, 255, 255)'],
    ['/v3/','body','rgb(247, 250, 252)'],
    ['/admin/','body','rgb(247, 250, 252)'],
    ['/gestao-de-frotas/','body','rgb(255, 255, 255)'],
    ['/km/','body','rgb(247, 250, 252)']
  ]){
    const page=await load(url);
    const c=await colors(page,selector);
    assert.equal(c.bg,background,url+' light background');
    assert.equal(c.fg,'rgb(20, 43, 66)',url+' dark foreground');
    await page.close();
  }
});
test('card de dados e superfícies do painel permanecem brancos',async()=>{
  const page=await load('/v3/');
  const c=await colors(page,'.fleet-panel');
  assert.equal(c.bg,'rgb(255, 255, 255)');
  assert.equal(c.fg,'rgb(20, 43, 66)');
  await page.close();
});
test('vendas e páginas de apoio seguem utilizáveis em celular estreito',async()=>{
  for(const url of ['/','/recursos/','/km/']){
    const page=await load(url,{width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
      true,url+' has no horizontal page overflow');
    await page.close();
  }
});


test('dashboard executivo e cabeçalhos antes escuros ficam realmente claros no mobile',async()=>{
  const page=await load('/v3/',{width:390,height:844});
  for(const selector of [
    '#view-dashboard .fleet-action-panel',
    '#view-dashboard .fleet-expiry-panel',
    '#view-dashboard .fleet-status-panel',
    '#view-dashboard .fleet-action-panel > header',
    '#view-dashboard .fleet-expiry-panel > header',
    '#view-dashboard .fleet-status-panel > header'
  ]){
    const actual=await colors(page,selector);
    assert.ok(['rgb(255, 255, 255)','rgb(248, 251, 253)'].includes(actual.bg),
      selector+' must have light surface, got '+actual.bg);
    assert.equal(actual.fg,'rgb(20, 43, 66)',selector+' readable foreground');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
  await page.close();
});

test('legenda, gráfico de vencimentos e aviso de multa gerados dinamicamente permanecem legíveis',async()=>{
 const page=await load('/v3/',{width:390,height:844});
 await page.evaluate(()=>{
  const bars=document.createElement('div');bars.id='v3-expiry-bars';
  const row=document.createElement('div');row.style.color='#bdd3e4';
  const name=document.createElement('span');name.textContent='Vencidos';
  const track=document.createElement('div');track.style.background='#173147';
  const fill=document.createElement('div');fill.style.background='#e66a77';fill.style.width='25%';
  const count=document.createElement('strong');count.textContent='2';
  track.append(fill);row.append(name,track,count);bars.append(row);
  document.querySelector('#expiry-panel').append(bars);
  const legend=document.createElement('div');legend.className='xrm-status-legend-item';
  legend.innerHTML='<span></span><span>Operacionais (Ativo)</span><strong>2</strong>';
  document.querySelector('#situation-legend').append(legend);
  const fine=document.createElement('div');fine.id='xrm-fines-quick';fine.className='xrm-fines-quick';
  fine.innerHTML='<div><strong>0 multa(s) pendente(s)</strong><span> · R$ 0,00</span></div><button class="fleet-button">Ver multas</button>';
  document.querySelector('#view-dashboard').append(fine);
  const chip=document.createElement('div');chip.className='xrm-mileage-dash-chip';
  chip.innerHTML='<span>Troca de óleo</span><strong>0</strong>';
  document.querySelector('.xrm-mileage-dashboard').append(chip);
 });
 for(const [selector,bg,fg] of [
   ['#v3-expiry-bars > div > div','rgb(231, 239, 245)',null],
   ['#v3-expiry-bars > div > span',null,'rgb(52, 76, 99)'],
   ['#v3-expiry-bars > div > strong',null,'rgb(20, 43, 66)'],
   ['#situation-legend .xrm-status-legend-item','rgb(244, 248, 251)','rgb(52, 76, 99)'],
   ['#situation-legend .xrm-status-legend-item strong',null,'rgb(20, 43, 66)'],
   ['#xrm-fines-quick','rgb(240, 248, 252)','rgb(52, 76, 99)'],
   ['#xrm-fines-quick strong',null,'rgb(20, 43, 66)'],
   ['.xrm-mileage-dashboard .xrm-mileage-dash-chip','rgb(244, 249, 252)','rgb(52, 76, 99)']
 ]){
  const actual=await colors(page,selector);
  if(bg)assert.equal(actual.bg,bg,selector+' background');
  if(fg)assert.equal(actual.fg,fg,selector+' foreground');
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
 await page.close();
});

test('menu real da landing: hamburger visível, foco perceptível e abre no celular',async()=>{
 const page=await load('/',{width:390,height:844});
 const summary=page.locator('header .xrm-mobile-nav > summary');
 const actual=await colors(page,'header .xrm-mobile-nav > summary');
 assert.equal(actual.bg,'rgb(238, 246, 251)');
 assert.equal(actual.fg,'rgb(7, 81, 139)');
 assert.equal(await summary.evaluate(el=>getComputedStyle(el).opacity),'1');
 const size=await summary.boundingBox();
 assert.ok(size.width>=44 && size.height>=44,'touch target >= 44px');
 await summary.click();
 assert.equal(await page.locator('header .xrm-mobile-nav').evaluate(el=>el.open),true);
 assert.equal((await colors(page,'header .xrm-mobile-nav nav')).bg,'rgb(255, 255, 255)');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
 await page.close();
});

test('Clientes compacto no desktop e cartões acessíveis no mobile',async()=>{
 for(const width of [390,760,1365]){
  const page=await load('/admin/',{width,height:900});
  const metrics=await page.evaluate(()=>{
   document.querySelector('#loading').hidden=true;
   document.querySelector('#content').hidden=false;
   document.querySelector('#view-overview').hidden=true;
   document.querySelector('#view-customers').hidden=false;
   const body=document.querySelector('#customers-body');
   body.replaceChildren();
   for(let i=0;i<6;i++){
    const tr=document.createElement('tr');
    tr.innerHTML='<td><div class="customer-identity-line"><b>cliente'+i+'@empresa-exemplo.com.br</b><span class="customer-presence offline">Offline</span></div><span class="sub">Empresa teste '+i+'</span><span class="sub">Interno</span></td><td>START · R$ 19,90</td><td><span class="pill active">Ativo</span><span class="sub">Autorização manual até 20/11/2026</span></td><td>1</td><td><span class="pill active">Manual até 20/11/2026</span></td><td>15/11/2026</td><td><div class="actions"><select class="search" aria-label="Classificação"><option>Interno</option></select><button class="btn danger">Revogar autorização</button><button class="btn">Bloquear</button><button class="btn">Mensagem</button><button class="btn danger">Cancelar renovação</button></div></td>';
    body.append(tr);
   }
   const row=body.querySelector('tr'),button=row.querySelector('button'),table=document.querySelector('.customers-table');
   return {
    pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,
    tableMinWidth:getComputedStyle(table).minWidth,
    rowDisplay:getComputedStyle(row).display,rowHeight:row.getBoundingClientRect().height,
    headerDisplay:getComputedStyle(table.tHead).display,
    cellFontSize:parseFloat(getComputedStyle(row.cells[1]).fontSize),
    actionVisible:button.getBoundingClientRect().width>45&&button.getBoundingClientRect().height>=26,
    actionContainerWidth:row.cells[6].getBoundingClientRect().width
   };
  });
  assert.ok(metrics.pageWidth<=width+2,'viewport '+width+' must not overflow: '+JSON.stringify(metrics));
  assert.equal(metrics.actionVisible,true,'action button readable at '+width);
  if(width<=760){
   assert.equal(metrics.headerDisplay,'none');
   assert.equal(metrics.rowDisplay,'grid');
   assert.equal(metrics.tableMinWidth,'0px');
  }else{
   assert.equal(metrics.rowDisplay,'table-row');
   assert.ok(metrics.cellFontSize<=11,'desktop customer body must remain compact');
   assert.ok(metrics.rowHeight<108,'desktop six client rows should remain compact: '+metrics.rowHeight);
  }
  await page.close();
 }
});
