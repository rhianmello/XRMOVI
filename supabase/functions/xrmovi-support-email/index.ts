// Transactional support alerts. Sends only messages queued by a database trigger.
// Credentials stay in Supabase Edge Secrets, never in the browser or GitHub.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
Deno.serve(async request=>{
 const apiKey=Deno.env.get("XRMOVI_RESEND_API_KEY")||"";
 const from=Deno.env.get("XRMOVI_SUPPORT_MAIL_FROM")||"";
 const adminEmail="rhian.udm@gmail.com";
 const ready=apiKey.startsWith("re_")&&from.includes("@");
 if(request.method==="GET")return reply({provider:"resend",configured:ready,delivery:ready?"enabled":"waiting_for_email_provider"});
 if(request.method!=="POST")return reply({error:"Method not allowed"},405);
 // Service-only cron token lives in Supabase Vault; no credential in repository.
 const supplied=request.headers.get("x-xrmovi-worker-secret")||"";
 if(!/^[a-f0-9]{64}$/i.test(supplied))return reply({error:"Worker not authorized"},401);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!service)return reply({error:"Notification database unavailable"},503);
 try{
  const db=createClient(url,service,{auth:{persistSession:false}});
  const {data:authorized,error:authorizationError}=await db.rpc("xrmovi_support_worker_authorized",{p_token:supplied});
  if(authorizationError||authorized!==true)return reply({error:"Worker not authorized"},401);
  if(!ready)return reply({status:"not_configured",message:"Mensagem guardada na fila. Aguarda provedor de email."},503);
  const {data:queue,error:claimError}=await db.rpc("xrmovi_support_mail_claim",{max_messages:10});
  if(claimError)throw claimError;
  let sent=0,failed=0;
  for(const item of Array.isArray(queue)?queue:[]){
   const label=String(item.company||"Cliente XRMOVI").slice(0,140);
   const sender=String(item.sender||"Cliente cadastrado").slice(0,140);
   const body={
    from, to:[adminEmail],reply_to:undefined,
    subject:"[XRMOVI] Nova mensagem de suporte — "+label,
    html:'<div style="font-family:Arial,sans-serif;color:#132735;max-width:600px"><h2>Nova mensagem recebida no suporte XRMOVI</h2><p><b>Empresa:</b> '+escapeHtml(label)+'</p><p><b>Cliente:</b> '+escapeHtml(sender)+'</p><p>Uma nova mensagem aguarda sua resposta. Para proteger a privacidade, o conteúdo completo fica disponível somente na Central do Proprietário.</p><p><a href="https://frota.nospassa.com.br/admin/" style="background:#0c7669;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">Abrir caixa de mensagens</a></p><small>Notificação automática. Não responda a este email.</small></div>'
   };
   let ok=false,providerId="",err="";
   try{
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{
     "Authorization":"Bearer "+apiKey,
     "Content-Type":"application/json",
     "Idempotency-Key":String(item.message_id)
    },body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    const payload=await response.json().catch(()=>({}));
    ok=response.ok&&typeof payload?.id==="string";
    providerId=ok?String(payload.id):"";
    if(!ok)err="Email provider HTTP "+response.status;
   }catch(e){err=e instanceof Error?e.message:"Email connection error"}
   const {error:finishError}=await db.rpc("xrmovi_support_mail_finish",{p_id:item.id,p_sent:ok,p_provider_id:providerId,p_error:err});
   if(finishError)throw finishError;
   if(ok)sent++;else failed++;
  }
  return reply({status:"processed",sent,failed});
 }catch(error){return reply({status:"retry",error:error instanceof Error?error.message:"Mail processing error"},503)}
});