/* XRMOVI: Google Analytics 4. Consentimento explícito nas áreas pública e autenticada. */
(function(){
'use strict';
var GA_ID='G-1Z1PSN1SJD',KEY='xrmovi_ga4_consent_v1';
var allowed={xrmovi_view_plans:1,xrmovi_contact:1,xrmovi_signup_start:1,xrmovi_demo_open:1,xrmovi_demo_complete:1,sign_up:1};
var status=null,loaded=false,box,notice;

var ATTR_KEY='xrmovi_campaign_first_touch_v1',ATTR_AGE=30*24*60*60*1000;
var INTERNAL_KEY='xrmovi_ga4_internal_admin_v1',INTERNAL_TTL=14*24*60*60*1000;
// Internal classification is a local reporting preference, never an authorization credential.
// The flag is written only after the authenticated platform_admin RPC succeeds.
function isInternal(){
 try{
  var flag=JSON.parse(localStorage.getItem(INTERNAL_KEY)||'null');
  if(flag&&flag.role==='platform_admin'&&Number(flag.until)>Date.now())return true;
  if(flag)localStorage.removeItem(INTERNAL_KEY);
 }catch(e){}
 return false;
}
function setInternal(value){
 try{
  if(value)localStorage.setItem(INTERNAL_KEY,JSON.stringify({role:'platform_admin',until:Date.now()+INTERNAL_TTL}));
  else localStorage.removeItem(INTERNAL_KEY);
 }catch(e){}
 if(value&&loaded){consent(false);clearAnalyticsCookies();}
}
function safeCampaignValue(v,max){
  if(typeof v!=='string')return '';
  var s=v.trim().slice(0,max);
  return /[@/?#\r\n<>]/.test(s)?'':s;
}
function captureCampaign(){
 if(status!=='accepted'||isInternal())return;
 try{
  var old=JSON.parse(localStorage.getItem(ATTR_KEY)||'null');
  if(old&&Date.now()-Number(old.time)<ATTR_AGE&&old.source)return;
  var q=new URLSearchParams(location.search);
  var source=safeCampaignValue(q.get('utm_source'),80);
  var medium=safeCampaignValue(q.get('utm_medium'),80);
  var campaign=safeCampaignValue(q.get('utm_campaign'),120);
  var paidClick=q.has('gclid')||q.has('gbraid')||q.has('wbraid');
  if(!source&&!medium&&!campaign&&!paidClick)return;
  localStorage.setItem(ATTR_KEY,JSON.stringify({source:source||(paidClick?'google':'direto'),medium:medium||(paidClick?'cpc':'none'),campaign:campaign||(paidClick?'google_ads_sem_utm':'sem campanha'),time:Date.now()}));
 }catch(e){}
}
async function syncAttribution(client){
 if(status!=='accepted'||isInternal()||!client||typeof client.rpc!=='function')return false;
 try{
  var saved=JSON.parse(localStorage.getItem(ATTR_KEY)||'null');
  var active=saved&&Date.now()-Number(saved.time)<ATTR_AGE&&saved.source?saved:
    {source:'direto',medium:'none',campaign:'sem campanha'};
  var result=await client.rpc('xrmovi_marketing_attribution_record',{
    p_source:active.source,p_medium:active.medium,p_campaign:active.campaign
  });
  if(result.error)return false;
  localStorage.removeItem(ATTR_KEY);
  return true;
 }catch(e){return false}
}


const CLIENT_PATTERN=/^[0-9]{1,14}\.[0-9]{1,14}$/;
function idFromCookie(){
 try{
  const part=document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('_ga='));
  if(!part)return null;
  const match=decodeURIComponent(part.slice(4)).match(/^GA\d+\.\d+\.([0-9]{1,14}\.[0-9]{1,14})$/);
  return match?match[1]:null;
 }catch(_){return null;}
}
function ga4Get(key,ms){
 return new Promise(resolve=>{
  if(typeof window.gtag!=='function'){resolve(null);return;}
  let done=false;const stop=setTimeout(()=>{if(!done){done=true;resolve(null)}},ms);
  try{window.gtag('get',GA_ID,key,value=>{
   if(!done){done=true;clearTimeout(stop);resolve(value);}
  });}catch(_){clearTimeout(stop);if(!done){done=true;resolve(null)}}
 });
}
async function syncPurchaseIdentity(client){
 if(isInternal()||!client||typeof client.rpc!=='function'||(status!=='accepted'&&status!=='denied'))return false;
 try{
  const session=await client.auth.getSession();
  if(!session?.data?.session)return false;
  if(status==='denied'){
   const {error}=await client.rpc('xrmovi_ga4_consent_update',{
    p_consent:false,p_client_id:null,p_session_id:null});
   return !error;
  }
  const measured=await ga4Get('client_id',1200);
  const id=CLIENT_PATTERN.test(String(measured||''))?String(measured):idFromCookie();
  if(!id)return false; // No consented GA cookie/id; never invent a visitor.
  const sessionId=String(await ga4Get('session_id',500)||'');
  const {data,error}=await client.rpc('xrmovi_ga4_consent_update',{
   p_consent:true,p_client_id:id,p_session_id:/^[0-9]{6,20}$/.test(sessionId)?sessionId:null
  });
  return !error&&data===true;
 }catch(_){return false}
}

function page(){
 // Preserve only advertising tags needed for GA4 campaign attribution, not arbitrary
 // query strings (which could contain tokens, email addresses or other PII).
 const u=new URL(location.origin+location.pathname);
 const source=new URLSearchParams(location.search);
 for(const key of ['utm_source','utm_medium','utm_campaign','utm_id','utm_term','utm_content','gclid','gbraid','wbraid']){
  const value=source.get(key);
  if(value&&value.length<=200&&!/[@<>\r\n]/.test(value))u.searchParams.set(key,value);
 }
 return u.href;
}
function consent(value){
 if(typeof window.gtag==='function')window.gtag('consent','update',{
 analytics_storage:value?'granted':'denied',
 ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
}
function startTag(){
 if(loaded||isInternal())return;
 loaded=true;
 window.dataLayer=window.dataLayer||[];
 window.gtag=function(){window.dataLayer.push(arguments);};
 window.gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 consent(true);
 window.gtag('js',new Date());
 window.gtag('config',GA_ID,{page_location:page(),page_title:document.title,send_page_view:true,allow_google_signals:false,allow_ad_personalization_signals:false});
 var script=document.createElement('script');
 script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA_ID);
 script.async=true;document.head.appendChild(script);
}
function clearAnalyticsCookies(){
 var names=document.cookie.split(';').map(function(x){return x.split('=')[0].trim();}).filter(function(x){return /^_ga(?:_|$)/.test(x);});
 var hosts=[location.hostname,'.'+location.hostname];
 var parts=location.hostname.split('.');if(parts.length>=3)hosts.push('.'+parts.slice(-3).join('.'));
 names.forEach(function(name){
   hosts.forEach(function(domain){document.cookie=encodeURIComponent(name)+'=; Max-Age=0; path=/; domain='+domain+'; SameSite=Lax';});
   document.cookie=encodeURIComponent(name)+'=; Max-Age=0; path=/; SameSite=Lax';
 });
}
function save(value){
 status=value;
 try{localStorage.setItem(KEY,value);if(value==='accepted')localStorage.setItem('xrmovi_monitor_count_consent_v1','yes');else localStorage.removeItem('xrmovi_monitor_count_consent_v1');}catch(e){}
 if(value==='accepted'){captureCampaign();startTag();}
 else {try{localStorage.removeItem(ATTR_KEY)}catch(e){}if(loaded){consent(false);clearAnalyticsCookies();}}
 box.hidden=true;
 if(notice)notice.textContent=isInternal()?'Acessos administrativos excluídos da medição.':value==='accepted'?'Medição analítica ativada.':'Medição analítica desativada.';
 window.dispatchEvent(new CustomEvent('xrmovi:analytics-consent-changed',{detail:{consent:value}}));
}
function track(name,data){
 if(status!=='accepted'||isInternal()||!loaded||!allowed[name]||typeof window.gtag!=='function')return;
 data=data||{};
 var args={page_location:page()};
 if(typeof data.plan==='string'&&['start','pro','business','advanced','enterprise'].indexOf(data.plan)>=0)args.plan=data.plan;
 if(typeof data.location==='string'&&['landing','seo','navigation','hero','plans','footer','preview','registration','qr_demo'].indexOf(data.location)>=0)args.click_location=data.location;
 if(name==='sign_up')args.method='email';
 window.gtag('event',name,args);
}
window.XrmoviAnalytics=Object.freeze({track:track,syncAttribution:syncAttribution,syncPurchaseIdentity:syncPurchaseIdentity,getConsent:function(){return status;},isInternal:isInternal,setInternal:setInternal});
function element(tag,text,cls){
 var n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;
}
function banner(){
 var style=document.createElement('style');
 style.textContent='#xrm-ga4-consent[hidden]{display:none!important}#xrm-ga4-consent{position:fixed;left:14px;bottom:14px;z-index:2147483600;width:min(500px,calc(100vw - 28px));padding:18px 20px;background:#0d2a39;color:#e7f9fa;border:1px solid #5b9a98;border-radius:15px;box-shadow:0 18px 60px #0009;font:13px/1.5 system-ui,Segoe UI,sans-serif}#xrm-ga4-consent h2{font:800 17px/1.3 system-ui,Segoe UI,sans-serif;letter-spacing:0;margin:0 0 8px;color:#f0feff}#xrm-ga4-consent p{font:13px/1.5 system-ui,Segoe UI,sans-serif;margin:0 0 14px;color:#c2dbe3}#xrm-ga4-consent .ga4-buttons{display:flex;gap:8px;flex-wrap:wrap}#xrm-ga4-consent button{cursor:pointer;border-radius:9px;padding:10px 15px;font:800 12px system-ui,Segoe UI,sans-serif;background:#6ae4ba;color:#06332d;border:1px solid #6ae4ba}#xrm-ga4-consent .ga4-deny{background:transparent;color:#e6f5fc;border-color:#668b9a}#xrm-ga4-settings{background:transparent;border:0;color:#8ee7c6;text-decoration:underline;cursor:pointer;font:12px system-ui,Segoe UI,sans-serif;padding:5px}#xrm-ga4-live{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}@media(max-width:600px){#xrm-ga4-consent{left:10px;bottom:10px;width:calc(100vw - 20px);padding:15px}#xrm-ga4-consent .ga4-buttons button{flex:1}}';
 document.head.appendChild(style);
 box=element('section');box.id='xrm-ga4-consent';box.hidden=true;box.setAttribute('role','dialog');box.setAttribute('aria-label','Preferências de privacidade');
 box.appendChild(element('h2','Podemos medir as visitas ao XRMOVI?'));
 box.appendChild(element('p','Com sua autorização, usamos Google Analytics e uma contagem interna com identificador aleatório diário para medir visitas, pessoas online, cliques e compras aprovadas. Não registramos IP, e-mail, senha ou dados dos veículos nessa contagem. Você pode recusar ou alterar sua escolha depois.'));
 var actions=element('div',null,'ga4-buttons'),yes=element('button','Aceitar análise'),no=element('button','Recusar','ga4-deny');
 yes.type=no.type='button';yes.addEventListener('click',function(){save('accepted');});no.addEventListener('click',function(){save('denied');});
 actions.appendChild(yes);actions.appendChild(no);box.appendChild(actions);document.body.appendChild(box);
 notice=element('div');notice.id='xrm-ga4-live';notice.setAttribute('aria-live','polite');document.body.appendChild(notice);
 var settings=element('button','Preferências de privacidade');settings.id='xrm-ga4-settings';settings.type='button';settings.addEventListener('click',function(){box.hidden=false;yes.focus({preventScroll:true});});
 (document.querySelector('footer .shell')||document.querySelector('footer')||document.body).appendChild(settings);
}
function instrument(){
 document.addEventListener('click',function(e){
  if(!e.target||!e.target.closest)return;
  if(e.target.closest('[data-auth-mode="signup"]')){track('xrmovi_signup_start',{location:'registration'});return;}
  if(e.target.closest('[data-demo]')){track('xrmovi_demo_open',{location:'preview'});return;}
  var a=e.target.closest('a[href]');if(!a)return;
  var u;try{u=new URL(a.href,location.href);}catch(err){return;}
  var inQrDemo=Boolean(a.closest('#demo-qr'));
  if(u.origin===location.origin&&u.hash==='#demo-qr'){track('xrmovi_demo_open',{location:'qr_demo'});return;}
  var planContainer=a.closest('.plan'),planLabel=(planContainer&&planContainer.querySelector('h2,h3')||{}).textContent||'';
  planLabel=planLabel.toLowerCase();
  var plan=['start','pro','business','advanced','enterprise'].find(function(x){return planLabel.indexOf(x)>=0;})||'';
  if(u.hostname==='wa.me'||u.hostname==='api.whatsapp.com'){track('xrmovi_contact',{location:inQrDemo?'qr_demo':plan?'plans':'landing',plan:plan});return;}
  if(u.origin===location.origin&&u.hash==='#planos')track('xrmovi_view_plans',{location:inQrDemo?'qr_demo':location.pathname==='/'?'landing':'seo'});
 },true);
}
function init(){
 banner();instrument();
 try{var saved=localStorage.getItem(KEY);status=saved==='accepted'||saved==='denied'?saved:null;}catch(err){status=null;}
 if(status==='accepted'){captureCampaign();startTag();}
 else if(!status&&!isInternal())box.hidden=false;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
