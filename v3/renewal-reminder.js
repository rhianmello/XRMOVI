// XRMOVI: presentation-only subscription reminders. The server is authoritative for billing.
const partsDate=(value)=>{
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return null;
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const by=Object.fromEntries(parts.filter(p=>p.type!=="literal").map(p=>[p.type,Number(p.value)]));
 return {key:Date.UTC(by.year,by.month-1,by.day),text:new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric"}).format(d)};
};
export function renewalNotice(info,now=new Date()){
 if(!info?.paid_through||!["active","canceled","past_due"].includes(String(info.status||"")))return null;
 const due=partsDate(info.paid_through),today=partsDate(now);
 if(!due||!today)return null;
 const days=Math.round((due.key-today.key)/86400000);
 if(days>7)return null;
 const pix=info.provider==="mercadopago_pix";
 const card=info.provider==="mercadopago";
 if(!pix&&!card)return null;
 const owner=info.owner!==false;
 const date=due.text;
 let title="",detail="",tone="warning";
 if(info.status==="canceled"){
  title=days<0?"Assinatura cancelada":"Assinatura cancelada · acesso termina em "+(days===0?"hoje":days+" dia(s)");
  detail="A renovação automática está cancelada. Abra Minha assinatura para consultar as opções disponíveis.";
  return {days,date,title,detail,tone:days<=0?"critical":"warning",pix,card,owner,action:"Abrir Minha assinatura"};
 }
 if(info.status==="past_due"&&days>=0){
  title="Pagamento pendente de confirmação";
  detail="Confira o pagamento antes do vencimento para manter o acesso.";
  return {days,date,title,detail,tone:days===0?"critical":"warning",pix,card,owner,action:"Abrir Minha assinatura"};
 }
 if(days<0){
  tone="critical";
  title="Assinatura vencida";
  detail=owner?"Seu prazo terminou em "+date+". Confira seu pagamento em Minha assinatura.":"Avise o titular para regularizar a assinatura vencida em "+date+".";
 }else if(days===0){
  tone="critical";
  title="A assinatura vence hoje";
  detail=pix?"Renove por Pix em Minha assinatura para evitar interrupção do acesso.":card?"A renovação automática do cartão está prevista. Confira o resultado do pagamento.":"";
 }else{
  title=days===1?"Falta 1 dia para o vencimento":"Faltam "+days+" dias para o vencimento";
  detail=pix?"Pix mensal: a renovação é manual. Gere um novo Pix em Minha assinatura.":"Cartão: a renovação é automática. Confira se o meio de pagamento está válido; não faça um Pix adicional.";
 }
 if(!owner&&days>=0)detail+=" Se necessário, peça ao titular da assinatura para verificar.";
 return {days,date,title,detail,tone,pix,card,owner,action:"Abrir Minha assinatura"};
}
