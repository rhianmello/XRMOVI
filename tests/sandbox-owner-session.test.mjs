import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const backend=readFileSync(new URL('../supabase/functions/xrmovi-payment-sandbox/index.ts',import.meta.url),'utf8');

test('only signed-in owner may call sandbox actions; anonymous or nonowner stops before POST',()=>{
 const start=page.indexOf('async function sandboxRequest(input)');
 const end=page.indexOf('function showSandboxOrder',start);
 const request=page.slice(start,end);
 assert.ok(start>0 && end>start);
 assert.match(request,/client\.auth\.getSession\(\)/);
 assert.match(request,/client\.auth\.getUser\(session\.access_token\)/);
 assert.match(request,/client\.rpc\('xrmovi_platform_is_admin'\)/);
 assert.match(request,/if\(isAdmin!==true\)throw requireOwnerSession\(\)/);
 assert.ok(request.indexOf("client.rpc('xrmovi_platform_is_admin')")<request.indexOf("fetch(sandboxEndpoint,{method:'POST'"));
 assert.match(backend,/client\.auth\.getUser\(token\)/);
 assert.match(backend,/client\.rpc\("xrmovi_platform_is_admin"\)/);
 assert.match(backend,/if\(adminError\|\|isAdmin!==true\)return reply\(origin,\{error:"Somente o proprietário/);
});

test('nonowner session receives explicit, optional account switching, never an automatic logout',()=>{
 assert.match(page,/id="xrm-sandbox-owner-session-warning" hidden/);
 assert.match(page,/id="xrm-sandbox-switch-owner"/);
 assert.match(page,/sandboxSwitchOwner\?\.addEventListener\('click',async\(\)=>\{/);
 assert.match(page,/client\.auth\.signOut\(\{scope:'local'\}\)/);
 assert.match(page,/window\.location\.assign\('\/\?login=1'\)/);
 const reqStart=page.indexOf('async function sandboxRequest(input)');
 const reqEnd=page.indexOf('function showSandboxOrder',reqStart);
 assert.doesNotMatch(page.slice(reqStart,reqEnd),/signOut/);
});

test('the ownership check cannot create payments by itself',()=>{
 const helper=page.slice(page.indexOf('function requireOwnerSession'),page.indexOf('async function sandboxRequest(input)'));
 assert.doesNotMatch(helper,/create_pix|create_card_hml|test_signed_card_webhook_hml/);
 assert.match(page,/Teste interno do webhook/);
 assert.match(backend,/if\(adminError\|\|isAdmin!==true\)/);
});
