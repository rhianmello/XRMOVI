import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const auth=readFileSync(new URL('../auth/public-auth.js',import.meta.url),'utf8');

test('header has one independently updatable auth action',()=>{
 assert.match(html,/id="xrm-header-auth-link" href="\/\?login=1"/);
 assert.match(auth,/getElementById\('xrm-header-auth-link'\)/);
 assert.match(auth,/headerAuthLink\.textContent='Painel ADM'/);
 assert.match(auth,/headerAuthLink\.textContent='Meu painel'/);
 assert.match(auth,/headerAuthLink\.textContent='Entrar \/ Criar conta'/);
 assert.match(auth,/headerAuthLink\.href='\/admin\/'/);
 assert.match(auth,/headerAuthLink\.href='\/v3\/'/);
});

test('remote auth and platform role determine the label',()=>{
 assert.match(auth,/await client\.auth\.getUser\(\)/);
 assert.match(auth,/await client\.rpc\('xrmovi_platform_is_admin'\)/);
 assert.match(auth,/renderHeaderSession\(!roleError&&isAdmin===true\?'admin':'user'\)/);
 assert.match(auth,/event==='SIGNED_OUT'/);
 assert.match(auth,/event==='SIGNED_IN'/);
});

test('logged-in header navigation bypasses login dialog interception',()=>{
 assert.match(html,/if\(a\.id==='xrm-header-auth-link' && a\.getAttribute\('href'\)!=='\/\?login=1'\)return;/);
 assert.match(html,/\/auth\/public-auth\.js\?v=20261112-auth-header-1/);
 assert.doesNotMatch(auth,/XRMOVI_MP_ACCESS_TOKEN|XRMOVI_MP_TEST_ACCESS_TOKEN/);
});
