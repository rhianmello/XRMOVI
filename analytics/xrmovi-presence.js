/* Presença anônima e efêmera; não registra IP, email ou histórico. */
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
try {
 const response=await fetch('/v3/config.json',{cache:'no-store'});
 if(!response.ok)throw Error('Configuração indisponível');
 const cfg=await response.json();
 const db=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:false}});
 const {data:{user}}=await db.auth.getUser();
 const owner=user?.email?.toLowerCase()==='rhian.udm@gmail.com';
 const internal=window.XrmoviAnalytics?.isInternal?.()===true;
 if(!owner&&!internal){
  const id=(()=>{try{let v=sessionStorage.getItem('xrmovi_presence_id');if(!v){v=crypto.randomUUID();sessionStorage.setItem('xrmovi_presence_id',v)}return v}catch{return crypto.randomUUID()}})();
  const channel=db.channel('xrmovi-online-visitors-v1',{config:{presence:{key:id}}});
  let tracked=false;
  const update=async()=>{
   if(document.visibilityState==='visible'&&!tracked){tracked=true;await channel.track({id,at:Date.now()})}
   else if(document.visibilityState!=='visible'&&tracked){tracked=false;await channel.untrack()}
  };
  channel.subscribe(status=>{if(status==='SUBSCRIBED')void update()});
  document.addEventListener('visibilitychange',()=>void update());
  window.addEventListener('pagehide',()=>{void channel.untrack()});
 }
}catch(error){console.warn('Indicador de presença indisponível:',error.message)}
