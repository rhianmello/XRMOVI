import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const landing = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('commercial CTA to hire opens registration, not existing-account login', () => {
  assert.match(landing, /href="\/\?login=1&vehicles=5" data-fleet-cta>Começar agora<\/a>/);
  assert.match(landing, /const signupIntent=trial\|\|authUrl\.searchParams\.has\('vehicles'\)\|\|authUrl\.searchParams\.get\('signup'\)==='1';/);
  assert.match(landing, /document\.querySelector\(signupIntent\?'\[data-auth-mode="signup"\]':'\[data-auth-mode="signin"\]'\)\?\.click\(\)/);
});

test('existing-account login link remains distinct from registration', () => {
  assert.match(landing, /id="xrm-header-auth-link" href="\/\?login=1"/);
  assert.match(landing, /const trial=authUrl\.searchParams\.get\('trial'\)==='1';/);
  assert.match(landing, /href="\/\?login=1&vehicles=5&trial=1">Testar grátis por 7 dias<\/a>/);
});
