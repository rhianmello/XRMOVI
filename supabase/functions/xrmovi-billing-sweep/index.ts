// XRMOVI: service-only, READ-ONLY provider polling for missed Mercado Pago webhooks.
// Runs on a private cron token. Never creates charges or trusts browser status.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const digits=/^\d+$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27,28}$/i;
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return respond({error:"Method not allowed"},405);
 const worker=req.headers.get("x-xrmovi-worker-secret")||"";
 if(!/^[a-f0-9]{64}$/i.test(worker))return respond({error:"Unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const token=Deno.env.get("XRMOVI_MP_ACCESS_TOKEN")||"";
 if(!url||!serviceKey||!token.startsWith("APP_USR-")||Deno.env.get("XRMOVI_BILLING_ENABLED")!=="true")
  return respond({error:"Billing unavailable"},503);
 const backend=createClient(url,serviceKey,{auth:{persistSession:false}});
 const {data:authorized,error:authError}=await backend.rpc("xrmovi_support_worker_authorized",{p_token:worker});
 if(authError||authorized!==true)return respond({error:"Unauthorized"},401);
 const {data:pending,error:lookupError}=await backend.rpc("xrmovi_billing_pending_for_worker",{p_limit:12});
 if(lookupError||!Array.isArray(pending))return respond({error:"Pending payment lookup unavailable"},503);
 const mpGet=async(path:string,allowFallback?:string)=>{
  const call=async(endpoint:string)=>fetch("https://api.mercadopago.com"+endpoint,{
   method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},
   signal:AbortSignal.timeout(9000)
  });
  let result=await call(path);
  if(result.status===400&&allowFallback)result=await call(allowFallback);
  if(!result.ok)throw Error("provider_http_"+result.status);
  return result.json();
 };
 let scanned=0,approved=0,duplicates=0,failures=0;
 for(const item of pending.slice(0,12)){
  scanned++;
  const intent=String(item?.intent_id||""),preapproval=String(item?.provider_id||"");
  const expected=Number(item?.amount);
  if(!uuid.test(intent)||!preapproval||preapproval.length>100||!Number.isFinite(expected)||expected<=0){
   failures++;continue;
  }
  try{
   const subscription=await mpGet("/preapproval/"+encodeURIComponent(preapproval));
   if(String(subscription?.id)!==preapproval
    ||String(subscription?.external_reference)!==intent
    ||Number(subscription?.collector_id)!==10284642
    ||String(subscription?.status)!=="authorized"
    ||String(subscription?.auto_recurring?.currency_id||"BRL")!=="BRL"
    ||Math.abs(Number(subscription?.auto_recurring?.transaction_amount)-expected)>0.009)
    continue;
   const list=await mpGet(
    "/authorized_payments/search?preapproval_id="+encodeURIComponent(preapproval)+"&limit=50",
    "/authorized_payments/search?preapproval_id="+encodeURIComponent(preapproval)
   );
   if(!Array.isArray(list?.results))throw Error("invoice_list_unavailable");
   if(Number(list?.paging?.total)>50)throw Error("invoice_list_exceeds_bound");
   for(const entry of list.results.slice(0,50)){
    if(!digits.test(String(entry?.id||""))||!digits.test(String(entry?.payment?.id||""))
      ||entry.payment.status!=="approved")continue;
    const invoice=await mpGet("/authorized_payments/"+encodeURIComponent(String(entry.id)));
    if(String(invoice?.id)!==String(entry.id)||String(invoice?.preapproval_id)!==preapproval
     ||String(invoice?.payment?.id)!==String(entry.payment.id)
     ||String(invoice?.payment?.status)!=="approved"||invoice.currency_id!=="BRL"
     ||Math.abs(Number(invoice.transaction_amount)-expected)>0.009)continue;
    const payment=await mpGet("/v1/payments/"+encodeURIComponent(String(entry.payment.id)));
    if(String(payment?.id)!==String(entry.payment.id)
     ||payment.status!=="approved"||payment.live_mode!==true
     ||payment.currency_id!=="BRL"
     ||Math.abs(Number(payment.transaction_amount)-expected)>0.009)continue;
    const when=String(payment.date_approved||"");
    if(!when||!Number.isFinite(Date.parse(when))||Date.parse(when)>Date.now()+600000)continue;
    const {data:settled,error:settleError}=await backend.rpc("xrmovi_checkout_settle",{
     intent_id:intent,preapproval_id:preapproval,
     invoice_id:String(invoice.id),payment_id:String(payment.id),
     paid_amount:expected,payment_date:when
    });
    if(settleError)throw Error("settlement_rejected");
    if(settled?.status==="paid")approved++;
    else if(settled?.status==="duplicate")duplicates++;
   }
  }catch(error){
   failures++;
   const reason=String(error instanceof Error?error.message:"unknown").slice(0,52);
   console.warn("XRMOVI billing sweep retry needed",{stage:"provider_or_settlement",reason});
  }
 }
 return respond({ok:true,scanned,approved,duplicates,failures});
});
