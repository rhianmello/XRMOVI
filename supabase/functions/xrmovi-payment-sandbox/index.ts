import {createClient} from "npm:@supabase/supabase-js@2.58.0";

// Isolated Mercado Pago sandbox tester. Never writes to XRMOVI commercial tables.
// Every state-changing request requires a verified platform administrator.
const allowedOrigins=new Set(["https://xrmovi.com.br","https://www.xrmovi.com.br","https://frota.nospassa.com.br"]);
const reply=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin",...(allowedOrigins.has(origin)?{"access-control-allow-origin":origin}:{})}});
const jsonStatus=(origin:string,enabled:boolean)=>reply(origin,{available:enabled,mode:"sandbox",creates_real_payments:false});
const configured=()=> {
 const key=Deno.env.get("XRMOVI_MP_TEST_ACCESS_TOKEN")||"";
 const prod=Deno.env.get("XRMOVI_MP_ACCESS_TOKEN")||"";
 return Deno.env.get("XRMOVI_MP_SANDBOX_ENABLED")==="true" &&
   key.startsWith("APP_USR-") && key.length>30 && key!==prod;
};
const orderId=/^ORD[A-Z0-9]{8,100}$/;
function publicTestOrder(data:Record<string,any>){
 const payment=data.transactions?.payments?.[0]||{};
 const method=payment.payment_method||{};
 const qr=String(method.qr_code||"");
 const base64=String(method.qr_code_base64||"");
 const ticket=String(method.ticket_url||"");
 const sandboxTicket=ticket.startsWith("https://www.mercadopago.com.br/sandbox/")?ticket:null;
 return {
  test:true,order_id:String(data.id||""),status:String(data.status||"unknown"),
  status_detail:String(data.status_detail||payment.status_detail||""),
  amount_brl:50,paid_in_real_money:false,
  pix_code:qr.length<=1500?qr:null,
  pix_qr_base64:base64.length<=400000&&/^[a-zA-Z0-9+/=]*$/.test(base64)?base64:null,
  sandbox_ticket_url:sandboxTicket
 };
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(origin&&!allowedOrigins.has(origin))return reply(origin,{error:"Origem não autorizada"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":origin,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","vary":"Origin"}});
 if(req.method==="GET")return jsonStatus(origin,configured());
 if(req.method!=="POST")return reply(origin,{error:"Método não permitido"},405);
 if(!configured())return reply(origin,{error:"Homologação não configurada. Não foi criada nenhuma ordem."},503);
 const rawAuth=req.headers.get("authorization")||"";
 if(!rawAuth.startsWith("Bearer "))return reply(origin,{error:"Entre na conta do proprietário"},401);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 if(!url.startsWith("https://")||!anon)return reply(origin,{error:"Autenticação indisponível"},503);
 const token=rawAuth.slice(7);
 const client=createClient(url,anon,{global:{headers:{Authorization:rawAuth}},auth:{autoRefreshToken:false,persistSession:false}});
 const {data:userResult,error:identityError}=await client.auth.getUser(token);
 if(identityError||!userResult.user)return reply(origin,{error:"Sessão inválida"},401);
 const {data:isAdmin,error:adminError}=await client.rpc("xrmovi_platform_is_admin");
 if(adminError||isAdmin!==true)return reply(origin,{error:"Somente o proprietário pode homologar pagamentos"},403);
 let input:Record<string,unknown>;
 try{
  if(Number(req.headers.get("content-length")||0)>512)return reply(origin,{error:"Requisição muito grande"},413);
  input=await req.json();
  if(!input||typeof input!=="object")throw Error();
 }catch{return reply(origin,{error:"Requisição inválida"},400)}
 const action=input.action;
 const mpToken=Deno.env.get("XRMOVI_MP_TEST_ACCESS_TOKEN")||"";
 if(action==="create_pix"){
  // Mercado Pago documented Pix test case: fixed R$50, test payer APRO.
  // No live customer, no commercial ledger, no subscription, no production webhook.
  const idempotencyKey="xrmovi-hml-"+userResult.user.id+"-"+Math.floor(Date.now()/600000);
  const payload={type:"online",external_reference:"xrmovi_hml_"+crypto.randomUUID(),total_amount:"50.00",payer:{email:"test_payer@example.com",first_name:"APRO"},transactions:{payments:[{amount:"50.00",payment_method:{id:"pix",type:"bank_transfer"}}]}};
  try{
   const result=await fetch("https://api.mercadopago.com/v1/orders",{method:"POST",headers:{"Authorization":"Bearer "+mpToken,"Content-Type":"application/json","X-Idempotency-Key":idempotencyKey},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
   const data=await result.json().catch(()=>({}));
   if(!result.ok)return reply(origin,{error:"Falha na ordem de teste",http_status:result.status},502);
   return reply(origin,publicTestOrder(data));
  }catch{return reply(origin,{error:"Não foi possível consultar o ambiente de teste"},502)}
 }
 if(action==="create_card_hml"||action==="inspect_card_hml"){
   // Test subscriptions only: no real payer, no production checkout or ledger writes.
   const liveKey=Deno.env.get("XRMOVI_MP_ACCESS_TOKEN")||Deno.env.get("MP_ACCESS_TOKEN")||"";
   if(!mpToken.startsWith("APP_USR-")||mpToken===liveKey)
     return reply(origin,{error:"Credencial de teste não está separada da produção"},503);
   const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
   if(!serviceKey)return reply(origin,{error:"Armazenamento de homologação indisponível"},503);
   const service=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
   const {data:record,error:recordError}=await service.from("xrmovi_hml_card_subscriptions")
     .select("id,provider_id,status,checkout_url").eq("id","card-sandbox-only").single();
   if(recordError||!record)return reply(origin,{error:"Registro isolado indisponível"},503);
   const mpHeaders={Authorization:"Bearer "+mpToken,Accept:"application/json"};
   const validateTestBuyer=async()=>{
     // Test buyer ID is from the user's Mercado Pago developer test-account dashboard.
     const res=await fetch("https://api.mercadopago.com/users/3674938694",{
       headers:mpHeaders,signal:AbortSignal.timeout(12000)});
     const account=await res.json().catch(()=>({}));
     const email=String(account.email||"").trim().toLowerCase();
     const verified=res.ok&&String(account.id)==="3674938694"&&
       email.endsWith("@testuser.com")&&!email.includes(" ")&&email.length>15;
     return {verified,email:verified?email:null,http_status:res.status};
   };
   const safeCheckout=(value:unknown)=>{
     if(typeof value!=="string")return null;
     try{const u=new URL(value);const host=u.hostname.toLowerCase();
      return u.protocol==="https:"&&["mercadopago.com","mercadopago.com.br"].some(d=>host===d||host.endsWith("."+d))?u.href:null;
     }catch{return null}
   };
   if(action==="diagnose_card_hml"){
     try{
       const buyer=await validateTestBuyer();
       const sellerResponse=await fetch("https://api.mercadopago.com/users/me",{
         headers:mpHeaders,signal:AbortSignal.timeout(12000)});
       const seller=await sellerResponse.json().catch(()=>({}));
       const email=String(seller.email||"").toLowerCase();
       const sellerIsTest=sellerResponse.ok&&(email.endsWith("@testuser.com")||String(seller.nickname||"").toUpperCase().startsWith("TEST"));
       return reply(origin,{test:true,diagnostic:true,buyer_verified:buyer.verified,
         buyer_http_status:buyer.http_status,seller_is_test:sellerIsTest,
         seller_http_status:sellerResponse.status,record_status:record.status,
         provider_id_exists:!!record.provider_id,
         can_safely_prepare:sellerIsTest&&buyer.verified&&!record.provider_id,
         note:"Somente inspeção das contas Mercado Pago. Nenhuma assinatura foi criada."});
     }catch{return reply(origin,{test:true,diagnostic:true,error:"Falha ao consultar contas de teste"},502)}
   }
   if(action==="inspect_card_hml"){
     if(!record.provider_id){
       // Read-only recovery before any retry: an earlier POST may have reached Mercado Pago.
       try{
         // Exhaust paginated provider results; never infer absence from page one.
         const found:any[]=[];
         let offset=0,total=0,complete=false;
         for(let page=0;page<20;page++){
           const params=new URLSearchParams({payer_email:"test_payer@example.com",limit:"50",offset:String(offset)});
           const response=await fetch("https://api.mercadopago.com/preapproval/search?"+params,{
             headers:mpHeaders,signal:AbortSignal.timeout(12000)});
           const data=await response.json().catch(()=>({}));
           if(!response.ok)return reply(origin,{test:true,created:false,status:record.status,
             recovery:"provider_search_failed",http_status:response.status,
             note:"Consulta inconclusiva. Não crie outra assinatura."});
           if(!Array.isArray(data.results))return reply(origin,{test:true,created:false,status:record.status,
             recovery:"invalid_search_response"});
           found.push(...data.results.filter((x:any)=>String(x.external_reference||"")==="xrmovi_hml_card_sandbox_only"));
           total=Number(data.paging?.total||0);
           offset+=data.results.length;
           if(data.results.length===0||offset>=total){complete=true;break}
         }
         if(!complete)return reply(origin,{test:true,created:false,status:record.status,
           recovery:"search_incomplete",note:"Busca paginada incompleta. Nenhuma nova assinatura criada."});
         if(found.length!==1)return reply(origin,{test:true,created:false,status:record.status,
           recovery:found.length>1?"multiple_matches":"not_found",
           search_complete:true,
           note:"Busca concluída sem criar assinatura. A tentativa anterior continua bloqueada; investigar a rejeição 400 antes de reabrir."});
         const item=found[0],checkout=safeCheckout(item.init_point);
         if(Math.abs(Number(item.auto_recurring?.transaction_amount)-19.90)>0.009)
           return reply(origin,{test:true,created:false,recovery:"amount_mismatch"});
         const {error:writeError}=await service.from("xrmovi_hml_card_subscriptions")
           .update({provider_id:String(item.id),checkout_url:checkout,status:"pending",updated_at:new Date().toISOString()})
           .eq("id","card-sandbox-only");
         if(writeError)return reply(origin,{error:"Assinatura localizada, mas não foi possível vinculá-la. Não crie outra."},502);
         return reply(origin,{test:true,created:true,recovered:true,provider_id:String(item.id),
           status:String(item.status||"pending"),checkout_url:checkout,
           real_customer_changed:false,revenue_changed:false});
       }catch{return reply(origin,{test:true,created:false,status:record.status,
         recovery:"search_unavailable",note:"Não repita a criação até concluir a conferência."})}
     }
     try{
       const response=await fetch("https://api.mercadopago.com/preapproval/"+encodeURIComponent(record.provider_id),{
         headers:mpHeaders,signal:AbortSignal.timeout(12000)});
       if(!response.ok)return reply(origin,{error:"Não foi possível verificar a assinatura de teste",http_status:response.status},502);
       const item=await response.json();
       if(String(item.external_reference)!=="xrmovi_hml_card_sandbox_only"||
          Math.abs(Number(item.auto_recurring?.transaction_amount)-19.90)>.009)
         return reply(origin,{error:"A assinatura não pertence ao ambiente isolado"},403);
       const status=String(item.status||"unknown");
       return reply(origin,{test:true,created:true,provider_id:String(item.id),
         status,checkout_url:safeCheckout(item.init_point),
         real_customer_changed:false,revenue_changed:false});
     }catch{return reply(origin,{error:"Consulta Mercado Pago indisponível"},502)}
   }
   if(record.provider_id)return reply(origin,{test:true,created:true,reused:true,
     provider_id:record.provider_id,status:record.status,checkout_url:safeCheckout(record.checkout_url),
     real_customer_changed:false,revenue_changed:false});
   if(record.status!=="not_created")return reply(origin,{error:"Existe uma tentativa anterior de homologação. Nenhuma assinatura adicional foi criada."},409);
   const buyer=await validateTestBuyer();
   if(!buyer.verified||!buyer.email)return reply(origin,{error:"A API não confirmou o e-mail do comprador de teste. Nenhuma assinatura foi criada.",buyer_http_status:buyer.http_status},503);
   const sellerResponse=await fetch("https://api.mercadopago.com/users/me",{
     headers:mpHeaders,signal:AbortSignal.timeout(12000)});
   const seller=await sellerResponse.json().catch(()=>({}));
   const sellerIsTest=sellerResponse.ok&&(String(seller.email||"").toLowerCase().endsWith("@testuser.com")||
     String(seller.nickname||"").toUpperCase().startsWith("TEST"));
   if(!sellerIsTest)return reply(origin,{error:"A credencial atual não foi confirmada como vendedor de teste. Nenhuma assinatura foi criada.",seller_http_status:sellerResponse.status},503);
   // Atomic single-use claim prevents accidental duplicate recurring subscriptions.
   const {data:claimed,error:claimError}=await service.from("xrmovi_hml_card_subscriptions")
     .update({status:"pending",updated_at:new Date().toISOString()})
     .eq("id","card-sandbox-only").eq("status","not_created").select("id").maybeSingle();
   if(claimError||!claimed)return reply(origin,{error:"Uma tentativa já está em andamento. Não criamos outra assinatura."},409);
   const payload={
     reason:"XRMOVI HOMOLOGAÇÃO — Start — CARTÃO DE TESTE",
     external_reference:"xrmovi_hml_card_sandbox_only",
     payer_email:buyer.email,
     auto_recurring:{frequency:1,frequency_type:"months",
       end_date:new Date(Date.now()+365*24*60*60*1000).toISOString(),
       transaction_amount:19.90,currency_id:"BRL"},
     back_url:"https://xrmovi.com.br/#planos",status:"pending"
   };
   try{
     const response=await fetch("https://api.mercadopago.com/preapproval",{
       method:"POST",headers:{...mpHeaders,"Content-Type":"application/json","X-Idempotency-Key":"xrmovi_hml_card_sandbox_only"},
       body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
     const item=await response.json().catch(()=>({}));
     if(!response.ok){
       // Only sanitized provider diagnostic categories may enter logs or admin-only responses.
       // Never emit credentials, full payer details, tokens or the entire provider response.
       const safeField=(v:unknown)=>String(v??"").replace(/[^a-zA-Z0-9_. :\-]/g,"").slice(0,120);
       const causes=Array.isArray(item.cause)?item.cause.slice(0,5).map((x:any)=>({
         code:safeField(x?.code),description:safeField(x?.description)
       })):[];
       const diagnostic={status:response.status,error:safeField(item.error),message:safeField(item.message),causes};
       console.error("XRMOVI test preapproval rejected",diagnostic);
       return reply(origin,{error:"Mercado Pago não aceitou a assinatura de teste. Tentativa bloqueada para evitar duplicidade.",http_status:response.status,
         provider_diagnostic:diagnostic},502);
     }
     const id=String(item.id||""),checkout=safeCheckout(item.init_point);
     if(!id||String(item.external_reference)!==payload.external_reference)
       return reply(origin,{error:"Resposta inesperada. Nenhuma nova assinatura será criada até conferência."},502);
     const {error:saveError}=await service.from("xrmovi_hml_card_subscriptions")
       .update({provider_id:id,checkout_url:checkout,status:"pending",updated_at:new Date().toISOString()})
       .eq("id","card-sandbox-only");
     if(saveError)return reply(origin,{error:"Assinatura criada no ambiente de teste, mas não vinculada. Não tente novamente."},502);
     return reply(origin,{test:true,created:true,reused:false,status:String(item.status||"pending"),
       provider_id:id,checkout_url:checkout,real_customer_changed:false,revenue_changed:false});
   }catch{return reply(origin,{error:"Não foi possível concluir a tentativa de teste. Evite repetir até conferir o status."},502)}
 }
 if(action==="run_signed_webhook_hml"){
   const id=String(input.order_id||"");
   if(!orderId.test(id))return reply(origin,{error:"Identificador de homologação inválido"},400);
   const webhookSecret=Deno.env.get("XRMOVI_MP_TEST_WEBHOOK_SECRET")||"";
   const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
   if(webhookSecret.length<20||!serviceKey)return reply(origin,{error:"Serviços de homologação indisponíveis"},503);
   try{
     // Verify order with the TEST Mercado Pago credential before any test write.
     const check=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(id),{
       headers:{Authorization:"Bearer "+mpToken},signal:AbortSignal.timeout(12000)});
     if(!check.ok)return reply(origin,{error:"Ordem de teste não encontrada"},404);
     const ord=await check.json(),p=ord.transactions?.payments?.[0]||{};
     const ref=String(ord.external_reference||"");
     const detail=String(ord.status_detail||p.status_detail||"").toLowerCase();
     if(String(ord.id)!==id||!ref.startsWith("xrmovi_hml_")||
        Math.abs(Number(ord.total_amount||p.amount||0)-50)>0.009||
        !(String(ord.status||"").toLowerCase()==="processed"&&
          (detail==="accredited"||String(p.status||"").toLowerCase()==="approved")))
       return reply(origin,{test:true,passed:false,error:"Ordem ainda não creditada ou não pertence à homologação"},409);
     const service=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
     const {error:resetError}=await service.from("xrmovi_hml_entitlements").upsert({
       id:"sandbox-only",order_id:id,external_reference:ref,status:"pending",
       activated_at:null,updated_at:new Date().toISOString()
     },{onConflict:"id"});
     if(resetError)return reply(origin,{error:"Falha ao preparar registro fictício"},500);
     // Deterministic in-house signed notification; NOT a provider-delivered event.
     const ts=String(Math.floor(Date.now()/1000));
     const requestId=crypto.randomUUID();
     const manifest="id:"+id.toLowerCase()+";request-id:"+requestId+";ts:"+ts+";";
     const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(webhookSecret),{
       name:"HMAC",hash:"SHA-256"},false,["sign"]);
     const signature=Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(manifest))))
       .map(b=>b.toString(16).padStart(2,"0")).join("");
     const endpoint=url+"/functions/v1/xrmovi-webhook-sandbox?data.id="+encodeURIComponent(id)+"&type=order";
     const incoming=await fetch(endpoint,{method:"POST",headers:{
       "content-type":"application/json","x-request-id":requestId,"x-signature":"ts="+ts+",v1="+signature},
       body:JSON.stringify({type:"order",action:"order.updated",live_mode:false,data:{id}}),
       signal:AbortSignal.timeout(20000)});
     const outcome=await incoming.json().catch(()=>({}));
     const {data:row,error:readError}=await service.from("xrmovi_hml_entitlements")
       .select("order_id,status,activated_at").eq("id","sandbox-only").maybeSingle();
     const passed=incoming.status===200&&outcome.signature_valid===true&&
       outcome.isolated_access_activated===true&&!readError&&
       row?.order_id===id&&row?.status==="active";
     return reply(origin,{test:true,passed,webhook_http_status:incoming.status,
       signature_valid:outcome.signature_valid===true,
       isolated_access_activated:passed,record_status:row?.status||"unavailable",
       webhook_event_source:"internally_signed_simulation",
       real_mercadopago_webhook_delivery_tested:false,
       customers_changed:false,revenue_changed:false},passed?200:502);
   }catch(e){return reply(origin,{test:true,passed:false,error:"Falha no teste integrado de webhook",
      reason:e instanceof Error?e.name:"unknown"},502)}
 }
 if(action==="inspect_pix"||action==="simulate_settlement"||action==="activate_hml_access"){
  const id=String(input.order_id||"");
  if(!orderId.test(id))return reply(origin,{error:"Identificador de teste inválido"},400);
  try{
   const result=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(id),{headers:{"Authorization":"Bearer "+mpToken},signal:AbortSignal.timeout(15000)});
   const data=await result.json().catch(()=>({}));
   if(!result.ok)return reply(origin,{error:"Não foi possível consultar a ordem",http_status:result.status},502);
   // Only orders explicitly created by the XRMOVI sandbox may participate.
   if(typeof data.external_reference!=="string"||!data.external_reference.startsWith("xrmovi_hml_"))
     return reply(origin,{error:"Ordem não pertence à homologação XRMOVI"},403);
   if(action==="inspect_pix")return reply(origin,publicTestOrder(data));
   const payment=data.transactions?.payments?.[0]||{};
   const status=String(data.status||"").toLowerCase();
   const detail=String(data.status_detail||payment.status_detail||"").toLowerCase();
   const accredited=status==="processed"&&(detail==="accredited"||String(payment.status||"").toLowerCase()==="approved");
   if(action==="activate_hml_access"){
     // Separate sandbox-only record. Never grant access to a real user or write commercial billing tables.
     const reference=String(data.external_reference||"");
     const amount=Number(data.total_amount||payment.amount||0);
     if(!reference.startsWith("xrmovi_hml_")||Math.abs(amount-50)>0.009)
       return reply(origin,{error:"Ordem não corresponde à homologação de R$ 50,00"},403);
     if(!accredited)return reply(origin,{test:true,activated:false,reason:"payment_not_accredited",order_id:id,status,detail});
     const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
     if(!serviceKey)return reply(origin,{error:"Serviço de homologação indisponível"},503);
     const service=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
     const {data:row,error:upsertError}=await service.from("xrmovi_hml_entitlements").upsert({
       id:"sandbox-only",order_id:id,external_reference:reference,status:"active",
       activated_at:new Date().toISOString(),updated_at:new Date().toISOString()
     },{onConflict:"id"}).select("id,order_id,status,activated_at").single();
     if(upsertError){console.error("XRMOVI sandbox entitlement write failed",{code:upsertError.code});return reply(origin,{error:"Não foi possível registrar acesso de homologação"},500)}
     return reply(origin,{test:true,activated:true,scope:"sandbox-only",order_id:row.order_id,status:row.status,activated_at:row.activated_at,real_customer_changed:false,revenue_changed:false});
   }
   return reply(origin,{
     test:true,order_id:id,provider_status:status,provider_detail:detail,
     event_simulated:accredited?"payment_approved":"payment_pending",
     would_grant_access:accredited,access_actually_changed:false,
     billing_ledger_changed:false,webhook_delivered:false,
     note:"Simulação da regra de liberação. Nenhum webhook externo foi recebido ou processado e nenhuma assinatura foi criada."
   });
  }catch{return reply(origin,{error:"Consulta da ordem indisponível"},502)}
 }
 return reply(origin,{error:"Ação não reconhecida"},400);
});
