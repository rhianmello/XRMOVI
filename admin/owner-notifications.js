/* XRMOVI · avisos do proprietário (somente após autenticação administrativa).
 * Esta etapa utiliza consultas autorizadas do próprio painel; não envia
 * informações de clientes a terceiros nem executa cobranças.
 * Notificações do sistema operacional dependem do app estar em execução.
 */
const PREFIX = 'xrmovi_owner_notifications_v1_';
const MAX_HISTORY = 60;
const POLL_MS = 45_000;

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch (_) { return null; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}
function item(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function normalized(snapshot, adminId) {
  const signups = (Array.isArray(snapshot?.signups) ? snapshot.signups : [])
    .filter(user => user && user.id && user.id !== adminId);
  const accounts = (Array.isArray(snapshot?.accounts) ? snapshot.accounts : [])
    .filter(account => account && account.id && account.owner_id !== adminId);
  return {
    signups: Object.fromEntries(signups.map(user => [String(user.id), {
      email: String(user.email || 'Cliente'),
      createdAt: String(user.created_at || '')
    }])),
    messages: Object.fromEntries(accounts.map(account => [String(account.id), {
      unread: Math.max(0, Number(account.unread) || 0),
      lastMessage: String(account.last_message || ''),
      email: String(account.email || 'Cliente'),
      company: (account.companies || []).map(company => company.name).filter(Boolean).join(' / ')
    }]))
  };
}

export function mountOwnerNotifications({ db, userId, initialSnapshot, fetchSnapshot, onNewEvents, onNavigate }) {
  if (!userId || typeof fetchSnapshot !== 'function') return null;
  const key = PREFIX + userId;
  const oldSaved = readJSON(key);
  let last = oldSaved?.last && typeof oldSaved.last === 'object' ? oldSaved.last : null;
  let history = Array.isArray(oldSaved?.history) ? oldSaved.history.slice(0, MAX_HISTORY) : [];
  let busy = false;
  let timer;
  let pushReady = false;
  let pushSubscriptionSaved = false;
  let pushRegistration = null;
  let pushPublicKey = null;
  let pushError = '';

  const host = document.querySelector('header .actions');
  if (!host || document.getElementById('owner-alerts-button')) return null;

  const bell = item('button', '🔔 Avisos', 'btn ghost');
  bell.type = 'button';
  bell.id = 'owner-alerts-button';
  bell.setAttribute('aria-expanded', 'false');
  bell.setAttribute('aria-controls', 'owner-alerts-panel');
  const enable = item('button', 'Ativar notificações', 'btn');
  enable.type = 'button';
  enable.id = 'owner-alerts-enable';
  const panel = item('section', null, 'owner-alerts-panel');
  panel.id = 'owner-alerts-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Notificações do proprietário');
  const heading = item('h2', 'Avisos do XRMOVI');
  const help = item('p', 'Novos cadastros e mensagens de clientes aparecem aqui. No iPhone, instale o XRMOVI na Tela de Início e permita notificações.');
  const pushStatus = item('p', 'Preparando avisos do celular…', 'owner-alerts-push-status');
  pushStatus.setAttribute('role', 'status');
  const testPush = item('button', 'Enviar notificação de teste', 'btn ghost');
  testPush.type = 'button';
  testPush.id = 'owner-alerts-test';
  const list = item('div', null, 'owner-alerts-list');
  panel.append(heading, help, enable, testPush, pushStatus, list);
  host.prepend(bell);
  document.querySelector('main')?.prepend(panel);

  function persist() { writeJSON(key, { last, history }); }
  function render() {
    const unread = history.filter(event => !event.read).length;
    bell.textContent = unread ? '🔔 Avisos (' + unread + ')' : '🔔 Avisos';
    bell.setAttribute('aria-label', unread ? unread + ' avisos não lidos' : 'Avisos do proprietário');
    list.replaceChildren();
    if (!history.length) list.append(item('p', 'Nenhuma novidade registrada neste aparelho.', 'owner-alerts-empty'));
    for (const event of history) {
      const button = item('button', null, 'owner-alerts-entry' + (event.read ? '' : ' is-unread'));
      button.type = 'button';
      const label = item('strong', event.title);
      const body = item('span', event.body);
      const date = item('small', new Date(event.at).toLocaleString('pt-BR'));
      button.append(label, body, date);
      button.addEventListener('click', () => {
        event.read = true; persist(); render(); panel.hidden = true;
        bell.setAttribute('aria-expanded', 'false');
        onNavigate?.({ kind: event.kind, accountId: event.accountId || '' });
      });
      list.append(button);
    }
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    const allowed = supported && Notification.permission === 'granted';
    enable.hidden = pushSubscriptionSaved;
    enable.textContent = !supported ? 'Instale o app para permitir avisos' :
      Notification.permission === 'denied' ? 'Notificações bloqueadas no dispositivo' :
      'Ativar notificações no celular';
    enable.disabled = !supported || (supported && Notification.permission === 'denied');
    pushStatus.textContent = pushSubscriptionSaved ?
      'Ativado neste aparelho: novos cadastros e mensagens podem chegar mesmo com o XRMOVI fechado.' :
      pushReady ? 'Pronto para ativar as notificações push deste aparelho.' :
      allowed ? 'Avisos locais permitidos. O envio com o app fechado ainda não está ativo. ' + pushError :
      pushError || 'No iPhone, abra o XRMOVI pela Tela de Início e toque em Ativar.';
    testPush.hidden = !pushSubscriptionSaved;
  }
  async function systemAlert(event) {
    if (pushSubscriptionSaved) return; // Evita duplicar o push remoto.
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await reg.showNotification(event.title, {
        body: event.body,
        icon: '/pwa/icon-192.png',
        badge: '/pwa/icon-192.png',
        tag: 'xrmovi-owner-' + event.id,
        data: { url: event.kind === 'support' && event.accountId ?
          '/admin/?tab=messages&account=' + encodeURIComponent(event.accountId) :
          '/admin/?tab=signups' }
      });
    } catch (error) {
      console.warn('Notificação local indisponível:', error);
    }
  }
  function reconcile(snapshot, announce = true) {
    const next = normalized(snapshot, userId);
    if (!last) {
      last = next; persist(); render();
      return [];
    }
    const events = [];
    for (const [id, user] of Object.entries(next.signups)) {
      if (last.signups && Object.hasOwn(last.signups, id)) continue;
      events.push({
        id: 'signup:' + id, kind: 'signup', at: user.createdAt || new Date().toISOString(),
        title: 'Novo cadastro no XRMOVI', body: user.email
      });
    }
    for (const [id, account] of Object.entries(next.messages)) {
      const old = last.messages?.[id];
      // A contagem de mensagens não lidas só cresce com mensagens do cliente.
      if (!old || account.unread <= (Number(old.unread) || 0)) continue;
      events.push({
        id: 'support:' + id + ':' + account.lastMessage + ':' + account.unread,
        kind: 'support', accountId: id,
        at: account.lastMessage || new Date().toISOString(),
        title: 'Nova mensagem de suporte',
        body: (account.company || account.email) + ' enviou uma mensagem.'
      });
    }
    last = next;
    if (events.length) {
      const known = new Set(history.map(event => event.id));
      const fresh = events.filter(event => !known.has(event.id));
      history = [...fresh.map(event => ({ ...event, read: false })), ...history].slice(0, MAX_HISTORY);
      if (announce) for (const event of fresh) void systemAlert(event);
      if (fresh.length) {
        render();
        if (announce) Promise.resolve(onNewEvents?.()).catch(() => {});
      }
    }
    persist();
    render();
    return events;
  }
  async function poll() {
    if (busy || document.visibilityState === 'hidden') return;
    busy = true;
    try { reconcile(await fetchSnapshot()); }
    catch (error) { console.warn('Avisos do proprietário: sincronização indisponível:', error); }
    finally { busy = false; }
  }
  bell.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    bell.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) {
      for (const event of history) event.read = true;
      persist(); render();
    }
  });
  function vapidBytes(publicKey) {
    const b64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
  }
  async function registerServerSubscription(subscription) {
    const { data, error } = await db.functions.invoke('xrmovi-owner-push', {
      body: { action: 'subscribe', subscription: subscription.toJSON() }
    });
    if (error || data?.ok !== true) throw Error(error?.message || data?.error || 'Não foi possível registrar o aparelho.');
    pushSubscriptionSaved = true;
    pushError = '';
    render();
  }
  async function prepareRemotePush() {
    if (!db || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      pushError = 'Este navegador ainda não permite Web Push. No iPhone, instale e abra o XRMOVI pela Tela de Início.';
      render(); return;
    }
    try {
      const [registration, result] = await Promise.all([
        navigator.serviceWorker.register('/sw.js', { scope: '/' }),
        db.functions.invoke('xrmovi-owner-push', { body: { action: 'public-key' } })
      ]);
      if (result.error || !result.data?.public_key) throw Error(result.error?.message || result.data?.error || 'Chave de notificações indisponível');
      pushPublicKey = result.data.public_key;
      pushRegistration = registration;
      pushReady = true;
      if (Notification.permission === 'granted') {
        const existing = await registration.pushManager.getSubscription();
        if (existing) await registerServerSubscription(existing);
      }
    } catch (error) {
      pushError = 'Envio remoto indisponível no momento. ' + String(error.message || error);
      console.warn('XRMOVI push:', error);
    }
    render();
  }
  enable.addEventListener('click', async () => {
    // Permissão deve partir do clique real do usuário, especialmente no iOS.
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { render(); return; }
      const registration = pushRegistration || await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      if (!pushReady) {
        pushError = 'Avisos do sistema permitidos. O envio remoto ainda está indisponível.';
        render();
        return;
      }
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: vapidBytes(pushPublicKey)
      });
      await registerServerSubscription(subscription);
    } catch (error) {
      pushError = 'Falha na ativação: ' + String(error.message || error);
      console.warn('Não foi possível ativar Web Push:', error);
      render();
    }
  });
  testPush.addEventListener('click', async () => {
    testPush.disabled = true;
    try {
      const { data, error } = await db.functions.invoke('xrmovi-owner-push', { body: { action: 'test' } });
      if (error || data?.ok !== true) throw Error(error?.message || data?.error || 'Falha no teste');
      pushStatus.textContent = 'Notificação de teste enviada. Confira os avisos do aparelho.';
    } catch (error) { pushStatus.textContent = 'Erro no teste: ' + String(error.message || error); }
    finally { testPush.disabled = false; }
  });
  document.addEventListener('click', event => {
    if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) {
      panel.hidden = true; bell.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void poll();
  });
  reconcile(initialSnapshot, true);
  void prepareRemotePush();
  timer = window.setInterval(() => void poll(), POLL_MS);
  render();
  return { poll, destroy: () => window.clearInterval(timer) };
}