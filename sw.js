/* Rede primeiro: evita servir dados financeiros, login ou relatórios obsoletos. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||event.request.mode!=='navigate'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title><body style="font:16px system-ui;background:#071725;color:white;padding:40px"><h2>XRMOVI está offline</h2><p>Conecte-se à internet e tente novamente. Seus dados não foram alterados.</p><button onclick="location.reload()">Tentar novamente</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'},status:503})));
});