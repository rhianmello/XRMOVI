import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {cancelPreapproval, preapprovalPath, isCancelled} from "./preapproval-transport.js";
import {buildPixPaymentPayload} from "./pix-payment-payload.js";
const ORIGINS=new Set(["https://frota.nospassa.com.br","https://www.frota.nospassa.com.br"]);
function respond(data:unknown,status=200,origin=""){
 const headers:Record<string,string>={"content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin"};
 if(ORIGINS.has(origin))headers["access-control-allow-origin"]=origin;
 return new Response(JSON.stringify(data),{status,headers});
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digits=/^\d+$/;
function validCpf(value:string){
 if(!/^\d{11}$/.test(value)||/^(\d)\1{10}$/.test(value))return false;
 for(let n=9;n<11;n++){let sum=0;for(let j=0;j<n;j++)sum+=Number(value[j])*(n+1-j);
  if(((sum*10)%11)%10!==Number(value[n]))return false;}
 return true;
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(origin&&!ORIGINS.has(origin))return respond({error:"Origem não autorizada."},403,origin);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":origin||"https://frota.nospassa.com.br","access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"authorization,apikey,content-type,x-client-info"}});
 if(req.method!=="POST")return respond({error:"Método inválido."},405,origin);
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer "))return respond({error:"Entre na conta."},401,origin);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const token=Deno.env.get("XRMOVI_MP_ACCESS_TOKEN")||"";
 if(!url||!anon||!serviceKey||!token.startsWith("APP_USR-")||Deno.env.get("XRMOVI_BILLING_ENABLED")!=="true")
  return respond({error:"Pix temporariamente indisponível."},503,origin);
 const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const backend=createClient(url,serviceKey,{auth:{persistSession:false}});
 try{
  const {data:userData,error:userError}=await client.auth.getUser(auth.slice(7));
  if(userError||!userData.user)return respond({error:"Sessão inválida."},401,origin);
  if(Deno.env.get("XRMOVI_BILLING_PILOT_ONLY")!=="false"){
   const {data:launch,error:launchError}=await backend.from("xrmovi_billing_launch_control").select("public_enabled").eq("id",1).maybeSingle();
   const publicLaunched=!launchError&&launch?.public_enabled===true;
   if(!publicLaunched){
   const {data:pilot,error:pilotError}=await client.rpc("xrmovi_billing_pilot_allowed");
   if(pilotError||pilot!==true)return respond({error:"Pagamento Pix em homologação. Acesso restrito a contas autorizadas para o piloto."},403,origin);
   }
  }
  const body=await req.json();
  const cid=String(body?.company_id||"");
  const action=String(body?.action||"");
  if(!uuid.test(cid)||!["create","check"].includes(action))return respond({error:"Requisição inválida."},400,origin);
  const {data:account,error:accountError}=await client.rpc("xrmovi_checkout_reconcile_lookup",{cid});
  if(accountError||!account?.account_id)return respond({error:"Titular da assinatura não autorizado."},403,origin);
  const accountId=String(account.account_id);
  const mp=async(path:string,method="GET",input?:unknown,idempotency?:string)=>{
   const response=await fetch("https://api.mercadopago.com"+path,{
    method,headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json",
      ...(idempotency?{"X-Idempotency-Key":idempotency}:{})},
    ...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(12000)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok){
    // Keep useful provider diagnostics internally without exposing buyer data or tokens.
    const redact=(v:unknown)=>String(v??"").slice(0,180)
      .replace(/Bearer\s+\S+|APP_USR-\S+|TEST-\S+/gi,"[REDACTED]")
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,"[REDACTED]")
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,"[REDACTED]")
      .replace(/\b\d{9,}\b/g,"[REDACTED]");
    const providerMessage=redact(data?.message);
    const failure:any=new Error("Mercado Pago recusou a operação (HTTP "+response.status+")."+(providerMessage?" "+providerMessage:""));
    failure.httpStatus=response.status;
    failure.providerMessage=providerMessage;
    failure.providerError=redact(data?.error).slice(0,80);
    failure.causes=(Array.isArray(data?.cause)?data.cause:[]).slice(0,5).map((item:any)=>({
      code:redact(item?.code).slice(0,60),
      description:redact(item?.description).slice(0,110)
    }));
    if(path==="/v1/payments"&&method==="POST"){
      console.warn("XRMOVI Pix creation rejected",{
       endpoint:"POST /v1/payments",
       http_status:failure.httpStatus,
       provider_error:failure.providerError,
       provider_message:failure.providerMessage,
       causes:failure.causes
      });
    }
    throw failure;
   }
   return data;
  };
  const getIntent=async()=>{
   const {data,error}=await client.rpc("xrmovi_pix_lookup",{p_company:cid});
   if(error)throw Error(error.message);
   return data;
  };
  const verify=async(intent:any)=>{
   if(!intent?.payment_id||!digits.test(String(intent.payment_id)))return {status:"not_generated"};
   const payment=await mp("/v1/payments/"+encodeURIComponent(String(intent.payment_id)));
   if(String(payment.id)!==String(intent.payment_id)||String(payment.external_reference)!==String(intent.id)
    ||payment.currency_id!=="BRL"||payment.payment_method_id!=="pix"
    ||Math.abs(Number(payment.transaction_amount)-Number(intent.amount))>0.009||payment.live_mode===false)
     throw Error("Pagamento não pertence ao pedido XRMOVI.");
   if(["refunded","charged_back"].includes(String(payment.status))){
    const {error:reversedError}=await backend.rpc("xrmovi_pix_revoke",{
     p_id:String(intent.id),p_payment:String(payment.id),p_status:String(payment.status)});
    if(reversedError)throw Error("Falha ao registrar estorno.");
    return {status:"failed",message:"Pagamento estornado ou contestado."};
   }
   if(payment.status==="approved"){
    const approved=String(payment.date_approved||"");
    if(!Number.isFinite(Date.parse(approved)))throw Error("Data de aprovação ausente.");
    const {data,error}=await backend.rpc("xrmovi_pix_settle",{
      p_id:String(intent.id),p_payment:String(payment.id),p_amount:Number(intent.amount),p_approved:approved});
    if(error)throw Error("Pagamento aprovado, mas a liberação exige revisão: "+error.message);
    return {status:"paid",paid_through:data?.paid_through||null};
   }
   const expiry=Date.parse(String(payment.date_of_expiration||intent.expires_at||""));
   if(Number.isFinite(expiry)&&expiry<Date.now())return {status:"expired"};
   if(["cancelled","rejected","refunded","charged_back"].includes(String(payment.status)))
    return {status:"failed"};
   const pix=payment.point_of_interaction?.transaction_data||{};
   return {status:"pending",qr_code:String(pix.qr_code||""),qr_code_base64:String(pix.qr_code_base64||""),
    ticket_url:String(pix.ticket_url||""),expires_at:String(payment.date_of_expiration||intent.expires_at)};
  };
  if(action==="check"){
   const intent=await getIntent();
   if(!intent)return respond({status:"no_payment",message:"Nenhum Pix emitido."},200,origin);
   if(intent.status==="paid")return respond({status:"paid"},200,origin);
   if(intent.status==="failed"||intent.status==="expired")return respond({status:intent.status},200,origin);
   return respond(await verify(intent),200,origin);
  }
  // Never create a Pix while a live recurring authorization may charge the same account.
  const {data:previous,error:existingError}=await client.rpc("xrmovi_pix_existing_card",{p_company:cid});
  if(existingError)throw Error("Não foi possível verificar cobranças anteriores.");
  if(previous){

   if(previous.provider_subscription_id){
    const providerId=String(previous.provider_subscription_id);
    const path=preapprovalPath(providerId);
    const preapproval=await mp(path);
    // Only the provider's exact checkout for this account may be cancelled.
    const sameCheckout=(item:any)=>String(item?.id)===providerId
      && String(item?.external_reference||"")===String(previous.id)
      && Number(item?.collector_id)===10284642;
    if(!sameCheckout(preapproval))
     return respond({error:"A assinatura anterior não corresponde à conta XRMOVI. Nenhum Pix foi emitido.",code:"CARD_CHECKOUT_PENDING"},409,origin);
    const cardStatus=String(preapproval.status||"");
    if(cardStatus==="authorized")
     return respond({error:"Existe assinatura por cartão autorizada. Confira o pagamento antes de mudar para Pix.",code:"CARD_CHECKOUT_PENDING"},409,origin);
    if(!["pending","paused"].includes(cardStatus)&&!isCancelled(cardStatus))
     return respond({error:"Estado desconhecido da assinatura anterior. Nenhum Pix foi emitido.",code:"CARD_CHECKOUT_PENDING"},409,origin);
    let verified=preapproval;
    try{
     if(!isCancelled(cardStatus)){
      verified=await cancelPreapproval(mp,providerId,{
       initial:preapproval,
       verifyResource:sameCheckout,
       onRejected:(variant:string,error:any)=>{
        console.warn("XRMOVI cancel rejected",{
         endpoint:"PUT /preapproval/{id}",
         status_sent:variant,
         http_status:Number(error?.httpStatus)||null,
         provider_error:String(error?.providerError||"").slice(0,80),
         provider_message:String(error?.providerMessage||"").slice(0,180),
         causes:Array.isArray(error?.causes)?error.causes:[]
        });
       }
      });
     }else{
      verified=await mp(path);
     }
    }catch(_failure){
     return respond({error:"Não foi possível confirmar o estado da assinatura anterior no Mercado Pago. Para sua segurança, o Pix não foi emitido.",code:"CARD_CHECKOUT_PENDING"},409,origin);
    }
    if(!sameCheckout(verified))
     return respond({error:"A assinatura consultada não corresponde à conta XRMOVI. Nenhum Pix foi emitido.",code:"CARD_CHECKOUT_PENDING"},409,origin);
    if(!isCancelled(String(verified.status||"")))
     return respond({error:"A tentativa anterior por cartão continua aberta no Mercado Pago. O Pix não foi gerado para evitar cobrança duplicada. Consulte Mensagens / Suporte.",code:"CARD_CHECKOUT_PENDING"},409,origin);
    const {data:released,error:releaseError}=await backend.rpc("xrmovi_pix_card_cancelled",{p_provider_id:providerId});
    if(releaseError||released!==true)throw Error("Não foi possível concluir a troca do pagamento.");
   }else{
    if(Date.now()-Date.parse(previous.created_at)<120000)
     return respond({error:"Uma tentativa de cartão está sendo criada. Tente novamente em alguns instantes."},409,origin);
    const {data:done,error}=await backend.rpc("xrmovi_pix_cancel_unlinked",{p_id:previous.id});
    if(error||done!==true)throw Error("Não foi possível encerrar a tentativa de cartão.");
   }
  }
  const {data:prepared,error:prepError}=await client.rpc("xrmovi_pix_prepare",{p_company:cid});
  if(prepError)throw Error(prepError.message);
  if(prepared.payment_id){
   const present=await verify({id:prepared.id,payment_id:prepared.payment_id,amount:prepared.amount,expires_at:prepared.expires_at});
   return respond({...present,plan:prepared.plan,amount:prepared.amount,reused:true},200,origin);
  }
  const name=String(body?.payer_name||"").trim().replace(/\s+/g," ");
  const cpf=String(body?.payer_cpf||"").replace(/\D/g,"");
  if(name.length<5||name.length>120||!name.includes(" ")||!validCpf(cpf))
   return respond({error:"Informe nome completo e CPF válido do pagador."},400,origin);
  const [first,...last]=name.split(" ");
  const email=String(userData.user.email||"");
  if(!email)return respond({error:"Conta sem e-mail confirmado."},400,origin);
  const expiration=new Date(Date.now()+30*60*1000).toISOString();
  const payload=buildPixPaymentPayload({
    amount:prepared.amount,plan:prepared.plan,id:String(prepared.id),
    url,expiration,email,first,last:last.join(" "),cpf
  });
  const created=await mp("/v1/payments","POST",payload,String(prepared.id));
  if(!digits.test(String(created.id))||created.payment_method_id!=="pix"
   ||String(created.external_reference)!==String(prepared.id)
   ||Math.abs(Number(created.transaction_amount)-Number(prepared.amount))>0.009)
    throw Error("Mercado Pago devolveu um pagamento divergente.");
  const {data:attached,error:attachError}=await backend.rpc("xrmovi_pix_attach",{
   p_id:String(prepared.id),p_payment:String(created.id),p_expires:String(created.date_of_expiration||expiration)});
  if(attachError||attached!==true)throw Error("Não foi possível registrar o Pix. Consulte o suporte antes de tentar novamente.");
  const pix=created.point_of_interaction?.transaction_data||{};
  if(!pix.qr_code)throw Error("Pix criado mas sem código. Use 'Verificar Pix' para retomar.");
  return respond({status:"pending",plan:prepared.plan,amount:prepared.amount,
    qr_code:String(pix.qr_code),qr_code_base64:String(pix.qr_code_base64||""),
    ticket_url:String(pix.ticket_url||""),expires_at:String(created.date_of_expiration||expiration)},200,origin);
 }catch(error){
  return respond({error:error instanceof Error?error.message:"Falha no Pix."},502,origin);
 }
});