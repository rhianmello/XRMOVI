// Painel SEO do XRMOVI: somente exibição de dados autorizados do Supabase.
// Nenhuma chave do Search Console/Windsor é enviada ao navegador.
const doc=document;
const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=String(text);return n};
const moneyless=v=>Number(v).toLocaleString('pt-BR');
const dec=(v,n=2)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:n,maximumFractionDigits:n});
const shortDate=v=>{if(!v)return 'Não conferida';const s=String(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):s};
const namedStatus={indexed:'Indexada',pending:'Aguardando indexação',issue:'Requer atenção',unknown:'Não verificada'};
const sourceName={search_console_screenshot:'Print do Search Console',manual_owner:'Atualização manual'};
const searchConsole='https://search.google.com/search-console?resource_id=https%3A%2F%2Ffrota.nospassa.com.br%2F';
const site='https://frota.nospassa.com.br';
const limitedPath=x=>typeof x==='string'&&/^\/[a-z0-9\-/]*$/.test(x)?x:'/';
function appendText(parent,tag,value,cls){const a=el(tag,value,cls);parent.append(a);return a}
function link(parent,label,url){const a=appendText(parent,'a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a}
function div(cls){return el('div',undefined,cls)}
function summaryStat(parent,name,number,detail){const c=div('seo-stat');appendText(c,'span',name);appendText(c,'strong',number);appendText(c,'small',detail);parent.append(c)}
function card(title){const c=div('seo-card');appendText(c,'h3',title);return c}
function metricValue(s,metric){if(!s||!Number(s.days_with_data))return '—';const x=s[metric];if(x===undefined||x===null)return '—';return metric==='ctr'?dec(x)+'%':metric==='avg_position'?dec(x,1):moneyless(x)}
function renderBars(target,daily,period){target.replaceChildren();const dates=(daily||[]).filter(d=>{const parsed=Date.parse(d.date);return Number.isFinite(parsed)&&parsed>=Date.now()-(period===7?8:29)*86400000});if(!dates.length){appendText(target,'div','Sem métricas diárias disponíveis ainda. O Google pode demorar a disponibilizar os dados.','seo-empty');return}
 const max=Math.max(1,...dates.map(x=>Number(x.impressions)||0));const graph=div('seo-chart');
 for(const d of dates){const col=div('seo-chart-col');const holder=div('seo-chart-bar-holder');const bar=div('seo-chart-bar');bar.style.height=Math.max(2,Math.round(100*(Number(d.impressions)||0)/max))+'%';bar.title=shortDate(d.date)+': '+moneyless(d.impressions||0)+' impressões · '+moneyless(d.clicks||0)+' cliques';holder.append(bar);col.append(holder);const label=appendText(col,'small',shortDate(d.date).slice(0,5),'seo-chart-label');graph.append(col)}
 target.append(graph);
}
function renderPageRows(parent,pages,update){
 parent.replaceChildren();if(!pages?.length){appendText(parent,'p','Nenhuma página cadastrada para acompanhamento.','seo-empty');return}
 for(const p of pages){const row=div('seo-page-item');const name=div();const title=appendText(name,'strong',p.title||p.path||'Página');const anchor=link(name,p.path||'/',site+limitedPath(p.path));anchor.className='seo-muted';anchor.style.cssText='font-size:11px;overflow-wrap:anywhere';row.append(name);
 const s=div();appendText(s,'span',namedStatus[p.status]||'Não verificada','seo-status '+(namedStatus[p.status]?p.status:'unknown'));row.append(s);
 const details=div();appendText(details,'small','Conferência: '+shortDate(p.checked_on));appendText(details,'small',sourceName[p.provenance]||'Fonte informada');if(p.eligible===true)appendText(details,'small','Teste de indexação: aprovado');row.append(details);
 const b=appendText(row,'button','Atualizar situação');b.type='button';b.title='Atualização manual após consultar o Google Search Console';b.onclick=async()=>{
  const input=prompt('Confirme primeiro no Search Console. Qual é a situação de '+(p.title||p.path)+'?\n1 = Indexada\n2 = Detectada, não indexada\n3 = Problema de indexação\n4 = Não verificada',p.status==='indexed'?'1':p.status==='pending'?'2':p.status==='issue'?'3':'4');
  if(input===null)return;
  const map={'1':'indexed','2':'pending','3':'issue','4':'unknown'};const next=map[input.trim()];
  if(!next){alert('Opção inválida. Use 1, 2, 3 ou 4.');return}
  const note=prompt('Observação opcional sobre sua conferência (até 350 caracteres):',p.notes||'');if(note===null)return;
  if(note.length>350){alert('Observação muito longa.');return}
  if(!confirm('Salvar '+(namedStatus[next]||next)+' para '+p.path+'? Isto não consulta o Google automaticamente.'))return;
  b.disabled=true;try{await update({p_path:p.path,p_status:next,p_eligible:next==='indexed'||(next==='pending'&&p.eligible===true),p_note:note});}catch(err){alert('Não foi possível atualizar: '+(err.message||err))}finally{b.disabled=false}
 };
 parent.append(row)}
}
function renderQueries(target,queries){
 target.replaceChildren();if(!queries?.length){appendText(target,'p','As pesquisas que geraram impressões aparecerão aqui quando houver dados do Search Console.','seo-empty');return}
 const wrap=div('seo-top-queries'),table=el('table'),head=el('thead'),tr=el('tr');
 for(const t of ['Pesquisa','Impressões','Cliques','Posição'])appendText(tr,'th',t);head.append(tr);table.append(head);
 const body=el('tbody');
 for(const q of queries.slice(0,12)){const row=el('tr');appendText(row,'td',q.query||'—');appendText(row,'td',moneyless(q.impressions||0));appendText(row,'td',moneyless(q.clicks||0));appendText(row,'td',q.position===null||q.position===undefined?'—':dec(q.position,1));body.append(row)}
 table.append(body);wrap.append(table);target.append(wrap);
}
export function renderSeoPanel(root,data,actions={}){
 root.replaceChildren();
 if(!data||typeof data!=='object'){appendText(root,'p','Não foi possível obter o relatório de SEO.','seo-empty');return}
 const head=div('seo-intro'),info=div();appendText(info,'h2','SEO · Visibilidade no Google');appendText(info,'p','Propriedade: '+(data.property||site+'/'));head.append(info);
 const external=div('seo-links');link(external,'Abrir Search Console',searchConsole);link(external,'Abrir páginas SEO',site+'/gestao-de-frotas/');head.append(external);root.append(head);
 const noData=!Number(data.last_28_days?.days_with_data);
 const sync=div('seo-disclaimer');
 if(noData)sync.textContent='O Search Console ainda não enviou métricas para o painel. “—” significa indisponível, não zero visitantes.';
 else sync.textContent='Dados agregados do Search Console via Windsor.ai; métricas podem ter atraso de publicação e não representam visitas de outras origens.';
 root.append(sync);
 const periodBar=div('seo-card-head'),periodTitle=appendText(periodBar,'h3','Desempenho orgânico');
 const controls=div('seo-controls'),a=appendText(controls,'button','7 dias'),b=appendText(controls,'button','28 dias');a.type=b.type='button';periodBar.append(controls);root.append(periodBar);
 const summary=div('seo-summary');root.append(summary);
 const two=div('seo-grid');const chartCard=card('Impressões por dia'),chartHost=div();chartCard.append(chartHost);
 const sourceCard=card('Atualização dos dados'),msg=div('seo-muted'),when=div('seo-muted'),footer=appendText(sourceCard,'p','Origem: Google Search Console → Windsor.ai → Supabase. O botão Atualizar recarrega os registros salvos; não força uma nova coleta no Google.','seo-footnote');
 const reload=appendText(sourceCard,'button','Recarregar métricas','btn');reload.style.marginTop='12px';reload.type='button';reload.onclick=()=>{if(actions.refresh)void actions.refresh()};
 sourceCard.insertBefore(msg,footer);sourceCard.insertBefore(when,footer);
 const state=data.sync||{},checked=state.last_checked_at?'Última tentativa: '+new Date(state.last_checked_at).toLocaleString('pt-BR'):'Primeira sincronização ainda pendente';
 msg.textContent=state.status==='ok'?'Dados recebidos da fonte.':state.status==='error'?'Última coleta apresentou erro.':state.status==='no_data'?'Conexão disponível, sem registros de pesquisa.':'Aguardando primeiro registro de desempenho.';
 when.textContent=checked;
 two.append(chartCard,sourceCard);root.append(two);
 const setPeriod=period=>{const s=period===7?data.last_7_days:data.last_28_days;a.setAttribute('aria-pressed',String(period===7));b.setAttribute('aria-pressed',String(period===28));summary.replaceChildren();
 const desc=period+' dias · pesquisas do Google';summaryStat(summary,'Cliques',metricValue(s,'clicks'),desc);summaryStat(summary,'Impressões',metricValue(s,'impressions'),desc);summaryStat(summary,'CTR média',metricValue(s,'ctr'),'Cliques ÷ impressões');summaryStat(summary,'Posição média',metricValue(s,'avg_position'),'Média ponderada por impressões');renderBars(chartHost,data.daily,period)};
 a.onclick=()=>setPeriod(7);b.onclick=()=>setPeriod(28);setPeriod(28);
 const pageCard=card('Situação das páginas no Google');appendText(pageCard,'p','Última conferência registrada. O status abaixo não se atualiza automaticamente: use o Search Console antes de marcar uma página como indexada.','seo-footnote');
 const pages=div('seo-page-list');pages.style.marginTop='14px';pageCard.append(pages);renderPageRows(pages,data.pages,async payload=>{if(!actions.update)throw Error('Atualização indisponível');await actions.update(payload)});root.append(pageCard);
 const queryCard=card('Principais pesquisas no Google');renderQueries(queryCard,data.queries);root.append(queryCard);
 appendText(root,'p','Fonte de indexação: inspeções registradas no Google Search Console; fonte de desempenho: Search Analytics, quando disponível. Nenhum dado de tráfego é estimado.','seo-footnote');
}
