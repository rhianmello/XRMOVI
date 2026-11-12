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
 if(action==="prepare_buyer_hml")
   return reply(origin,{error:"Use o Painel do Desenvolvedor para gerenciar contas de teste."},410);
 if(["create_card_hml","inspect_card_hml","diagnose_card_hml"].includes(String(action))){
   // Homologation only. A verified platform administrator is required above this branch.
   const liveTokens=[Deno.env.get("XRMOVI_MP_ACCESS_TOKEN"),Deno.env.get("MP_ACCESS_TOKEN")];
   if(!mpToken.startsWith("APP_USR-")||liveTokens.includes(mpToken))
     return reply(origin,{error:"Credenciais de teste e produção não estão separadas."},503);
   const errorId=crypto.randomUUID();
   const payerEmail=typeof input.payer_email==="string"?input.payer_email.trim():"";
   let maskedEmail:string|undefined;
   const cardError=(error:string,status:number,details:Record<string,unknown>={})=>{
     console.error("XRMOVI sandbox card issue",{error_id:errorId,http_status:status,
       payer_email:maskedEmail,reason:error,...details});
     return reply(origin,{error,error_id:errorId,...details},status);
   };
   if(action==="create_card_hml"){
     if(!payerEmail)return cardError("Informe o e-mail para cobrança (payer_email).",400);
     if(payerEmail.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payerEmail))
       return cardError("Informe um e-mail para cobrança válido.",400);
     const [local,domain]=payerEmail.split("@");
     maskedEmail=local.slice(0,Math.min(2,local.length-1))+"***@"+domain;
     const normalized=payerEmail.toLowerCase();
     if(normalized===Deno.env.get("MP_TEST_SELLER_EMAIL")?.trim().toLowerCase())
       return cardError("O e-mail de cobrança precisa ser diferente do e-mail do vendedor.",400);
     const allowlist=(Deno.env.get("MP_TEST_PAYER_EMAIL_ALLOWLIST")??"").split(",")
       .map(email=>email.trim().toLowerCase()).filter(Boolean);
     if(Deno.env.get("MP_TEST_MODE")==="true"&&allowlist.length&&!allowlist.includes(normalized))
       return cardError("E-mail de cobrança fora da lista de homologação.",400);
   }
   const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
   if(!key)return reply(origin,{error:"Persistência da homologação indisponível."},503);
   const service=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
   const table=()=>service.from("xrmovi_hml_card_subscriptions");
   const {data:record,error:readError}=await table().select("*").eq("id","card-sandbox-only").single();
   if(readError||!record)return reply(origin,{error:"Registro isolado de cartão indisponível."},503);
   const mpHeaders={Authorization:"Bearer "+mpToken,Accept:"application/json"};
   const reference="xrmovi_hml_card_sandbox_only";
   const safeCheckout=(value:unknown)=>{
     if(typeof value!=="string")return null;
     try{const u=new URL(value),h=u.hostname.toLowerCase();
       return u.protocol==="https:"&&["mercadopago.com.br","mercadopago.com"]
         .some(d=>h===d||h.endsWith("."+d))?u.href:null;
     }catch{return null}
   };
   const patch=async(fields:Record<string,unknown>,status?:string)=>{
     const query=table().update({...fields,updated_at:new Date().toISOString()}).eq("id","card-sandbox-only");
     const {data,error}=await (status?query.eq("status",status):query).select("id,status,provider_id").maybeSingle();
     if(error||!data)throw Error("database_update_failed");
     return data;
   };
   const mpGet=async(path:string)=>{
     const response=await fetch("https://api.mercadopago.com"+path,{
       headers:mpHeaders,signal:AbortSignal.timeout(12000)});
     const data=await response.json().catch(()=>({}));
     return {response,data};
   };
   // Full recovery across provider pages: never treat page-one absence as definitive.
   const recover=async()=>{
     const found:any[]=[];let offset=0;let complete=false;
     for(let page=0;page<100;page++){
       const params=new URLSearchParams({limit:"50",offset:String(offset)});
       const {response,data}=await mpGet("/preapproval/search?"+params);
       if(!response.ok||!Array.isArray(data.results))return {complete:false,reason:"search_failed"};
       found.push(...data.results.filter((item:any)=>String(item.external_reference||"")===reference));
       const total=Number(data.paging?.total);
       if(!Number.isFinite(total))return {complete:false,reason:"paging_unknown"};
       offset+=data.results.length;
       if(offset>=total||data.results.length===0){complete=true;break}
     }
     return {complete,found};
   };
   if(action==="diagnose_card_hml"){
     return reply(origin,{test:true,diagnostic:true,record_status:record.status,
       provider_id_exists:!!record.provider_id,
       can_safely_prepare:record.status==="not_created"&&!record.provider_id,
       note:"Informe o e-mail de cobrança antes de iniciar o checkout de teste."});
   }
   if(action==="inspect_card_hml"){
     if(record.provider_id){
       try{
         const {response,data}=await mpGet("/preapproval/"+encodeURIComponent(record.provider_id));
         if(!response.ok)return reply(origin,{error:"Consulta da assinatura falhou.",http_status:response.status},502);
         if(String(data.external_reference||"")!==reference||
            Math.abs(Number(data.auto_recurring?.transaction_amount)-19.90)>0.009)
            return reply(origin,{error:"Assinatura de outra referência ou valor.",test:true},403);
         const currentProviderStatus=String(data.status||"pending");
         if(record.status!=="created"||record.provider_status!==currentProviderStatus){
           await patch({status:"created",provider_status:currentProviderStatus,
             checkout_url:safeCheckout(data.init_point),error_id:null,error_details:null});
         }
         return reply(origin,{test:true,created:true,status:"created",
           provider_status:currentProviderStatus,provider_id:String(data.id),
           checkout_url:safeCheckout(data.init_point),
           webhook_verified:!!record.webhook_verified_at,
           webhook_last_topic:record.webhook_last_topic||null,
           sandbox_payment_status:record.last_payment_status||null,
           real_customer_changed:false,revenue_changed:false});
       }catch{return reply(origin,{error:"Consulta de assinatura indisponível.",test:true},502)}
     }
     try{
       const result=await recover();
       if(!result.complete)return reply(origin,{test:true,created:false,status:record.status,
         recovery:"search_incomplete",note:"Não repita a criação."});
       if(result.found.length>1)return reply(origin,{test:true,created:false,status:record.status,
         recovery:"multiple_matches",note:"Conflito entre assinaturas. Não repetir."});
       if(result.found.length===1){
         const item=result.found[0];
         if(Math.abs(Number(item.auto_recurring?.transaction_amount)-19.90)>.009)
           return reply(origin,{test:true,created:false,recovery:"amount_mismatch"},409);
         await patch({status:"created",provider_id:String(item.id),
           provider_status:String(item.status||"pending"),checkout_url:safeCheckout(item.init_point),
           error_id:null,error_details:null});
         return reply(origin,{test:true,created:true,recovered:true,status:"created",
           provider_status:String(item.status||"pending"),provider_id:String(item.id),
           checkout_url:safeCheckout(item.init_point),
           real_customer_changed:false,revenue_changed:false});
       }
       return reply(origin,{test:true,created:false,status:record.status,
         recovery:"not_found",search_complete:true,
         error_id:record.error_id||null,provider_diagnostic:record.error_details||null,
         note:"Busca exaustiva sem assinatura correspondente. Não houve POST."});
     }catch{return reply(origin,{test:true,created:false,status:record.status,
       recovery:"search_unavailable",note:"Não repita a criação."})}
   }
   // Creation is one-shot. Rejected or unknown attempts need explicit reconciliation.
   if(record.provider_id||record.status!=="not_created")
     return reply(origin,{error:"Tentativa anterior existente ou bloqueada. Consulte o status, sem criar outra.",
       status:record.status,error_id:record.error_id||null},409);
   const testSellerId=Deno.env.get("XRMOVI_MP_TEST_SELLER_ID")?.trim()||"3674980618";
   if(!/^\d+$/.test(testSellerId))
     return cardError("O ID configurado do vendedor de teste é inválido.",503);
   const seller=await mpGet("/users/me").catch(()=>null);
   if(!seller?.response.ok||String(seller.data?.id)!==testSellerId||seller.data?.site_id!=="MLB")
     return cardError("A credencial não corresponde ao vendedor de teste configurado.",503);
   if(payerEmail.toLowerCase()===String(seller.data?.email||"").trim().toLowerCase())
     return cardError("O e-mail de cobrança precisa ser diferente do e-mail do vendedor.",400);
   const existing=await recover().catch(()=>({complete:false,reason:"search_unavailable"}));
   if(!existing.complete||existing.found?.length){
     return reply(origin,{error:"Não foi possível comprovar ausência de assinatura anterior. Nenhum POST enviado."},409);
   }
   try{
     await patch({status:"creating",error_id:null,error_details:null,
       last_attempt_at:new Date().toISOString()},"not_created");
   }catch{return reply(origin,{error:"Tentativa simultânea detectada. Nenhum POST enviado."},409)}
   const payload={
     reason:"XRMOVI HOMOLOGAÇÃO - Start - CARTÃO TESTE",
     external_reference:reference,
     payer_email:payerEmail,
     auto_recurring:{frequency:1,frequency_type:"months",
       end_date:new Date(Date.now()+365*24*60*60*1000).toISOString(),
       transaction_amount:19.90,currency_id:"BRL"},
     back_url:"https://xrmovi.com.br/",status:"pending"
   };
   try{
     const response=await fetch("https://api.mercadopago.com/preapproval",{
       method:"POST",headers:{...mpHeaders,"Content-Type":"application/json",
         "X-Idempotency-Key":reference},
       body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
     const body=await response.json().catch(()=>({}));
     if(!response.ok){
       await patch({status:"rejected",error_id:errorId,error_details:{status:response.status}},"creating");
       return cardError("Mercado Pago recusou a assinatura de teste.",502,{provider_status:response.status});
     }
     if(!body.id||String(body.external_reference||"")!==reference){
       // A 2xx may have created the provider resource; leave creating until recovery.
       return cardError("Resposta inconclusiva. Consulte antes de repetir.",502,{status:"creating"});
     }
     const checkout=safeCheckout(body.init_point);
     await patch({status:"created",provider_id:String(body.id),
       provider_status:String(body.status||"pending"),checkout_url:checkout,
       error_id:null,error_details:null},"creating");
     return reply(origin,{test:true,created:true,status:"created",
       provider_status:String(body.status||"pending"),provider_id:String(body.id),
       checkout_url:checkout,real_customer_changed:false,revenue_changed:false});
   }catch{
     // Network/DB uncertainty must not become rejected or retryable.
     return cardError("Resultado incerto. Consulte a assinatura antes de qualquer nova tentativa.",502,{status:"creating"});
   }
 }

 if(action==="test_signed_card_webhook_hml"){
   // Owner-only, internally generated HMAC exercise of the live URL's TEST branch.
   // This is NOT an actual Mercado Pago delivery. Absolutely no new payment/order.
   const secret=Deno.env.get("XRMOVI_MP_TEST_WEBHOOK_SECRET")||"";
   const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
   if(secret.length<20||!key)return reply(origin,{error:"Teste de webhook indisponível."},503);
   const service=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
   const {data:row,error:lookupError}=await service.from("xrmovi_hml_card_subscriptions")
     .select("provider_id,status,external_reference").eq("id","card-sandbox-only").maybeSingle();
   if(lookupError||row?.status!=="created"||!row?.provider_id||
     row.external_reference!=="xrmovi_hml_card_sandbox_only")
     return reply(origin,{error:"Não existe assinatura fictícia válida para testar.",test:true},409);
   const testGet=async(path:string)=>{
     const res=await fetch("https://api.mercadopago.com"+path,{
       headers:{Authorization:"Bearer "+mpToken,Accept:"application/json"},
       signal:AbortSignal.timeout(12000)});
     if(!res.ok)throw Error("test_provider_not_available");
     return res.json();
   };
   try{
     const sub=await testGet("/preapproval/"+encodeURIComponent(row.provider_id));
     if(String(sub.id)!==row.provider_id||
       String(sub.external_reference)!=="xrmovi_hml_card_sandbox_only"||
       sub.auto_recurring?.currency_id!=="BRL"||
       Math.abs(Number(sub.auto_recurring?.transaction_amount)-19.90)>0.009)
       return reply(origin,{error:"Assinatura não pertence ao teste isolado.",test:true},403);
     const invoices=await testGet("/authorized_payments/search?preapproval_id="+
       encodeURIComponent(row.provider_id)+"&limit=50");
     const approved=Array.isArray(invoices.results)?invoices.results.find((v:any)=>
       String(v.preapproval_id)===row.provider_id&&v.currency_id==="BRL"&&
       Math.abs(Number(v.transaction_amount)-19.90)<0.009&&
       v.payment?.status==="approved"&&/^\d+$/.test(String(v.id||""))):null;
     const events=[{topic:"subscription_preapproval",id:row.provider_id}];
     if(approved)events.push({topic:"subscription_authorized_payment",id:String(approved.id)});
     const received:any[]=[];
     for(const event of events){
       const ts=String(Math.floor(Date.now()/1000));
       const requestId=crypto.randomUUID();
       const manifest="id:"+event.id.toLowerCase()+";request-id:"+requestId+";ts:"+ts+";";
       const hmacKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
         {name:"HMAC",hash:"SHA-256"},false,["sign"]);
       const digest=Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",hmacKey,
          new TextEncoder().encode(manifest)))).map(b=>b.toString(16).padStart(2,"0")).join("");
       const endpoint=url+"/functions/v1/xrmovi-billing-webhook?data.id="+
         encodeURIComponent(event.id)+"&type="+encodeURIComponent(event.topic);
       const response=await fetch(endpoint,{method:"POST",headers:{
         "content-type":"application/json","x-request-id":requestId,
         "x-signature":"ts="+ts+",v1="+digest
       },body:JSON.stringify({type:event.topic,action:event.topic+".updated",
         live_mode:false,data:{id:event.id}}),signal:AbortSignal.timeout(20000)});
       const body=await response.json().catch(()=>({}));
       received.push({topic:event.topic,http_status:response.status,
         acknowledged:response.ok&&body.test===true&&body.ok===true,
         provider_status:body.provider_status||null,payment_status:body.payment_status||null});
       if(!response.ok||body.ok!==true||body.test!==true)
         break;
     }
     const {data:after,error:dbError}=await service.from("xrmovi_hml_card_subscriptions")
       .select("provider_status,last_payment_status,webhook_verified_at,webhook_last_topic")
       .eq("id","card-sandbox-only").maybeSingle();
     const passed=!dbError&&!!after?.webhook_verified_at&&
       received.length===events.length&&received.every(x=>x.acknowledged);
     return reply(origin,{test:true,passed,simulated_only:true,
       webhook_event_source:"internally_signed_simulation",
       real_mercadopago_webhook_delivery_tested:false,
       subscription_provider_status:after?.provider_status||null,
       payment_status:after?.last_payment_status||null,
       test_invoice_found:!!approved,deliveries:received,
       real_customer_changed:false,revenue_changed:false},passed?200:502);
   }catch{return reply(origin,{test:true,passed:false,
     error:"Falha no teste de webhook de cartão. Não foi criada nova cobrança.",
     simulated_only:true,real_mercadopago_webhook_delivery_tested:false},502)}
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
