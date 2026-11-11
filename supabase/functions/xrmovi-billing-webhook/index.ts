// XRMOVI billing: validate signed Mercado Pago notification, re-fetch MP resources,
// reconcile authorized recurring invoices and deliver exactly-once ledger settlement.
// Billing is live. Never process a payment unless signed webhook + verified provider proof agree.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const send=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const getType=(s:unknown)=>typeof s==="string"?s:"";
function signatureInfo(header:string){
 const parts=new Map(header.split(",").map(x=>x.trim().split("=")).filter(x=>x.length===2));
 return {time:parts.get("ts")||"",hash:parts.get("v1")||""};
}
async function signed(request:Request,id:string,secret:string){
 const header=request.headers.get("x-signature")||"";
 const {time,hash}=signatureInfo(header);
 const rid=request.headers.get("x-request-id")||"";
 if(!header)return {ok:false,reason:"missing_signature"};
 if(!rid)return {ok:false,reason:"missing_request_id"};
 if(!id||id.length>128)return {ok:false,reason:"invalid_resource_id"};
 if(!/^\d{10,13}$/.test(time)||!/^[a-f0-9]{64}$/i.test(hash))
  return {ok:false,reason:"invalid_signature_format"};
 const value=Number(time);
 const ms=time.length===13?value:value*1000;
 if(!Number.isFinite(ms)||Math.abs(Date.now()-ms)>600_000)
  return {ok:false,reason:"timestamp_outside_window"};
 const manifest="id:"+id.toLowerCase()+";request-id:"+rid+";ts:"+time+";";
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const bytes=Uint8Array.from(hash.match(/../g)!.map(x=>parseInt(x,16)));
 const ok=await crypto.subtle.verify("HMAC",key,bytes,new TextEncoder().encode(manifest));
 return {ok,reason:ok?"verified":"signature_mismatch"};
}
Deno.serve(async(request:Request)=>{
 if(request.method!=="POST")return send({error:"Method not allowed"},405);
 if(Deno.env.get("XRMOVI_BILLING_ENABLED")!=="true")return send({error:"Billing disabled"},503);
 const token=Deno.env.get("XRMOVI_MP_ACCESS_TOKEN")||"";
 const secret=Deno.env.get("XRMOVI_MP_WEBHOOK_SECRET")||"";
 const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!token.startsWith("APP_USR-")||secret.length<20||!supabaseUrl||!serviceKey)return send({error:"Billing unavailable"},503);
 const url=new URL(request.url);
 const dataId=url.searchParams.get("data.id")||url.searchParams.get("data_id")||"";
 if(!dataId)return send({error:"Missing notification ID"},400);
 try {
  const verification=await signed(request,dataId,secret);
  if(!verification.ok){
   // Log only bounded reason, never the secret, digest, request ID, resource ID or payer data.
   console.warn("XRMOVI Mercado Pago webhook rejected",{reason:verification.reason});
   return send({error:"Invalid notification signature"},401);
  }
  const body=await request.json();
  if(body?.data?.id!=null&&String(body.data.id).toLowerCase()!==dataId.toLowerCase())
   return send({error:"Resource mismatch"},400);
  if(body?.live_mode===false)return send({ok:true,ignored:"test_event"});
  const type=getType(body?.type||body?.topic);
  const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const mpGet=async(path:string)=>{
   const response=await fetch("https://api.mercadopago.com"+path,{
    headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
    signal:AbortSignal.timeout(12_000)
   });
   if(!response.ok)throw new Error("Mercado Pago verification HTTP "+response.status);
   return response.json();
  };
  const settleInvoice=async(invoice:any)=>{
   if(!invoice||!/^\d+$/.test(String(invoice.id||""))||!invoice.preapproval_id)return {ignored:"not_subscription"};
   const paymentId=String(invoice.payment?.id||"");
   if(!/^\d+$/.test(paymentId)||invoice.payment?.status!=="approved")return {ignored:"not_approved"};
   if(invoice.currency_id!=="BRL")return {ignored:"invalid_currency"};
   const [subscription,payment]=await Promise.all([
    mpGet("/preapproval/"+encodeURIComponent(String(invoice.preapproval_id))),
    mpGet("/v1/payments/"+encodeURIComponent(paymentId))
   ]);
   if(String(subscription?.id)!==String(invoice.preapproval_id)
     ||!subscription.external_reference
     ||!/^[-0-9a-f]{36}$/i.test(String(subscription.external_reference))
     ||subscription.status!=="authorized")
     return {ignored:"subscription_not_authorized"};
   if(String(payment?.id)!==paymentId||payment.status!=="approved"
     ||payment.currency_id!=="BRL"||payment.live_mode===false)
     return {ignored:"payment_not_confirmed"};
   const amount=Number(invoice.transaction_amount);
   if(!Number.isFinite(amount)||amount<=0
     ||Math.abs(amount-Number(payment.transaction_amount))>0.009
     ||Math.abs(amount-Number(subscription.auto_recurring?.transaction_amount))>0.009)
     return {ignored:"payment_amount_mismatch"};
   const paymentDate=String(invoice.debit_date||payment.date_approved||invoice.date_created||"");
   if(!paymentDate||!Number.isFinite(Date.parse(paymentDate)))throw new Error("Payment date invalid");
   const {data,error}=await service.rpc("xrmovi_checkout_settle",{
    intent_id:String(subscription.external_reference),
    preapproval_id:String(subscription.id),
    invoice_id:String(invoice.id),payment_id:paymentId,
    paid_amount:amount,payment_date:paymentDate
   });
   if(error)throw new Error("Database settlement rejected: "+error.message);
   return {result:data?.status||"processed"};
  };
  if(type==="subscription_authorized_payment"){
   if(!/^\d+$/.test(dataId))return send({error:"Invalid invoice id"},400);
   const outcome=await settleInvoice(await mpGet("/authorized_payments/"+encodeURIComponent(dataId)));
   return send({ok:true,kind:"recurring_payment",...outcome});
  }
  if(type==="payment"){
   if(!/^\d+$/.test(dataId))return send({error:"Invalid payment id"},400);
   const payment=await mpGet("/v1/payments/"+encodeURIComponent(dataId));
   if(payment?.status!=="approved")return send({ok:true,ignored:"payment_not_approved"});
   const search=await mpGet("/authorized_payments/search?payment_id="+encodeURIComponent(dataId)+"&limit=10");
   const invoice=Array.isArray(search?.results)?search.results.find((x:any)=>String(x?.payment?.id)===dataId):null;
   if(!invoice)return send({ok:true,ignored:"not_a_recurring_invoice"});
   const outcome=await settleInvoice(invoice);
   return send({ok:true,kind:"payment",...outcome});
  }
  if(type==="subscription_preapproval"){
   const sub=await mpGet("/preapproval/"+encodeURIComponent(dataId));
   if(String(sub?.id)!==dataId)return send({error:"Subscription mismatch"},400);
   if(["paused","canceled"].includes(String(sub.status))){
    const {error}=await service.rpc("xrmovi_checkout_provider_status",{
     preapproval_id:String(sub.id),new_status:String(sub.status)
    });
    if(error)throw new Error("Subscription status sync failed: "+error.message);
   }
   return send({ok:true,kind:"subscription",status:sub.status});
  }
  return send({ok:true,ignored:"unsupported_topic"});
 }catch(error){
  // Trigger Mercado Pago retries; never mark a payment as paid without verified API evidence.
  return send({error:error instanceof Error?error.message:"Webhook reconciliation failed"},500);
 }
});