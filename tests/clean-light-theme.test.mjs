import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const file = (name) => readFileSync(join(root, name), 'utf8');
const theme = file('theme/clean-light.css');
const utility = file('theme/clean-utility.css');

function srgb(v) {
  const n = v / 255;
  return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
}
function luminosity(hex) {
  const rgb = hex.match(/[a-f\d]{2}/gi).map(x => parseInt(x, 16));
  return .2126 * srgb(rgb[0]) + .7152 * srgb(rgb[1]) + .0722 * srgb(rgb[2]);
}
function contrast(a, b) {
  const one = luminosity(a), two = luminosity(b);
  return (Math.max(one, two) + .05) / (Math.min(one, two) + .05);
}

test('cores principais atendem contraste AA para texto normal', () => {
  for (const [fg, bg] of [
    ['142b42', 'ffffff'], ['475569', 'ffffff'], ['0759a5', 'ffffff'],
    ['ffffff', '0759a5'], ['ffffff', '087986'], ['142b42', 'f7fafc']
  ]) {
    assert.ok(contrast(fg, bg) >= 4.5, '#'+fg+' / #'+bg+' must meet AA');
  }
});

test('tema aplicado a vendas, painel, administrador, SEO e páginas secundárias', () => {
  for (const [path, needle] of [
    ['index.html', 'class="xrm-sales-page"'],
    ['v3/index.html', 'class="fleet-page"'],
    ['admin/index.html', 'class="xrm-admin-page"'],
  ]) {
    assert.ok(file(path).includes(needle), path + ' has page scope');
    assert.ok(file(path).includes('/theme/clean-light.css?v=20261114-1'), path + ' includes theme');
  }
  assert.ok(file('seo/comercial.css').startsWith('@import url("/theme/clean-light.css?v=20261114-1");'));
  for (const path of [
    'cliente/index.html', 'recursos/index.html', 'redefinir-senha.html',
    'widget/index.html', 'km/index.html', 'v3/os.html',
    'v3/operacoes.html', 'admin/storage.html',
    'admin/storage-hml.html', 'admin/storage-hml-probe.html'
  ]) {
    assert.ok(file(path).includes('xrm-utility-page'), path + ' has utility page class');
    assert.ok(file(path).includes('/theme/clean-utility.css?v=20261114-1'), path + ' includes utility theme');
  }
});

test('CSS mantém regras escopadas e não oculta ações de negócio', () => {
  for (const css of [theme, utility]) {
    assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length);
    assert.doesNotMatch(css, /display\s*:\s*none/i);
  }
  assert.match(theme, /\.fleet-page #view-dashboard/);
  assert.match(theme, /\.xrm-admin-page \.trial-metric/);
  assert.match(theme, /\.xrm-sales-page \.xrm-mobile-nav nav/);
  assert.match(utility, /\.xrm-utility-page .*input/);
});
