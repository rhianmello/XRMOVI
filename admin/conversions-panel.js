// XRMOVI: painel gerencial de conversões verificadas pelo backend.
export function renderConversionsPanel(root, data, ga4 = null) {
  root.replaceChildren();
  const el=(tag,text='',className='')=>{
    const node=document.createElement(tag);
    node.textContent=String(text??'');
    if(className)node.className=className;
    return node;
  };
  const n=v=>Number(v||0).toLocaleString('pt-BR');
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const header=el('section','','panel');
  const headerRow=el('div','','panel-head');
  headerRow.append(el('h2','Funil comercial — últimos 30 dias'),
                   el('small','Somente pagamentos confirmados pelo servidor'));
  header.append(headerRow);
  // The aggregate RPC still includes legacy test accounts. Explicitly disclose this,
  // rather than presenting historical payments as production sales.
  const historicalNote=el('p','Histórico geral do banco: inclui contas e pagamentos de teste. Estes números não devem ser interpretados como vendas reais da nova operação. A separação definitiva será feita na apuração do servidor.','conversion-note');
  header.append(historicalNote);
  const metrics=el('div','','conversion-metrics');
  const kpis=[
    ['Contas criadas',n(data.accounts_created),'Não equivale a assinantes'],
    ['Tentativas de checkout',n(data.checkout_attempts),'Inclui cartão e Pix ainda pendentes'],
    ['Clientes que pagaram',n(data.paying_customers),'Contas distintas com pagamento aprovado'],
    ['Valor recebido',money(data.confirmed_revenue),'Somente pagamentos confirmados']
  ];
  for(const [label,value,note] of kpis){
    const metric=el('div','','conversion-metric');
    metric.append(el('span',label),el('strong',value),el('small',note));
    metrics.append(metric);
  }
  header.append(metrics);
  const foot=el('div','','conversion-note');
  foot.textContent=n(data.confirmed_payments)+' pagamento(s) confirmado(s) no período. '+
    n(data.active_verified_customers)+' cliente(s) atualmente ativo(s) com pagamento verificado. '+
    'Liberações manuais, testes grátis e checkouts abertos não são vendas.';
  header.append(foot);
  root.append(header);
  const panel=el('section','','panel');
  const panelHead=el('div','','panel-head');
  panelHead.append(el('h2','Origem dos clientes e vendas'),el('small','Atribuição inicial mediante consentimento'));
  panel.append(panelHead);
  const wrap=el('div','','table-wrap'),table=el('table'),thead=el('thead'),tr=el('tr');
  for(const name of ['Origem','Meio','Campanha','Cadastros','Clientes pagantes','Receita confirmada']){
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
    const empty=el('td','Nenhuma campanha registrada neste período.');empty.colSpan=6;
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
    audit.append(el('p','A transmissão HTTP bem-sucedida não comprova, sozinha, que a compra apareceu no GA4 ou foi atribuída ao Google Ads. O evento padrão é purchase, e a conversão correspondente precisa ser importada e validada no Google Ads.','conversion-note'));
    root.append(audit);
  }
}
