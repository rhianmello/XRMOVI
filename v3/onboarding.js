import {wireFleetCalculator,quoteFleet,money} from '../pricing/fleet-pricing.js?v=20261112';
import {openPixCheckout} from './pix-checkout.js?v=20261105-confirmed-pix-1';
import {createPaymentEmailNotice} from './payment-email-notice.js?v=20261105-plain-text-2';
// XRMOVI | Cadastro guiado: capacidade por veículo, pagamento ou avaliação de 24 horas.
// Preços e autorização definitivos são calculados pelo servidor Supabase.
export async function showXrmoviOnboarding({login,client,onCreated,onLogout,existing=null}){
 login.hidden=false;
 login.classList.add('xrm-onboarding-overlay');
 login.style.cssText='';
 const form=login.querySelector('#v3login');
 form.classList.add('xrm-signup');
 form.style.cssText='';
 form.innerHTML="\n  <header class=\"wizard-header\">\n   <div class=\"wizard-brand\">\n    <span class=\"wizard-brand-symbol\" aria-hidden=\"true\">X</span>\n    <div><b>XRMOVI</b><small>Plataforma inteligente de frotas</small></div>\n   </div>\n   <button type=\"button\" class=\"wizard-exit\" aria-label=\"Encerrar sessão e sair do cadastro\"><span aria-hidden=\"true\">↗</span> Sair da conta</button>\n  </header>\n  <div class=\"wizard-intro\">\n   <div class=\"wizard-eyebrow\">Sua operação começa aqui</div>\n   <h1>Configure sua frota.<br><em>O controle começa agora.</em></h1>\n   <p>Informe sua empresa e quantos veículos deseja administrar. Escolha cartão, Pix ou 24 horas de teste sem pagamento.</p>\n  </div>\n  <div class=\"wizard-journey\" aria-label=\"Etapas do cadastro\">\n   <div class=\"wizard-journey-step\" data-journey=\"1\" data-active=\"true\"><span class=\"journey-number\">01</span><span>Empresa</span></div>\n   <div class=\"wizard-journey-step\" data-journey=\"2\" data-active=\"false\"><span class=\"journey-number\">02</span><span>Assinatura</span></div>\n  </div>\n  <div class=\"wizard-body\">\n   <div class=\"wizard-fields\">\n    <section class=\"step\" data-wizard-step=\"1\" aria-labelledby=\"step-company-title\">\n     <header class=\"step-heading\"><span class=\"step-number\">01</span><div><h3 id=\"step-company-title\">Dados da empresa / Seu nome</h3><p>Quem será o titular desta assinatura?</p></div></header>\n     <label>Nome da empresa<input name=\"company\" required minlength=\"2\" maxlength=\"160\" autocomplete=\"organization\" placeholder=\"Ex.: Transportadora Santos\"></label>\n    </section>\n    <section class=\"step\" data-wizard-step=\"2\" aria-labelledby=\"step-plan-title\">\n     <header class=\"step-heading\"><span class=\"step-number\">02</span><div><h3 id=\"step-plan-title\">Personalize sua assinatura</h3><p>5 veículos incluídos por R$ 29,90; R$ 5,90 por adicional</p></div></header>\n     <div class=\"wizard-vehicle-quote\" data-fleet-calculator><label for=\"xrm-wizard-vehicles\">Veículos contratados</label><div class=\"wizard-vehicle-counter\"><button type=\"button\" data-fleet-minus aria-label=\"Diminuir um veículo\">−</button><input id=\"xrm-wizard-vehicles\" type=\"number\" min=\"1\" max=\"10000\" value=\"5\" inputmode=\"numeric\" data-fleet-count><button type=\"button\" data-fleet-plus aria-label=\"Adicionar um veículo\">+</button></div><input type=\"range\" min=\"5\" max=\"200\" step=\"1\" value=\"5\" data-fleet-slider aria-label=\"Quantidade de veículos\"><p class=\"wizard-vehicle-breakdown\">5 incluídos + <b data-fleet-extra>0</b> adicionais × R$ 5,90 = <strong data-fleet-price>R$ 29,90</strong>/mês</p></div>\n    </section>\n    <div class=\"wizard-actions\">\n     <button type=\"submit\" class=\"wizard-submit\" disabled><span data-action-label>Continuar para o pagamento</span><span class=\"wizard-submit-arrow\" aria-hidden=\"true\">›</span></button>\n     <p class=\"wizard-note\"><span class=\"wizard-note-dot\" aria-hidden=\"true\">●</span><span>Teste por 24 horas sem cartão ou conclua o pagamento para liberar o painel. O preço definitivo é validado pelo servidor.</span></p>\n     <p class=\"wizard-msg\" role=\"status\" aria-live=\"polite\"></p>\n    </div>\n   </div>\n   <aside class=\"plan-preview\" aria-label=\"Resumo da assinatura escolhida\" aria-live=\"polite\">\n    <div class=\"preview-top\">\n     <span class=\"preview-label\">Sua assinatura</span>\n     <div class=\"preview-plan\" data-plan-title>Um único plano</div>\n     <div class=\"preview-price-line\"><strong data-plan-price>—</strong><small>/ mês</small></div>\n    </div>\n    <div class=\"preview-rule\" aria-hidden=\"true\"></div>\n    <div class=\"preview-cap\">\n     <p class=\"preview-cap-title\">Capacidade incluída</p>\n     <div class=\"limits\" data-limits></div>\n    </div>\n    <div class=\"preview-summary\">\n     <span>Resumo do cadastro</span>\n     <div class=\"preview-summary-row\"><small>Empresa</small><strong data-summary-company>Não informado</strong></div>\n    </div>\n    <div class=\"preview-footer\"><span class=\"preview-footer-mark\" aria-hidden=\"true\">✓</span><span>Quantidade de veículos compartilhada entre suas empresas. Teste gratuito por 24 horas sem cartão, limitado a 5 veículos.</span></div>\n   </aside>\n  </div>";
 const paymentChoice=document.createElement('fieldset');
 paymentChoice.className='wizard-payment-choice';
 paymentChoice.innerHTML=`<legend>Como deseja pagar?</legend>
  <label class="wizard-payment-option">
   <input type="radio" name="payment_method" value="card" required>
   <span class="wizard-payment-indicator" aria-hidden="true"></span>
   <span class="wizard-payment-copy"><strong>Cartão de crédito</strong><small>Renovação automática mensal</small></span>
  </label>
  <label class="wizard-payment-option">
   <input type="radio" name="payment_method" value="pix">
   <span class="wizard-payment-indicator" aria-hidden="true"></span>
   <span class="wizard-payment-copy"><strong>Pix</strong><small>QR Code ou Copia e Cola · renovação mensal manual</small></span>
  </label>
  <label class="wizard-payment-option">
   <input type="radio" name="payment_method" value="trial">
   <span class="wizard-payment-indicator" aria-hidden="true"></span>
   <span class="wizard-payment-copy"><strong>Experimentar grátis por 24 horas</strong><small>Sem cartão, sem Pix · até 5 veículos durante a avaliação</small></span>
  </label>`;
 form.querySelector('[data-wizard-step="2"]').append(paymentChoice);
 // Before redirecting to Mercado Pago, identify the payer address bound to this account.
 const emailSlot=document.createElement('div');
 emailSlot.id='xrm-checkout-login-email';
 form.querySelector('[data-wizard-step="2"]').append(emailSlot);
 void createPaymentEmailNotice(client).then(note=>emailSlot.replaceChildren(note))
  .catch(()=>{emailSlot.textContent='Confira o e-mail do login XRMOVI antes de confirmar no Mercado Pago.';});

 const elements=form.elements, submit=form.querySelector('.wizard-submit'),status=form.querySelector('.wizard-msg');
 const companyField=elements.namedItem('company');
 let companyId=existing?.id||null;
 let snapshot=null,pendingCheckout=null,frozenPlan=null;
 const initialParams=new URLSearchParams(window.location.search);
 const initialQty=Number(initialParams.get('vehicles')||(()=>{try{return localStorage.getItem('xrmovi_fleet_vehicles')}catch{return 5}})()||5);
 const initialTrial=initialParams.has('trial')||(()=>{try{return localStorage.getItem('xrmovi_fleet_trial_intent')==='1'}catch{return false}})();
 const desiredInitial=Number.isInteger(initialQty)&&initialQty>0&&initialQty<=10000?initialQty:5;
 const setCompany=()=>form.querySelector('[data-summary-company]').textContent=companyField.value.trim()||'Não informado';
 companyField.addEventListener('input',setCompany);
 const renderLimits=(count,trial=false)=>{
  const host=form.querySelector('[data-limits]');host.replaceChildren();
  const entries=[['Veículos',trial?'5 no teste':String(count)],['Empresas','Sem limite comercial'],['Contratos','Opcionais']];
  entries.forEach(([label,value])=>{
   const tile=document.createElement('div');tile.className='limit-tile';
   const b=document.createElement('b');b.textContent=value;
   const small=document.createElement('small');small.textContent=label;tile.append(b,small);host.append(tile);
  });
 };
 const calc=wireFleetCalculator(form.querySelector('[data-fleet-calculator]'),{
  initial:desiredInitial,onChange:quote=>{
   form.querySelector('[data-plan-title]').textContent='XRMOVI por veículo';
   form.querySelector('[data-plan-price]').textContent=money(quote.monthlyCents);
   renderLimits(quote.count);
  }
 });
 calc?.setCount(desiredInitial);
 const trialRadio=form.querySelector('input[value="trial"][name="payment_method"]');
 if(initialTrial)trialRadio.checked=true;
 for(const step of form.querySelectorAll('[data-wizard-step]'))
  step.addEventListener('focusin',()=>form.querySelectorAll('[data-journey]').forEach(t=>t.dataset.active=String(t.dataset.journey===step.dataset.wizardStep)));
 const markCheckoutLocked=async(plan)=>{
  frozenPlan=plan;
  let count=Number(/^fleet_(\d+)$/.exec(plan)?.[1]||0);
  let price=null,title=plan;
  if(!count){
   const {data}=await client.rpc('xrmovi_list_plans');
   const legacy=(Array.isArray(data)?data:[]).find(x=>x.code===plan);
   count=Number(legacy?.vehicle_limit||5);
   price=legacy?.monthly_brl;
   title=legacy?.title||plan;
  }
  calc?.setCount(count);
  form.querySelectorAll('[data-fleet-count],[data-fleet-slider],[data-fleet-minus],[data-fleet-plus]').forEach(e=>e.disabled=true);
  if(price!=null)form.querySelector('[data-plan-price]').textContent=Number(price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  if(!/^fleet_/.test(plan))form.querySelector('[data-plan-title]').textContent=title+' · contratação anterior';
  renderLimits(count);
  trialRadio.disabled=true;
  if(trialRadio.checked)trialRadio.checked=false;
 };
 const checkExistingPayment=async()=>{
  if(!companyId)return;
  status.textContent='Consultando o pagamento no Mercado Pago. Nenhuma cobrança será feita...';
  try{
   const {data,error}=await client.functions.invoke('xrmovi-reconcile-subscription',{body:{company_id:existing.id}});
   if(error){
    let text='Falha ao verificar o pagamento.';
    try{const detail=await error.context?.json?.();if(detail?.error)text=detail.error}catch{}
    throw Error(text);
   }
   if(data?.status==='active'){status.textContent='Pagamento confirmado. Abrindo painel...';window.location.reload();return 'active'}
   status.textContent=data?.message||'Pagamento ainda não confirmado. Não faça uma segunda assinatura se já foi cobrado.';
   return data?.status||'pending';
  }catch(error){status.textContent=error.message||'Serviço indisponível. Tente novamente.';return 'failed'}
 };
 if(companyId){
  try{
   const {data,error}=await client.rpc('xrmovi_onboarding_snapshot',{cid:companyId});
   if(error)throw error;
   snapshot=data;
   companyField.value=String(data?.company_name||existing?.name||'');
   setCompany();
   const {data:attempt,error:attemptError}=await client.rpc('xrmovi_checkout_reconcile_lookup',{cid:companyId});
   if(attemptError)throw attemptError;
   if(attempt?.intent_id&&['created','pending'].includes(attempt.intent_status)&&attempt.requested_plan){
    pendingCheckout=attempt;
    await markCheckoutLocked(String(attempt.requested_plan));
    const warning=document.createElement('p');
    warning.className='wizard-pending-payment';
    warning.textContent='Já existe tentativa de pagamento em andamento. Você pode retomar ou consultar o pagamento, sem abrir outra assinatura.';
    form.querySelector('[data-fleet-calculator]').after(warning);
    const verify=document.createElement('button');verify.type='button';verify.id='xrm-onboarding-verify-payment';verify.className='wizard-verify-payment';
    verify.textContent='Já paguei · Verificar pagamento';
    verify.addEventListener('click',()=>void checkExistingPayment());
    submit.before(verify);
    if(window.location.hash==='#subscription'){
     void(async()=>{for(const ms of [900,3500,7000]){await new Promise(r=>setTimeout(r,ms));if(login.hidden)return;if((await checkExistingPayment())==='active')return}})();
    }
   }else if(snapshot.status==='trial'){
    await markCheckoutLocked(String(snapshot.plan));
    const notice=document.createElement('p');notice.className='wizard-pending-payment';
    notice.textContent='Seu teste de 24 horas terminou. Escolha cartão ou Pix para continuar com os veículos já selecionados.';
    form.querySelector('[data-fleet-calculator]').after(notice);
   }else if(/^fleet_\d+$/.test(String(snapshot.plan||''))){
    calc?.setCount(Number(snapshot.plan.split('_')[1]));
   }
  }catch(error){status.textContent='Não foi possível recuperar a assinatura: '+error.message;}
 }
 if(!snapshot&&existing?.name){companyField.value=existing.name;setCompany()}
 submit.disabled=false;
 form.querySelector('.wizard-exit').onclick=onLogout;
 form.onsubmit=async event=>{
  event.preventDefault();
  if(submit.disabled)return;
  const choice=form.querySelector('input[name="payment_method"]:checked')?.value;
  if(!choice){status.textContent='Escolha cartão, Pix ou o teste gratuito de 24 horas.';return}
  submit.disabled=true;
  status.textContent='Validando sua assinatura com segurança...';
  try{
   let plan=frozenPlan;
   if(!plan){
    const {data:quote,error:quoteError}=await client.rpc('xrmovi_vehicle_quote',{p_count:calc.quote.count});
    if(quoteError||!quote?.code)throw Error(quoteError?.message||'Preço não disponível no servidor.');
    plan=quote.code;
   }
   let data={company_id:companyId};
   if(!companyId||snapshot?.status==='pending'){
    const args={
     ...(companyId?{cid:companyId}:{}),
     company_name:companyField.value.trim(),contract_name:null,chosen_plan:plan
    };
    const response=await client.rpc(companyId?'xrmovi_onboarding_update':'xrmovi_onboarding_complete',args);
    if(response.error)throw response.error;
    data=response.data;companyId=String(data.company_id);
    snapshot={status:'pending',plan};
   }
   if(choice==='trial'){
    if(frozenPlan||pendingCheckout)throw Error('Você já iniciou uma contratação; conclua ou verifique esse pagamento.');
    const {data:trial,error}=await client.rpc('xrmovi_start_trial',{cid:companyId});
    if(error||trial?.status!=='trial')throw Error(error?.message||'Não foi possível iniciar o teste.');
    try{localStorage.removeItem('xrmovi_fleet_trial_intent')}catch{}
    login.hidden=true;await onCreated(data);return;
   }
   if(choice==='pix'){
    login.hidden=true;
    await onCreated(data);
    openPixCheckout({client,companyId,onPaid:async()=>window.location.reload()});
    return;
   }
   const readiness=await client.functions.invoke('xrmovi-billing-readiness',{method:'GET'});
   if(readiness.error||readiness.data?.enabled!==true){
    throw Error(readiness.data?.reason==='pilot_only'
     ?'Checkout de cartão restrito à homologação. Nenhuma cobrança foi iniciada. Você também pode escolher Pix ou teste gratuito.'
     :'Cartão temporariamente indisponível. Nenhuma cobrança foi iniciada. Escolha Pix ou tente novamente.');
   }
   const checkout=await client.functions.invoke('xrmovi-create-subscription',{body:{company_id:companyId,plan}});
   if(checkout.error){
    let message=checkout.error.message||'Não foi possível iniciar a cobrança.';
    try{const detail=await checkout.error.context?.json?.();if(detail?.error)message=detail.error}catch{}
    throw Error(message);
   }
   const url=new URL(String(checkout.data?.checkout_url||''));
   if(url.protocol!=='https:'||!['mercadopago.com','mercadopago.com.br'].some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))
    throw Error('URL de pagamento inválida. Nenhum novo checkout foi aberto.');
   window.location.assign(url.href);
  }catch(error){
   status.textContent=error?.message||'Falha ao processar sua solicitação.';
   const feedback=document.getElementById('xrm-bill-plan-feedback');
   if(feedback)feedback.textContent=status.textContent;
  }finally{submit.disabled=false}
 };
}
