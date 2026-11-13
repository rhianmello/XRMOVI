const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');

// Pass PLAYWRIGHT_MODULE when the package is supplied by a workspace runtime.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const output = process.env.BRANDING_SCREENSHOT_DIR;
const companyA = '11111111-1111-4111-8111-111111111111';
const companyB = '22222222-2222-4222-8222-222222222222';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
let browser, base;

before(async () => {
  // All requests are fulfilled from disk; no external network or account is used.
  base = 'https://xrmovi.test';
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
});

after(async () => {
  await browser?.close();
});

async function open({ role = 'owner', existing = false, viewport = { width: 1440, height: 1000 } } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ role, existing, a, b, png64 }) => {
    const bytes = Uint8Array.from(atob(png64), character => character.charCodeAt(0));
    const state = window.brandingTest = {
      uploads: [], saves: [], downloads: [], downloadsCompleted: 0, databaseError: false, uploadError: false, downloadError: false,
      holdUpload: false, holdDownload: false,
      companies: [
        { id: a, name: 'Empresa de Teste — Operação e Transportes', role, logo_path: existing ? a + '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png' : null, logo_url: existing ? 'https://example.test/logo.png' : null },
        { id: b, name: 'Segunda Empresa', role: 'viewer', logo_path: null, logo_url: null }
      ]
    };
    state.client = {
      auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
      functions: { invoke: async () => ({ data: { enabled: false }, error: null }) },
      rpc: async (name, args) => {
        if(name==='xrmovi_access_status')return {data:{allowed:true,billing_required:false,status:'active'}};
        if (name === 'xrmovi_my_companies') return { data: state.companies, error: null };
        if (name === 'xrmovi_company_logo_save') {
          state.saves.push(args);
          if (state.databaseError) return { data: null, error: { message: 'Banco indisponível' } };
          return { data: { id: args.cid, logo_path: args.p_path, logo_url: 'https://example.test/storage/' + args.p_path }, error: null };
        }
        if (name === 'xrmovi_financial_intelligence') return { data: { vehicles: [] }, error: null };
        if (name === 'xrmovi_cost_report') return { data: { fuel: [], maintenance: [] }, error: null };
        return { data: [], error: null };
      },
      storage: { from: bucket => ({
        upload: async (objectPath, file, options) => {
          state.uploads.push({ bucket, path: objectPath, type: file.type, size: file.size, options });
          if (state.holdUpload) await new Promise(resolve => state.releaseUpload = resolve);
          return { data: { path: objectPath }, error: state.uploadError ? { message: 'Storage indisponível' } : null };
        },
        download: async objectPath => {
          state.downloads.push(objectPath);
          if (state.holdDownload) await new Promise(resolve => state.releaseDownload = resolve);
          state.downloadsCompleted++;
          if (state.downloadError) return { data: null, error: { message: 'Download indisponível' } };
          return { data: new Blob([bytes], { type: 'image/png' }), error: null };
        }
      }) }
    };
  }, { role, existing, a: companyA, b: companyB, png64: png.toString('base64') });
  await page.route(base + '/**', route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '');
    const filename = path.resolve(root, relative || 'v3/index.html');
    if (!filename.startsWith(root + path.sep)) return route.fulfill({ status: 403, body: '' });
    try {
      const contentType = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' })[path.extname(filename)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: fs.readFileSync(filename) });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await page.route('https://esm.sh/**', route => route.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'export const createClient = () => window.brandingTest.client;' }));
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.lucide = { createIcons() {
      document.querySelectorAll('i[data-lucide="pencil"]').forEach(icon => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = '<path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/>';
        icon.replaceWith(svg);
      });
    } };
  ` }));
  await page.goto(base + '/v3/index.html');
  await page.waitForFunction(() => document.getElementById('company-name').textContent.startsWith('Empresa de Teste'));
  await page.waitForFunction(() => document.getElementById('v3-company'));
  return { page, errors };
}

async function selectFile(page, file = { name: 'logo.png', mimeType: 'image/png', buffer: png }) {
  const picker = page.waitForEvent('filechooser');
  await page.locator('#company-logo-edit').click();
  await (await picker).setFiles(file);
}

async function waitIdle(page) {
  await page.waitForFunction(() => document.getElementById('company-logo-area').getAttribute('aria-busy') === 'false');
}

test('owner and manager can edit; viewer cannot open or upload even with forced DOM events', async () => {
  for (const role of ['owner', 'manager', 'viewer']) {
    const { page, errors } = await open({ role });
    assert.equal(await page.locator('#company-logo-edit').isVisible(), role !== 'viewer');
    assert.equal(await page.locator('#company-logo-placeholder').textContent(), 'Logo / Foto');
    if (role === 'viewer') {
      await page.evaluate(() => document.getElementById('company-logo-edit').click());
      await page.locator('#company-logo-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
      assert.equal(await page.evaluate(() => brandingTest.uploads.length), 0);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('existing logo loads through authenticated storage and PDF uses captured company identity', async () => {
  const { page, errors } = await open({ existing: true });
  await page.waitForFunction(() => !document.getElementById('company-logo').hidden);
  assert.equal(await page.locator('#company-logo-placeholder').isVisible(), false);
  const pdf = await page.evaluate(() => window.XrmoviCompanyBranding.forPdf());
  assert.equal(pdf.companyId, companyA);
  assert.match(pdf.logoDataUrl, /^data:image\/png;base64,/);
  assert.equal(pdf.name, 'Empresa de Teste — Operação e Transportes');
  await page.evaluate(() => { brandingTest.holdDownload = true; window.pdfPending = XrmoviCompanyBranding.forPdf(); });
  await page.selectOption('#v3-company', companyB);
  await page.evaluate(() => brandingTest.releaseDownload());
  const captured = await page.evaluate(() => window.pdfPending);
  assert.equal(captured.companyId, companyA);
  assert.equal(await page.locator('#company-name').textContent(), 'Segunda Empresa');
  assert.equal(await page.locator('#company-logo').isVisible(), false);
  assert.deepEqual(errors, []);
  await page.close();
});

test('valid upload persists URL and immediately renders; files use unique non-overwriting paths', async () => {
  const { page, errors } = await open();
  await selectFile(page);
  await page.waitForFunction(() => document.getElementById('company-logo-status').textContent.startsWith('Logo / Foto atualizada.'));
  await waitIdle(page);
  assert.equal(await page.locator('#company-logo').isVisible(), true);
  const first = await page.evaluate(() => ({ upload: brandingTest.uploads[0], save: brandingTest.saves[0], company: brandingTest.companies[0] }));
  assert.equal(first.upload.bucket, 'xrmovi-company-logos');
  assert.equal(first.upload.options.upsert, false);
  assert.match(first.upload.path, new RegExp('^' + companyA + '/[0-9a-f-]{36}\\.png$'));
  assert.equal(first.save.cid, companyA);
  assert.equal(first.company.logo_path, first.upload.path);
  assert.ok(first.company.logo_url);
  await selectFile(page);
  await page.waitForFunction(() => brandingTest.saves.length === 2);
  await waitIdle(page);
  assert.notEqual(await page.evaluate(() => brandingTest.uploads[1].path), first.upload.path);
  assert.deepEqual(errors, []);
  await page.close();
});

test('failed database or storage write preserves the previous displayed logo and enables retry', async () => {
  for (const failure of ['databaseError', 'uploadError']) {
    const { page, errors } = await open({ existing: true });
    await page.waitForFunction(() => !document.getElementById('company-logo').hidden);
    const oldSource = await page.locator('#company-logo').getAttribute('src');
    const oldPath = await page.evaluate(() => brandingTest.companies[0].logo_path);
    await page.evaluate(key => { brandingTest[key] = true; }, failure);
    await selectFile(page);
    await page.waitForFunction(() => document.getElementById('company-logo-status').textContent.startsWith('Não foi possível salvar'));
    await waitIdle(page);
    assert.equal(await page.locator('#company-logo').getAttribute('src'), oldSource);
    assert.equal(await page.evaluate(() => brandingTest.companies[0].logo_path), oldPath);
    assert.equal(await page.locator('#company-logo-edit').isEnabled(), true);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('download failure after a successful save retains the loading error instead of showing success', async () => {
  const { page, errors } = await open();
  await page.evaluate(() => { brandingTest.downloadError = true; });
  await selectFile(page);
  await page.waitForFunction(() => document.getElementById('company-logo-status').textContent === 'Não foi possível carregar a logo. Tente atualizar os dados.');
  await waitIdle(page);
  assert.equal(await page.evaluate(() => brandingTest.saves.length), 1);
  assert.ok(await page.evaluate(() => brandingTest.companies[0].logo_url));
  assert.equal(await page.locator('#company-logo').isVisible(), false);
  assert.equal(await page.locator('#company-logo-placeholder').isVisible(), true);
  assert.equal(await page.locator('#company-logo-status').textContent(), 'Não foi possível carregar a logo. Tente atualizar os dados.');
  assert.equal(await page.locator('#company-logo-edit').isEnabled(), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test('switching companies during the post-save download never publishes success to the new company', async () => {
  const { page, errors } = await open();
  await page.evaluate(() => { brandingTest.holdDownload = true; });
  await selectFile(page);
  await page.waitForFunction(() => brandingTest.saves.length === 1 && !!brandingTest.releaseDownload);
  await page.selectOption('#v3-company', companyB);
  await page.evaluate(() => brandingTest.releaseDownload());
  await page.waitForFunction(() => brandingTest.downloadsCompleted === 1);
  await page.waitForTimeout(30);
  assert.equal(await page.locator('#company-name').textContent(), 'Segunda Empresa');
  assert.equal(await page.locator('#company-logo-status').textContent(), '');
  assert.equal(await page.locator('#company-logo').isVisible(), false);
  assert.equal(await page.locator('#company-logo-placeholder').isVisible(), true);
  assert.equal(await page.locator('#company-logo-edit').isVisible(), false);
  assert.deepEqual(errors, []);
  await page.close();
});

test('rejects invalid MIME, oversized files and corrupt image data before any storage write', async () => {
  const { page, errors } = await open();
  for (const [file, expected] of [
    [{ name: 'payload.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') }, 'PNG, JPG ou WebP'],
    [{ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) }, 'até 2 MB'],
    [{ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') }, 'Não foi possível salvar']
  ]) {
    await selectFile(page, file);
    await page.waitForFunction(text => document.getElementById('company-logo-status').textContent.includes(text), expected);
    await waitIdle(page);
    assert.equal(await page.evaluate(() => brandingTest.uploads.length), 0);
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('switching companies during upload updates only the original record and never displays its logo on the new company', async () => {
  const { page, errors } = await open();
  await page.evaluate(() => { brandingTest.holdUpload = true; });
  await selectFile(page);
  await page.waitForFunction(() => brandingTest.uploads.length === 1 && !!brandingTest.releaseUpload);
  assert.equal(await page.locator('#company-logo-edit').isEnabled(), false);
  await page.selectOption('#v3-company', companyB);
  await page.evaluate(() => brandingTest.releaseUpload());
  await page.waitForFunction(() => brandingTest.saves.length === 1);
  assert.equal(await page.locator('#company-name').textContent(), 'Segunda Empresa');
  assert.equal(await page.locator('#company-logo').isVisible(), false);
  assert.equal(await page.locator('#company-logo-placeholder').isVisible(), true);
  const state = await page.evaluate(() => ({ companies: brandingTest.companies, save: brandingTest.saves[0] }));
  assert.equal(state.save.cid, companyA);
  assert.ok(state.companies[0].logo_url);
  assert.equal(state.companies[1].logo_url, null);
  assert.deepEqual(errors, []);
  await page.close();
});

test('late download from a previous company cannot replace current company branding', async () => {
  const { page, errors } = await open({ existing: true });
  await page.waitForFunction(() => !document.getElementById('company-logo').hidden);
  await page.evaluate(() => { brandingTest.holdDownload = true; });
  await page.locator('#refresh-button').click();
  await page.waitForFunction(() => !!brandingTest.releaseDownload);
  await page.selectOption('#v3-company', companyB);
  await page.evaluate(() => brandingTest.releaseDownload());
  await page.waitForTimeout(30);
  assert.equal(await page.locator('#company-name').textContent(), 'Segunda Empresa');
  assert.equal(await page.locator('#company-logo').isVisible(), false);
  assert.deepEqual(errors, []);
  await page.close();
});

test('desktop and mobile keep logo visible, compact edit target >=26px and long company name within viewport', async () => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const { page, errors } = await open({ viewport });
    await page.evaluate(() => {
      const heading = document.getElementById('company-name');
      heading.textContent = 'Empresa de Logística, Operação e Transportes — Nome de Teste para Layout Responsivo';
    });
    assert.equal(await page.locator('#company-logo-area').isVisible(), true);
    const box = await page.locator('#company-logo-edit').boundingBox();
    assert.ok(box.width >= 26 && box.height >= 26);
    const hero = await page.locator('.fleet-hero').boundingBox();
    assert.ok(hero.x >= 0 && hero.x + hero.width <= viewport.width + 1);
    const heading = await page.locator('#company-name').boundingBox();
    assert.ok(heading.x + heading.width <= viewport.width + 1);
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      await page.screenshot({ path: path.join(output, viewport.width > 600 ? 'xrmovi-logo-desktop.png' : 'xrmovi-logo-mobile.png'), fullPage: false });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
});
