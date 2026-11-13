import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const site='https://xrmovi.com.br';
const sitemap=read('sitemap.xml');
const robots=read('robots.txt');

test('SEO pages have indexable canonical metadata and a single H1',()=>{
 for(const path of ['','gestao-de-frotas/','controle-de-manutencao/','controle-de-abastecimento/','calculadora-consumo-combustivel/','planilha-controle-frotas/','preco-sistema-gestao-frotas/','controle-quilometragem-qr-code/','sobre/','seguranca/','exemplos-de-uso/']){
  const file=read((path||'')+'index.html');
  const url=site+'/'+path;
  assert.ok(file.includes('<link rel="canonical" href="'+url+'">'),url+' canonical');
  assert.ok(sitemap.includes('<loc>'+url+'</loc>'),url+' sitemap');
  assert.match(file,/<meta name="description" content="[^"]+"/);
  assert.equal((file.match(/<h1(?:\s|>)/g)||[]).length,1,path+' H1');
 }
 assert.ok(robots.includes('Sitemap: '+site+'/sitemap.xml'));
});

test('private applications and password recovery stay out of index',()=>{
 for(const path of ['admin/index.html','cliente/index.html','v3/index.html','km/index.html','redefinir-senha.html']){
  const file=read(path);
  assert.match(file,/<meta name="robots" content="[^"]*noindex/i,path);
  assert.ok(!sitemap.includes(site+'/'+path.split('/index.html')[0]+'/'),path+' not in sitemap');
 }
});

test('homepage structured data and social metadata use canonical URL',()=>{
 const home=read('index.html');
 const raw=[...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
 assert.ok(raw.length>=2);
 const ld=raw.map(match=>JSON.parse(match[1]));
 assert.ok(ld.some(item=>item['@type']==='WebSite'&&item.url===site+'/'));
 assert.ok(ld.some(item=>item['@type']==='SoftwareApplication'&&item.url===site+'/'));
 assert.match(home,/<meta property="og:site_name" content="XRMOVI">/);
 assert.match(home,/<meta property="og:locale" content="pt_BR">/);
});


test('public sales pages have internal links, factual prices and structured content',()=>{
 const home=read('index.html');
 assert.ok(home.includes('href="/preco-sistema-gestao-frotas/"'));
 assert.ok(home.includes('href="/controle-quilometragem-qr-code/"'));
 const prices=read('preco-sistema-gestao-frotas/index.html');
 const qr=read('controle-quilometragem-qr-code/index.html');
 for(const price of ['R$ 19,90','R$ 39,90','R$ 79,90','R$ 149,90']) assert.ok(prices.includes(price));
 assert.ok(prices.includes('/pricing/fleet-pricing.js'));
 assert.ok(prices.includes('vehicles=5&amp;trial=1'));
 assert.match(qr,/foto do hodômetro/i);
 assert.match(qr,/não é um rastreador GPS/i);
 for(const html of [prices,qr]){
  assert.ok(html.includes('name="robots" content="index, follow'));
  assert.ok(html.includes('/analytics/xrmovi-analytics.js'));
  const schemas=Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),v=>JSON.parse(v[1]));
  assert.ok(schemas.some(v=>v['@type']==='BreadcrumbList'));
  assert.ok(schemas.some(v=>v['@type']==='WebPage'));
 }
});

test('transparency pages disclose a real contact and label illustrations accurately',()=>{
 const home=read('index.html');
 const about=read('sobre/index.html');
 const security=read('seguranca/index.html');
 const cases=read('exemplos-de-uso/index.html');
 const llms=read('llms.txt');
 for(const path of ['sobre/','seguranca/','exemplos-de-uso/']){
  assert.ok(home.includes('href="/'+path+'"'),path+' linked from homepage');
  assert.ok(sitemap.includes('<loc>'+site+'/'+path+'</loc>'),path+' in sitemap');
 }
 assert.ok(about.includes('Rhian Mello'));
 assert.ok(about.includes('mailto:rhian.udm@gmail.com'));
 assert.ok(security.includes('não representam auditoria externa')||security.includes('não representam auditoria externa'.replace('não','Não')));
 assert.match(cases,/não relatos de clientes reais/i);
 assert.match(cases,/simulações ilustrativas/i);
 assert.ok(!/application\/ld\+json[^]*?"aggregateRating"/i.test(cases),'no fake aggregate rating');
 assert.ok(llms.includes('https://xrmovi.com.br/seguranca/'));
 assert.ok(llms.includes('não depoimentos'));
});
