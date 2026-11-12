// XRMOVI - Checkout Mercado Pago. Reuse a prior pending intent; never create two subscriptions for one signup.
// Deploy com verify_jwt=true. NUNCA inserir token Mercado Pago ou service_role no GitHub.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
const json=(body:unknown,status=200,origin="https://xrmovi.com.br")=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization, apikey, content-type, x-client-info, x-supabase-api-version","cache-control":"no-store","vary":"Origin"}
});
const originAllowed=(origin:string|null)=>origin===null||["https://frota.nospassa.com.br","https://www.frota.nospassa.com.br","https://xrmovi.com.br","https://www.xrmovi.com.br"].includes(origin);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(!originAllowed(origin))return json({error:"Origem não autorizada"},403);
 const outputOrigin=origin||"https://xrmovi.com.br";
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
  "access-control-allow-origin":outputOrigin,"access-control-allow-methods":"POST, OPTIONS",
  "access-control-allow-headers":"authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "access-control-max-age":"300",
  "vary":"Origin"
 }});
 if(req.method!=="POST")return json({error:"Método não permitido"},405,outputOrigin);
 if(Deno.env.get("XRMOVI_BILLING_ENABLED")!=="true")return json({error:"Checkout ainda não habilitado."},503,outputOrigin);
 const token=Deno.env.get("XRMOVI_MP_ACCESS_TOKEN");
 const supabaseUrl=Deno.env.get("SUPABASE_URL"),anonKey=Deno.env.get("SUPABASE_ANON_KEY"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!token||!supabaseUrl||!anonKey||!serviceKey)return json({error:"Configuração de cobrança incompleta."},503,outputOrigin);
 const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
 const mpHeaders={"Authorization":"Bearer "+token,"Accept":"application/json"};
 const mpApi=async (path:string)=>{
   const response=await fetch("https://api.mercadopago.com"+path,{headers:mpHeaders,signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error("Mercado Pago não permitiu consultar a assinatura existente (HTTP "+response.status+"). Nenhuma nova assinatura foi criada.");
   return response.json();
 };
 const checkoutUrl=(item:any)=>{
   if(typeof item?.init_point!=="string")throw new Error("A assinatura não possui link de checkout. Verifique o pagamento existente antes de criar outra.");
   const url=new URL(item.init_point);
   const domain=url.hostname.toLowerCase();
   if(url.protocol!=="https:"||!["mercadopago.com.br","mercadopago.com"].some(base=>domain===base||domain.endsWith("."+base)))
    throw new Error("O Mercado Pago retornou endereço inesperado. Checkout interrompido.");
   return url.href;
 };
 const verifyMP=(item:any,intent:any,expectedAmount:number)=>{
   if(String(item?.external_reference||"")!==String(intent.intent_id)||Number(item?.collector_id)!==10284642)
    throw new Error("A assinatura encontrada não pertence à conta XRMOVI. Não foi iniciada outra cobrança.");
   const recurring=item?.auto_recurring||{};
   if(String(recurring?.currency_id||"BRL")!=="BRL"
    ||(recurring?.transaction_amount!=null&&Math.abs(Number(recurring.transaction_amount)-expectedAmount)>.009))
    throw new Error("O plano e o valor encontrados no Mercado Pago divergem da tentativa original.");
 };
 const bindMP=async(intentId:string,mpId:string)=>{
   const {error}=await service.rpc("xrmovi_checkout_attach",{intent_id:intentId,preapproval_id:mpId});
   if(error){
    // Keep the database cause in server logs without credentials or payment payloads.
    console.error("XRMOVI checkout attach rejected",{code:String(error.code||"").slice(0,32),message:String(error.message||"").slice(0,180)});
    throw new Error("Assinatura encontrada, mas não foi possível vinculá-la ao banco. Não conclua outra compra; verifique o pagamento e procure o suporte.");
   }
 };
 const useExisting=async(item:any,intent:any,amount:number,origin:string)=>{
   verifyMP(item,intent,amount);
   if(["canceled","paused"].includes(String(item.status||"")))
    return json({error:"Uma assinatura anterior já foi encontrada no Mercado Pago e está "+String(item.status)+". A alteração precisa de conferência no suporte; não criamos outra cobrança."},409,origin);
   // An already authorized subscription may be the one whose original attach failed.
   // Recover its verified ID so payment reconciliation can find it without a new charge.
   await bindMP(String(intent.intent_id),String(item.id));
   if(item.status==="authorized")
    return json({error:"O Mercado Pago já autorizou uma assinatura vinculada a esta conta. Use Verificar pagamento, sem contratar novamente."},409,origin);
   return json({checkout_url:checkoutUrl(item),status:"pending",resumed:true},200,origin);
 };
 const bearer=req.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return json({error:"Faça login antes de contratar."},401,outputOrigin);
 try{
  const authClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:bearer}}});
  const {data:auth,error:authError}=await authClient.auth.getUser(bearer.slice(7));
  if(authError||!auth.user)return json({error:"Sessão inválida."},401,outputOrigin);
  // Pilot gate enforced server-side independently of the browser and visible pricing.
  // Default to restricted until owner explicitly sets XRMOVI_BILLING_PILOT_ONLY=false.
  if(Deno.env.get("XRMOVI_BILLING_PILOT_ONLY")!=="false"){
   const {data:launch,error:launchError}=await service.from("xrmovi_billing_launch_control").select("public_enabled").eq("id",1).maybeSingle();
   const publicLaunched=!launchError&&launch?.public_enabled===true;
   if(!publicLaunched){
   const {data:pilotAllowed,error:pilotError}=await authClient.rpc("xrmovi_billing_pilot_allowed");
   if(pilotError||pilotAllowed!==true)return json({error:"Pagamento disponível somente para a conta de homologação autorizada."},403,outputOrigin);
   }
  }
  const payload=await req.json();
  const cid=String(payload?.company_id||""),chosen=String(payload?.plan||"");
  if(!/^[0-9a-f-]{36}$/i.test(cid)||!(["start","pro","business","advanced"].includes(chosen)||(/^fleet_([5-9]|[1-9]\d|100)$/.test(chosen))))
    return json({error:"Dados inválidos."},400,outputOrigin);
  const {data:intent,error:intentError}=await authClient.rpc("xrmovi_checkout_prepare",{cid,chosen_plan:chosen});
  if(intentError)throw new Error(intentError.message);

  const price=Number(intent.amount_brl);
  if(!Number.isFinite(price)||price<=0)throw new Error("Preço inválido no cadastro.");
  const intentId=String(intent.intent_id);
  // Already associated with Mercado Pago: retrieve the same checkout; do not create another.
  if(intent.provider_subscription_id){
   const existing=await mpApi("/preapproval/"+encodeURIComponent(String(intent.provider_subscription_id)));
   return await useExisting(existing,intent,price,outputOrigin);
  }
  // If a request failed after reaching Mercado Pago but before attaching the ID,
  // discover that preapproval by external_reference before any new POST.
  if(intent.existing===true){
   let offset=0,seen=0,total=0;
   do{
    const params=new URLSearchParams({payer_email:String(intent.payer_email),limit:"50",offset:String(offset)});
    const found=await mpApi("/preapproval/search?"+params.toString());
    if(!Array.isArray(found?.results))throw new Error("Consulta de assinaturas indisponível. Para evitar cobrança duplicada, interrompemos a tentativa.");
    const matched=found.results.filter((item:any)=>String(item.external_reference||"")===intentId);
    if(matched.length>1)throw new Error("Há múltiplas assinaturas com a mesma referência. Verifique com o suporte antes de pagar.");
    if(matched.length===1)return await useExisting(matched[0],intent,price,outputOrigin);
    const batch=found.results.length;
    seen+=batch;
    total=Math.max(total,Number(found.paging?.total||0));
    if(!batch)break;
    offset+=batch;
   }while(seen<total&&offset<500);
   if(seen<total)throw new Error("A consulta de assinaturas foi parcial. Nenhuma cobrança foi iniciada; procure o suporte.");
  }
  // Only a verified absence of an existing provider subscription permits creation.
  // The same intent UUID is reused as external reference and idempotency key.
  const mp=await fetch("https://api.mercadopago.com/preapproval",{
   method:"POST",
   headers:{...mpHeaders,"Content-Type":"application/json","X-Idempotency-Key":intentId},
   signal:AbortSignal.timeout(15000),
   body:JSON.stringify({
    reason:"XRMOVI — Plano "+chosen,
    external_reference:intentId,
    payer_email:String(intent.payer_email),
    auto_recurring:{frequency:1,frequency_type:"months",transaction_amount:price,currency_id:"BRL"},
    back_url:(origin && (origin==="https://xrmovi.com.br" || origin==="https://www.xrmovi.com.br") ? "https://xrmovi.com.br" : "https://frota.nospassa.com.br")+"/v3/#subscription",
    status:"pending"
   })
  });
  const response=await mp.json().catch(()=>({}));
  if(!mp.ok){
   const providerMessage=typeof response?.message==="string"?response.message.slice(0,170):"Solicitação de assinatura não aceita.";
   const providerCode=typeof response?.error==="string"?response.error.slice(0,60):"";
   console.error("XRMOVI subscription provider rejection",{http_status:mp.status,code:providerCode});
   throw new Error("Mercado Pago recusou criar a assinatura (HTTP "+mp.status+"): "+providerMessage);
  }
  if(!response?.id)throw new Error("Mercado Pago respondeu sem identificador da assinatura. A tentativa foi preservada para recuperação segura.");
  verifyMP(response,intent,price);
  await bindMP(intentId,String(response.id));
  return json({checkout_url:checkoutUrl(response),status:"pending",resumed:false},200,outputOrigin);
 }catch(error){
  // Preserve the original intent on ANY uncertainty; all retries resolve the
  // same reference first. Never auto-cancel a remote recurring subscription.
  const message=error instanceof Error?error.message:"Não foi possível abrir o checkout.";
  console.error("XRMOVI checkout issue",{category:"provider_or_recovery",reason:message.slice(0,180)});
  return json({error:message},400,outputOrigin);
 }
});
