(function(){'use strict';
const style=document.createElement('style');style.textContent=`
#xrm-install-trigger{position:fixed;right:max(15px,env(safe-area-inset-right));top:max(16px,env(safe-area-inset-top));bottom:auto;z-index:2147483000;border:1px solid #52e0b8;background:#103a45;color:white;border-radius:40px;padding:11px 17px;font:700 13px system-ui;box-shadow:0 5px 24px #0008;cursor:pointer}
@media(max-width:600px){#xrm-install-trigger{right:max(9px,env(safe-area-inset-right));top:max(8px,env(safe-area-inset-top));padding:9px 12px;font-size:12px}}
#xrm-install-overlay{position:fixed;inset:0;z-index:2147483001;background:#000a;display:none;align-items:center;justify-content:center;padding:16px}
#xrm-install-overlay.open{display:flex}
#xrm-install-dialog{max-width:420px;width:100%;max-height:calc(100dvh - 32px);overflow-y:auto;background:#0d2839;color:#f0fbff;border:1px solid #3d6875;border-radius:18px;padding:24px;font:14px/1.55 system-ui;box-shadow:0 20px 70px #0009}
#xrm-install-dialog h2{font-size:22px;margin:0 0 12px}
#xrm-install-dialog p{margin:9px 0;color:#c1d9e3}
#xrm-install-dialog button{border:0;border-radius:10px;padding:11px 16px;font-weight:700;cursor:pointer}
#xrm-install-primary{background:#54e0b7;color:#062c30}
#xrm-install-close{background:#28485b;color:white}
#xrm-install-dialog .actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
`;document.head.append(style);
let deferred=null,lastTrigger=null,oldOverflow='';
const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
const android=/Android/i.test(navigator.userAgent);
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
if(standalone)return;
const triggers=Array.from(document.querySelectorAll('[data-xrm-install]'));
if(!triggers.length)return;
const overlay=document.createElement('div');overlay.id='xrm-install-overlay';
overlay.innerHTML='<div id="xrm-install-dialog" role="dialog" aria-modal="true" aria-labelledby="xrm-install-title"><h2 id="xrm-install-title">Instalar XRMOVI</h2><p id="xrm-install-instructions"></p><div class="actions"><button id="xrm-install-primary" type="button">Instalar aplicativo</button><button id="xrm-install-close" type="button">Fechar</button></div></div>';
document.body.append(overlay);
const instructions=overlay.querySelector('#xrm-install-instructions'),primary=overlay.querySelector('#xrm-install-primary');
function open(trigger){
 lastTrigger=trigger||document.activeElement;
 oldOverflow=document.body.style.overflow;
 document.body.style.overflow='hidden';
 overlay.classList.add('open');
 if(isiOS){
 instructions.textContent='No iPhone ou iPad, abra este site no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início” (ou “Adicionar à Tela de Início” no menu de opções). Depois confirme em Adicionar. A instalação não passa pela App Store.';
 primary.textContent='Entendi';primary.onclick=close;
 }else if(android){
 instructions.textContent=deferred?'No Android, toque em “Instalar aplicativo” para adicionar o XRMOVI à tela inicial. Não é necessário usar a Play Store.':'No Android, abra o menu ⋮ do Chrome e escolha “Instalar app” ou “Adicionar à tela inicial”. Não é necessário usar a Play Store.';
 primary.textContent=deferred?'Instalar aplicativo':'Entendi';
 primary.onclick=async()=>{if(!deferred){close();return}const p=deferred;deferred=null;close();await p.prompt();await p.userChoice};
 }else{
 instructions.textContent='Em navegadores compatíveis, use o menu do navegador e escolha “Instalar XRMOVI” ou “Instalar aplicativo”. No iPhone, use Safari > Compartilhar > Adicionar à Tela de Início.';
 primary.textContent=deferred?'Instalar aplicativo':'Entendi';
 primary.onclick=async()=>{if(!deferred){close();return}const p=deferred;deferred=null;close();await p.prompt();await p.userChoice};
 }
 primary.focus({preventScroll:true});
}
function close(){
 if(!overlay.classList.contains('open'))return;
 overlay.classList.remove('open');
 document.body.style.overflow=oldOverflow;
 if(lastTrigger&&lastTrigger.isConnected)lastTrigger.focus({preventScroll:true});
}
triggers.forEach(trigger=>{trigger.addEventListener('click',e=>{e.preventDefault();open(trigger)})});overlay.querySelector('#xrm-install-close').onclick=close;
overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
document.addEventListener('keydown',e=>{
 if(!overlay.classList.contains('open'))return;
 if(e.key==='Escape'){e.preventDefault();close();return}
 if(e.key!=='Tab')return;
 const focusables=[...overlay.querySelectorAll('button:not([disabled])')].filter(node=>node.getClientRects().length);
 if(!focusables.length)return;
 const first=focusables[0],last=focusables[focusables.length-1];
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e});
window.addEventListener('appinstalled',()=>{triggers.forEach(trigger=>trigger.remove());close()});
if('serviceWorker'in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(e=>console.warn('PWA indisponível',e)));
})();