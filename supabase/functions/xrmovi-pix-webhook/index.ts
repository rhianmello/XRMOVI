import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function authenticatedWebhook(request:Request,id:string,secret:string){
 const parts=new Map((request.headers.get("x-signature")||"").split(",").map(x=>x.trim().split("=")).filter(x=>x.length===2));
 const time=parts.get("ts")||"",hash=parts.get("v1")||"",rid=request.headers.get("x-request-id")||"";
 if(!request.headers.get('x-signature'))return {ok:false,reason:'missing_signature'};
 if(!rid)return {ok:false,reason:'missing_request_id'};
 if(!/^\d{5,22}$/.test(id))return {ok:false,reason:'invalid_resource_id'};
 if(!/^\d{10,13}$/.test(time)||!/^[a-f0-9]{64}$/i.test(hash))return {ok:false,reason:'invalid_signature_format'};
 const unix=time.length===13?Number(time):Number(time)*1000;
 if(!Number.isFinite(unix)||Math.abs(Date.now()-unix)>600000)return {ok:false,reason:'timestamp_outside_window'};
 const manifest="id:"+id.toLowerCase()+";request-id:"+rid+";ts:"+time+";";
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const ok=await crypto.subtle.verify("HMAC",key,Uint8Array.from(hash.match(/../g)!.map(x=>parseInt(x,16))),new TextEncoder().encode(manifest));
 return {ok,reason:ok?'verified':'signature_mismatch'};
}
Deno.serve(async req=>{
 if(req.method!=="POST")return respond({error:"Method not allowed"},405);
 if(Deno.env.get("XRMOVI_BILLING_ENABLED")!=="true")return respond({error:"Billing not enabled"},503);
 const token=Deno.env.get("XRMOVI_MP_ACCESS_TOKEN")||"",secret=Deno.env.get("XRMOVI_MP_WEBHOOK_SECRET")||"";
 const url=Deno.env.get("SUPABASE_URL")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!token.startsWith("APP_USR-")||secret.length<20||!url||!serviceKey)return respond({error:"Billing unavailable"},503);
 const reqUrl=new URL(req.url);
 const id=reqUrl.searchParams.get("data.id")||reqUrl.searchParams.get("data_id")||"";
 if(!id){
  // Legacy Mercado Pago IPN is UNSIGNED. Acknowledge a well-formed notice to
  // stop retries, but NEVER consult a provider, settle a payment or grant access.
  // Only signed modern Webhooks below can trigger reconciliation.
  const legacyId=reqUrl.searchParams.get("id")||"";
  if(!req.headers.get("x-signature")
    && reqUrl.searchParams.get("topic")==="payment" && /^\d{5,22}$/.test(legacyId)){
    console.warn("XRMOVI Pix legacy notification ignored",{reason:"legacy_unsigned_ipn_ignored"});
    return respond({ok:true,ignored:"legacy_unsigned_ipn"},200);
  }
  console.warn('XRMOVI Pix webhook rejected',{reason:'missing_data_id',legacy_ipn:reqUrl.searchParams.has('topic')});
  return respond({error:"Missing ID"},400);
 }
 const signature=await authenticatedWebhook(req,id,secret);
 if(!signature.ok){
  // Only a bounded reason code is logged: no secret, signature, ID or payer data.
  console.warn('XRMOVI Pix webhook rejected',{reason:signature.reason});
  return respond({error:"Signature invalid"},401);
 }
 try{
  const body=await req.json();
  if(body?.data?.id!=null&&String(body.data.id)!==id)return respond({error:"Resource mismatch"},400);
  if(body?.live_mode===false)return respond({ok:true,ignored:"sandbox"},200);
  if(String(body?.type||body?.topic)!=="payment")return respond({ok:true,ignored:"other_topic"});
  const res=await fetch("https://api.mercadopago.com/v1/payments/"+encodeURIComponent(id),{
   headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error("Mercado Pago verification unavailable");
  const payment=await res.json();
  if(String(payment.id)!==id||payment.payment_method_id!=="pix"
   ||payment.currency_id!=="BRL"||payment.live_mode===false)
   return respond({ok:true,ignored:"not_pix"});
  const service=createClient(url,serviceKey,{auth:{persistSession:false}});
  const {data:intent,error}=await service.rpc("xrmovi_pix_payment_for_webhook",{p_payment:id});
  if(error)throw Error("Unable to look up Pix intent");
  if(!intent)return respond({ok:true,ignored:"unrelated_payment"});
  if(String(payment.external_reference)!==String(intent.id)
   ||Math.abs(Number(payment.transaction_amount)-Number(intent.amount))>0.009)
   return respond({error:"Payment mismatch"},400);
  if(["refunded","charged_back"].includes(String(payment.status))){
   const {error:revokeError}=await service.rpc("xrmovi_pix_revoke",{
    p_id:String(intent.id),p_payment:id,p_status:String(payment.status)});
   if(revokeError)throw Error("Unable to reverse Pix entitlement");
   return respond({ok:true,status:payment.status});
  }
  if(payment.status!=="approved")return respond({ok:true,ignored:"not_approved_pix"});
  const at=String(payment.date_approved||"");
  if(!Number.isFinite(Date.parse(at)))throw Error("Invalid approval timestamp");
  const {data:settled,error:settleError}=await service.rpc("xrmovi_pix_settle",{
   p_id:String(intent.id),p_payment:id,p_amount:Number(intent.amount),p_approved:at});
  if(settleError)throw Error("Settlement rejected");
  return respond({ok:true,status:settled?.status||"paid"});
 }catch{
  return respond({error:"Reconciliation failed; retry"},500);
 }
});
