import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('a logo oficial do XRMOVI existe no HTML de todos os painéis', () => {
  const fleet = read('v3/index.html');
  const admin = read('admin/index.html');
  const client = read('cliente/index.html');
  const official = /\/assets\/xrmovi-logo-oficial\.svg/;
  assert.match(fleet, /<a class="xrm-mobile-brand"[^>]*>[\s\S]*?<img[^>]+src="\/assets\/xrmovi-logo-oficial\.svg/);
  assert.match(fleet, /class="xrmovi-fleet-logo"[^>]+src="\/assets\/xrmovi-logo-oficial\.svg/);
  assert.match(admin, official);
  assert.match(client, official);
});

test('marca móvel não depende de criação por JS e não é substituída por ícone de caminhão', () => {
  const script = read('v3/mobile-experience.js');
  const css = read('v3/mobile-experience.css');
  assert.doesNotMatch(script, /brand\.innerHTML\s*=/);
  assert.match(css, /\.fleet-page \.xrm-mobile-brand img/);
  assert.match(css, /\.fleet-page \.fleet-top-actions #fleet-session-email:not\(\[hidden\]\)/);
  assert.match(css, /flex-wrap:wrap!important/);
});
