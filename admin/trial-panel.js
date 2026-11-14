// Painel de testes reais: somente dados entregues pela RPC autenticada do administrador.
// Não trata clique em anúncio, tentativa de cadastro ou checkout como teste iniciado/venda.
export function renderTrialPanel(root, payload, {refresh} = {}) {
  root.replaceChildren();
  const make=(tag,text='',className='')=>{
    const element=document.createElement(tag);
    element.textContent=String(text??'');
    if(className)element.className=className;
    return element;
  };
  if(payload?.scope!=='admin_trial_report'||!Array.isArray(payload.entries)){
    root.append(make('p','Não foi possível verificar o relatório de testes no servidor.','empty'));
    return;
  }
  const entries=payload.entries;
  const now=Number.isFinite(Date.parse(payload.server_now))?Date.parse(payload.server_now):Date.now();
  const fmt=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
  const datetime=value=>value&&Number.isFinite(Date.parse(value))?fmt.format(new Date(value)):'—';
  const n=value=>Number(value||0).toLocaleString('pt-BR');
  const isInternal=row=>row.owner_admin===true||['internal','homologation'].includes(row.classification);
  const isCurrent=row=>row.billing_status==='trial'&&Date.parse(row.expires_at)>now&&!row.paid_confirmed;
  const isConfirmed=row=>row.paid_confirmed===true;
  const sourceText=row=>{
    switch(row.channel){
      case 'anuncio': return 'Anúncio pago (CPC)';
      case 'direto': return 'Acesso direto';
      case 'organico': return 'Busca orgânica';
      case 'referencia': return 'Outra origem';
      default: return 'Não atribuída';
    }
  };
  const stateText=row=>isConfirmed(row)?'Pagamento registrado':isCurrent(row)?'Em teste':'Teste encerrado';
  const stateClass=row=>isConfirmed(row)?'paid':isCurrent(row)?'running':'ended';
  const baseClass=row=>row.owner_admin?'Administrador':row.classification==='external'?'Cliente externo':row.classification==='internal'?'Interno':row.classification==='homologation'?'Homologação':'A classificar';

  const heading=make('section','','panel trial-panel');
  const bar=make('div','','panel-head trial-panel-header');
  const titles=make('div');
  titles.append(make('h2','Teste gratuito de 24 horas'),make('small','Cadastros que realmente iniciaram o teste no servidor · horário de Brasília'));
  const update=make('button','Atualizar agora','btn ghost');update.type='button';
  update.addEventListener('click',()=>refresh?.());
  bar.append(titles,update);heading.append(bar);
  const intro=make('p','O painel diferencia teste iniciado de clique, simples cadastro ou venda. Origem de anúncio só aparece quando há atribuição gravada com consentimento; ausência de origem não significa visita direta.','trial-note');
  heading.append(intro);
  const controls=make('div','','trial-controls');
  const period=make('select');period.setAttribute('aria-label','Período dos testes');
  for(const [value,text] of [['24','Últimas 24 horas'],['168','Últimos 7 dias'],['720','Últimos 30 dias'],['2160','Últimos 90 dias']]){
    const option=make('option',text);option.value=value;if(value==='720')option.selected=true;period.append(option);
  }
  const channel=make('select');channel.setAttribute('aria-label','Filtrar por origem');
  for(const [value,text] of [['all','Todas as origens'],['anuncio','Anúncios'],['direto','Direto'],['organico','Busca orgânica'],['referencia','Outras origens'],['nao_atribuido','Não atribuída']]){
    const option=make('option',text);option.value=value;channel.append(option);
  }
  const state=make('select');state.setAttribute('aria-label','Filtrar situação dos testes');
  for(const [value,text] of [['all','Todos os estados'],['running','Em teste'],['ended','Encerrados'],['paid','Com pagamento']]){
    const option=make('option',text);option.value=value;state.append(option);
  }
  const search=make('input');search.type='search';search.placeholder='Buscar cliente, e-mail ou empresa';search.setAttribute('aria-label','Buscar pessoa ou empresa');
  const label=make('label','','trial-internal-label'),internal=make('input');internal.type='checkbox';internal.checked=false;label.append(internal,make('span','Incluir internos e homologação'));
  controls.append(period,channel,state,search,label);heading.append(controls);

  const metrics=make('div','','trial-metrics');
  const kpis=[
    ['Iniciados','started','Testes iniciados no período'],
    ['Em andamento','running','Prazo de 24h ainda válido'],
    ['Via anúncios','ads','UTM ou clique pago identificado'],
    ['Acesso direto','direct','Origem direta com consentimento'],
    ['Encerrados','ended','Sem pagamento confirmado'],
    ['Com pagamento','paid','Pagamento no registro financeiro']
  ];
  const nodes={};
  for(const [title,key,help] of kpis){
    const metric=make('div','','trial-metric');
    const value=make('strong','—');nodes[key]=value;
    metric.append(make('span',title),value,make('small',help));metrics.append(metric);
  }
  heading.append(metrics);
  const tableWrap=make('div','','table-wrap');
  const table=make('table');table.className='trial-table';
  const thead=make('thead'),header=make('tr');
  for(const title of ['Cliente / empresa','Origem / campanha','Teste iniciado','Prazo final','Situação','Último login','Classificação']){
    header.append(make('th',title));
  }
  thead.append(header);
  const tbody=make('tbody');table.append(thead,tbody);tableWrap.append(table);heading.append(tableWrap);
  const count=make('p','','trial-note');heading.append(count);
  root.append(heading);

  const audit=make('section','','panel trial-panel');
  const auditHead=make('div','','panel-head');auditHead.append(make('h2','Como interpretar a origem'));audit.append(auditHead);
  audit.append(make('p','Anúncios: source/medium registrados como CPC ou publicidade paga; não é prova isolada de um clique faturado pelo Google Ads. Direto: atribuição explícita “direto / none”. Não atribuída: sem consentimento, cadastro antigo ou dados insuficientes. O último login não confirma que a pessoa está online. Testes e pagamentos de homologação não entram no resumo por padrão.','trial-note'));
  root.append(audit);

  function paint(){
    const hours=Number(period.value);
    const cutoff=now-hours*3600000;
    const text=search.value.trim().toLocaleLowerCase('pt-BR');
    const filtered=entries.filter(row=>
      (internal.checked||!isInternal(row)) &&
      Number.isFinite(Date.parse(row.started_at)) &&
      Date.parse(row.started_at)>=cutoff &&
      (channel.value==='all'||row.channel===channel.value) &&
      (state.value==='all'||stateClass(row)===state.value) &&
      (!text||[row.email,row.companies,row.source,row.campaign].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(text)))
    );
    // KPIs da seleção atual: nunca contam clique ou conta sem trial_started_at.
    nodes.started.textContent=n(filtered.length);
    nodes.running.textContent=n(filtered.filter(isCurrent).length);
    nodes.ads.textContent=n(filtered.filter(row=>row.channel==='anuncio').length);
    nodes.direct.textContent=n(filtered.filter(row=>row.channel==='direto').length);
    nodes.ended.textContent=n(filtered.filter(row=>stateClass(row)==='ended').length);
    nodes.paid.textContent=n(filtered.filter(isConfirmed).length);
    tbody.replaceChildren();
    for(const row of filtered){
      const tr=make('tr'),who=make('td');
      who.append(make('strong',row.email||'Sem e-mail'),make('small',row.companies||'—','trial-sub'));
      tr.append(who);
      const from=make('td');from.append(make('strong',sourceText(row)));
      if(row.source||row.medium||row.campaign)from.append(make('small',[row.source,row.medium,row.campaign].filter(Boolean).join(' · '),'trial-sub'));
      tr.append(from);
      tr.append(make('td',datetime(row.started_at)),make('td',datetime(row.expires_at)));
      const s=make('td'),pill=make('span',stateText(row),'trial-status '+stateClass(row));s.append(pill);tr.append(s);
      tr.append(make('td',datetime(row.last_login_at)));
      tr.append(make('td',baseClass(row)));
      tbody.append(tr);
    }
    if(!filtered.length){
      const tr=make('tr'),td=make('td','Nenhum teste iniciado corresponde aos filtros. Isso não significa ausência de cliques ou visitas.');td.colSpan=7;tr.append(td);tbody.append(tr);
    }
    count.textContent=n(filtered.length)+' registro(s) · Última consulta ao servidor: '+datetime(payload.server_now)+'. Histórico disponível: últimos '+n(payload.history_days||90)+' dias. Atualização automática quando esta aba estiver aberta.';
  }
  for(const input of [period,channel,state,internal])input.addEventListener('change',paint);
  search.addEventListener('input',paint);
  paint();
}
