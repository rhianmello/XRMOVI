/* Rede primeiro: evita servir dados financeiros, login ou relatórios obsoletos. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||event.request.mode!=='navigate'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title><body style="font:16px system-ui;background:#071725;color:white;padding:40px"><h2>XRMOVI está offline</h2><p>Conecte-se à internet e tente novamente. Seus dados não foram alterados.</p><button onclick="location.reload()">Tentar novamente</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'},status:503})));
});

// Web Push: handler pronto para o envio remoto assim que o backend VAPID
// estiver configurado. Não recebe dados privados sem permissão do usuário.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  const title = typeof payload.title === 'string' ? payload.title.slice(0, 120) : 'Aviso do XRMOVI';
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 320) : 'Você tem uma nova atualização.';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/admin/') ?
    payload.url : '/admin/';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/pwa/icon-192.png',
    badge: '/pwa/icon-192.png',
    tag: payload.tag ? String(payload.tag).slice(0, 100) : 'xrmovi-owner-alert',
    data: { url }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const requested = event.notification?.data?.url || '/admin/';
  const target = new URL(requested, self.location.origin);
  if (target.origin !== self.location.origin || !target.pathname.startsWith('/admin/')) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const match = windows.find(win => new URL(win.url).origin === target.origin && new URL(win.url).pathname.startsWith('/admin/'));
    if (match) {
      await match.navigate(target.href);
      return match.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});