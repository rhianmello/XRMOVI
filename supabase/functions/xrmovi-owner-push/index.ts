// Web Push para o proprietário do XRMOVI.
// Somente administradores autenticados podem registrar aparelhos;
// o envio automático usa token secreto gerado no Supabase Vault.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import webpush from 'npm:web-push@3.6.7';

const URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''; }
  catch { return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''; }
})();
const ANON = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || Deno.env.get('SUPABASE_ANON_KEY') || ''; }
  catch { return Deno.env.get('SUPABASE_ANON_KEY') || ''; }
})();
const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const ORIGIN = 'https://xrmovi.com.br';
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Content-Type': 'application/json; charset=utf-8'
};
const response = (obj, code = 200) => new Response(JSON.stringify(obj), { status: code, headers: cors });
const safeError = (error) => String(error?.message || error || 'erro').slice(0, 200);

async function state() {
  const { data, error } = await svc.rpc('xrmovi_owner_push_state');
  if (error) throw error;
  return data;
}

async function checkAdmin(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '');
  if (!match || !ANON) return null;
  const jwt = match[1];
  const db = createClient(URL, ANON, {
    global: { headers: { Authorization: 'Bearer ' + jwt } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userError } = await db.auth.getUser(jwt);
  if (userError || !userData?.user) return null;
  const { data: allowed, error: roleError } = await db.rpc('xrmovi_platform_is_admin');
  return !roleError && allowed === true ? { db, user: userData.user } : null;
}

async function setupPublicKey() {
  const existing = await state();
  if (existing?.public_key) return existing.public_key;
  const pair = webpush.generateVAPIDKeys();
  const hook = [crypto.randomUUID(), crypto.randomUUID()].join('-');
  const { data, error } = await svc.rpc('xrmovi_owner_push_bootstrap', {
    p_public: pair.publicKey, p_private: pair.privateKey, p_hook: hook
  });
  if (error) throw error;
  return data;
}

async function sendQueued() {
  const config = await state();
  if (!config?.public_key || !config?.private_key) return { sent: 0, pending: 0 };
  webpush.setVapidDetails('mailto:suporte@xrmovi.com.br', config.public_key, config.private_key);
  let sent = 0, failed = 0;
  for (let pass = 0; pass < 3; pass++) {
    const { data: jobs, error } = await svc.rpc('xrmovi_owner_push_claim', { p_limit: 30 });
    if (error) throw error;
    if (!Array.isArray(jobs) || !jobs.length) break;
    for (const job of jobs) {
      let ok = false, gone = false, failure = '';
      try {
        await webpush.sendNotification({
          endpoint: job.endpoint,
          keys: { p256dh: job.p256dh, auth: job.auth_key }
        }, JSON.stringify({
          title: job.title, body: job.body, url: job.url,
          tag: 'xrmovi-owner-' + job.event_id
        }), { TTL: 3600, urgency: 'high', timeout: 12000 });
        ok = true;
        sent++;
      } catch (error) {
        failed++;
        gone = [404, 410].includes(Number(error?.statusCode));
        failure = safeError(error);
        console.warn('XRMOVI Web Push: entrega falhou (sem conteúdo privado)', error?.statusCode || 'network');
      }
      const { error: completionError } = await svc.rpc('xrmovi_owner_push_complete', {
        p_job: job.job_id, p_ok: ok, p_gone: gone, p_error: failure || null
      });
      if (completionError) console.error('Falha ao registrar entrega:', safeError(completionError));
    }
  }
  return { sent, failed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return response({ error: 'Método não permitido' }, 405);
  if (!SERVICE || !URL) return response({ error: 'Serviço indisponível' }, 503);
  try {
    const raw = await req.text();
    if (raw.length > 12000) return response({ error: 'Requisição grande demais' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return response({ error: 'JSON inválido' }, 400); }
    if (body?.action === 'flush') {
      const config = await state();
      if (!config?.webhook_secret || req.headers.get('x-owner-push-secret') !== config.webhook_secret)
        return response({ error: 'Não autorizado' }, 401);
      return response({ ok: true, ...(await sendQueued()) });
    }
    const caller = await checkAdmin(req);
    if (!caller) return response({ error: 'Acesso restrito ao proprietário' }, 403);
    if (body?.action === 'public-key') {
      const publicKey = await setupPublicKey();
      return response({ ok: true, public_key: publicKey });
    }
    if (body?.action === 'subscribe') {
      const sub = body.subscription;
      if (!sub || typeof sub.endpoint !== 'string' || !sub.keys ||
        typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string')
        return response({ error: 'Inscrição inválida' }, 400);
      const { error } = await caller.db.rpc('xrmovi_owner_push_register', {
        p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth
      });
      if (error) throw error;
      return response({ ok: true });
    }
    if (body?.action === 'unsubscribe') {
      if (typeof body.endpoint !== 'string') return response({ error: 'Endpoint inválido' }, 400);
      const { error } = await caller.db.rpc('xrmovi_owner_push_unregister', { p_endpoint: body.endpoint });
      if (error) throw error;
      return response({ ok: true });
    }
    if (body?.action === 'test') {
      const { error } = await svc.rpc('xrmovi_owner_push_test', { p_user: caller.user.id });
      if (error) throw error;
      return response({ ok: true, ...(await sendQueued()) });
    }
    return response({ error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('XRMOVI push:', safeError(error));
    return response({ error: 'Não foi possível concluir a operação' }, 500);
  }
});