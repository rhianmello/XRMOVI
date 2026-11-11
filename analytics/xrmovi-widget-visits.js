/* XRMOVI Monitor: visitas de quem aceitou explicitamente a contagem interna.
   Guarda só UUID aleatório diário, sem IP, e-mail, URL ou dados do veículo. */
(function(){
  "use strict";
  const CONSENT="xrmovi_monitor_count_consent_v1";
  const DAILY="xrmovi_monitor_daily_visitor_v1";
  const URL="https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/xrmovi-widget-visit";
  let timer=null,lastPing=0;
  function day(){
    return new Date().toLocaleDateString("sv-SE",{timeZone:"America/Sao_Paulo"});
  }
  function allowed(){
    try {
      return localStorage.getItem(CONSENT)==="yes" &&
        window.XrmoviAnalytics?.getConsent?.()==="accepted" &&
        !window.XrmoviAnalytics?.isInternal?.();
    } catch {return false;}
  }
  function visitor(){
    try {
      const d=day(),old=JSON.parse(localStorage.getItem(DAILY)||"null");
      if(old && old.day===d && /^[0-9a-f-]{36}$/i.test(old.id))return old.id;
      if(!crypto?.randomUUID)return null;
      const id=crypto.randomUUID();
      localStorage.setItem(DAILY,JSON.stringify({day:d,id}));
      return id;
    }catch{return null;}
  }
  async function ping(){
    if(!allowed() || document.visibilityState!=="visible")return;
    const t=Date.now();
    if(t-lastPing<45000)return;
    const id=visitor();
    if(!id)return;
    lastPing=t;
    try {
      await fetch(URL,{
        method:"POST",
        mode:"cors",
        cache:"no-store",
        keepalive:true,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({visitor_id:id})
      });
    }catch{ /* Métrica opcional nunca interrompe o site. */ }
  }
  function update(){
    if(!allowed()){
      if(timer){clearInterval(timer);timer=null;}
      try{localStorage.removeItem(DAILY);}catch{}
      return;
    }
    void ping();
    if(!timer)timer=setInterval(()=>void ping(),60000);
  }
  window.addEventListener("xrmovi:analytics-consent-changed",update);
  document.addEventListener("visibilitychange",update);
  window.addEventListener("pageshow",update);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",update,{once:true});
  else update();
})();