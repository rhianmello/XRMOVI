// Admin-only diagnostics for XRMOVI Mercado Pago. Never exposes secrets.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const origins=new Set(["https://frota.nospassa.com.br","https://www.frota.nospassa.com.br","https://xrmovi.com.br","https://www.xrmovi.com.br"]);
const respond=(data:unknown,status=200,origin:string|null=null)=>{
 const headers:Record<string,string>={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","vary":"Origin"};
 if(origin&&origins.has(origin))headers["access-control-allow-origin"]=origin;
 return new Response(JSON.stringify(data),{status,headers});
};
Deno.serve(async (request:Request)=>{
 const origin=request.headers.get("origin");
 if(origin&&!origins.has(origin))return respond({error:"Origin not permitted"},403);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{
  "access-control-allow-origin":origin||"https://frota.nospassa.com.br",
  "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods":"POST, OPTIONS","vary":"Origin"
 }});
 if(request.method!=="POST")return respond({error:"Method not allowed"},405,origin);
 const jwt=request.headers.get("authorization")||"";
 const url=Deno.env.get("SUPABASE_URL")||"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 if(!jwt.startsWith("Bearer ")||!url||!anon)return respond({error:"Not authenticated"},401,origin);
 try{
  const client=createClient(url,anon,{global:{headers:{Authorization:jwt}}});
  const {data:user,error:authError}=await client.auth.getUser(jwt.slice(7));
  if(authError||!user?.user)return respond({error:"Invalid session"},401,origin);
  const {data:admin,error:adminError}=await client.rpc("xrmovi_platform_is_admin");
  if(adminError||admin!==true)return respond({error:"Admin access required"},403,origin);
  const token=Deno.env.get("XRMOVI_MP_ACCESS_TOKEN")||"";
  const secret=Deno.env.get("XRMOVI_MP_WEBHOOK_SECRET")||"";
  const enabled=Deno.env.get("XRMOVI_BILLING_ENABLED")==="true";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  let publicLaunched=false;
  if(serviceKey&&url){
   try{
    const backend=createClient(url,serviceKey,{auth:{persistSession:false}});
    const {data,error}=await backend.from("xrmovi_billing_launch_control").select("public_enabled").eq("id",1).maybeSingle();
    publicLaunched=!error&&data?.public_enabled===true;
   }catch{publicLaunched=false}
  }
  let tokenAuthorized=false,accountMatched=false,tokenCheck="not_configured";
  if(token.startsWith("APP_USR-")){
   try{
    const response=await fetch("https://api.mercadopago.com/users/me",{
     headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
     signal:AbortSignal.timeout(8500)
    });
    if(response.ok){
      const info=await response.json();
      tokenAuthorized=typeof info?.id==="number"&&Number.isFinite(info.id);
      // Mercado Pago seller user ID visible in XRMOVI application configuration.
      accountMatched=tokenAuthorized&&info.id===10284642;
      tokenCheck=tokenAuthorized?"verified":"invalid_response";
    }else tokenCheck=response.status===401||response.status===403?"unauthorized":"provider_error";
   }catch{tokenCheck="connection_error"}
  }
  const webhookSecretPresent=secret.length>=20;
  const eligible=tokenAuthorized&&accountMatched&&webhookSecretPresent;
  return respond({
   token_configured:token.startsWith("APP_USR-"),token_check:tokenCheck,
   token_authorized:tokenAuthorized,merchant_matches:accountMatched,
   webhook_secret_configured:webhookSecretPresent,
   billing_switch_enabled:enabled,
   billing_pilot_only:Deno.env.get('XRMOVI_BILLING_PILOT_ONLY')!=='false'&&!publicLaunched,
   billing_public_launch:publicLaunched,
   support_email_configured:(Deno.env.get('XRMOVI_RESEND_API_KEY')||'').startsWith('re_')&&(Deno.env.get('XRMOVI_SUPPORT_MAIL_FROM')||'').includes('@'),
   configuration_ready:eligible,
   note:eligible&&!enabled?"Credentials verified. Production payments remain disabled pending end-to-end webhook testing.":
    eligible&&enabled?"Credentials verified; test a real webhook before inviting paying customers.":"Verify the token and webhook secret in Supabase Edge Function Secrets."
  },200,origin);
 }catch{return respond({error:"Unable to validate billing"},500,origin)}
});