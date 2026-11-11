import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const site='https://xrmovi.com.br';
const sitemap=read('sitemap.xml');
const robots=read('robots.txt');

test('SEO pages have indexable canonical metadata and a single H1',()=>{
 for(const path of ['','gestao-de-frotas/','controle-de-manutencao/','controle-de-abastecimento/','calculadora-consumo-combustivel/','planilha-controle-frotas/']){
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
