(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FleetCore = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const identifierKey = value => norm(value).replace(/[^a-z0-9]/g, '');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  function dateISO(value) {
    if (!value) return null;
    const text = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const date = new Date(text + 'T12:00:00Z');
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === text ? text : null;
  }
  function daysUntil(value, today = todayISO()) {
    const date = dateISO(value), base = dateISO(today);
    return date && base ? Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(base + 'T12:00:00Z')) / 86400000) : null;
  }
  function formatDate(value, withTime = false) {
    if (!value) return '—';
    if (!dateISO(String(value).slice(0,10))) return 'Data inválida';
    const date = new Date(String(value).length === 10 ? value + 'T12:00:00Z' : value);
    if (!Number.isFinite(date.valueOf())) return 'Data inválida';
    return new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric', ...(withTime ? {hour:'2-digit',minute:'2-digit'} : {})}).format(date);
  }
  function currentRecords(records = []) {
    const replaced = new Set(records.map(r => r.supersedes_id).filter(Boolean));
    return records.filter(r => !replaced.has(r.id) && !r.deleted_at);
  }
  function newest(records = []) {
    return [...currentRecords(records)].sort((a,b) => String(b.created_at || b.data_emissao || b.data_inspecao || b.data_execucao || '').localeCompare(String(a.created_at || a.data_emissao || a.data_inspecao || a.data_execucao || '')))[0] || null;
  }
  function latestByType(records = [], key) {
    const groups = new Map();
    currentRecords(records).forEach(r => {
      const type = norm(r[key] || 'outros');
      const value = groups.get(type);
      const date = r.data_inspecao || r.data_execucao || r.emissao || r.created_at || '';
      const previous = value && (value.data_inspecao || value.data_execucao || value.emissao || value.created_at || '');
      if (!value || String(date) >= String(previous)) groups.set(type, r);
    });
    return [...groups.values()];
  }
  const PTRAN_STATUSES = ['Não solicitado','Em preparação','Solicitado','Em análise','Pendente','Aprovado','Pronto','Provisório','Cancelado','Vencido'];
  const CATEGORIES = ['Veículo leve','Utilitário','Caminhonete','Caminhão','Ônibus','Máquina / equipamento','Escavadeira','Retroescavadeira','Motoniveladora','Bomba de concreto','Outros'];
  function suggestCategory(model) {
    const m = norm(model);
    const rules = [['Retroescavadeira',/retroescavadeira/],['Motoniveladora',/motoniveladora/],['Escavadeira',/escavadeira/],['Bomba de concreto',/bomba.*concreto/],['Ônibus',/onibus|micro ?onibus/],['Caminhão',/caminhao|truck|basculante/],['Caminhonete',/frontier|hilux|ranger|s10|l200|amarok/],['Utilitário',/saveiro|strada|fiorino|ducato|van/],['Veículo leve',/hb20|argo|mobi|cronos|onix|gol|polo|corolla|logan|kwid/]];
    return rules.find(([,regex]) => regex.test(m))?.[0] || 'Outros';
  }
  // Regras conservadoras: dados ausentes nunca comprovam regularidade. Só as versões
  // atuais e a renovação mais recente de cada tipo geram vencimentos; histórico antigo
  // não torna o ativo crítico depois de uma renovação. Atenção: prazo <=30 dias.
  // Crítico: vencido, resultado reprovado, km/horas atingidos ou indisponibilidade.
  // Fora do contrato/inativo tem prioridade cinza. PTRAN cancelado isolado é cinza.
  function situation(asset, today = todayISO()) {
    const alerts = [], reasons = [];
    const p = newest(asset.ptrans || []), operational = norm(asset.status_operacional);
    if (asset.ativo_no_contrato === false || asset.deleted_at || operational === 'fora do contrato' || operational === 'inativo' || (p && norm(p.status) === 'cancelado')) {
      return {tone:'gray',label:'Inativo',reasons:[asset.ativo_no_contrato === false ? 'Fora do contrato' : p && norm(p.status) === 'cancelado' ? 'PTRAN cancelado' : 'Ativo inativo'],alerts:[]};
    }
    function add(tone, type, message, validity = null, record = null) {
      reasons.push(message); alerts.push({tone,severity:tone === 'red' ? 'critical':'attention',type,message,asset_id:asset.id,validade:validity,days:daysUntil(validity,today),record_id:record?.id || null});
    }
    function expiry(record, type, field) {
      const value = record[field];
      const days = daysUntil(value,today);
      if (value && days === null) add('yellow',type, type + ': data inválida',null,record);
      else if (days !== null && days < 0) add('red',type,type + ' vencido',value,record);
      else if (days !== null && days <= 30) add('yellow',type,type + ' vence em ' + days + ' dia(s)',value,record);
    }
    if (['indisponivel','em manutencao'].includes(operational)) add('red','operacional','Ativo ' + operational);
    if (asset.ativo_no_contrato !== true) add('yellow','contrato','Permanência no contrato não confirmada');
    if (!operational) add('yellow','operacional','Situação operacional não informada');
    else if (!['disponivel','em operacao','reserva','indisponivel','em manutencao'].includes(operational)) add('yellow','operacional','Situação operacional desconhecida: ' + asset.status_operacional);
    if (!p) add('yellow','PTRAN','PTRAN não cadastrado');
    else {
      const status = norm(p.status);
      if (status === 'vencido') add('red','PTRAN','PTRAN vencido',p.data_validade,p);
      else expiry(p,'PTRAN','data_validade');
      if (!p.numero_ptran) add('yellow','PTRAN','PTRAN sem número',null,p);
      if (!['aprovado','pronto','provisorio'].includes(status) && status !== 'vencido') add('yellow','PTRAN','PTRAN: ' + (p.status || 'status não informado'),null,p);
      if (!p.data_validade) add('yellow','PTRAN','Validade do PTRAN não informada',null,p);
      if (p.provisoria || status === 'provisorio') add('yellow','PTRAN','PTRAN provisório',p.data_validade,p);
    }
    latestByType(asset.inspections || [],'tipo_inspecao').forEach(r => {
      expiry(r,'Inspeção','validade'); expiry(r,'Inspeção','proxima_inspecao');
      if (norm(r.status) === 'vencido') add('red','Inspeção','Inspeção vencida',r.validade,r);
      if (norm(r.status) === 'reprovado' || norm(r.resultado) === 'reprovado') add('red','Inspeção','Inspeção reprovada',null,r);
    });
    latestByType(asset.documents || [],'tipo_documento').forEach(r => { expiry(r,'Documento','validade'); if (norm(r.status) === 'vencido') add('red','Documento','Documento vencido',r.validade,r); });
    latestByType(asset.maintenance || [],'categoria').forEach(r => {
      if (!coreCanceled(r.status)) {
        expiry(r,'Revisão','proxima_revisao_data');
        if (norm(r.status) === 'vencido') add('red','Revisão','Revisão vencida',r.proxima_revisao_data,r);
        [['quilometragem','proxima_revisao_km','km'],['horimetro','proxima_revisao_horas','horas']].forEach(([field,due,label]) => {
          if (asset[field] != null && r[due] != null && Number(asset[field]) >= Number(r[due])) add('red','Revisão','Revisão atingiu ' + r[due] + ' ' + label,null,r);
        });
      }
    });
    if (!asset.responsavel_cpl) add('yellow','qualidade','Responsável CPL não informado');
    const tone = alerts.some(a => a.tone === 'red') ? 'red' : alerts.length ? 'yellow' : 'green';
    return {tone,label:{red:'Crítico',yellow:'Atenção',green:'Regular'}[tone],reasons,alerts};
  }
  function quality(assets = []) {
    const issues = [], identifiers = new Map();
    const push = (asset,type,message) => issues.push({asset_id:asset.id,type,message,severity:'warning'});
    assets.forEach(a => {
      const key = identifierKey(a.placa_identificador);
      if (key) { const list = identifiers.get(key) || []; list.push(a); identifiers.set(key,list); }
      else push(a,'identificação','Identificação não informada');
      if (!a.responsavel_cpl) push(a,'responsável','Responsável CPL ausente');
      if (a.status_operacional && !['disponivel','em operacao','reserva','indisponivel','em manutencao','fora do contrato','inativo'].includes(norm(a.status_operacional))) push(a,'operacional','Situação operacional desconhecida: ' + a.status_operacional);
      const p = newest(a.ptrans || []);
      if (p) {
        if (!p.numero_ptran) push(a,'PTRAN','PTRAN sem número');
        if (!PTRAN_STATUSES.some(s => norm(s) === norm(p.status))) push(a,'status','Status PTRAN desconhecido: ' + (p.status || 'vazio'));
        ['data_recebimento','data_solicitacao','data_emissao','data_validade'].forEach(f => { if (p[f] && (!dateISO(p[f]) || Number(String(p[f]).slice(0,4)) < 1980)) push(a,'data','Data PTRAN requer revisão: ' + f); });
      }
      const raw = a.raw_import?.source || a.raw_import || {};
      if (raw.issues?.length) raw.issues.forEach(i => push(a,i.type || 'importação',i.message || String(i)));
      if (/cancelar/i.test(a.observacao_atual || '')) push(a,'conflito','Observação solicita CANCELAR; confirmar situação');
    });
    identifiers.forEach(list => { if (list.length > 1) list.forEach(a => push(a,'duplicidade','Identificador compartilhado por ' + list.length + ' ativos: ' + a.placa_identificador)); });
    return issues;
  }
  function filterAssets(assets, filters = {}) {
    return assets.filter(a => {
      const p = newest(a.ptrans || []), s = situation(a);
      const search = norm(filters.search);
      const searchText = norm([a.placa_identificador,a.asset_code,a.modelo,a.categoria,a.empresa,a.gerencia,a.responsavel_cpl,...(a.ptrans || []).flatMap(r => [r.numero_ptran,r.numero_isc])].join(' '));
      if (search && !searchText.includes(search)) return false;
      if (filters.situation && filters.situation !== s.tone && filters.situation !== s.label) return false;
      for (const key of ['tipo','categoria','responsavel_cpl','gerencia','empresa','status_operacional']) if (filters[key] && norm(a[key]) !== norm(filters[key])) return false;
      for (const key of ['placa_identificador','modelo']) if (filters[key] && !norm(a[key]).includes(norm(filters[key]))) return false;
      if (filters.ptran_status && norm(p?.status) !== norm(filters.ptran_status)) return false;
      if (filters.only_pending && !['yellow','red'].includes(s.tone)) return false;
      if (filters.expiry) {
        const dates = [p?.data_validade,...latestByType(a.inspections || [],'tipo_inspecao').flatMap(r=>[r.validade,r.proxima_inspecao]),...latestByType(a.documents || [],'tipo_documento').map(r=>r.validade),...latestByType(a.maintenance || [],'categoria').filter(r=>coreCanceled(r.status) === false).map(r=>r.proxima_revisao_data)].map(v=>daysUntil(v)).filter(v=>v !== null);
        if (!dates.some(d=>filters.expiry === 'expired' ? d < 0 : d >= 0 && d <= Number(filters.expiry))) return false;
      }
      return true;
    });
  }
  function coreCanceled(status) { return ['cancelado','cancelada'].includes(norm(status)); }
  function metrics(assets = [], today = todayISO()) {
    const result = {total:assets.length,active:0,unconfirmed:0,available:0,unavailable:0,ptran_valid:0,ptran_pending:0,ptran_expired:0,inspection_expired:0,inspection_due:0,maintenance_expired:0,maintenance_due:0,document_expired:0};
    assets.forEach(a=>{
      if (a.ativo_no_contrato === true) result.active++;
      else if (a.ativo_no_contrato !== false) result.unconfirmed++;
      if (a.ativo_no_contrato === false) return;
      if (a.ativo_no_contrato === true && ['disponivel','em operacao','reserva'].includes(norm(a.status_operacional))) result.available++;
      if (a.ativo_no_contrato === true && ['indisponivel','em manutencao'].includes(norm(a.status_operacional))) result.unavailable++;
      const p = newest(a.ptrans || []), d = daysUntil(p?.data_validade,today), status = norm(p?.status);
      if (p && status !== 'cancelado' && (status === 'vencido' || d !== null && d < 0)) result.ptran_expired++;
      else if (p && ['pronto','aprovado','provisorio'].includes(status) && d !== null && d >= 0 && p.numero_ptran) result.ptran_valid++;
      else if (status !== 'cancelado') result.ptran_pending++;
      const alerts = situation(a,today).alerts;
      const has = (type,tone) => alerts.some(x=>x.type === type && x.tone === tone && x.days !== null);
      if (alerts.some(x=>x.type==='Inspeção' && x.tone==='red' && /vencid/i.test(x.message))) result.inspection_expired++;
      if (has('Inspeção','yellow')) result.inspection_due++;
      if (alerts.some(x=>x.type==='Revisão' && x.tone==='red')) result.maintenance_expired++;
      if (has('Revisão','yellow')) result.maintenance_due++;
      if (alerts.some(x=>x.type==='Documento' && x.tone==='red' && /vencid/i.test(x.message))) result.document_expired++;
    });
    return result;
  }
  return {norm,identifierKey,escape,todayISO,dateISO,daysUntil,formatDate,currentRecords,newest,latestByType,situation,quality,filterAssets,metrics,suggestCategory,PTRAN_STATUSES,CATEGORIES};
}));
