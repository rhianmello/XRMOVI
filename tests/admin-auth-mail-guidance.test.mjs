import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');

test('admin password recovery and mail instructions use the current domain',()=>{
 assert.match(html,/https:\/\/xrmovi\.com\.br\/redefinir-senha\.html/);
 assert.match(html,/acesso@xrmovi\.com\.br/);
 assert.match(html,/avisos@xrmovi\.com\.br/);
 assert.doesNotMatch(html,/nospassa\.com\.br/);
});
test('support inbox delivery is not represented as proof of outbound SMTP configuration',()=>{
 assert.match(html,/Receber mensagens em suporte@xrmovi\.com\.br não comprova/);
 assert.match(html,/somente após validação do domínio no provedor de envio/);
});
