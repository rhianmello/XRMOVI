/* XRMOVI: relatório somente leitura, autorizado pelo servidor. */
const names={dashboard:'Visão Geral',assets:'Veículos',mileage:'KM e troca de óleo',maintenance:'Manutenção',drivers:'Motoristas',documents:'Documentos',alerts:'Alertas',history:'Histórico',fuel:'Abastecimentos',fines:'Multas',financial:'Relatórios',subscription:'Minha assinatura',account:'Conta e mensagens'};
const el=(tag,value='',cls='')=>{const n=document.createElement(tag);n.textContent=String(value??'');if(cls)n.className=cls;return n};
const number=v=>Number(v||0).toLocaleString('pt-BR');
const when=d=>d?new Date(d).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
const date=d=>d?new Date(d+'T12:00:00-03:00').toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
const duration=s=>{const m=Math.floor(Number(s||0)/60);return m>=60?Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'min':m>0?m+' min':Number(s)>0?'< 1 min':'0 min'};
const css=`
#xrm-access-dialog{width:min(1030px,calc(100vw - 20px));max-height:92dvh;overflow:auto;padding:0;background:#fff;color:#18364a;border:1px solid #c9dbe6;border-radius:16px;box-shadow:0 24px 70px #00182788;font-family:inherit}
#xrm-access-dialog::backdrop{background:#071827b8}
.xrm-access-top{position:sticky;top:0;background:#fff;z-index:1;padding:16px 19px;border-bottom:1px solid #d8e5ec;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.xrm-access-top h2{font-size:18px;margin:0}.xrm-access-top p{font-size:12px;color:#5e7582;overflow-wrap:anywhere;margin:4px 0 0}
.xrm-access-buttons{display:flex;gap:8px}.xrm-access-buttons button{border:1px solid #b9d0dd;background:#eef5fa;color:#174a65;border-radius:8px;padding:8px 10px;cursor:pointer;font:inherit}
.xrm-access-main{padding:17px 19px;display:grid;gap:17px}
.xrm-access-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
.xrm-access-box{border:1px solid #d9e4eb;border-radius:11px;padding:12px;min-width:0}
.xrm-access-box small{display:block;font-size:11px;color:#577080}.xrm-access-box strong{display:block;margin-top:5px;font-size:18px;color:#153e56;overflow-wrap:anywhere}.xrm-access-box span{display:block;font-size:10px;color:#6f8290}
.xrm-access-note,.xrm-access-empty{font-size:12px;color:#667f8e;line-height:1.55;margin:0}
.xrm-access-section{min-width:0}.xrm-access-section h3{font-size:14px;margin:0 0 10px}
.xrm-access-scroll{overflow-x:auto;border:1px solid #dbe6ed;border-radius:10px}
.xrm-access-scroll table{width:100%;min-width:420px;border-collapse:collapse;font-size:12px}
.xrm-access-scroll th,.xrm-access-scroll td{padding:10px;border-bottom:1px solid #e7eef3;text-align:left}
.xrm-access-scroll th{background:#f0f6fa;color:#405e71}
@media(max-width:700px){.xrm-access-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.xrm-access-main{padding:12px}}
@media(max-width:400px){.xrm-access-cards{grid-template-columns:1fr}}
`;
function stat(label,value,note=''){
 const n=el('div','','xrm-access-box');n.append(el('small',label),el('strong',value));
 if(note)n.append(el('span',note));return n;
}
function table(title,columns,rows){
 const sec=el('section','','xrm-access-section');sec.append(el('h3',title));
 if(!rows.length){sec.append(el('p','Nenhum registro disponível.','xrm-access-empty'));return sec}
 const sc=el('div','','xrm-access-scroll'),t=el('table'),head=el('thead'),hdr=el('tr');
 columns.forEach(h=>hdr.append(el('th',h)));head.append(hdr);t.append(head);
 const body=el('tbody');for(const row of rows){const tr=el('tr');row.forEach(v=>tr.append(el('td',v)));body.append(tr)}
 t.append(body);sc.append(t);sec.append(sc);return sec;
}
export function openAccessHistory({email,fetchHistory}){
 if(!document.getElementById('xrm-access-css')){const s=document.createElement('style');s.id='xrm-access-css';s.textContent=css;document.head.append(s)}
 document.getElementById('xrm-access-dialog')?.close();
 const dialog=el('dialog');dialog.id='xrm-access-dialog';
 const head=el('div','','xrm-access-top'),heading=el('div');
 heading.append(el('h2','Histórico de acessos'),el('p',email));
 const actions=el('div','','xrm-access-buttons'),refresh=el('button','Atualizar'),close=el('button','Fechar');
 refresh.type='button';close.type='button';close.onclick=()=>dialog.close();actions.append(refresh,close);head.append(heading,actions);
 const body=el('div','','xrm-access-main');dialog.append(head,body);document.body.append(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 let loading=false;
 async function load(){
  if(loading)return;loading=true;refresh.disabled=true;
  body.replaceChildren(el('p','Consultando os registros protegidos no servidor…','xrm-access-empty'));
  try{
   const d=await fetchHistory();
   const cards=el('div','','xrm-access-cards');
   cards.append(stat('Sessões de autenticação disponíveis',number(d.auth_session_count),'Não equivalem necessariamente a visitas'),
     stat('Aberturas de módulos (90 dias)',number(d.page_views)),
     stat('Tempo ativo estimado (90 dias)',duration(d.active_seconds)),
     stat('Sessões de navegação (90 dias)',number(d.tracked_session_count)));
   const others=el('div','','xrm-access-cards');
   others.append(stat('Último login',when(d.last_sign_in_at)),
     stat('Última atividade',when(d.last_seen_at)),
     stat('Veículos cadastrados',number(d.vehicles_count),d.first_vehicle_at?'Primeiro em '+when(d.first_vehicle_at):'Nenhum cadastrado'));
   body.replaceChildren(cards,others,
    el('p','Histórico de módulos disponível somente após a ativação desta função. O tempo é estimado pela atividade com página visível, não um cronômetro. Não coletamos IP, senhas ou conteúdo. Os registros de navegação expiram após 90 dias.','xrm-access-note'),
    table('Módulos utilizados',['Módulo','Aberturas','Tempo','Última atividade'],(d.modules||[]).map(m=>[names[m.module]||m.module,number(m.views),duration(m.active_seconds),when(m.last_seen_at)])),
    table('Atividade por dia',['Data','Módulo','Aberturas','Tempo'],(d.daily||[]).map(m=>[date(m.day),names[m.module]||m.module,number(m.views),duration(m.active_seconds)])),
    table('Sessões autenticadas ainda registradas pelo Supabase',['Início','Última atualização'],(d.auth_sessions||[]).map(m=>[when(m.created_at),when(m.updated_at)]))
   );
  }catch(e){body.replaceChildren(el('p','Falha ao consultar histórico: '+e.message,'xrm-access-empty'))}
  finally{loading=false;refresh.disabled=false}
 }
 refresh.onclick=()=>void load();void load();
}
