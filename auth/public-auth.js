import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const form=document.getElementById('xrm-public-auth'),msg=document.getElementById('xrm-auth-message'),submit=document.getElementById('xrm-auth-submit'),confirm=document.getElementById('xrm-confirm-row'),forgot=document.getElementById('xrm-auth-forgot'),passwordRow=document.getElementById('xrm-password-row');
let mode='signin';
const dashboard=new URL('/v3/',location.origin).href;
for(const button of document.querySelectorAll('[data-auth-mode]'))button.addEventListener('click',()=>{
 mode=button.dataset.authMode;
 document.querySelectorAll('[data-auth-mode]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-selected',String(b===button))});
 confirm.hidden=mode!=='signup';confirm.querySelector('input').required=mode==='signup';passwordRow.hidden=false;passwordRow.querySelector('input').required=true;forgot.hidden=mode!=='signin';form.querySelector('[name=password]').setAttribute('autocomplete',mode==='signup'?'new-password':'current-password');
 submit.textContent=mode==='signup'?'Criar minha conta':'Entrar no painel';msg.textContent='';
});
forgot.addEventListener('click',()=>{mode='recover';document.querySelectorAll('[data-auth-mode]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-selected','false')});confirm.hidden=true;confirm.querySelector('input').required=false;passwordRow.hidden=true;passwordRow.querySelector('input').required=false;forgot.hidden=true;submit.textContent='Enviar link de recuperação';msg.textContent='Informe seu e-mail para receber o link de redefinição.';form.querySelector('[name=email]').focus();});
let client;
try{const response=await fetch('./v3/config.json',{cache:'no-store'});if(!response.ok)throw Error('Configuração indisponível');const config=await response.json();client=createClient(config.supabaseUrl,config.supabaseAnonKey)}catch(e){msg.textContent='Serviço temporariamente indisponível: '+e.message;submit.disabled=true}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(!client)return;
 submit.disabled=true;msg.textContent='Verificando...';
 try{
  const data=new FormData(form),email=String(data.get('email')||'').trim(),password=String(data.get('password')||'');
  if(mode==='recover'){
   const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:new URL('./redefinir-senha.html',location.href).href});
   if(error)throw error;
   msg.textContent='Se houver uma conta com este e-mail, você receberá o link de recuperação. Verifique também o spam.';return;
  }
  if(mode==='signup'){
   if(password!==data.get('confirmation'))throw Error('As senhas não coincidem.');
   const {data:created,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:new URL('./?login=1#acesso',location.href).href,data:{signup_product:'xrmovi',signup_origin:'xrmovi.com.br'}}});
   if(error)throw error;
   window.XrmoviAnalytics?.track('sign_up',{location:'registration'});
   if(!created.session){msg.textContent='Conta criada. Confirme seu e-mail e depois faça login.';return}
  }else{
   const {data:logged,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;if(!logged?.session)throw Error('Não foi possível confirmar sua sessão. Tente novamente.');
  }
  // Route the platform owner to the protected administration area.
  let destination=dashboard;
  const {data:isAdmin,error:adminError}=await client.rpc('xrmovi_platform_is_admin');
  if(!adminError&&isAdmin===true){
    window.XrmoviAnalytics?.setInternal?.(true);
    destination=new URL('/admin/',location.origin).href;
  }
  msg.textContent=isAdmin===true&&!adminError?'Acesso confirmado. Abrindo administração...':'Acesso confirmado. Abrindo painel...';
  // Atribuição é opcional e nunca bloqueia o login nem libera assinatura.
  try{await Promise.race([Promise.allSettled([window.XrmoviAnalytics?.syncAttribution?.(client)||Promise.resolve(false),window.XrmoviAnalytics?.syncPurchaseIdentity?.(client)||Promise.resolve(false)]),new Promise(resolve=>setTimeout(resolve,2800))]);}catch(_error){}
  location.replace(destination);
 }catch(error){
  const original=String(error?.message||'');
  const code=String(error?.code||'');
  if(mode==='signup'&&(code==='user_already_exists'||/user already registered|already been registered|already registered/i.test(original))){
    // A conta existente nunca é sobrescrita e a senha não é alterada.
    mode='signin';
    document.querySelectorAll('[data-auth-mode]').forEach(b=>{const selected=b.dataset.authMode==='signin';b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected))});
    confirm.hidden=true;confirm.querySelector('input').required=false;
    passwordRow.hidden=false;passwordRow.querySelector('input').required=true;
    form.querySelector('[name=password]').setAttribute('autocomplete','current-password');
    forgot.hidden=false;submit.textContent='Entrar no painel';
    msg.textContent='Este e-mail já possui cadastro. Entre com sua senha ou toque em “Esqueci minha senha” para recuperar o acesso.';
  }else if(/invalid login credentials/i.test(original)){
    msg.textContent='E-mail ou senha incorretos. Confira os dados ou toque em “Esqueci minha senha”.';
  }else if(/email not confirmed/i.test(original)){
    msg.textContent='Seu e-mail ainda não foi confirmado. Verifique a caixa de entrada e o spam.';
  }else{
    msg.textContent=original||'Não foi possível autenticar. Tente novamente.';
  }
 }finally{submit.disabled=false}
});
// A abertura da janela de acesso é controlada pelo script da landing.

// Revocation/consent changes from the landing page are mirrored to the private record.
window.addEventListener('xrmovi:analytics-consent-changed',async()=>{
 if(!client)return;
 try{const {data}=await client.auth.getSession();if(data?.session)await window.XrmoviAnalytics?.syncPurchaseIdentity?.(client)}catch(_error){}
});
