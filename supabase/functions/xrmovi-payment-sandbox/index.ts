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
