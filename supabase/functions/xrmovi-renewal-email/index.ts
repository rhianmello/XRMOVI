// XRMOVI: transactional renewals, 7 / 3 / 1 days before subscription expiration.
// Service-only worker, called from existing Supabase Vault-backed cron.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]||c));
const fmtDate=(v:string)=>new Intl.DateTimeFormat("pt-BR",{
 timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric"
}).format(new Date(v));
const fmtMoney=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);
const link="https://xrmovi.com.br/v3/#subscription";
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return respond({error:"Method not allowed"},405);
 const supplied=req.headers.get("x-xrmovi-worker-secret")||"";
 if(!/^[a-f0-9]{64}$/i.test(supplied))return respond({error:"Not authorized"},401);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!serviceKey)return respond({error:"Database unavailable"},503);
 const token=Deno.env.get("XRMOVI_RESEND_API_KEY")||"";
 const from=Deno.env.get("XRMOVI_SUPPORT_MAIL_FROM")||"";
 const ready=token.startsWith("re_")&&from.includes("@");
 try{
  const db=createClient(url,serviceKey,{auth:{persistSession:false}});
  const {data:allowed,error:authErr}=await db.rpc("xrmovi_support_worker_authorized",{p_token:supplied});
  if(authErr||allowed!==true)return respond({error:"Not authorized"},401);
  if(!ready)return respond({status:"provider_not_configured",sent:0},503);
  const {data:queue,error:claimErr}=await db.rpc("xrmovi_renewal_mail_claim",{max_messages:10});
  if(claimErr)throw claimErr;
  let sent=0,failed=0,skipped=0;
  for(const item of Array.isArray(queue)?queue:[]){
   const id=String(item.id||"");
   let ok=false,providerId="",errorText="";
   try{
    const {data:current,error:currentErr}=await db.rpc("xrmovi_renewal_mail_current",{p_id:id});
    if(currentErr)throw currentErr;
    if(current!==true){
     const {error:finishErr}=await db.rpc("xrmovi_renewal_mail_finish",{
      p_id:id,p_sent:false,p_error:"Aviso obsoleto: assinatura renovada ou expirada."
     });
     if(finishErr)throw finishErr;
     skipped++;continue;
    }
    const days=Number(item.days_before);
    if(![7,3,1].includes(days))throw Error("Unexpected reminder interval");
    const pix=item.provider==="mercadopago_pix";
    const intro=days===1?"Sua assinatura vence amanhã.":"Faltam "+days+" dias para o vencimento da sua assinatura.";
    const instructions=pix
      ?"Como você paga por Pix, a renovação é manual. Entre em Minha assinatura, escolha Pagar por Pix e conclua o pagamento."
      :"A renovação pelo cartão é automática. Confira se o cartão está válido. Não gere Pix ou faça um pagamento adicional enquanto a cobrança automática estiver em andamento.";
    const subject="[XRMOVI] "+(pix?"Renove por Pix":"Renovação automática")+" — "+(days===1?"vence amanhã":"faltam "+days+" dias");
    const company=esc(String(item.company||"Sua empresa").slice(0,120));
    const date=esc(fmtDate(String(item.paid_through)));
    const plan=esc(String(item.plan||"XRMOVI").slice(0,80));
    const amount=Number(item.amount);
    const price=Number.isFinite(amount)&&amount>0?esc(fmtMoney(amount)):"Conforme contrato";
    const html='<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;padding:26px;color:#163343">'+
      '<h2 style="color:#075e57">XRMOVI · Aviso de assinatura</h2>'+
      '<p style="font-size:16px;line-height:1.6">'+esc(intro)+'</p>'+
      '<div style="border:1px solid #b9d9d9;border-radius:12px;padding:16px;margin:20px 0;background:#f2f8f8">'+
      '<p><strong>Empresa:</strong> '+company+'</p>'+
      '<p><strong>Plano:</strong> '+plan+'</p>'+
      '<p><strong>Mensalidade:</strong> '+price+'</p>'+
      '<p><strong>Vencimento:</strong> '+date+'</p>'+
      '<p><strong>Pagamento:</strong> '+(pix?'Pix mensal (manual)':'Cartão (automático)')+'</p></div>'+
      '<p style="line-height:1.7">'+esc(instructions)+'</p>'+
      '<p><a href="'+link+'" style="display:inline-block;border-radius:10px;padding:12px 19px;background:#107d6e;color:#fff;text-decoration:none;font-weight:700">Abrir Minha assinatura</a></p>'+
      '<p style="font-size:12px;color:#687f8a;margin-top:26px">Aviso de serviço. Não envie comprovantes ou dados de cartão por e-mail. Apenas o sistema confirma pagamentos.</p></div>';
    const response=await fetch("https://api.resend.com/emails",{
     method:"POST",
     headers:{Authorization:"Bearer "+token,"Content-Type":"application/json","Idempotency-Key":id},
     body:JSON.stringify({from,to:[String(item.email)],subject,html}),
     signal:AbortSignal.timeout(12000)
    });
    const payload=await response.json().catch(()=>({}));
    ok=response.ok&&typeof payload?.id==="string";
    providerId=ok?String(payload.id):"";
    if(!ok)errorText="Email provider HTTP "+response.status;
   }catch(e){errorText=e instanceof Error?e.message:"Email delivery error";}
   const {error:finishErr}=await db.rpc("xrmovi_renewal_mail_finish",{
    p_id:id,p_sent:ok,p_provider_id:providerId,p_error:errorText
   });
   if(finishErr)throw finishErr;
   if(ok)sent++;else failed++;
  }
  return respond({status:"processed",sent,failed,skipped});
 }catch{
  return respond({status:"retry",error:"Unable to process renewal mail queue"},503);
 }
});