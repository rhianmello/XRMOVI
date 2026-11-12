import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const analytics=read('analytics/xrmovi-analytics.js');
const admin=read('admin/index.html');
const auth=read('auth/public-auth.js');
const KEY='xrmovi_ga4_internal_admin_v1';

function boot(initial={}) {
 const items=new Map(Object.entries(initial));
 const localStorage={
  getItem:key=>items.has(key)?items.get(key):null,
  setItem:(key,value)=>items.set(key,String(value)),
  removeItem:key=>items.delete(key)
 };
 const window={};
 const document={readyState:'loading',addEventListener(){}};
 vm.runInNewContext(analytics,{
  window,document,localStorage,
  Date,JSON,Number,URL,URLSearchParams,setTimeout,clearTimeout,
  location:{hostname:'xrmovi.com.br',origin:'https://xrmovi.com.br',pathname:'/',search:''}
 });
 return {api:window.XrmoviAnalytics,items};
}

test('verified owner flag excludes only this browser and expires',()=>{
 const {api,items}=boot();
 assert.equal(api.isInternal(),false);
 api.setInternal(true);
 assert.equal(api.isInternal(),true);
 const saved=JSON.parse(items.get(KEY));
 assert.equal(saved.role,'platform_admin');
 assert.ok(saved.until>Date.now());
 assert.ok(saved.until<=Date.now()+14*24*60*60*1000+1000);
 api.setInternal(false);
 assert.equal(api.isInternal(),false);
 assert.equal(items.has(KEY),false);
});

test('expired or malformed internal flags are not honored',()=>{
 const expired=boot({[KEY]:JSON.stringify({role:'platform_admin',until:1})});
 assert.equal(expired.api.isInternal(),false);
 assert.equal(expired.items.has(KEY),false);
 const bad=boot({[KEY]:'not-json'});
 assert.equal(bad.api.isInternal(),false);
 const forgedRole=boot({[KEY]:JSON.stringify({role:'customer',until:Date.now()+60000})});
 assert.equal(forgedRole.api.isInternal(),false);
});

test('admin classification requires successful platform authorization',()=>{
 const proof="const check=await rpc('platform_is_admin');if(check!==true)throw Error(";
 assert.ok(admin.includes(proof));
 assert.ok(admin.indexOf("localStorage.setItem('"+KEY+"'")>admin.indexOf(proof));
 assert.match(admin,/localStorage\.removeItem\('xrmovi_ga4_internal_admin_v1'\)/);
 assert.match(auth,/if\(!adminError&&isAdmin===true\)\{\s*window\.XrmoviAnalytics\?\.setInternal\?\.\(true\)/);
});

test('analytics and attribution guard against owner/test traffic',()=>{
 assert.match(analytics,/function startTag\(\)\{\s*if\(loaded\|\|isInternal\(\)\)return;/);
 assert.match(analytics,/function track\(name,data\)\{\s*if\(status!=='accepted'\|\|isInternal\(\)/);
 assert.match(analytics,/function captureCampaign\(\)\{\s*if\(status!=='accepted'\|\|isInternal\(\)\)return;/);
 assert.match(analytics,/async function syncAttribution\(client\)\{\s*if\(status!=='accepted'\|\|isInternal\(\)/);
 assert.match(analytics,/async function syncPurchaseIdentity\(client\)\{\s*if\(isInternal\(\)/);
 assert.doesNotMatch(analytics,/gtag\('event','purchase'/);
});
