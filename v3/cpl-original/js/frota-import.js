(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./frota-core.js'));
  else root.FleetImport = factory(root.FleetCore);
}(typeof window !== 'undefined' ? window : globalThis, function (core) {
  'use strict';
  const aliases = {
    item:['item'],empresa:['empresa solicitante','empresa'],gerencia:['gerencia'],
    placa_identificador:['placa','identificacao','placa identificador','identificador'],modelo:['modelo'],
    numero_ptran:['numero ptran','n ptran','ptran'],data_recebimento:['data recebimento solicitacao','data recebimento da solicitacao','data recebimento'],
    data_solicitacao:['solicitacao','data solicitacao'],numero_isc:['numero isc','n isc','isc'],status:['status','status ptran'],
    responsavel_cpl:['cpl responsavel','responsavel cpl','responsavel','cpl'],observacao:['observacao','observacoes','obsevacao']
  };
  const headerKey = value => core.norm(value).replace(/[^a-z0-9]+/g,' ').trim();
  function normalizedStatus(value) {
    const key = core.norm(value);
    const translations = {pronta:'Pronto',pronto:'Pronto',aprovada:'Aprovado',aprovado:'Aprovado',cancelada:'Cancelado',cancelado:'Cancelado',provisoria:'Provisório',provisorio:'Provisório',vencida:'Vencido',vencido:'Vencido'};
    return translations[key] || core.PTRAN_STATUSES.find(s=>core.norm(s) === key) || String(value ?? '').trim();
  }
  function parseDate(value,options = {}) {
    if (value == null || value === '') return {value:null};
    let iso = null;
    if (value instanceof Date && Number.isFinite(value.valueOf())) iso = value.toISOString().slice(0,10);
    else if (typeof value === 'number') {
      // Excel serial 60 is fictitious 29/02/1900; leave all pre-1980 dates for review.
      const decoded = options.XLSX?.SSF?.parse_date_code(value,{date1904:Boolean(options.date1904)});
      if (decoded) iso = [decoded.y,String(decoded.m).padStart(2,'0'),String(decoded.d).padStart(2,'0')].join('-');
      else if (Number.isFinite(value) && value > 0 && value < 2958466) {
        const epoch = options.date1904 ? Date.UTC(1904,0,1) : Date.UTC(1899,11,30);
        iso = new Date(epoch + Math.floor(value)*86400000).toISOString().slice(0,10);
      }
    } else {
      const str = String(value).trim();
      if (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(str)) iso = str.slice(0,10);
      else { const m = str.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) iso = [m[3],m[2].padStart(2,'0'),m[1].padStart(2,'0')].join('-'); }
    }
    if (!core.dateISO(iso) || Number(iso.slice(0,4)) < 1980) return {value:null,issue:'Data inválida ou anômala: ' + String(value instanceof Date && Number.isFinite(value.valueOf()) ? value.toISOString() : value)};
    return {value:iso};
  }
  function fromRows(matrix,options = {}) {
    let headerRow = -1, mapping = {};
    for (let row = 0; row < Math.min(50,matrix.length); row++) {
      const candidate = {};
      (matrix[row] || []).forEach((value,index)=>{
        const semantic = Object.keys(aliases).find(k=>aliases[k].includes(headerKey(value)));
        if (semantic) { if (candidate[semantic] !== undefined) throw new Error('Cabeçalho duplicado: ' + semantic); candidate[semantic] = index; }
      });
      if (candidate.placa_identificador !== undefined && candidate.modelo !== undefined && candidate.status !== undefined) { headerRow = row; mapping = candidate; break; }
    }
    if (headerRow < 0) throw new Error('Cabeçalhos de identificação, modelo e status não encontrados na Planilha1.');
    const rows = [], allIssues = [], duplicateMap = new Map(), iscMap = new Map(); let ignored = 0;
    function issue(row,type,message,field,severity='warning') {
      const item = {row_number:row.row_number,type,message,field,severity}; row.issues.push(item); allIssues.push(item);
    }
    for (let index = headerRow+1; index < matrix.length; index++) {
      const source = matrix[index] || [];
      if (!source.some(value=>value != null && String(value).trim() !== '')) { ignored++; continue; }
      const get = key => mapping[key] === undefined ? '' : source[mapping[key]] ?? '';
      const text = key => String(get(key)).trim();
      const asset = {placa_identificador:text('placa_identificador'),modelo:text('modelo'),empresa:text('empresa'),gerencia:text('gerencia'),responsavel_cpl:text('responsavel_cpl'),observacao_atual:text('observacao'),categoria:core.suggestCategory(text('modelo'))};
      const ptran = {numero_ptran:text('numero_ptran'),numero_isc:text('numero_isc'),status:normalizedStatus(get('status')),observacao:text('observacao'),responsavel:text('responsavel_cpl')};
      // Do not derive contract membership, availability, issue date or expiry from
      // PRONTA/ATIVA/CANCELAR. Original cells and human review stay attached to the batch.
      const row = {row_number:index+1,raw:{cells:source.map(v=>v instanceof Date ? v.toISOString() : v),headers:matrix[headerRow],original_status:get('status'),source_item:get('item')},asset,ptran,issues:[],reviewed:false};
      ['data_recebimento','data_solicitacao'].forEach(field=>{ const d=parseDate(get(field),options); ptran[field]=d.value; if(d.issue)issue(row,'data',d.issue,field,'error'); });
      if (!asset.modelo && !asset.placa_identificador) issue(row,'identificação','Modelo e identificação ausentes','modelo','error');
      else if (!asset.placa_identificador) issue(row,'identificação','Equipamento sem identificação: confirme cadastro distinto','placa_identificador','error');
      if (!asset.responsavel_cpl) issue(row,'responsável','Responsável CPL ausente','responsavel_cpl');
      if (!ptran.numero_ptran) issue(row,'PTRAN','PTRAN sem número','numero_ptran');
      if (!core.PTRAN_STATUSES.includes(ptran.status)) issue(row,'status','Status desconhecido preservado: ' + (ptran.status || 'vazio'),'status','error');
      if (/cancelar/i.test(asset.observacao_atual)) issue(row,'conflito','Observação CANCELAR requer decisão humana; ativo não será inativado','observacao_atual','error');
      if (core.norm(ptran.status)==='cancelado' && /ativa/i.test(asset.observacao_atual)) issue(row,'conflito','PTRAN cancelado com observação ATIVA; confirmar entidades distintas','status','error');
      if (/provis[oó]ria?|provis[oó]rio/i.test(asset.observacao_atual)) issue(row,'provisório','Observação cita PTRAN provisória; flag e status dependem de revisão','observacao_atual');
      const key=core.identifierKey(asset.placa_identificador);
      if (key) { const group=duplicateMap.get(key)||[]; group.push(row); duplicateMap.set(key,group); }
      const iscKey=core.identifierKey(ptran.numero_isc);
      if (iscKey) { const group=iscMap.get(iscKey)||[]; group.push(row); iscMap.set(iscKey,group); }
      rows.push(row);
    }
    duplicateMap.forEach(group=>{ if(group.length>1)group.forEach(row=>issue(row,'duplicidade','Identificação repetida nas linhas ' + group.map(r=>r.row_number).join(', ') + '. Não consolidar automaticamente.','placa_identificador','error')); });
    iscMap.forEach(group=>{ if(group.length>1)group.forEach(row=>issue(row,'conflito','ISC repetido nas linhas ' + group.map(r=>r.row_number).join(', '),'numero_isc','error')); });
    rows.forEach(row=>{ row.raw.issues=row.issues.map(i=>({...i})); });
    return {rows,issues:allIssues,ignored,header_row:headerRow+1,headers:mapping};
  }
  async function read(file) {
    if (!/\.(xlsx|xlsm|xlsb)$/i.test(file.name)) throw new Error('Selecione um arquivo .xlsx, .xlsm ou .xlsb.');
    if (file.size > 25*1024*1024) throw new Error('O arquivo excede o limite de 25 MB para importação.');
    const workbook = window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
    const sheet=workbook.Sheets.Planilha1;
    if (!sheet) throw new Error('A aba Planilha1 não foi encontrada.');
    const matrix=window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:true,blankrows:true});
    if(matrix.length>2002)throw new Error('Importação limitada a 2.000 registros por lote. Divida o arquivo.');
    return {...fromRows(matrix,{XLSX:window.XLSX,date1904:workbook.Workbook?.WBProps?.date1904}),file_name:file.name};
  }
  function compare(parsed,assets) {
    const summary={found:parsed.rows.length,new_assets:0,existing_assets:0,new_ptrans:0,changes:0,inconsistencies:0,ignored:parsed.ignored||0};
    const rows=parsed.rows.map(source=>{
      const row=JSON.parse(JSON.stringify(source)); row.changes=[]; row.decision='new'; row.asset_id=null; row.expected_updated_at=null;
      const matches=assets.filter(a=>core.identifierKey(a.placa_identificador) && core.identifierKey(a.placa_identificador) === core.identifierKey(row.asset.placa_identificador));
      const ambiguous=row.issues.some(i=>i.type==='duplicidade');
      if(matches.length===1 && !ambiguous && core.norm(matches[0].modelo)===core.norm(row.asset.modelo)) {
        const asset=matches[0]; row.asset_id=asset.id; row.expected_updated_at=asset.updated_at; row.decision='update';
        // Classification is only suggested for new assets. Preserve manually assigned
        // categories and all blank Excel fields on updates; never silently clear values.
        delete row.asset.categoria;
        Object.keys(row.asset).forEach(field=>{
          if(row.asset[field] !== '' && row.asset[field] != null && String(asset[field]??'').trim() !== String(row.asset[field]).trim()) row.changes.push({field,before:asset[field]??'',after:row.asset[field]});
        });
        const matching=core.currentRecords(asset.ptrans||[]).find(p=>row.ptran.numero_ptran ? String(p.numero_ptran)===row.ptran.numero_ptran : row.ptran.numero_isc && core.norm(p.numero_isc)===core.norm(row.ptran.numero_isc));
        if(matching) {
          row.ptran.supersedes_id=matching.id;
          Object.keys(row.ptran).filter(f=>f!=='supersedes_id').forEach(field=>{
            if(row.ptran[field] !== '' && row.ptran[field] != null && String(matching[field]??'') !== String(row.ptran[field]))row.changes.push({field:'PTRAN.'+field,before:matching[field]??'',after:row.ptran[field]});
          });
          if(!row.changes.some(c=>c.field.startsWith('PTRAN.')))row.ptran=null;
        } else summary.new_ptrans++;
        summary.existing_assets++;
      } else {
        summary.new_assets++; summary.new_ptrans++;
        if(matches.length)row.issues.push({type:'correspondência',field:'placa_identificador',severity:'error',row_number:row.row_number,message:'Há ' + matches.length + ' cadastro(s) no banco com este identificador. Escolha o vínculo ou um ativo distinto.'});
      }
      row.raw.issues=row.issues; summary.changes+=row.changes.length;
      return row;
    });
    summary.inconsistencies=rows.filter(r=>r.issues.length).length;
    return {rows,summary,issues:rows.flatMap(r=>r.issues),ignored:parsed.ignored||0};
  }
  return {read,fromRows,compare,parseDate,normalizedStatus,aliases};
}));
