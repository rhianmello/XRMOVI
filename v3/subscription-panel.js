import {openPixCheckout} from './pix-checkout.js?v=20261105-confirmed-pix-1';
import {createPaymentEmailNotice} from './payment-email-notice.js?v=20261105-plain-text-2';
import {renewalNotice} from './renewal-reminder.js?v=20261103-reminders-2';
// XRMOVI | Central de assinatura — todas as gravações passam por RPCs autenticadas.
// Nunca decide cotas pelo navegador: o banco aplica regras nas inserções.
export function setupSubscriptionPanel({client,getCompany,onCompanyCreated,onDataChanged}){
 const root=document.getElementById('xrm-subscription-content');
 const nav=document.getElementById('xrm-subscriptions-nav');
 if(!root)return {refresh:async()=>{}};
 let current=null,loading=false,request=0;
 let availablePlans=[];
 const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const formatDate=v=>v?new Date(v).toLocaleDateString('pt-BR'):'—';
 const text=(id,value)=>{const target=root.querySelector('#'+id);if(target)target.textContent=String(value);};
 const css=document.createElement('style');
 css.textContent=`
 .xrm-billing{display:grid;gap:18px;color:#dcedf5}.xrm-billing h2{margin:5px 0;font-size:clamp(25px,3vw,34px)}.xrm-billing p{color:#aac8da;margin:5px 0}
 .xrm-billing .xrm-billing-lead{max-width:760px;font-size:13px;line-height:1.7}
 .xrm-billing .xrm-plan-hero{padding:24px;border:1px solid #356e75;border-radius:18px;background:linear-gradient(115deg,#123b50,#102940)}
 .xrm-billing .xrm-plan-hero-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
 .xrm-billing .xrm-plan-pill{font-size:11px;letter-spacing:.2px;color:#60e5bf;border:1px solid #367e79;border-radius:99px;padding:6px 12px}
 .xrm-billing .xrm-plan-hero strong{font-size:26px;color:#f2fbff}
 .xrm-billing .xrm-plan-details{font-size:12px;color:#b8d2df;margin-top:12px}
 .xrm-billing .xrm-quotas{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}
 .xrm-billing .xrm-plan-selection{grid-column:1/-1}
 .xrm-billing .xrm-plan-compare-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(270px,.85fr);gap:16px;align-items:start}
 .xrm-billing .xrm-plan-preview{background:linear-gradient(150deg,#123d49,#122f40);border:1px solid #397e79;border-radius:13px;padding:18px;display:grid;gap:14px}
 .xrm-billing .xrm-plan-preview .preview-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
 .xrm-billing .xrm-plan-preview .preview-head strong{font-size:20px;color:#74e9c7}
 .xrm-billing .xrm-plan-preview .preview-head b{color:#f0fbff;font-size:23px}
 .xrm-billing .xrm-plan-preview .preview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
 .xrm-billing .xrm-plan-preview .preview-item{border:1px solid #346772;background:#0c2939;border-radius:10px;padding:12px}
 .xrm-billing .xrm-plan-preview .preview-item strong{display:block;font-size:26px;line-height:1.25;color:white}
 .xrm-billing .xrm-plan-preview .preview-item span{color:#add1db;font-size:11px}
 .xrm-billing .xrm-plan-preview .preview-note{font-size:11px;color:#b1cbd4;line-height:1.55;margin:0}
 @media(max-width:790px){.xrm-billing .xrm-plan-compare-layout{grid-template-columns:1fr}}

 .xrm-billing .xrm-quota{padding:16px;background:#102c41;border:1px solid #32516b;border-radius:13px;display:grid;gap:8px}
 .xrm-billing .xrm-quota small{font-size:11px;color:#b5cfe0}
 .xrm-billing .xrm-quota b{font-size:25px;color:#f7fdff}
 .xrm-billing .xrm-quota b em{font-size:13px;font-style:normal;color:#91afbf}
 .xrm-billing .xrm-bar{height:8px;overflow:hidden;background:#1b4557;border-radius:10px}
 .xrm-billing .xrm-bar span{display:block;background:#55ddb4;height:100%;max-width:100%;border-radius:10px}
 .xrm-billing .xrm-bar.critical span{background:#f7bb71}
 .xrm-billing .xrm-group{background:#0b273b;border:1px solid #32546a;border-radius:16px;padding:20px}
 .xrm-billing .xrm-group h3{margin:0 0 13px;font-size:17px;color:#f0fbff}
 .xrm-billing .xrm-company-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
 .xrm-billing .xrm-company-card{background:#13364b;border:1px solid #365a6d;padding:14px;border-radius:11px}
 .xrm-billing .xrm-company-card b{display:block;margin-bottom:9px;font-size:13px}
 .xrm-billing .xrm-company-card small{color:#aac8d8;font-size:11px;line-height:1.6}
 .xrm-billing .xrm-actions-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
 .xrm-billing form{display:grid;gap:11px;align-content:start}
 .xrm-billing label{display:grid;gap:6px;font-size:12px;font-weight:650;color:#cce4ee}
 .xrm-billing input,.xrm-billing select{width:100%;background:#0b2032;border:1px solid #45677d;border-radius:9px;color:white;padding:11px;font:13px system-ui;min-width:0}
 .xrm-billing button{cursor:pointer;border-radius:9px;border:1px solid #3d7885;padding:11px 14px;font-weight:700;background:#55ddae;color:#092633}
 .xrm-billing button.secondary{color:#daebf1;background:#174257}
 .xrm-billing button:disabled{opacity:.55;cursor:not-allowed}
 .xrm-billing .xrm-feedback{font-size:12px;line-height:1.6;min-height:18px;color:#8ddfc7}
 .xrm-billing .xrm-info{font-size:12px;line-height:1.65;color:#a9c7d7}
 .xrm-billing .xrm-error{color:#ffb7b7}
 .xrm-billing .xrm-billing-foot{font-size:12px;color:#aac7d7}
  .xrm-billing .xrm-cancel-section{border:1px solid #3c5c6c;border-radius:13px;padding:17px;background:#102d3c;display:grid;gap:9px}
  .xrm-billing .xrm-cancel-section h3{font-size:15px;color:#e6f4f7;margin:0}
  .xrm-billing .xrm-cancel-section p{font-size:12px;color:#abcbd8;line-height:1.6;margin:0}
  .xrm-billing .xrm-cancel-section button{width:max-content;max-width:100%;background:transparent;color:#ffcbcb;border:1px solid #ae6972}
  .xrm-billing .xrm-cancel-section button:disabled{opacity:.5}
  .xrm-billing .xrm-cancel-section[hidden]{display:none!important}
 @media(max-width:920px){.xrm-billing .xrm-quotas{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:670px){.xrm-billing .xrm-actions-grid,.xrm-billing .xrm-quotas{grid-template-columns:1fr}}
 `;
 document.head.append(css);
 root.innerHTML=`
 <div class="xrm-billing">
  <header><p class="eyebrow">GESTÃO COMERCIAL</p><h2 tabindex="-1">Minha assinatura</h2><p class="xrm-billing-lead">Controle a capacidade contratada, distribua suas empresas e acompanhe os pedidos de alteração de plano.</p></header>
  <div id="xrm-bill-feedback" class="xrm-feedback" role="status" aria-live="polite">Consultando sua assinatura...</div>
  <section class="xrm-plan-hero"><div class="xrm-plan-hero-head"><div><span class="xrm-plan-pill" id="xrm-bill-status">Consultando</span><div><strong id="xrm-bill-plan">—</strong></div></div><b id="xrm-bill-price">—</b></div><div id="xrm-bill-details" class="xrm-plan-details"></div></section>
  <section id="xrm-bill-renewal" aria-live="polite" hidden><strong id="xrm-bill-renewal-title"></strong><p id="xrm-bill-renewal-detail"></p></section>
  <div id="xrm-bill-quotas" class="xrm-quotas" aria-label="Capacidade do plano"></div>
  <section class="xrm-group"><h3>Empresas vinculadas à assinatura</h3><div class="xrm-company-cards" id="xrm-bill-companies"></div><p class="xrm-info">Veículos e contratos são compartilhados no total da assinatura, mesmo quando há várias empresas.</p></section>
  <div class="xrm-actions-grid">
   <section class="xrm-group"><h3>Adicionar empresa</h3><form id="xrm-bill-company-form"><label>Nome da nova empresa<input name="company" required minlength="2" maxlength="160" placeholder="Ex.: Empresa de Transportes"></label><button type="submit">Cadastrar empresa</button></form><div class="xrm-feedback" id="xrm-bill-company-feedback" role="status"></div></section>
   <section class="xrm-group"><h3>Criar contrato</h3><form id="xrm-bill-contract-form"><label>Empresa<select name="company" required id="xrm-bill-contract-company"></select></label><label>Contrato<input name="name" required minlength="2" maxlength="160" placeholder="Ex.: Contrato Obra 02"></label><label>Cliente (opcional)<input name="client" maxlength="160"></label><label>Código (opcional)<input name="code" maxlength="60"></label><button type="submit" class="secondary">Adicionar contrato</button></form><div class="xrm-feedback" id="xrm-bill-contract-feedback" role="status"></div></section>
   <section class="xrm-group"><h3>Adicionar usuário</h3><form id="xrm-bill-member-form"><label>Empresa<select name="company" required id="xrm-bill-member-company"></select></label><label>E-mail cadastrado e confirmado<input type="email" name="email" required autocomplete="off" placeholder="usuario@empresa.com.br"></label><label>Permissão<select name="role"><option value="manager">Gestor</option><option value="driver">Motorista</option></select></label><button type="submit" class="secondary">Vincular usuário</button></form><div class="xrm-feedback" id="xrm-bill-member-feedback" role="status"></div><p class="xrm-info">O usuário precisa ter conta confirmada no XRMOVI. O número de usuários é independente do número de empresas.</p></section>
   <section class="xrm-group xrm-plan-selection"><h3>Escolher / alterar plano</h3><div class="xrm-plan-compare-layout"><form id="xrm-bill-plan-form"><label>Plano desejado<select name="plan" required><option value="start">Start — R$ 19,90</option><option value="pro">Pro — R$ 39,90</option><option value="business">Business — R$ 64,90</option><option value="advanced">Advanced — R$ 99,90</option></select></label><button type="submit" id="xrm-plan-change-request">Solicitar mudança de plano</button><button type="button" class="secondary" id="xrm-bill-checkout">Pagar com Mercado Pago</button></form><aside class="xrm-plan-preview" aria-label="Capacidade do plano escolhido" aria-live="polite"><div class="preview-head"><strong id="xrm-plan-preview-title">Carregando plano…</strong><b id="xrm-plan-preview-price">—</b></div><div class="preview-grid" id="xrm-plan-preview-limits"></div><p class="preview-note">As empresas compartilham as cotas totais de veículos e contratos. Os limites não são multiplicados pelo número de empresas.</p></aside></div><div class="xrm-feedback" id="xrm-bill-plan-feedback" role="status"></div><p class="xrm-info">O acesso pago é liberado após a confirmação do pagamento pelo Mercado Pago. Solicitar uma alteração de plano não cobra automaticamente. Para Enterprise, entre em contato.</p></section>
  </div>
  <section id="xrm-bill-cancel-section" class="xrm-cancel-section" hidden>
    <h3>Renovação da assinatura</h3>
    <p id="xrm-bill-cancel-summary"></p>
    <button type="button" id="xrm-bill-cancel-button">Cancelar renovação automática</button>
    <p>Cancelar interrompe cobranças futuras do cartão no Mercado Pago. Não gera estorno. O período já pago continua disponível até o vencimento.</p>
    <div id="xrm-bill-cancel-feedback" class="xrm-feedback" role="status" aria-live="polite"></div>
   </section>
   <p class="xrm-billing-foot">Apenas o titular da assinatura pode gerenciar empresas, usuários e planos. Todas as alterações são validadas pelo servidor.</p>
 </div>`;
 const planSelectForPreview=root.querySelector('#xrm-bill-plan-form select');
 function showSelectedPlan(){
  const chosen=availablePlans.find(p=>p.code===planSelectForPreview.value);
  text('xrm-plan-preview-title',chosen?.title||'Plano selecionado');
  text('xrm-plan-preview-price',chosen?.monthly_brl==null?'—':money(chosen.monthly_brl)+'/mês');
  const host=root.querySelector('#xrm-plan-preview-limits');
  host.replaceChildren();
  for(const [label,limit] of [['Empresas',chosen?.company_limit],['Contratos',chosen?.contract_limit],['Veículos',chosen?.vehicle_limit],['Logins',chosen?.seat_limit]]){
   const cell=document.createElement('div');cell.className='preview-item';
   const big=document.createElement('strong');big.textContent=limit==null?'—':String(limit);
   const small=document.createElement('span');small.textContent=label;
   cell.append(big,small);host.append(cell);
  }
 }
 planSelectForPreview.onchange=showSelectedPlan;
 async function loadPlansForPreview(){
  try{
   const {data,error}=await client.rpc('xrmovi_list_plans');
   if(error)throw error;
   const opts=Array.isArray(data)?data.filter(p=>['start','pro','business','advanced'].includes(p.code)):[];
   if(!opts.length)throw Error('Não há planos disponíveis.');
   availablePlans=opts;
   const selected=planSelectForPreview.value;
   planSelectForPreview.replaceChildren();
   for(const p of opts){
    const option=document.createElement('option');option.value=p.code;option.textContent=p.title+' — '+money(p.monthly_brl);
    planSelectForPreview.append(option);
   }
   if(opts.some(p=>p.code===selected))planSelectForPreview.value=selected;
   showSelectedPlan();
  }catch(error){
   text('xrm-plan-preview-title','Confira a conexão para visualizar os limites');
  }
 }
 void loadPlansForPreview();
 const feedback=(id,message,error=false)=>{const node=root.querySelector('#'+id);if(node){node.textContent=message;node.classList.toggle('xrm-error',error)}};
  const cancelSection=root.querySelector('#xrm-bill-cancel-section');
  const cancelButton=root.querySelector('#xrm-bill-cancel-button');
  cancelButton.addEventListener('click',async()=>{
   const info=current,base=getCompany();
   if(!base||!info||info.status!=='active'||info.provider!=='mercadopago'||!info.owner)return;
   const accessDate=info.paid_through?formatDate(info.paid_through):'a data registrada na sua assinatura';
   if(!window.confirm('Cancelar a RENOVAÇÃO AUTOMÁTICA do plano '+info.plan+'?\n\nO Mercado Pago deixará de cobrar mensalidades futuras. O pagamento já realizado não será estornado e o acesso continuará até '+accessDate+'.\n\nDeseja confirmar?'))return;
   cancelButton.disabled=true;
   feedback('xrm-bill-cancel-feedback','Consultando e cancelando a renovação no Mercado Pago...');
   try{
    const {data,error}=await client.functions.invoke('xrmovi-cancel-subscription',{body:{company_id:base.id}});
    if(error){
     let explanation=error.message||'Não foi possível cancelar a renovação.';
     try{const detail=await error.context?.json?.();if(detail?.error)explanation=String(detail.error)}catch{}
     throw new Error(explanation);
    }
    if(data?.status!=='canceled'||data.provider_confirmed!==true)throw new Error('O provedor não confirmou o cancelamento.');
    await refresh();await onDataChanged?.();
    feedback('xrm-bill-cancel-feedback','Renovação cancelada no Mercado Pago. Nenhuma nova mensalidade será cobrada nesta assinatura.');
   }catch(err){feedback('xrm-bill-cancel-feedback',err?.message||'Não foi possível concluir o cancelamento.',true)}
   finally{cancelButton.disabled=false;}
  });
 const run=async(form,action,callback)=>{
  const button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{await action(new FormData(form));await refresh();if(callback)await callback()}catch(err){feedback(form.id.replace('-form','-feedback'),err?.message||'Não foi possível concluir a operação.',true)}
  finally{button.disabled=false}
 };
 root.querySelector('#xrm-bill-company-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;await run(form,async data=>{
   const base=getCompany();if(!base)throw Error('Selecione uma empresa.');
   const {data:id,error}=await client.rpc('xrmovi_account_add_company',{cid:base.id,company_name:String(data.get('company')||'').trim()});
   if(error)throw error;
   feedback('xrm-bill-company-feedback','Empresa criada dentro da assinatura.');
   form.reset();await onCompanyCreated?.(id);
  });
 });
 root.querySelector('#xrm-bill-contract-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;
  await run(form,async data=>{
   const {error}=await client.rpc('xrmovi_contract_create',{cid:String(data.get('company')),contract_name:String(data.get('name')),client:String(data.get('client')||''),code:String(data.get('code')||'')});
   if(error)throw error;feedback('xrm-bill-contract-feedback','Contrato criado. Agora vincule seus veículos.');
   form.elements.name.value='';form.elements.client.value='';form.elements.code.value='';
   await onDataChanged?.();
  });
 });
 root.querySelector('#xrm-bill-member-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;
  await run(form,async data=>{
   const {error}=await client.rpc('xrmovi_account_add_member',{cid:String(data.get('company')),member_email:String(data.get('email')||''),member_role:String(data.get('role'))});
   if(error)throw error;feedback('xrm-bill-member-feedback','Usuário vinculado com sucesso.');form.elements.email.value='';
  });
 });
 root.querySelector('#xrm-bill-plan-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;
  await run(form,async data=>{
   const base=getCompany();if(!base)throw Error('Selecione uma empresa.');
   const {error}=await client.rpc('xrmovi_account_request_plan',{cid:base.id,chosen_plan:String(data.get('plan'))});
   if(error)throw error;feedback('xrm-bill-plan-feedback','Solicitação registrada. Ainda não houve cobrança e o plano não foi alterado.');
  });
 });
 const checkoutButton=root.querySelector('#xrm-bill-checkout');
 let billingReady=false;
 const billingNotice=document.createElement('p');
 billingNotice.className='xrm-info';
 billingNotice.id='xrm-billing-readiness-message';
 checkoutButton.insertAdjacentElement('afterend',billingNotice);
 const payerNoticeSlot=document.createElement('div');
 payerNoticeSlot.id='xrm-bill-payer-email';
 billingNotice.insertAdjacentElement('afterend',payerNoticeSlot);
 void createPaymentEmailNotice(client).then(note=>payerNoticeSlot.replaceChildren(note))
  .catch(()=>{payerNoticeSlot.textContent='Confira o e-mail do login XRMOVI ao pagar no Mercado Pago.';});

 const pixButton=document.createElement('button');
 pixButton.type='button';pixButton.id='xrm-bill-pix';pixButton.className='secondary';
 pixButton.textContent='Pagar por Pix · mensal';
 pixButton.title='Pix Copia e Cola ou QR Code bancário. Renovação mensal manual.';
 checkoutButton.insertAdjacentElement('afterend',pixButton);
 pixButton.addEventListener('click',()=>{
  if(!billingReady)return;
  const current=getCompany();
  if(!current){feedback('xrm-bill-plan-feedback','Selecione a empresa.',true);return;}
  openPixCheckout({client,companyId:current.id,onPaid:async()=>{
   await refresh();await onDataChanged?.();
   feedback('xrm-bill-plan-feedback','Pix confirmado. Sua assinatura foi liberada.');
  }});
 });

 const retryButton=document.createElement('button');
 retryButton.type='button';retryButton.id='xrm-bill-retry-readiness';
 retryButton.className='secondary';retryButton.textContent='Verificar disponibilidade do pagamento';
 retryButton.hidden=true;retryButton.style.marginTop='8px';
 billingNotice.insertAdjacentElement('afterend',retryButton);
 retryButton.addEventListener('click',()=>void checkBillingReadiness());

 const checkoutState=(ready,message)=>{
  billingReady=Boolean(ready);
  const allowCheckout=billingReady&&current?.status!=='active'&&current?.status!=='canceled';
  checkoutButton.disabled=!allowCheckout;
  pixButton.disabled=!allowCheckout;
  checkoutButton.title=billingReady?'Abrir checkout seguro do Mercado Pago':'Cobrança ainda não habilitada';
  checkoutButton.textContent=current?.status==='canceled'?'Renovação cancelada':current?.status==='active'?'Assinatura ativa':billingReady?'Assinar e pagar com Mercado Pago':'Pagamento aguardando configuração';
  billingNotice.textContent=message;
  retryButton.hidden=billingReady;
 };
 checkoutState(false,'Consultando a disponibilidade do Mercado Pago...');
 async function checkBillingReadiness(){
  try{
   checkoutState(false,'Verificando o Mercado Pago...');
   const {data,error}=await client.functions.invoke('xrmovi-billing-readiness',{method:'GET'});
   if(error)throw error;
   const notReady=data?.reason==='pilot_only'
    ?'O Mercado Pago está em homologação. Esta conta ainda não está autorizada para contratar. Nenhuma cobrança foi criada.'
    :'O checkout por cartão e Pix está temporariamente indisponível. Nenhuma cobrança foi criada. Aguarde a liberação segura do Mercado Pago.';
   checkoutState(data?.enabled===true,
    data?.enabled===true?(data.mode==='pilot'?'Homologação autorizada para esta conta. Cartão: cobrança recorrente mensal. Pix: renovação manual. Confirme o valor antes de pagar; o plano depende de pagamento aprovado.':'Pagamento disponível por cartão recorrente ou Pix com renovação mensal manual. O plano depende de confirmação efetiva do Mercado Pago.'):notReady);
   if(data?.enabled===true){
    const base=getCompany();
    if(base){
     try{
      const {data:attempt,error:lookupError}=await client.rpc('xrmovi_checkout_reconcile_lookup',{cid:base.id});
      if(!lookupError&&attempt?.intent_id&&['created','pending'].includes(attempt.intent_status)){
       const original=String(attempt.requested_plan||'');
       const choices=root.querySelector('#xrm-bill-plan-form select');
       if([...choices.options].some(option=>option.value===original)){
        choices.value=original;showSelectedPlan();
       }
       checkoutButton.textContent='Retomar pagamento pendente';
       billingNotice.textContent='Identificamos uma tentativa anterior de '+(original||'assinatura')+'. O sistema reutilizará a mesma referência no Mercado Pago; não será criada outra assinatura independente.';
      }
     }catch{} // The payment service still enforces recovery and duplicate prevention.
    }
   }
  }catch(err){
   checkoutState(false,'Serviço de cobrança indisponível neste momento. Tente atualizar a página.');
  }
 }
 void checkBillingReadiness();
 const verifyPaymentButton=document.createElement('button');
 verifyPaymentButton.type='button';
 verifyPaymentButton.className='secondary';
 verifyPaymentButton.textContent='Verificar pagamento';
 verifyPaymentButton.title='Consultar uma cobrança já realizada no Mercado Pago, sem criar outra cobrança.';
 checkoutButton.insertAdjacentElement('afterend',verifyPaymentButton);
 verifyPaymentButton.addEventListener('click',async()=>{
  const base=getCompany();if(!base){feedback('xrm-bill-plan-feedback','Selecione sua empresa.',true);return}
  verifyPaymentButton.disabled=true;
  feedback('xrm-bill-plan-feedback','Consultando o Mercado Pago. Isso não cria outra cobrança.');
  try{
   const {data,error}=await client.functions.invoke('xrmovi-reconcile-subscription',{body:{company_id:base.id}});
   if(error){
    let message=error.message||'Falha na verificação.';
    try{const extra=await error.context?.json?.();if(extra?.error)message=String(extra.error)}catch{}
    throw new Error(message);
   }
   const success=data?.status==='active';
   feedback('xrm-bill-plan-feedback',data?.message||(success?'Assinatura ativa.':'Pagamento ainda não confirmado.'),false);
   if(success){await refresh();await onDataChanged?.();}
  }catch(error){feedback('xrm-bill-plan-feedback',error.message||'Falha ao verificar pagamento.',true)}
  finally{verifyPaymentButton.disabled=false;}
 });
 checkoutButton.addEventListener('click',async()=>{
  if(!billingReady)return;
  const base=getCompany();if(!base)return;
  checkoutButton.disabled=true;feedback('xrm-bill-plan-feedback','Verificando a assinatura existente e preparando o checkout. Não será criada uma cobrança duplicada...');
  try{
   const chosen=root.querySelector('#xrm-bill-plan-form select').value;
   const {data,error}=await client.functions.invoke('xrmovi-create-subscription',{
    body:{company_id:base.id,plan:chosen}
   });
   if(error){
    let description='Não foi possível iniciar o pagamento. A cobrança não foi confirmada.';
    if(error.name==='FunctionsFetchError'){
     description='Falha de comunicação com o Supabase. Verifique sua conexão e atualize a página antes de tentar novamente.';
    }else if(error.name==='FunctionsRelayError'){
     description='O serviço de pagamento está temporariamente indisponível. Tente novamente.';
    }else{
     description=error.message||description;
     try{
      const detail=await error.context?.json?.();
      if(typeof detail?.error==='string')description=detail.error;
      else if(typeof detail?.message==='string')description=detail.message;
     }catch{}
    }
    throw new Error(description);
   }
   const url=new URL(String(data?.checkout_url||''));
   if(url.protocol!=='https:'||!(url.hostname==='mercadopago.com.br'||url.hostname.endsWith('.mercadopago.com.br')||url.hostname==='mercadopago.com'||url.hostname.endsWith('.mercadopago.com')))
    throw new Error('O provedor retornou um endereço de pagamento inválido.');
   window.location.assign(url.href);
  }catch(err){
   feedback('xrm-bill-plan-feedback',err?.message||'Checkout indisponível.',true);
   checkoutButton.disabled=false;
  }
 });
 const selectCompanies=(id,companies,active)=>{
  const node=root.querySelector('#'+id);node.replaceChildren();
  companies.forEach(c=>{const opt=document.createElement('option');opt.value=c.id;opt.textContent=c.name;node.append(opt)});
  if(companies.some(c=>c.id===active))node.value=active;
 };
 function renderQuota(label,used,limit){
  const card=document.createElement('div');card.className='xrm-quota';
  const cap=limit==null?'Personalizado':String(limit);
  const pct=limit==null?0:Math.min(100,Math.round(used/Math.max(1,limit)*100));
  const title=document.createElement('small');title.textContent=label;
  const val=document.createElement('b');val.textContent=used+' / '+cap;
  const track=document.createElement('div');track.className='xrm-bar'+(pct>=90?' critical':'');
  const fill=document.createElement('span');fill.style.width=pct+'%';track.append(fill);
  card.append(title,val,track);return card;
 }
 function render(info){
  current=info;
  text('xrm-bill-plan',info.plan+' · '+(info.vehicle_limit??'sob medida')+' veículos');
  text('xrm-bill-price',info.price_brl==null?'Sob consulta':money(info.price_brl)+'/mês');
  const expired=info.status==='trial'&&info.trial_end&&new Date(info.trial_end)<new Date();
  text('xrm-bill-status',expired?'Teste expirado':info.status==='trial'?'Aguardando pagamento':info.status==='pending'?'Aguardando pagamento':info.status==='active'?'Ativa':info.status==='canceled'?'Renovação cancelada':info.status);
  const renewal=info.status==='canceled'?null:renewalNotice(info);
  const reminder=root.querySelector('#xrm-bill-renewal');
  if(reminder){
   reminder.hidden=!renewal;
   if(renewal){
    reminder.dataset.tone=renewal.tone;
    text('xrm-bill-renewal-title',renewal.title+' · '+renewal.date);
    text('xrm-bill-renewal-detail',renewal.detail);
   }
  }

  text('xrm-bill-details',info.status==='canceled'?'Renovação cancelada no Mercado Pago. Acesso disponível até '+formatDate(info.paid_through)+'. Não haverá novas cobranças automáticas para esta assinatura.':(['pending','trial'].includes(info.status)?'Escolha um plano e conclua o pagamento para liberar veículos, contratos e demais operações. · ':'')+'Limites totais da assinatura, não por empresa');
   const recurring=info.provider==='mercadopago'&&Boolean(info.paid_through)&&['active','canceled'].includes(info.status);
   cancelSection.hidden=!recurring;
   cancelButton.hidden=info.status==='canceled';
   text('xrm-bill-cancel-summary',info.status==='canceled'
    ?'Renovação cancelada. Acesso ao período pago até '+formatDate(info.paid_through)+'.'
    :'Seu cartão renova mensalmente. Período já pago válido até '+formatDate(info.paid_through)+'. Você pode encerrar as próximas cobranças aqui.');
  const quotas=root.querySelector('#xrm-bill-quotas');quotas.replaceChildren(
   renderQuota('Empresas',info.companies_used,info.company_limit),
   renderQuota('Veículos',info.vehicles_used,info.vehicle_limit),
   renderQuota('Contratos',info.contracts_used,info.contract_limit),
   renderQuota('Usuários',info.seats_used,info.seat_limit)
  );
  const cards=root.querySelector('#xrm-bill-companies');cards.replaceChildren();
  for(const c of info.companies||[]){
   const card=document.createElement('div');card.className='xrm-company-card';
   const name=document.createElement('b');name.textContent=c.name;
   const metrics=document.createElement('small');metrics.textContent=c.vehicles+' veículos · '+c.contracts+' contratos · '+c.users+' usuários';
   card.append(name,metrics);cards.append(card);
  }
  selectCompanies('xrm-bill-contract-company',info.companies,getCompany()?.id);
  selectCompanies('xrm-bill-member-company',info.companies,getCompany()?.id);
  const companyForm=root.querySelector('#xrm-bill-company-form');
  companyForm.querySelector('button').disabled=info.company_limit!=null&&info.companies_used>=info.company_limit;
  const planSelect=root.querySelector('#xrm-bill-plan-form select');planSelect.value=info.plan_code;
  const requestPlan=root.querySelector('#xrm-plan-change-request');
  const isPending=['pending','trial','canceled'].includes(info.status);
  if(['active','canceled'].includes(info.status)){
    checkoutButton.disabled=true;pixButton.disabled=true;checkoutButton.textContent=info.status==='canceled'?'Renovação cancelada':'Assinatura ativa';
   }
  requestPlan.hidden=isPending;
  requestPlan.style.display=isPending?'none':'';
  showSelectedPlan();
  feedback('xrm-bill-feedback',['pending','trial'].includes(info.status)?'Cadastro concluído. Aguardando pagamento para liberar o sistema.':'Capacidade atualizada no banco de dados.');
 }
 // When a buyer returns from Mercado Pago, verify their own pending subscription
 // against provider-approved recurring invoices, never by trusting a browser redirect.
 const checkedAfterReturn=new Set();
 async function reconcileOnce(cid){
  try{
   feedback('xrm-bill-feedback','Conferindo pagamento no Mercado Pago...');
   const {data,error}=await client.functions.invoke('xrmovi-reconcile-subscription',{body:{company_id:cid}});
   if(error)throw error;
   if(data?.status==='active'){
    await refresh();
    await onDataChanged?.();
    feedback('xrm-bill-plan-feedback','Pagamento confirmado. Assinatura ativada com segurança.');
   }else if(data?.status==='pending'){
    feedback('xrm-bill-plan-feedback','Pagamento ainda não confirmado. Se a cobrança foi concluída, clique em Verificar pagamento. Para corrigir dados antes da aprovação, use Retomar pagamento pendente.');
   }
  }catch{
   feedback('xrm-bill-plan-feedback','Não foi possível conferir automaticamente o pagamento. Use Verificar pagamento antes de tentar de novo.',true);
  }
 }

 async function refresh(){
  const base=getCompany();if(!base)return;
  const rid=++request;
  feedback('xrm-bill-feedback','Atualizando sua assinatura...');
  try{
   const {data,error}=await client.rpc('xrmovi_account_overview',{cid:base.id});
   if(rid!==request)return;
   if(error)throw error;
   render(data);
   if(['pending','trial'].includes(data?.status)&&!checkedAfterReturn.has(base.id)){
    checkedAfterReturn.add(base.id);
    void reconcileOnce(base.id);
   }
  }catch(err){
   if(rid!==request)return;
   current=null;
   root.querySelector('#xrm-bill-quotas').replaceChildren();
   root.querySelector('#xrm-bill-companies').replaceChildren();
   feedback('xrm-bill-feedback',err?.message||'Área comercial indisponível.',true);
  }
 }
 nav?.addEventListener('click',()=>{void refresh()});
 document.getElementById('fleet-mobile-view')?.addEventListener('change',e=>{if(e.target.value==='subscription')void refresh()});
 return {refresh};
}
