import {openPixCheckout} from './pix-checkout.js?v=20261105-confirmed-pix-1';
import {createPaymentEmailNotice} from './payment-email-notice.js?v=20261105-plain-text-2';
// XRMOVI | Cadastro guiado sem acesso operacional antes de pagamento.
// Valores e limites são fornecidos por xrmovi_list_plans no banco.
export async function showXrmoviOnboarding({login,client,onCreated,onLogout,existing=null}){
 login.hidden=false;
 login.classList.add('xrm-onboarding-overlay');
 login.style.cssText='';
 const form=login.querySelector('#v3login');
 form.classList.add('xrm-signup');
 form.style.cssText='';
 form.innerHTML="\n  <header class=\"wizard-header\">\n   <div class=\"wizard-brand\">\n    <span class=\"wizard-brand-symbol\" aria-hidden=\"true\">X</span>\n    <div><b>XRMOVI</b><small>Plataforma inteligente de frotas</small></div>\n   </div>\n   <button type=\"button\" class=\"wizard-exit\" aria-label=\"Encerrar sessão e sair do cadastro\"><span aria-hidden=\"true\">↗</span> Sair da conta</button>\n  </header>\n  <div class=\"wizard-intro\">\n   <div class=\"wizard-eyebrow\">Sua operação começa aqui</div>\n   <h1>Configure sua frota.<br><em>O controle começa agora.</em></h1>\n   <p>Informe os dados da empresa e escolha o plano para sua frota. Tudo preparado para começar assim que o pagamento for confirmado.</p>\n  </div>\n  <div class=\"wizard-journey\" aria-label=\"Etapas do cadastro\">\n   <div class=\"wizard-journey-step\" data-journey=\"1\" data-active=\"true\"><span class=\"journey-number\">01</span><span>Empresa</span></div>\n   <div class=\"wizard-journey-step\" data-journey=\"2\" data-active=\"false\"><span class=\"journey-number\">02</span><span>Assinatura</span></div>\n  </div>\n  <div class=\"wizard-body\">\n   <div class=\"wizard-fields\">\n    <section class=\"step\" data-wizard-step=\"1\" aria-labelledby=\"step-company-title\">\n     <header class=\"step-heading\"><span class=\"step-number\">01</span><div><h3 id=\"step-company-title\">Dados da empresa / Seu nome</h3><p>Quem será o titular desta assinatura?</p></div></header>\n     <label>Nome da empresa<input name=\"company\" required minlength=\"2\" maxlength=\"160\" autocomplete=\"organization\" placeholder=\"Ex.: Transportadora Santos\"></label>\n    </section>\n    <section class=\"step\" data-wizard-step=\"2\" aria-labelledby=\"step-plan-title\">\n     <header class=\"step-heading\"><span class=\"step-number\">02</span><div><h3 id=\"step-plan-title\">Escolha sua assinatura</h3><p>Você pode mudar de plano conforme a frota crescer</p></div></header>\n     <label>Plano mensal<select name=\"plan\" required disabled><option value=\"\">Carregando os planos...</option></select></label>\n    </section>\n    <div class=\"wizard-actions\">\n     <button type=\"submit\" class=\"wizard-submit\" disabled><span data-action-label>Continuar para o pagamento</span><span class=\"wizard-submit-arrow\" aria-hidden=\"true\">›</span></button>\n     <p class=\"wizard-note\"><span class=\"wizard-note-dot\" aria-hidden=\"true\">●</span><span>Cadastro sem cobrança imediata. O Mercado Pago apresenta as condições antes de confirmar. O painel operacional é liberado após pagamento aprovado.</span></p>\n     <p class=\"wizard-msg\" role=\"status\" aria-live=\"polite\"></p>\n    </div>\n   </div>\n   <aside class=\"plan-preview\" aria-label=\"Resumo da assinatura escolhida\" aria-live=\"polite\">\n    <div class=\"preview-top\">\n     <span class=\"preview-label\">Sua assinatura</span>\n     <div class=\"preview-plan\" data-plan-title>Selecione um plano</div>\n     <div class=\"preview-price-line\"><strong data-plan-price>—</strong><small>/ mês</small></div>\n    </div>\n    <div class=\"preview-rule\" aria-hidden=\"true\"></div>\n    <div class=\"preview-cap\">\n     <p class=\"preview-cap-title\">Capacidade incluída</p>\n     <div class=\"limits\" data-limits></div>\n    </div>\n    <div class=\"preview-summary\">\n     <span>Resumo do cadastro</span>\n     <div class=\"preview-summary-row\"><small>Empresa</small><strong data-summary-company>Não informado</strong></div>\n    </div>\n    <div class=\"preview-footer\"><span class=\"preview-footer-mark\" aria-hidden=\"true\">✓</span><span>Limites compartilhados entre as empresas, não multiplicados por contrato. Sem acesso operacional antes da confirmação do pagamento.</span></div>\n   </aside>\n  </div>";
 const paymentChoice=document.createElement('fieldset');
 paymentChoice.className='wizard-payment-choice';
 paymentChoice.innerHTML=`<legend>Como deseja pagar?</legend>
  <label class="wizard-payment-option">
   <input type="radio" name="payment_method" value="card" checked>
   <span class="wizard-payment-indicator" aria-hidden="true"></span>
   <span class="wizard-payment-copy"><strong>Cartão de crédito</strong><small>Renovação automática mensal</small></span>
  </label>
  <label class="wizard-payment-option">
   <input type="radio" name="payment_method" value="pix">
   <span class="wizard-payment-indicator" aria-hidden="true"></span>
   <span class="wizard-payment-copy"><strong>Pix</strong><small>QR Code ou Copia e Cola · renovação mensal manual</small></span>
  </label>`;
 form.querySelector('[data-wizard-step="2"]').append(paymentChoice);
 // Before redirecting to Mercado Pago, identify the payer address bound to this account.
 const emailSlot=document.createElement('div');
 emailSlot.id='xrm-checkout-login-email';
 form.querySelector('[data-wizard-step="2"]').append(emailSlot);
 void createPaymentEmailNotice(client).then(note=>emailSlot.replaceChildren(note))
  .catch(()=>{emailSlot.textContent='Confira o e-mail do login XRMOVI antes de confirmar no Mercado Pago.';});
 const elements=form.elements, select=elements.namedItem('plan'), submit=form.querySelector('.wizard-submit'), status=form.querySelector('.wizard-msg');

 const setSummary=()=>{
  const companyName=String(elements.namedItem('company').value||'').trim();
  form.querySelector('[data-summary-company]').textContent=companyName||'Não informado';
 };
 elements.namedItem('company').addEventListener('input',setSummary);
 const setStep=(number)=>{
  for(const tab of form.querySelectorAll('[data-journey]'))tab.dataset.active=String(tab.dataset.journey===String(number));
 };
 for(const step of form.querySelectorAll('[data-wizard-step]')){
  step.addEventListener('focusin',()=>setStep(step.dataset.wizardStep));
 }
 elements.namedItem('plan').addEventListener('change',()=>setStep(2));
 setSummary();

 form.querySelector('.wizard-exit').onclick=onLogout;
 let plans=[];
 let pendingSnapshot=null;
 let pendingCheckout=null;
 if(existing?.id){
  try{
   const {data,error}=await client.rpc('xrmovi_onboarding_snapshot',{cid:existing.id});
   if(error)throw error;
   pendingSnapshot=data;
   form.elements.namedItem('company').value=String(data.company_name||existing.name||'');
   setSummary();
   const {data:attempt,error:attemptError}=await client.rpc('xrmovi_checkout_reconcile_lookup',{cid:existing.id});
   if(attemptError)throw attemptError;
   if(attempt?.intent_id&&['created','pending'].includes(attempt.intent_status)&&attempt.requested_plan){
    pendingCheckout=attempt;
    const info=document.createElement('p');
    info.className='wizard-pending-payment';
    const title=document.createElement('strong');
    title.textContent='Pagamento já iniciado · '+String(attempt.requested_plan).toUpperCase();
    const detail=document.createElement('span');
    detail.textContent='Se você já pagou, use Verificar pagamento. Se ainda não concluiu a compra, é possível retomar o checkout original sem contratar outra assinatura.';
    info.append(title,detail);
    select.closest('label').after(info);
    form.querySelector('[data-action-label]').textContent='Continuar checkout (somente se não pagou)';
    // Buyers with an existing attempt must be able to check payment directly here.
    const verify=document.createElement('button');
    verify.type='button';
    verify.className='wizard-verify-payment';
    verify.id='xrm-onboarding-verify-payment';
    verify.textContent='Já paguei · Verificar pagamento';
    verify.style.cssText='display:block;width:100%;margin-top:8px;padding:13px 15px;border-radius:9px;border:1px solid #55c7ce;background:#28b5aa;color:#052c35;font-weight:800;cursor:pointer';
    const action=form.querySelector('.wizard-submit');
    action.insertAdjacentElement('beforebegin',verify);
    action.style.cssText='background:#173b4b;color:#cce6ef;border:1px solid #396375;';
    const checkExistingPayment=async()=>{
     if(verify.disabled)return 'busy';
     verify.disabled=true;
     status.textContent='Consultando a assinatura existente no Mercado Pago. Nenhuma cobrança será feita...';
     try{
      const {data:result,error:checkError}=await client.functions.invoke('xrmovi-reconcile-subscription',{body:{company_id:existing.id}});
      if(checkError){
       let message='Não foi possível verificar o pagamento agora.';
       try{
        const detail=await checkError.context?.json?.();
        if(typeof detail?.error==='string')message=detail.error;
       }catch{}
       throw new Error(message);
      }
      if(result?.status==='active'){
       status.textContent='Pagamento aprovado e assinatura ativa. Abrindo o painel...';
       window.location.reload();
       return 'active';
      }
      status.textContent=result?.message||'Ainda não foi identificada uma cobrança aprovada. Se você já pagou, não refaça a assinatura.';
      return result?.status||'pending';
     }catch(error){
      status.textContent='Não foi possível consultar a confirmação: '+(error?.message||'Serviço indisponível')+'. Não pague novamente. Use este botão para verificar depois.';
      return 'failed';
     }finally{verify.disabled=false}
    };
    verify.addEventListener('click',()=>void checkExistingPayment());
    // Mercado Pago returns to /v3/#subscription. Check the existing invoice automatically,
    // without opening another checkout; bounded retries cover short provider settlement delays.
    if(window.location.hash==='#subscription'){
     void(async()=>{
      for(const pause of [900,3500,7000]){
       await new Promise(resolve=>setTimeout(resolve,pause));
       if(login.hidden||!document.contains(verify))return;
       const result=await checkExistingPayment();
       if(result==='active'||result==='failed')return;
      }
      status.textContent='Se o cartão já foi cobrado e ainda não liberou, clique em Já paguei · Verificar pagamento. Não contrate outra assinatura.';
     })();
    }
   }
  }catch(error){status.textContent='Não foi possível recuperar o cadastro anterior: '+error.message;}
 }

 const showPlan=()=>{
  const p=plans.find(x=>x.code===select.value);
  form.querySelector('[data-plan-title]').textContent=p?.title||'Selecione um plano';
  form.querySelector('[data-plan-price]').textContent=p?.monthly_brl!=null?Number(p.monthly_brl).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
  const host=form.querySelector('[data-limits]');host.replaceChildren();
  for(const [name,value] of [['Empresas',p?.company_limit],['Contratos',p?.contract_limit],['Veículos',p?.vehicle_limit],['Logins',p?.seat_limit]]){
   const card=document.createElement('div'),val=document.createElement('b'),label=document.createElement('small');card.className='limit-tile';
   val.textContent=value==null?'—':String(value);label.textContent=name;card.append(val,label);host.append(card);
  }
 };
 select.onchange=showPlan;
 try{
  const {data,error}=await client.rpc('xrmovi_list_plans');
  if(error)throw error;
  plans=(Array.isArray(data)?data:[]).filter(p=>['start','pro','business','advanced'].includes(p.code)&&p.monthly_brl!=null);
  if(!plans.length)throw Error('Planos indisponíveis no momento.');
  select.replaceChildren();
  for(const p of plans){const option=document.createElement('option');option.value=p.code;option.textContent=p.title+' — '+Number(p.monthly_brl).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+'/mês';select.append(option)}
  if(pendingSnapshot&&plans.some(p=>p.code===pendingSnapshot.plan))select.value=pendingSnapshot.plan;
  if(pendingCheckout){
   const original=String(pendingCheckout.requested_plan);
   if(!plans.some(p=>p.code===original))throw Error('O plano da tentativa anterior não está disponível. Fale com o suporte antes de iniciar outra assinatura.');
   select.value=original;
   for(const item of select.options)item.disabled=item.value!==original;
   select.title='Plano fixado à tentativa de pagamento que já está em andamento.';
  }
  select.disabled=false;submit.disabled=false;showPlan();
 }catch(err){status.textContent='Não foi possível consultar os planos: '+err.message}
 form.onsubmit=async event=>{
  event.preventDefault();
  if(submit.disabled)return;
  submit.disabled=true;status.textContent='Salvando cadastro com segurança...';
  const plan=String(select.value);
  const paymentMethod=form.querySelector('input[name="payment_method"]:checked')?.value||'card';
  try{
   const {data,error}=await client.rpc(existing?.id?'xrmovi_onboarding_update':'xrmovi_onboarding_complete',{
    ...(existing?.id?{cid:existing.id}:{}),
    company_name:String(elements.namedItem('company').value).trim(),
    contract_name:null,
    chosen_plan:plan
   });
   if(error)throw error;
   // Leave onboarding immediately; no operational dashboard until payment.
   login.hidden=true;
   await onCreated(data);
   if(data.recovered)return;
   if(paymentMethod==='pix'){
    openPixCheckout({client,companyId:data.company_id,onPaid:async()=>window.location.reload()});
    return;
   }
   const readiness=await client.functions.invoke('xrmovi-billing-readiness',{method:'GET'});
   if(readiness.error||readiness.data?.enabled!==true){
    const reason=readiness.data?.reason;
    const explanation=reason==='pilot_only'
     ?'Cadastro concluído. O Mercado Pago está em homologação e este acesso ainda não foi autorizado para pagamentos. Nenhuma cobrança foi iniciada.'
     :'Cadastro concluído. O checkout do Mercado Pago ainda não está disponível. Nenhuma cobrança foi iniciada. Acompanhe a ativação em Minha assinatura.';
    const feedback=document.getElementById('xrm-bill-plan-feedback');
    if(feedback){feedback.textContent=explanation;feedback.setAttribute('role','alert');}
    return;
   }
   const checkout=await client.functions.invoke('xrmovi-create-subscription',{body:{company_id:data.company_id,plan}});
   if(checkout.error){
    let msg=checkout.error.name==='FunctionsFetchError'
     ?'Falha de conexão com o Supabase. Seu cadastro foi preservado; abra Minha assinatura e tente pagar novamente.'
     :(checkout.error.message||'Não foi possível iniciar o pagamento.');
    try{const details=await checkout.error.context?.json?.();if(details?.error)msg=String(details.error)}catch{}
    throw new Error(msg);
   }
   const url=new URL(String(checkout.data?.checkout_url||''));
   if(url.protocol!=='https:'||!['mercadopago.com','mercadopago.com.br'].some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))throw Error('URL de pagamento inválida.');
   window.location.assign(url.href);
  }catch(err){
   if(!login.hidden){status.textContent=err?.message||'Cadastro indisponível';submit.disabled=false}
   else {
    const messages=document.getElementById('xrm-bill-plan-feedback');
    if(messages)messages.textContent='Cadastro concluído. Abra o pagamento no plano escolhido. '+(err?.message||'');
   }
  }
 };
}
