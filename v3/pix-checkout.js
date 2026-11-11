// XRMOVI Pix: one-off monthly charge, never a recurring debit authorization.
// Never consider a QR generation equivalent to an approved payment.
const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function openPixCheckout({client,companyId,onPaid=()=>{}}){
 if(document.querySelector('#xrm-pix-dialog'))return;
 const backdrop=document.createElement('div');
 backdrop.id='xrm-pix-dialog';
 backdrop.setAttribute('role','dialog');
 backdrop.setAttribute('aria-modal','true');
 backdrop.setAttribute('aria-label','Pagamento mensal via Pix');
 backdrop.style.cssText='position:fixed;inset:0;z-index:100050;background:rgba(1,10,19,.87);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
 const card=document.createElement('section');
 card.style.cssText='position:relative;width:min(460px,100%);max-height:calc(100vh - 32px);overflow:auto;color:#eaf6ff;background:linear-gradient(150deg,#09263a,#0c1526);border:1px solid #366f7c;border-radius:20px;padding:24px;box-shadow:0 24px 65px #0009;font:14px system-ui';
 card.innerHTML='<button type="button" data-close aria-label="Fechar" style="position:absolute;right:14px;top:12px;background:transparent;color:#fff;border:0;font-size:25px;cursor:pointer">×</button>'+
 '<h2 style="font-size:23px;margin:0 30px 4px 0">Pagamento por Pix</h2>'+
 '<p style="color:#a9cbd7;margin:4px 0 18px">Mensalidade do XRMOVI. Renovação manual, sem débito automático.</p>'+
 '<form data-form style="display:grid;gap:12px">'+
 '<label style="display:grid;gap:5px">Nome completo do pagador<input data-name autocomplete="name" required minlength="5" maxlength="120" placeholder="Nome e sobrenome" style="padding:12px;border-radius:8px;border:1px solid #507581;background:#102f43;color:white"></label>'+
 '<label style="display:grid;gap:5px">CPF do pagador<input data-cpf inputmode="numeric" autocomplete="off" required maxlength="14" placeholder="000.000.000-00" style="padding:12px;border-radius:8px;border:1px solid #507581;background:#102f43;color:white"></label>'+
 '<button type="submit" data-generate style="padding:14px;border-radius:9px;border:0;background:#35ceb0;color:#05232c;font-weight:750;cursor:pointer">Gerar Pix seguro</button>'+
 '<small style="color:#b7d6e2">O CPF será utilizado somente pelo provedor para emitir a cobrança. Não é salvo no cadastro do XRMOVI.</small></form>'+
 '<section data-qr hidden style="display:grid;justify-items:center;gap:12px;text-align:center">'+
 '<strong data-price style="font-size:24px"></strong>'+
 '<img data-image alt="QR Code Pix para pagamento da mensalidade" style="max-width:210px;width:85%;border-radius:10px;background:white;padding:8px" hidden>'+
 '<label style="width:100%;text-align:left">Pix Copia e Cola<textarea data-code readonly rows="3" style="width:100%;box-sizing:border-box;margin-top:5px;border-radius:8px;padding:10px;background:#102f43;color:#eaf6ff;border:1px solid #507581"></textarea></label>'+
 '<button type="button" data-copy style="width:100%;padding:12px;border-radius:8px;border:0;background:#35ceb0;color:#05232c;font-weight:700">Copiar código Pix</button>'+
 '<a data-ticket target="_blank" rel="noopener noreferrer" hidden style="color:#6fead0">Ver Pix no Mercado Pago</a>'+
 '<small data-expiry style="color:#b7d6e2"></small>'+
 '<button type="button" data-verify style="padding:10px 16px;border-radius:8px;border:1px solid #5c8f9b;background:#173e53;color:#fff">Verificar pagamento</button>'+
 '</section><p data-state aria-live="polite" style="margin:14px 0 0;color:#c3e5ee;min-height:20px"></p>'+
 '<section data-card-block hidden style="margin-top:12px;padding:12px;border:1px solid #6a7b83;border-radius:10px;background:#102c3d"><strong style="display:block;margin-bottom:7px">Como liberar o pagamento por Pix</strong><p style="margin:0 0 8px;color:#bbd1dc">Na conta recebedora do Mercado Pago, abra Ferramentas para vender → Assinaturas → Assinantes. Localize a tentativa antiga do XRMOVI e confira a opção de cancelamento. Não cancele outras assinaturas.</p><a target="_blank" rel="noopener noreferrer" href="https://www.mercadopago.com.br/developers/pt/docs/subscription-plans/manage-subscription-plan" style="color:#7ef5da">Consultar instruções oficiais do Mercado Pago</a></section><a data-support hidden href="/cliente/" style="display:inline-block;color:#7ef5da;margin-top:10px;font-weight:700">Falar com o suporte sobre a tentativa anterior por cartão</a>';
 const visibility=document.createElement('style');
 visibility.textContent='#xrm-pix-dialog [hidden]{display:none!important}';
 backdrop.append(visibility,card);document.body.append(backdrop);
 const $=s=>card.querySelector(s);
 let closed=false, busy=false, timer=null;
 function close(){closed=true;if(timer)clearInterval(timer);backdrop.remove();}
 $('[data-close]').onclick=close;
 backdrop.addEventListener('click',e=>{if(e.target===backdrop)close()});
 const state=(msg,error=false)=>{if(!closed){$('[data-state]').textContent=msg;$('[data-state]').style.color=error?'#ffacb1':'#bcefe0'}};
 async function invoke(action,extra={}){
  const {data,error}=await client.functions.invoke('xrmovi-pix',{body:{action,company_id:companyId,...extra}});
  if(error){let message=error.message||'Erro no Pix.',code='';
   try{const d=await error.context?.json?.();if(d?.error)message=String(d.error);if(d?.code)code=String(d.code);}catch{}
   const failure=new Error(message);failure.code=code;throw failure;
  }
  if(data?.error){const failure=new Error(String(data.error));failure.code=String(data.code||'');throw failure;}
  return data;
 }
 async function showResult(data){
  if(closed)return;
  if(data.status==='paid'){
   if(timer)clearInterval(timer);
   $('[data-form]').hidden=true;
   $('[data-qr]').hidden=true;
   state('Pagamento confirmado! A assinatura foi liberada.');
   $('[data-verify]').disabled=true;
   try{await onPaid();}catch{}
   return;
  }
  if(data.status==='failed'||data.status==='expired'){
   if(timer)clearInterval(timer);
   $('[data-qr]').hidden=true;$('[data-form]').hidden=false;
   state('O Pix anterior venceu ou foi recusado. Gere um novo código.',true);
   return;
  }
  if(data.status!=='pending')return;
  if(!data.qr_code){state('O pagamento está pendente. Consulte novamente para recuperar o código.',true);return;}
  $('[data-form]').hidden=true;
  const qr=$('[data-qr]');qr.hidden=false;
  $('[data-price]').textContent=data.amount!=null?money(data.amount):'Pagamento Pix';
  const pic=$('[data-image]');
  if(/^[a-zA-Z0-9+/=\s]+$/.test(data.qr_code_base64||'')&&data.qr_code_base64?.length>100){
   pic.src='data:image/png;base64,'+data.qr_code_base64;pic.hidden=false;
  } else pic.hidden=true;
  $('[data-code]').value=data.qr_code;
  const ticket=$('[data-ticket]');
  try{const u=new URL(data.ticket_url);if(u.protocol==='https:'&&/(^|\.)mercadopago\.com(\.br)?$/.test(u.hostname)){ticket.href=u.href;ticket.hidden=false;}}catch{}
  if(data.expires_at){const dt=new Date(data.expires_at);if(!Number.isNaN(+dt))$('[data-expiry]').textContent='Válido até '+dt.toLocaleString('pt-BR');}
  state('Aguardando pagamento. Use o Pix do seu banco; o acesso só será liberado após a confirmação.');
  if(!timer)timer=setInterval(()=>{if(!busy&&!closed)void check(true)},12000);
 }
 async function check(silent=false){
  if(busy)return;busy=true;
  if(!silent)state('Conferindo pagamento no Mercado Pago...');
  try{const data=await invoke('check');await showResult(data);if(!silent&&data.status==='no_payment')state('Preencha seus dados para gerar o Pix.');}
  catch(e){if(!silent)state(e.message,true);}
  finally{busy=false;}
 }
 $('[data-form]').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;
  busy=true;$('[data-generate]').disabled=true;
  $('[data-support]').hidden=true;
  $('[data-card-block]').hidden=true;
  state('Gerando Pix no Mercado Pago...');
  try{
   const data=await invoke('create',{payer_name:$('[data-name]').value.trim(),payer_cpf:$('[data-cpf]').value.replace(/\D/g,'')});
   await showResult(data);
  }catch(err){
   state(err.message||'Não foi possível gerar Pix.',true);
   $('[data-support]').hidden=err.code!=='CARD_CHECKOUT_PENDING';
   $('[data-card-block]').hidden=err.code!=='CARD_CHECKOUT_PENDING';
  }
  finally{busy=false;$('[data-generate]').disabled=false;}
 });
 $('[data-verify]').onclick=()=>void check(false);
 $('[data-copy]').onclick=async()=>{
  try{await navigator.clipboard.writeText($('[data-code]').value);state('Código Pix copiado.');}
  catch{const field=$('[data-code]');field.focus();field.select();state('Selecione e copie o código Pix.');}
 };
 void check(true);
 return {close};
}
