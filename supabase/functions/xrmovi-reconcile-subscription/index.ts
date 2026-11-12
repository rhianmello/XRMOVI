// XRMOVI: authenticated read-only reconciliation against Mercado Pago. NEVER creates a payment.
// Settles only verified, approved recurring invoices that belong to the caller's own account.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const origins=new Set(["https://frota.nospassa.com.br","https://www.frota.nospassa.com.br","https://xrmovi.com.br","https://www.xrmovi.com.br"]);
const json=(data:unknown,status=200,origin:string|null=null)=>{
 const headers:Record<string,string>={"content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin"};
 if(origin&&origins.has(origin))headers["access-control-allow-origin"]=origin;
 return new Response(JSON.stringify(data),{status,headers});
};
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(origin&&!origins.has(origin))return json({error:"Origem não autorizada"},403,origin);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
  "access-control-allow-origin":origin||"https://xrmovi.com.br",
  "access-control-allow-methods":"POST, OPTIONS",
  "access-control-allow-headers":"authorization,apikey,content-type,x-client-info",
  "vary":"Origin"
 }});
 if(req.method!=="POST")return json({error:"Método não permitido"},405,origin);
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer "))return json({error:"Faça login."},401,origin);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const mpToken=Deno.env.get("XRMOVI_MP_ACCESS_TOKEN")||"";
 if(!url||!anon||!serviceKey||!mpToken.startsWith("APP_USR-"))return json({error:"Verificação de cobrança indisponível."},503,origin);
 try{
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:identity,error:authError}=await client.auth.getUser(auth.slice(7));
  if(authError||!identity.user)return json({error:"Sessão inválida."},401,origin);
  const body=await req.json();
  const cid=String(body?.company_id||"");
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(cid))
    return json({error:"Empresa inválida."},400,origin);
  const {data:record,error:lookupError}=await client.rpc("xrmovi_checkout_reconcile_lookup",{cid});
  if(lookupError)throw new Error(lookupError.message);
  // Do not trust an active flag alone: recurring payments may have arrived without webhook.
 const paidUntil=Date.parse(String(record?.paid_through||""));
 const currentlyPaid=record?.status==="active"&&Number.isFinite(paidUntil)&&paidUntil>Date.now();
  if(!record?.intent_id||!record?.provider_subscription_id||!["created","pending","paid"].includes(record?.intent_status))
    return json({status:currentlyPaid?"active":"no_payment",message:currentlyPaid?"Assinatura vigente até "+new Date(paidUntil).toLocaleDateString("pt-BR",{timeZone:"UTC"})+".":"Não foi encontrada cobrança vinculada a essa empresa."},200,origin);
  // Only GET requests: verification must never create or restart a charge.
  // Some Mercado Pago accounts reject paging arguments on the first invoice search.
  // Retry that same READ-ONLY filter without paging once; never mistake a failed API response for no payment.
  const mpGet=async(path:string,operation:string,readOnlyFallback?:string)=>{
   const read=async(urlPath:string)=>fetch("https://api.mercadopago.com"+urlPath,{
    method:"GET",headers:{Authorization:"Bearer "+mpToken,Accept:"application/json"},
    signal:AbortSignal.timeout(10000)
   });
   let result=await read(path);
   if(result.status===400&&readOnlyFallback){
    console.warn("XRMOVI Mercado Pago read-only paging rejected",{operation,status:400});
    result=await read(readOnlyFallback);
   }
   if(!result.ok){
    let providerCode="unavailable";
    try{
     const detail=await result.json();
     const raw=String(detail?.error||detail?.code||"");
     if(/^[a-z_0-9-]{1,60}$/i.test(raw))providerCode=raw;
    }catch{}
    console.warn("XRMOVI Mercado Pago reconciliation GET failed",{
     operation,http_status:result.status,provider_code:providerCode
    });
    throw new Error("Falha na consulta de "+operation+" ao Mercado Pago (HTTP "+result.status+"). Nenhuma nova cobrança foi criada. Tente Verificar pagamento novamente ou procure o suporte.");
   }
   return result.json();
  };
  const preapproval=String(record.provider_subscription_id);
  const subscription=await mpGet("/preapproval/"+encodeURIComponent(preapproval),"assinatura");
  if(String(subscription.id)!==preapproval
    ||String(subscription.external_reference)!==String(record.intent_id)
    ||Number(subscription.collector_id)!==10284642)
    throw new Error("Cobrança não corresponde à conta XRMOVI.");

  const backend=createClient(url,serviceKey,{auth:{persistSession:false}});
  if(["paused","canceled"].includes(String(subscription.status))){
   const {error}=await backend.rpc("xrmovi_checkout_provider_status",{preapproval_id:preapproval,new_status:String(subscription.status)});
   if(error)throw new Error("Não foi possível atualizar o cancelamento da assinatura.");
   return json({status:"inactive",provider_status:subscription.status,message:"Assinatura "+(subscription.status==="canceled"?"cancelada":"pausada")+" no Mercado Pago."},200,origin);
  }
  if(subscription.status!=="authorized")
   return json({status:currentlyPaid?"active":"pending",provider_status:subscription.status,message:currentlyPaid?"A assinatura ainda tem período pago vigente.":"Assinatura ainda não autorizada pelo pagador."},200,origin);
  if(String(subscription.auto_recurring?.currency_id||"BRL")!=="BRL"||
     Math.abs(Number(subscription.auto_recurring?.transaction_amount)-Number(record.expected_amount))>0.009)
   throw new Error("Valor ou moeda da assinatura não corresponde ao plano contratado.");
  const expected=Number(record.expected_amount);
  if(!Number.isFinite(expected)||expected<=0)throw new Error("Valor contratual inválido.");
  // Scan bounded pages, so a missed webhook on a renewal is not hidden behind older invoices.
  const invoices:any[]=[];
  let offset=0;
  for(let page=0;page<20;page++){
   const result=await mpGet("/authorized_payments/search?preapproval_id="+encodeURIComponent(preapproval)+"&limit=50&offset="+offset,"faturas",offset===0?"/authorized_payments/search?preapproval_id="+encodeURIComponent(preapproval):undefined);
   if(!Array.isArray(result?.results))throw new Error("Mercado Pago não retornou uma lista válida de faturas.");
   invoices.push(...result.results);
   offset+=result.results.length;
   const total=Number(result.paging?.total);
   if(!result.results.length||(Number.isFinite(total)&&offset>=total))break;
   if(page===19)throw new Error("Histórico de faturas excede o limite de conferência; contate o suporte.");
  }
  invoices.sort((a,b)=>Date.parse(String(a?.debit_date||a?.date_created||""))-Date.parse(String(b?.debit_date||b?.date_created||"")));
  let reconciled=0;
  for(const item of invoices){
   if(!/^\d+$/.test(String(item?.id||""))||!/^\d+$/.test(String(item?.payment?.id||""))||item.payment.status!=="approved")continue;
   const invoice=await mpGet("/authorized_payments/"+encodeURIComponent(String(item.id)),"fatura");
   if(String(invoice.id)!==String(item.id)||String(invoice.preapproval_id)!==preapproval
     ||String(invoice.payment?.id)!==String(item.payment.id)
     ||invoice.payment?.status!=="approved"||invoice.currency_id!=="BRL"
     ||Math.abs(Number(invoice.transaction_amount)-expected)>0.009)continue;
   const payment=await mpGet("/v1/payments/"+encodeURIComponent(String(invoice.payment.id)),"pagamento");
   if(String(payment.id)!==String(invoice.payment.id)||payment.status!=="approved"
     ||payment.currency_id!=="BRL"||payment.live_mode===false
     ||Math.abs(Number(payment.transaction_amount)-expected)>0.009)continue;
   const at=String(payment.date_approved||invoice.debit_date||"");
   if(!Number.isFinite(Date.parse(at)))continue;
   const {data:settled,error:err}=await backend.rpc("xrmovi_checkout_settle",{
    intent_id:String(record.intent_id),preapproval_id:preapproval,invoice_id:String(invoice.id),
    payment_id:String(invoice.payment.id),paid_amount:expected,payment_date:at
   });
   if(err)throw new Error("Pagamento confirmado, mas ativação pendente: "+err.message);
   if(settled?.status==="paid")reconciled++;
  }
  const {data:updated,error:updatedError}=await client.rpc("xrmovi_checkout_reconcile_lookup",{cid});
  if(updatedError)throw new Error("Não foi possível conferir o vencimento atualizado.");
  const newUntil=Date.parse(String(updated?.paid_through||""));
  const paidNow=updated?.status==="active"&&Number.isFinite(newUntil)&&newUntil>Date.now();
  if(paidNow)return json({status:"active",message:reconciled?"Pagamento confirmado e vencimento atualizado.":"Assinatura ativa, com vencimento conferido.",paid_through:updated.paid_through,renewals_confirmed:reconciled},200,origin);
  return json({status:"pending",message:"Nenhuma nova fatura aprovada foi localizada. O acesso só será renovado após a confirmação do pagamento.",paid_through:updated?.paid_through||null},200,origin);
 }catch(error){return json({error:error instanceof Error?error.message:"Falha na verificação de pagamento"},502,origin);}
});