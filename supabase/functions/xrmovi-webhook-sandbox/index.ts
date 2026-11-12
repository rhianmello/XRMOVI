// Isolated Mercado Pago webhook receiver for XRMOVI homologation.
// Does not access production billing tables or update customer entitlements.
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const hexToBytes=(h:string)=>Uint8Array.from(h.match(/../g)?.map(v=>parseInt(v,16))||[]);
Deno.serve(async req=>{
 if(req.method==="GET")return respond({service:"xrmovi-webhook-sandbox",ready:!!(Deno.env.get("XRMOVI_MP_TEST_WEBHOOK_SECRET")||""),accepts_real_payments:false,changes_access:false});
 if(req.method!=="POST")return respond({error:"method_not_allowed"},405);
 const secret=Deno.env.get("XRMOVI_MP_TEST_WEBHOOK_SECRET")||"";
 if(secret.length<20)return respond({error:"test_webhook_secret_not_configured"},503);
 const url=new URL(req.url);
 const dataId=url.searchParams.get("data.id")||url.searchParams.get("data_id")||"";
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(dataId))return respond({error:"missing_or_invalid_data_id"},400);
 const requestId=req.headers.get("x-request-id")||"";
 const signature=req.headers.get("x-signature")||"";
 const parts=new Map(signature.split(",").map(x=>x.trim().split("=")).filter(x=>x.length===2));
 const ts=parts.get("ts")||"",hash=parts.get("v1")||"";
 if(!requestId||requestId.length>200||!/^\d{10,13}$/.test(ts)||!/^[a-f0-9]{64}$/i.test(hash)){
   // Never log raw headers, hashes, secret keys, or payer identifiers.
   const reason=!requestId?"missing_request_id":!ts?"missing_signature_timestamp":!hash?"missing_signature_hash":"invalid_signature_format";
   console.warn("XRMOVI homologation webhook rejected",{reason});
   return respond({error:"invalid_signature",reason},401);
 }
 const ms=ts.length===13?Number(ts):Number(ts)*1000;
 if(!Number.isFinite(ms)||Math.abs(Date.now()-ms)>600000)return respond({error:"signature_expired"},401);
 const manifest="id:"+dataId.toLowerCase()+";request-id:"+requestId+";ts:"+ts+";";
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const valid=await crypto.subtle.verify("HMAC",key,hexToBytes(hash),new TextEncoder().encode(manifest));
 if(!valid){console.warn("XRMOVI sandbox webhook rejected",{reason:"signature_mismatch"});return respond({error:"invalid_signature"},401)}
 if(Number(req.headers.get("content-length")||"0")>8192)return respond({error:"payload_too_large"},413);
 let body:Record<string,unknown>;
 try{const raw=await req.text();if(raw.length>8192)throw Error("payload_too_large");body=JSON.parse(raw)}
 catch{return respond({error:"invalid_json"},400)}
 if(body?.data&&typeof body.data==="object"&&body.data!==null&&"id" in body.data&&String((body.data as {id:unknown}).id)!==dataId)
   return respond({error:"id_mismatch"},400);
 // Signed test events are validated, but only verified TEST ORD orders can
 // update the single isolated sandbox-only entitlement. No production billing writes.
 const topic=String(body.type||body.topic||"unknown").slice(0,60);
 const action=String(body.action||"unknown").slice(0,60);
 if((topic==="order"||topic==="orders")&&/^ORD[A-Z0-9]{8,100}$/.test(dataId)){
   const testToken=Deno.env.get("XRMOVI_MP_TEST_ACCESS_TOKEN")||"";
   const prodToken=Deno.env.get("XRMOVI_MP_ACCESS_TOKEN")||"";
   if(!testToken.startsWith("APP_USR-")||testToken===prodToken)
     return respond({error:"sandbox_credentials_not_ready"},503);
   try{
     const res=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(dataId),{
       headers:{Authorization:"Bearer "+testToken},signal:AbortSignal.timeout(12000)});
     if(!res.ok)return respond({ok:true,ignored:"test_order_not_available"},200);
     const order=await res.json();
     const pay=order.transactions?.payments?.[0]||{};
     const reference=String(order.external_reference||"");
     const amount=Number(order.total_amount||pay.amount||0);
     if(String(order.id)!==dataId||!reference.startsWith("xrmovi_hml_")||Math.abs(amount-50)>0.009)
       return respond({ok:true,ignored:"not_xrmovi_sandbox_order"},200);
     const detail=String(order.status_detail||pay.status_detail||"").toLowerCase();
     const approved=String(order.status||"").toLowerCase()==="processed"&&(detail==="accredited"||String(pay.status||"").toLowerCase()==="approved");
     if(!approved)return respond({ok:true,received:true,ignored:"order_not_accredited",access_changed:false,revenue_changed:false});
     const sbUrl=Deno.env.get("SUPABASE_URL")||"";
     const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
     if(!sbUrl.startsWith("https://")||!serviceKey)return respond({error:"sandbox_persistence_unavailable"},503);
     const write=await fetch(sbUrl+"/rest/v1/xrmovi_hml_entitlements?on_conflict=id",{
       method:"POST",headers:{"apikey":serviceKey,"authorization":"Bearer "+serviceKey,"content-type":"application/json","prefer":"resolution=merge-duplicates"},
       body:JSON.stringify({id:"sandbox-only",order_id:dataId,external_reference:reference,status:"active",activated_at:new Date().toISOString(),updated_at:new Date().toISOString()}),
       signal:AbortSignal.timeout(12000)
     });
     if(!write.ok){console.error("XRMOVI sandbox webhook entitlement failed",{status:write.status});return respond({error:"sandbox_entitlement_update_failed"},500)}
     console.info("XRMOVI sandbox webhook verified",{topic,action,simulation:true,isolated_access_activated:true});
     return respond({ok:true,signature_valid:true,received:true,isolated_access_activated:true,real_customer_changed:false,revenue_changed:false});
   }catch{return respond({error:"sandbox_order_verification_unavailable"},503)}
 }
 console.info("XRMOVI sandbox webhook verified",{topic,action,simulation:true,mutated:false});
 return respond({ok:true,signature_valid:true,received:true,topic,action,simulation_only:true,access_changed:false,revenue_changed:false});
});
