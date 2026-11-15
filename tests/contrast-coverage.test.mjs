import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  'index.html', 'v3/index.html', 'admin/index.html', 'cliente/index.html',
  'perguntas-frequentes/index.html', 'calculadora-consumo-combustivel/index.html',
  'planilha-controle-frotas/index.html', 'controle-de-abastecimento/index.html',
  'controle-de-manutencao/index.html', 'controle-quilometragem-qr-code/index.html',
  'gestao-de-frotas/index.html', 'preco-sistema-gestao-frotas/index.html',
  'recursos/index.html', 'sobre/index.html', 'seguranca/index.html',
  'exemplos-de-uso/index.html', 'cancelamento/index.html', 'termos/index.html',
  'privacidade/index.html', 'km/index.html', 'redefinir-senha.html',
  'widget/index.html', 'v3/operacoes.html', 'v3/os.html',
  'admin/storage.html', 'admin/storage-hml.html', 'admin/storage-hml-probe.html'
];

test('all existing user-facing pages load the contrast layer last in head', () => {
  for (const page of pages) {
    const html = readFileSync(resolve(root, page), 'utf8');
    const head = html.split('</head>')[0];
    assert.ok(html.includes('</head>'), 'missing closing head in ' + page);
    assert.ok(head.includes('/theme/contrast-20261114.css?v=20261114-1'), 'theme missing in ' + page);
    assert.ok(
      head.indexOf('/theme/contrast-20261114.css') > head.lastIndexOf('<style'),
      'theme must follow inline styles in ' + page
    );
  }
});

test('explore dialog, SEO and FAQ have explicit readable surfaces', () => {
  const css = readFileSync(resolve(root, 'theme/contrast-20261114.css'), 'utf8');
  const landing = readFileSync(resolve(root, 'index.html'), 'utf8');
  const faq = readFileSync(resolve(root, 'perguntas-frequentes/index.html'), 'utf8');
  assert.ok(css.includes('body.xrm-sales-page #demo{'));
  assert.ok(css.includes('#demo :is(.preview-company h2'));
  assert.ok(css.includes('#demo .preview-kpi strong'));
  assert.ok(css.includes('body.seo-page{'));
  assert.ok(css.includes('body.xrm-faq-page{'));
  assert.ok(landing.includes('<dialog id="demo"'));
  assert.ok(faq.includes('<body class="xrm-faq-page">'));
});
