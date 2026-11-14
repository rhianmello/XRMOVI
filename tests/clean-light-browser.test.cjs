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
  const c=await colors(page,'.fleet-kpi');
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
