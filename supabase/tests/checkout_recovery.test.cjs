const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { test } = require('node:test');

// Execute the production handler with isolated, in-memory Supabase and Mercado Pago
// transports. No network requests, credentials, or real subscriptions are used.
const source = fs.readFileSync(path.join(__dirname, '../functions/xrmovi-create-subscription/index.ts'), 'utf8');
const executable = stripTypeScriptTypes(source.replace(/^import .* from "npm:.*";\r?\n/m, ''));
const companyId = '11111111-1111-4111-8111-111111111111';
const intentId = '22222222-2222-4222-8222-222222222222';
const providerId = 'existing-preapproval';
const checkoutUrl = 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=' + providerId;

function harness({ status = 'pending', linked = false, attachError = null, provider = {}, lookupFails = false } = {}) {
  const calls = { fetch: [], attach: [], logs: [] };
  const environment = {
    XRMOVI_BILLING_ENABLED: 'true', XRMOVI_BILLING_PILOT_ONLY: 'false',
    XRMOVI_MP_ACCESS_TOKEN: 'fake-mp-token', SUPABASE_URL: 'https://database.test',
    SUPABASE_ANON_KEY: 'fake-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'fake-service-key'
  };
  const subscription = {
    id: providerId, external_reference: intentId, collector_id: 10284642,
    status, init_point: checkoutUrl,
    auto_recurring: { currency_id: 'BRL', transaction_amount: 19.90 }, ...provider
  };
  let handler;
  const context = {
    Request, Response, URL, URLSearchParams, AbortSignal,
    console: { error: (...args) => calls.logs.push(args) },
    Deno: { env: { get: name => environment[name] }, serve: callback => { handler = callback; } },
    createClient: (_url, key) => key === environment.SUPABASE_SERVICE_ROLE_KEY ? {
      rpc: async (name, args) => {
        assert.equal(name, 'xrmovi_checkout_attach');
        calls.attach.push(args);
        return { data: !attachError, error: attachError };
      }
    } : {
      auth: { getUser: async token => {
        assert.equal(token, 'fake-user-token');
        return { data: { user: { id: 'test-user' } }, error: null };
      } },
      rpc: async (name, args) => {
        assert.equal(name, 'xrmovi_checkout_prepare');
        assert.equal(args.cid, companyId);
        return { data: {
          intent_id: intentId, amount_brl: 19.90, plan: 'start', payer_email: 'test@example.test',
          existing: true, provider_subscription_id: linked ? providerId : null, intent_status: 'created'
        }, error: null };
      }
    },
    fetch: async (url, options = {}) => {
      const method = options.method || 'GET';
      calls.fetch.push({ url: String(url), method });
      assert.equal(method, 'GET', 'Recovery must not create another Mercado Pago subscription');
      assert.equal(options.headers.Authorization, 'Bearer fake-mp-token');
      if (lookupFails) return Response.json({ error: 'provider_unavailable' }, { status: 503 });
      if (String(url).includes('/preapproval/search?')) {
        assert.equal(new URL(url).searchParams.get('payer_email'), 'test@example.test');
        return Response.json({ results: [subscription], paging: { total: 1 } });
      }
      assert.equal(String(url), 'https://api.mercadopago.com/preapproval/' + providerId);
      return Response.json(subscription);
    }
  };
  vm.runInNewContext(executable, context, { filename: 'xrmovi-create-subscription.js' });
  return {
    calls,
    async request() {
      const response = await handler(new Request('https://database.test/functions/v1/xrmovi-create-subscription', {
        method: 'POST', headers: { origin: 'https://frota.nospassa.com.br', authorization: 'Bearer fake-user-token', 'content-type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, plan: 'start' })
      }));
      return { response, body: await response.json() };
    }
  };
}

for (const linked of [false, true]) {
  test(`pending subscription ${linked ? 'already linked' : 'orphaned after failed attach'} resumes without creating a charge`, async () => {
    const fixture = harness({ linked });
    const { response, body } = await fixture.request();
    assert.equal(response.status, 200);
    assert.deepEqual(body, { checkout_url: checkoutUrl, status: 'pending', resumed: true });
    assert.equal(fixture.calls.attach.length, 1);
    assert.equal(fixture.calls.attach[0].intent_id, intentId);
    assert.equal(fixture.calls.attach[0].preapproval_id, providerId);
    assert.equal(fixture.calls.fetch.length, 1);
    assert.ok(fixture.calls.fetch.every(call => call.method === 'GET'));
  });
}

test('authorized orphan is linked before directing the owner to payment verification', async () => {
  const fixture = harness({ status: 'authorized' });
  const { response, body } = await fixture.request();
  assert.equal(response.status, 409);
  assert.match(body.error, /Verificar pagamento/);
  assert.equal(body.checkout_url, undefined);
  assert.equal(fixture.calls.attach.length, 1);
  assert.equal(fixture.calls.attach[0].preapproval_id, providerId);
  assert.ok(fixture.calls.fetch.every(call => call.method === 'GET'));
});

for (const status of ['canceled', 'paused']) {
  test(`${status} subscription requires review without attaching or creating another charge`, async () => {
    const fixture = harness({ status });
    const { response, body } = await fixture.request();
    assert.equal(response.status, 409);
    assert.match(body.error, new RegExp(status));
    assert.equal(body.checkout_url, undefined);
    assert.equal(fixture.calls.attach.length, 0);
    assert.ok(fixture.calls.fetch.every(call => call.method === 'GET'));
  });
}

for (const status of ['pending', 'authorized']) {
  test(`attach failure for ${status} preserves the attempt and does not return a checkout URL`, async () => {
    const fixture = harness({ status, attachError: { code: '42501', message: 'Acesso exclusivo do serviço de pagamento.' } });
    const { response, body } = await fixture.request();
    assert.equal(response.status, 400);
    assert.match(body.error, /não foi possível vinculá-la ao banco/);
    assert.equal(body.checkout_url, undefined);
    assert.equal(fixture.calls.attach.length, 1);
    const diagnostic = fixture.calls.logs.find(entry => entry[0] === 'XRMOVI checkout attach rejected');
    assert.equal(diagnostic[1].code, '42501');
    assert.equal(diagnostic[1].message, 'Acesso exclusivo do serviço de pagamento.');
    assert.doesNotMatch(JSON.stringify(fixture.calls.logs), /fake-(mp-token|service-key|user-token)|test@example\.test/);
    assert.doesNotMatch(body.error, /42501|Acesso exclusivo/);
    assert.ok(fixture.calls.fetch.every(call => call.method === 'GET'));
  });
}

test('provider reference mismatch cannot be attached or resumed', async () => {
  const fixture = harness({ linked: true, provider: { external_reference: 'another-intent' } });
  const { response, body } = await fixture.request();
  assert.equal(response.status, 400);
  assert.match(body.error, /não pertence/);
  assert.equal(body.checkout_url, undefined);
  assert.equal(fixture.calls.attach.length, 0);
  assert.ok(fixture.calls.fetch.every(call => call.method === 'GET'));
});

test('provider lookup failure cannot fall through to subscription creation', async () => {
  const fixture = harness({ lookupFails: true });
  const { response, body } = await fixture.request();
  assert.equal(response.status, 400);
  assert.match(body.error, /HTTP 503/);
  assert.equal(fixture.calls.attach.length, 0);
  assert.equal(fixture.calls.fetch.length, 1);
  assert.ok(fixture.calls.fetch.every(call => call.method === 'GET'));
});
