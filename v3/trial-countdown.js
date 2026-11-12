// Show a server-sourced trial countdown. Never use browser time to AUTHORIZE access.
export function setupTrialCountdown({onExpire}){
 const banner=document.createElement('aside');
 banner.id='xrmovi-trial-clock';
 banner.setAttribute('role','status');
 banner.setAttribute('aria-live','off');
 banner.hidden=true;
 banner.style.cssText='position:fixed;z-index:70;top:78px;right:16px;max-width:min(365px,calc(100vw - 32px));border-radius:12px;border:1px solid #50cba4;background:#113c48;color:#ebffff;box-shadow:0 15px 40px #0006;padding:12px 16px;font:650 13px/1.5 system-ui;';
 document.body.append(banner);
 let timer=null,remainingAtSync=0,monotonicStart=0,fired=false;
 function stop(){if(timer){clearInterval(timer);timer=null;}banner.hidden=true;remainingAtSync=0;fired=false}
 function tick(){
  const left=Math.max(0,remainingAtSync-(performance.now()-monotonicStart));
  const seconds=Math.ceil(left/1000);
  const hours=Math.floor(seconds/3600),mins=Math.floor(seconds%3600/60),secs=seconds%60;
  banner.textContent='⏳ Teste gratuito termina em '+[hours,mins,secs].map(x=>String(x).padStart(2,'0')).join(':');
  if(left<=0&&!fired){fired=true;void onExpire?.()}
 }
 function sync(state){
  if(!(state?.status==='trial'&&state.allowed===true&&state.trial_end)){stop();return}
  const when=Date.parse(String(state.trial_end)),server=Date.parse(String(state.server_now||''));
  if(!Number.isFinite(when)){stop();return}
  if(timer)clearInterval(timer);
  remainingAtSync=when-(Number.isFinite(server)?server:Date.now());
  monotonicStart=performance.now();fired=false;banner.hidden=false;tick();
  timer=setInterval(tick,1000);
 }
 return {sync,stop};
}
