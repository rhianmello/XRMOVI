// Cancels automatic Mercado Pago renewals for a verified owner or XRMOVI platform administrator.
// Does NOT refund, create invoices, or cancel other tenants. The paid period remains accessible.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const allowedOrigins=new Set(["https://frota.nospassa.com.br","https://www.frota.nospassa.com.br"]);
const respond=(value:unknown,status=200,origin:string|null=null)=>{
 const headers:Record<string,string>={
  "content-type":"application/json; charset=utf-8","cache-control":"private, no-store","vary":"Origin"
 };
 if(origin&&allowedOrigins.has(origin))headers["access-control-allow-origin"]=origin;
 return new Response(JSON.stringify(value),{status,headers});
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(origin&&!allowedOrigins.has(origin))return respond({error:"Origem não autorizada."},403,origin);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
  "access-control-allow-origin":origin||"https://frota.nospassa.com.br",
  "access-control-allow-headers":"authorization,apikey,content-type,x-client-info",
  "access-control-allow-methods":"POST,OPTIONS","vary":"Origin"
 }});
 if(req.method!=="POST")return respond({error:"Método não permitido."},405,origin);
 const jwt=req.headers.get("authorization")||"";
 const url=Deno.env.get("SUPABASE_URL")||"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const mpToken=Deno.env.get("XRMOVI_MP_ACCESS_TOKEN")||"";
 if(!jwt.startsWith("Bearer ")||!url||!anon)return respond({error:"Entre na conta novamente."},401,origin);
 if(!serviceKey||!mpToken.startsWith("APP_USR-"))
  return respond({error:"Serviço de cancelamento indisponível. Nenhuma alteração foi realizada."},503,origin);
 try{
  const userClient=createClient(url,anon,{global:{headers:{Authorization:jwt}},auth:{persistSession:false}});
  const {data:auth,error:authError}=await userClient.auth.getUser(jwt.slice(7));
  if(authError||!auth?.user?.id)return respond({error:"Sessão expirada. Entre novamente."},401,origin);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object")return respond({error:"Informe a assinatura que deseja cancelar."},400,origin);
  const accountId=typeof body.account_id==="string"?body.account_id:"";
  const companyId=typeof body.company_id==="string"?body.company_id:"";
  if(Boolean(accountId)===Boolean(companyId)||accountId&&!uuid.test(accountId)||companyId&&!uuid.test(companyId))
   return respond({error:"Referência da assinatura inválida."},400,origin);
  const adminRequested=Boolean(accountId);
  const reason=adminRequested?String(body.reason||"").trim():"Cancelamento solicitado pelo titular da assinatura";
  if(reason.length<10||reason.length>500)
   return respond({error:"Informe um motivo entre 10 e 500 caracteres."},400,origin);
  const backend=createClient(url,serviceKey,{auth:{persistSession:false}});
  const {data:target,error:lookupError}=await backend.rpc("xrmovi_billing_cancel_target",{
   p_actor:auth.user.id,p_account:accountId||null,p_company:companyId||null
  });
  if(lookupError||!target?.preapproval_id||!target?.reference_id)
   return respond({error:"Conta não autorizada ou sem assinatura recorrente ativa por cartão."},403,origin);
  const preapproval=String(target.preapproval_id);
  if(preapproval.length>128||preapproval.length<8)return respond({error:"Referência do provedor inválida."},409,origin);
  const headers={"authorization":"Bearer "+mpToken,"accept":"application/json"};
  const get=async()=>{
   const res=await fetch("https://api.mercadopago.com/preapproval/"+encodeURIComponent(preapproval),{
    method:"GET",headers,signal:AbortSignal.timeout(13000)
   });
   if(!res.ok)throw Error("Consulta ao Mercado Pago falhou (HTTP "+res.status+"). Nenhum cancelamento confirmado.");
   return res.json();
  };
  const check=(item:any)=>{
   const amount=Number(target.amount_brl);
   return String(item?.id)===preapproval &&
    String(item?.external_reference)===String(target.reference_id) &&
    Number(item?.collector_id)===10284642 &&
    item?.auto_recurring?.currency_id==="BRL" &&
    Number.isFinite(amount)&&amount>0 &&
    Math.abs(Number(item?.auto_recurring?.transaction_amount)-amount)<0.01;
  };
  let provider=await get();
  if(!check(provider))return respond({error:"Assinatura divergente no Mercado Pago. Cancelamento interrompido para proteger outros clientes."},409,origin);
  const state=String(provider?.status||"");
  if(!["authorized","paused","pending","canceled"].includes(state))
   return respond({error:"O Mercado Pago não permite cancelar esta assinatura no estado atual."},409,origin);
  if(state!=="canceled"){
   const update=await fetch("https://api.mercadopago.com/preapproval/"+encodeURIComponent(preapproval),{
    method:"PUT",headers:{...headers,"content-type":"application/json"},
    body:JSON.stringify({status:"canceled"}),signal:AbortSignal.timeout(15000)
   });
   if(!update.ok){
    // The provider may commit cancellation then return a transient error; read back before reporting failure.
    provider=await get();
    if(!check(provider)||provider?.status!=="canceled")
     return respond({error:"Mercado Pago não confirmou o cancelamento (HTTP "+update.status+"). Nenhuma alteração local foi feita."},502,origin);
   }
  }
  provider=await get();
  if(!check(provider)||provider.status!=="canceled")
   return respond({error:"Não foi possível confirmar a interrupção das cobranças no Mercado Pago. Verifique novamente."},502,origin);
  const {data:result,error:recordError}=await backend.rpc("xrmovi_billing_cancel_record",{
   p_actor:auth.user.id,p_account:target.account_id,p_preapproval:preapproval,
   p_channel:adminRequested?"administrator":"customer",p_reason:reason
  });
  if(recordError||result?.status!=="canceled"){
   console.error("XRMOVI cancellation provider success, database synchronization pending",{type:"reconciliation_needed"});
   return respond({error:"O Mercado Pago cancelou a renovação, mas o sistema não confirmou a atualização. Não tente contratar novamente; procure o suporte para sincronizar o cadastro."},503,origin);
  }
  return respond({
   status:"canceled",provider_confirmed:true,paid_through:result.paid_through,
   retains_access:result.retains_access,
   message:"Renovação automática cancelada no Mercado Pago. Nenhuma cobrança futura será iniciada por esta assinatura."
  },200,origin);
 }catch(err){
  const reason=err instanceof Error?err.message:"Erro desconhecido";
  console.warn("XRMOVI subscription cancellation failed",{category:"provider_or_database"});
  return respond({error:reason.startsWith("Consulta ao Mercado Pago")?reason:"Não foi possível confirmar o cancelamento. Confira o estado antes de tentar novamente."},502,origin);
 }
});