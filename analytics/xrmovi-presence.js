/* Presença online efêmera e histórico de módulos agregado (sem IP/conteúdo). */
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
try {
 const response=await fetch('/v3/config.json',{cache:'no-store'});
 if(!response.ok)throw Error('Configuração indisponível');
 const cfg=await response.json();
 const db=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:false}});
 const {data:{user}}=await db.auth.getUser();
 const owner=user?.email?.toLowerCase()==='rhian.udm@gmail.com';
 const internal=window.XrmoviAnalytics?.isInternal?.()===true;
 // Only signed-in users publish a user-scoped heartbeat; no identity enters
 // the anonymous public Presence channel.
 if(user?.id&&!owner){
  const ping=async()=>{
   if(document.visibilityState!=='visible')return;
   try{const {error}=await db.rpc('xrmovi_presence_ping');if(error)throw error}
   catch(error){console.warn('Sinal de atividade indisponível:',error.message)}
  };
  void ping();
  window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void ping()});
  window.addEventListener('pageshow',()=>void ping());
  window.setInterval(()=>void ping(),45000);

  // Histórico operacional restrito ao administrador, separado de GA4.
  const allowed=new Set(['dashboard','assets','mileage','maintenance','drivers','documents','alerts','history','fuel','fines','financial','subscription','account']);
  const navSession=(()=>{try{let id=sessionStorage.getItem('xrmovi_activity_session_v1');if(!id){id=crypto.randomUUID();sessionStorage.setItem('xrmovi_activity_session_v1',id)}return id}catch{return crypto.randomUUID()}})();
  let lastModule='',lastOpen=0,trackDisabled=false;
  const getModule=()=>{
   if(location.pathname.startsWith('/cliente/'))return 'account';
   if(!location.pathname.startsWith('/v3/'))return null;
   const active=document.querySelector('.fleet-main-nav [aria-current="page"][data-view]')?.dataset.view;
   const name=active||location.hash.slice(1)||'dashboard';
   return allowed.has(name)?name:'dashboard';
  };
  const track=async(kind,module=getModule())=>{
   if(trackDisabled||document.visibilityState!=='visible'||!allowed.has(module))return;
   const time=Date.now();
   if(kind==='open'){if(module===lastModule&&time-lastOpen<3000)return;lastModule=module;lastOpen=time}
   try{
    const {error}=await db.rpc('xrmovi_track_access',{p_module:module,p_event:kind,p_client_session_id:navSession});
    if(error){if(error.code==='42883')trackDisabled=true;throw error}
   }catch(error){if(!trackDisabled)console.warn('Histórico de navegação indisponível:',error.message)}
  };
  void track('open');
  window.addEventListener('xrmovi:assistant-view',e=>{if(allowed.has(e?.detail?.view))void track('open',e.detail.view)});
  window.setInterval(()=>void track('heartbeat'),45000);
 }
 if(!owner&&!internal){
  const id=(()=>{try{let v=sessionStorage.getItem('xrmovi_presence_id');if(!v){v=crypto.randomUUID();sessionStorage.setItem('xrmovi_presence_id',v)}return v}catch{return crypto.randomUUID()}})();
  const channel=db.channel('xrmovi-online-visitors-v1',{config:{presence:{key:id,enabled:true}}});
  let joined=false,pageOpen=true;
  channel.subscribe(status=>{
   joined=status==='SUBSCRIBED';
   if(joined&&pageOpen)void channel.track({id});
  });
  window.addEventListener('pagehide',()=>{
   pageOpen=false;
   if(joined)void channel.untrack();
  });
  window.addEventListener('pageshow',()=>{
   if(pageOpen)return;
   pageOpen=true;
   if(joined)void channel.track({id});
  });
 }
}catch(error){console.warn('Indicador de presença indisponível:',error.message)}
