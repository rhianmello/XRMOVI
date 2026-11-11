// XRMOVI authenticated pages: persist/refuse GA4 identity with authenticated Supabase RPC.
// Loads only the public key; it never contains the GA4 Measurement Protocol secret.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
(async()=>{
 try{
  const r=await fetch('/v3/config.json',{cache:'no-store'});
  if(!r.ok)return;
  const c=await r.json();
  const client=createClient(c.supabaseUrl,c.supabaseAnonKey);
  const {data,error}=await client.auth.getUser();
  if(error||!data?.user)return;
  async function sync(){try{await window.XrmoviAnalytics?.syncPurchaseIdentity?.(client)}catch(_){/* non-blocking */}}
  await sync();
  window.addEventListener('xrmovi:analytics-consent-changed',()=>{void sync()});
 }catch(_){/* Analytics never gates fleet access. */}
})();
