// XRMOVI: server-to-server GA4 purchase delivery.
// The payment state is NEVER changed here. Delivery is only for approved,
// consented, newly confirmed Pix/card transactions queued by database triggers.
// Cron authentication reuses the existing private XRMOVI worker token in Vault.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const measurement=/^G-[A-Z0-9]{6,20}$/;
const clientId=/^[0-9]{1,14}\.[0-9]{1,14}$/;
const transactionId=/^(?:pix|card):[0-9]{5,22}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27,28}$/i;
function purchasePayload(item:any){
 const value=Number(item?.amount);
 const paidAt=Date.parse(String(item?.paid_at||""));
 if(!uuid.test(String(item?.id||""))||!transactionId.test(String(item?.transaction_id||""))
   ||!clientId.test(String(item?.client_id||""))
   ||!Number.isFinite(value)||value<=0||value>100000
   ||!Number.isFinite(paidAt)||paidAt<Date.now()-48*3600_000||paidAt>Date.now()+300_000)
  throw Error("Invalid verified purchase envelope");
 const plan=String(item.plan||"").toLowerCase();
 if(!/^[a-z0-9_-]{1,30}$/.test(plan))throw Error("Invalid plan");
 const session=String(item.session_id||"");
 return {
  client_id:String(item.client_id),
  // Do not send e-mail, CPF, IP, account ID or vehicle data to GA4.
  ...(paidAt<=Date.now()?{timestamp_micros:paidAt*1000}:{}),
  events:[{
   name:"purchase",
   params:{
    transaction_id:"xrmovi-"+String(item.transaction_id).replace(":","-"),
    currency:"BRL",value:Math.round(value*100)/100,
    items:[{item_id:"xrmovi-"+plan,item_name:"Plano XRMOVI "+plan,
     price:Math.round(value*100)/100,quantity:1}],
    engagement_time_msec:1,
    ...(session&&/^[0-9]{6,20}$/.test(session)?{session_id:Number(session)}:{})
   }
  }]
 };
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const worker=req.headers.get("x-xrmovi-worker-secret")||"";
 if(!/^[a-f0-9]{64}$/i.test(worker))return reply({error:"Unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!key)return reply({error:"Database unavailable"},503);
 const db=createClient(url,key,{auth:{persistSession:false}});
 // Verify against server-side Vault token through a service-only SQL RPC.
 const {data:authorized,error:authError}=await db.rpc("xrmovi_support_worker_authorized",{p_token:worker});
 if(authError||authorized!==true)return reply({error:"Unauthorized"},401);
 const secret=Deno.env.get("XRMOVI_GA4_API_SECRET")||"";
 const mid=Deno.env.get("XRMOVI_GA4_MEASUREMENT_ID")||"";
 if(!measurement.test(mid)||secret.length<12)return reply({status:"not_configured",processed:0},503);
 const input=await req.json().catch(()=>({}));
 if(input?.action==="validate"){
  // GA4 debug endpoint validates schema without ingesting purchases into reports.
  try{
   const synthetic=purchasePayload({
    id:"00000000-0000-4000-8000-000000000000",
    transaction_id:"pix:123456789",
    client_id:"123456789.987654321",
    plan:"start",amount:19.9,paid_at:new Date().toISOString()
   });
   const endpoint=new URL("https://www.google-analytics.com/debug/mp/collect");
   endpoint.searchParams.set("measurement_id",mid);
   endpoint.searchParams.set("api_secret",secret);
   const response=await fetch(endpoint,{method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...synthetic,validation_behavior:"ENFORCE_RECOMMENDATIONS"}),
    signal:AbortSignal.timeout(12000)});
   const result=await response.json().catch(()=>({}));
   const errors=Array.isArray(result?.validationMessages)?result.validationMessages:[];
   return reply({status:response.ok?(errors.length?"validation_warnings":"validated"):"validation_unavailable",
    error_count:errors.length,details:errors.slice(0,5).map((x:any)=>({
     field:String(x.fieldPath||"").slice(0,65),code:String(x.validationCode||"").slice(0,65)
    }))},response.ok?200:502);
  }catch{return reply({status:"validation_unavailable"},502)}
 }
 try{
  const {data,error}=await db.rpc("xrmovi_ga4_delivery_claim",{p_limit:10});
  if(error)throw Error("Could not claim verified events");
  const records=Array.isArray(data)?data:[];
  let sent=0,failed=0;
  for(const row of records){
   let good=false,reason="";
   try{
    const payload=purchasePayload(row);
    const endpoint=new URL("https://www.google-analytics.com/mp/collect");
    endpoint.searchParams.set("measurement_id",mid);
    endpoint.searchParams.set("api_secret",secret);
    const response=await fetch(endpoint,{
     method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)
    });
    good=response.status===204||response.status===200;
    if(!good)reason="Google Analytics transport HTTP "+response.status;
   }catch(e){reason=e instanceof Error?e.message.slice(0,120):"Delivery failed"}
   const {error:finishError}=await db.rpc("xrmovi_ga4_delivery_finish",{
    p_id:row.id,p_success:good,p_error:good?null:reason
   });
   if(finishError)throw Error("Could not confirm analytics delivery state");
   if(good)sent++;else failed++;
  }
  return reply({status:"processed",sent,failed});
 }catch{
  return reply({error:"Delivery service unavailable; retry later"},503);
 }
});
