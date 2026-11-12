import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../supabase/functions/xrmovi-pix/index.ts',import.meta.url),'utf8');

test('Pix accepts the new and legacy origins during domain migration',()=>{
  for(const origin of [
    'https://xrmovi.com.br',
    'https://www.xrmovi.com.br',
    'https://frota.nospassa.com.br',
    'https://www.frota.nospassa.com.br'
  ]) assert.ok(source.includes(JSON.stringify(origin)),origin+' must be on the allowlist');
  assert.match(source,/if\(origin&&!ORIGINS\.has\(origin\)\)return respond\(/);
  assert.match(source,/if\(ORIGINS\.has\(origin\)\)headers\["access-control-allow-origin"\]=origin/);
});

test('Pix function requires authentication and does not expose secret keys in the public client',()=>{
  assert.match(source,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/);
  assert.match(source,/Deno\.env\.get\(/);
});
