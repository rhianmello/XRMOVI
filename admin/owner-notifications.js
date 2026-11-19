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

export function mountOwnerNotifications({ userId, initialSnapshot, fetchSnapshot, onNewEvents, onNavigate }) {
  if (!userId || typeof fetchSnapshot !== 'function') return null;
  const key = PREFIX + userId;
  const oldSaved = readJSON(key);
  let last = oldSaved?.last && typeof oldSaved.last === 'object' ? oldSaved.last : null;
  let history = Array.isArray(oldSaved?.history) ? oldSaved.history.slice(0, MAX_HISTORY) : [];
  let busy = false;
  let timer;

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
  const list = item('div', null, 'owner-alerts-list');
  panel.append(heading, help, enable, list);
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
    enable.hidden = allowed;
    enable.textContent = !supported ? 'Avisos disponíveis no app instalado' :
      Notification.permission === 'denied' ? 'Notificações bloqueadas no dispositivo' :
      'Ativar notificações';
    enable.disabled = !supported || (supported && Notification.permission === 'denied');
  }
  async function systemAlert(event) {
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
  enable.addEventListener('click', async () => {
    // O pedido precisa ser iniciado diretamente pelo toque, especialmente no iOS.
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      render();
      if (permission === 'granted') {
        await systemAlert({
          id: 'teste', kind: 'signup', title: 'Avisos do XRMOVI ativados',
          body: 'Você receberá alertas de novos cadastros e mensagens enquanto o painel estiver ativo.'
        });
      }
    } catch (error) { console.warn('Erro ao ativar avisos:', error); render(); }
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
  timer = window.setInterval(() => void poll(), POLL_MS);
  render();
  return { poll, destroy: () => window.clearInterval(timer) };
}