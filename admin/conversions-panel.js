// XRMOVI: painel gerencial de conversões verificadas pelo backend.
export function renderConversionsPanel(root, data, ga4 = null) {
  root.replaceChildren();
  const el=(tag,text='',className='')=>{
    const node=document.createElement(tag);
    node.textContent=String(text??'');
    if(className)node.className=className;
    return node;
  };
  if(data?.scope!=='classified_external_only'){
    const warning=document.createElement('p');
    warning.className='conversion-note';
    warning.textContent='Não foi possível validar a classificação comercial. Nenhum dado financeiro será exibido como venda externa.';
    root.append(warning);
    return;
  }
  const n=v=>Number(v||0).toLocaleString('pt-BR');
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const header=el('section','','panel');
  const headerRow=el('div','','panel-head');
  headerRow.append(el('h2','Clientes externos verificados — últimos 30 dias'),
                   el('small','Pagamento confirmado e classificação explícita da conta'));
  header.append(headerRow);
  // Only audited external classifications contribute to KPIs and campaigns.
  // The pre-existing financial ledger is retained as a separate reconciliation note.
  const historicalNote=el('p','Apuração comercial restrita a contas explicitamente classificadas como Cliente externo. Pagamentos de homologação, internos, do proprietário e de contas a classificar permanecem no histórico financeiro, mas não são considerados vendas externas.','conversion-note');
  header.append(historicalNote);
  const metrics=el('div','','conversion-metrics');
  const kpis=[
    ['Contas externas cadastradas',n(data.accounts_created),'Classificadas externamente, criadas nos últimos 30 dias'],
    ['Checkouts de contas externas',n(data.checkout_attempts),'Inclui cartão e Pix ainda pendentes, não são vendas'],
    ['Contas externas com pagamento',n(data.paying_customers),'Contas externas classificadas com pagamento confirmado'],
    ['Recebimentos de contas externas',money(data.confirmed_revenue),'Somente pagamentos confirmados de contas externas']
  ];
  for(const [label,value,note] of kpis){
    const metric=el('div','','conversion-metric');
    metric.append(el('span',label),el('strong',value),el('small',note));
    metrics.append(metric);
  }
  header.append(metrics);
  const foot=el('div','','conversion-note');
  foot.textContent=n(data.confirmed_payments)+' pagamento(s) de contas externas classificado(s) e confirmado(s) no período. '+
    n(data.active_verified_customers)+' conta(s) externa(s) atualmente ativa(s) com pagamento verificado. '+
    'Liberações manuais, testes grátis e checkouts abertos não são vendas.';
  header.append(foot);
  const pending=el('p',n(data.unclassified_accounts)+' conta(s) aguardando revisão comercial. '+n(data.excluded_payments)+' pagamento(s) do histórico de 30 dias fora da apuração externa.','conversion-note');
  header.append(pending);
  const rawAudit=el('p','Auditoria do histórico bruto: '+n(data.historical_payments)+' pagamento(s) confirmado(s), total '+money(data.historical_revenue)+'. São registros contábeis, NÃO novas vendas do XRMOVI.','conversion-note');
  header.append(rawAudit);
  root.append(header);
  const panel=el('section','','panel');
  const panelHead=el('div','','panel-head');
  panelHead.append(el('h2','Origem dos clientes externos classificados'),el('small','UTMs registradas com consentimento; não confirmam atribuição Google Ads'));
  panel.append(panelHead);
  const wrap=el('div','','table-wrap'),table=el('table'),thead=el('thead'),tr=el('tr');
  for(const name of ['Origem','Meio','Campanha','Contas externas','Contas externas pagantes','Receita externa confirmada']){
    tr.append(el('th',name));
  }
  thead.append(tr);
  const body=el('tbody');
  for(const row of (Array.isArray(data.campaigns)?data.campaigns:[])){
    const item=el('tr');
    for(const value of [row.source,row.medium,row.campaign,n(row.signups),n(row.paying_customers),money(row.revenue)]){
      item.append(el('td',value));
    }
    body.append(item);
  }
  if(!body.children.length){
    const empty=el('td','Nenhuma campanha de cliente externo classificado neste período.');empty.colSpan=6;
    const item=el('tr');item.append(empty);body.append(item);
  }
  table.append(thead,body);wrap.append(table);panel.append(wrap);
  const note=el('p','Os parâmetros UTM são vinculados à conta somente após o usuário aceitar a análise e fazer login. A categoria “não atribuído” inclui cadastros anteriores a este controle e pessoas sem consentimento. Tráfego do Google Analytics não é tratado como venda.','','');
  note.className='conversion-note';
  panel.append(note);root.append(panel);
  if(ga4){
    const audit=el('section','','panel');
    const bar=el('div','','panel-head');
    bar.append(el('h2','Google Analytics — compras confirmadas'),
      el('small','Envio servidor, sem registrar tentativas como compras'));
    audit.append(bar);
    const kpis=el('div','','conversion-metrics');
    for(const [label,value] of [
      ['Consentimentos válidos',n(ga4.consented_clients)],
      ['Eventos enviados',n(ga4.sent)],
      ['Fila de envio',n(ga4.pending)],
      ['Falhas de entrega',n(ga4.failed)]
    ]){
      const block=el('div','','conversion-metric');
      block.append(el('span',label),el('strong',value));kpis.append(block);
    }
    audit.append(kpis);
    audit.append(el('p','A transmissão HTTP bem-sucedida não comprova, sozinha, que a compra apareceu no GA4 ou foi atribuída ao Google Ads. O evento padrão é purchase, e a conversão correspondente precisa ser importada e validada no Google Ads. O contador de eventos GA4 pode incluir compras históricas de homologação; não representa apenas clientes externos.','conversion-note'));
    root.append(audit);
  }
}
