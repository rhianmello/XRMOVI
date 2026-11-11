/* Dashboard guide with no Gemini/OpenAI API. Microphone recognition may use a browser vendor service. */
(() => {
  'use strict';
  let context = null;
  let view = 'dashboard';
  let active = false;
  let recognizing = false;
  let recognizer = null;
  const synthesis = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const course = window.XrmoviGuideCourse || null;
  let selectedLesson = null;
  let lastCourseId = '';
  let responseTicket = 0;
  const labels = {dashboard:'Visão Geral',assets:'Ativos / Veículos',maintenance:'Manutenção / Despesas',drivers:'Motoristas',documents:'Documentação',alerts:'Alertas',history:'Histórico',fuel:'Abastecimentos',financial:'Relatórios financeiros',subscription:'Minha assinatura'};
  const host = document.createElement('section');
  host.id = 'xrm-local-assistant';
  host.className = 'xrm-local-assistant';
  host.hidden = true;
  host.setAttribute('aria-label', 'Assistente de voz do XRMOVI');
  host.innerHTML = [
    '<button type="button" class="xrm-assistant-launch" aria-label="Abrir assistente do painel" aria-expanded="false"><span class="xrm-assistant-core" aria-hidden="true"></span></button>',
    '<div class="xrm-assistant-panel" hidden role="region" aria-label="Conversa com o assistente">',
    '<div class="xrm-assistant-header"><span><strong>XRMOVI VOZ</strong><small>Assistente local do painel · sem API</small></span><button class="xrm-assistant-close" type="button" aria-label="Fechar assistente">✕</button></div>',
    '<div class="xrm-assistant-stage"><div class="xrm-assistant-orb" aria-hidden="true"><span class="xrm-assistant-core"></span></div><p class="xrm-assistant-state" aria-live="polite">Pronto para explicar sua frota.</p><p class="xrm-assistant-caption" aria-live="polite">Abra uma conversa para ouvir seu resumo.</p></div>',
    '<div class="xrm-assistant-shortcuts"><button type="button" data-intent="resumo">Resumo da tela</button><button type="button" data-intent="o que é operacional?">Operacional?</button><button type="button" data-intent="alertas">Alertas</button><button type="button" data-intent="combustível">Combustível</button><button type="button" data-intent="manutenção">Manutenção</button></div>',
    '<div class="xrm-assistant-learning"><button class="xrm-assistant-course-toggle" type="button" aria-expanded="false">📚 Curso do XRMOVI · '+(course?.topics?.length||0)+' aulas</button><span>Aprenda cada módulo, passo a passo</span></div>',
    '<div class="xrm-assistant-content"><div class="xrm-assistant-course-list" hidden><label>Buscar uma aula<input class="xrm-assistant-course-search" type="search" placeholder="Ex.: cadastrar veículo, QR Code…" aria-label="Buscar aula do XRMOVI"></label><div class="xrm-assistant-course-results" role="list"></div></div>',
    '<div class="xrm-assistant-lesson" hidden><div class="xrm-assistant-lesson-top"><small class="xrm-assistant-lesson-counter"></small><strong class="xrm-assistant-lesson-title"></strong></div><p class="xrm-assistant-lesson-intro"></p><ol class="xrm-assistant-lesson-steps"></ol><p class="xrm-assistant-lesson-note"></p><div class="xrm-assistant-lesson-actions"><button type="button" class="xrm-assistant-lesson-open">Abrir esta tela</button><button type="button" class="xrm-assistant-lesson-hear">🔊 Ouvir aula</button><button type="button" class="xrm-assistant-lesson-prev">Anterior</button><button type="button" class="xrm-assistant-lesson-next">Próxima</button></div></div>',
    '<details class="xrm-assistant-chat-details" open><summary>Conversa <span class="xrm-assistant-chat-count">0 mensagens</span></summary><div class="xrm-assistant-history" role="log" aria-label="Histórico da conversa" aria-live="polite"></div></details></div>',
    '<form class="xrm-assistant-form"><label class="xrm-assistant-input-wrap"><span class="sr-only">Sua pergunta sobre o painel</span><input type="text" maxlength="220" autocomplete="off" placeholder="Pergunte sobre esta tela…" aria-label="Pergunte sobre esta tela" required></label><button type="submit" aria-label="Enviar pergunta" title="Enviar pergunta">➤</button><button class="xrm-assistant-mic" type="button" aria-label="Fazer pergunta por voz" title="Perguntar por voz">🎙</button></form>',
    '<details class="xrm-assistant-settings"><summary>⚙ Voz e tema</summary><div class="xrm-assistant-setting-row"><label>Velocidade<select class="xrm-assistant-rate"><option value="1">1x</option><option value="1.5">1,5x</option><option value="2" selected>2x</option><option value="2.5">2,5x</option></select></label><label>Visual<select class="xrm-assistant-theme"><option value="neural">Neural Blue</option><option value="matrix">Matrix</option><option value="purple">Cyber Purple</option><option value="minimal">Minimal</option><option value="hologram">Holographic</option></select></label></div><div class="xrm-assistant-local-controls"><button type="button" class="xrm-assistant-local-toggle">Ativar IA local (experimental)</button><small class="xrm-assistant-local-status" role="status">Desligada. Requer WebGPU e download de centenas de MB. Não é necessária para o curso.</small></div></details>',
    '<div class="xrm-assistant-foot"><button type="button" class="xrm-assistant-stop" title="Interromper fala" aria-label="Interromper resposta">■ Parar</button><button type="button" class="xrm-assistant-sound" aria-pressed="true">🔊 Voz ligada</button><span>Sem API de IA. Microfone sujeito ao serviço de voz do navegador.</span></div>',
    '</div>'
  ].join('');
  document.body.append(host);
  const query = selector => host.querySelector(selector);
  const launcher = query('.xrm-assistant-launch');
  const panel = query('.xrm-assistant-panel');
  const caption = query('.xrm-assistant-caption');
  const state = query('.xrm-assistant-state');
  const history = query('.xrm-assistant-history');
  const input = query('input');
  const mic = query('.xrm-assistant-mic');
  const sound = query('.xrm-assistant-sound');
  const catalog = query('.xrm-assistant-course-list');
  const catalogResults = query('.xrm-assistant-course-results');
  const catalogSearch = query('.xrm-assistant-course-search');
  const courseToggle = query('.xrm-assistant-course-toggle');
  const lessonPanel = query('.xrm-assistant-lesson');
  const chatDetails = query('.xrm-assistant-chat-details');
  const chatCount = query('.xrm-assistant-chat-count');

  let voiceOn = true;
  let voiceRate = 2;
  const rateInput = query('.xrm-assistant-rate');
  const themeInput = query('.xrm-assistant-theme');
  const stopButton = query('.xrm-assistant-stop');
  const modelButton=query('.xrm-assistant-local-toggle');
  const modelStatus=query('.xrm-assistant-local-status');
  window.XrmoviLocalModel?.subscribe?.(info=>{
    modelStatus.textContent=info.message;
    modelButton.textContent=info.status==='off'||info.status==='error'||info.status==='unsupported'?'Ativar IA local (experimental)':'Desligar / cancelar IA local';
  });
  modelButton.addEventListener('click',async()=>{
    if(!window.XrmoviLocalModel){modelStatus.textContent='Módulo local indisponível neste navegador.';return}
    if(window.XrmoviLocalModel.isReady()){window.XrmoviLocalModel.disable();return}
    const label=modelButton.textContent;
    if(label.startsWith('Desligar')){window.XrmoviLocalModel.disable();return}
    modelButton.textContent='Desligar / cancelar IA local';
    await window.XrmoviLocalModel.enable();
  });
  try {const saved = localStorage.getItem('xrmovi-voice-theme'); if(['neural','matrix','purple','minimal','hologram'].includes(saved))themeInput.value=saved;}catch{}
  host.dataset.theme=themeInput.value;
  rateInput.addEventListener('change',()=>{voiceRate=Number(rateInput.value)||2;});
  themeInput.addEventListener('change',()=>{host.dataset.theme=themeInput.value;try{localStorage.setItem('xrmovi-voice-theme',themeInput.value);}catch{}});
  stopButton.addEventListener('click',()=>{if(synthesis)synthesis.cancel();host.classList.remove('speaking');state.textContent='Fala interrompida.';});
  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  }
  function metric(name) {
    const label = normalize(name);
    return (context && context.kpis || []).find(item => normalize(item.label) === label)?.value || null;
  }
  function say(text) {
    const compact = String(text).replace(/\s+/g,' ').trim();
    caption.textContent = compact.length > 96 ? compact.slice(0,93)+'…' : compact;
    if (!voiceOn || !synthesis || !active || !context) return;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = voiceRate; // 2x by default
    utterance.pitch = 1.02;
    const selected = synthesis.getVoices().find(v => normalize(v.lang) === 'pt-br') || synthesis.getVoices().find(v => normalize(v.lang).startsWith('pt'));
    if (selected) utterance.voice = selected;
    utterance.onstart = () => { host.classList.add('speaking'); state.textContent = 'Falando sobre seu painel…'; };
    const done = () => { host.classList.remove('speaking'); if (!recognizing) state.textContent = 'Pronto para outra pergunta.'; };
    utterance.onend = done;
    utterance.onerror = done;
    synthesis.speak(utterance);
  }
  function log(role, text) {
    const entry = document.createElement('p');
    entry.className = 'xrm-assistant-message ' + (role === 'user' ? 'from-user' : 'from-guide');
    entry.textContent = text;
    history.append(entry);
    while (history.childElementCount > 12) history.firstElementChild.remove();
    chatCount.textContent = history.childElementCount+' mensagens';
    history.scrollTop = history.scrollHeight;
  }
  function cost(field, label) {
    if (!context || !context.financialReady || !context[field] || context[field] === '—') return 'Os dados de ' + label + ' não estão disponíveis nesta consulta. Atualize o painel.';
    return 'O painel mostra ' + context[field] + ' em ' + label + '. ' + (context.costPeriod || 'Consulte o período selecionado no painel.');
  }
  let lastTopic = '';
  function permissionNote(topic) {
    if (!topic || !context) return '';
    if (topic.owner && context.role !== 'owner') return 'Esta operação é exclusiva do titular da assinatura. Você pode consultar a aula, mas peça ao titular que execute as alterações.';
    if (topic.writer && !['owner','manager'].includes(context.role)) return 'Seu perfil permite consulta, mas a gravação exige autorização de proprietário ou gestor.';
    return '';
  }
  function showLesson(topic) {
    if (!course || !topic) return;
    selectedLesson = topic;
    lastCourseId = topic.id;
    lessonPanel.hidden = false;
    catalog.hidden = true;
    courseToggle.setAttribute('aria-expanded','false');
    chatDetails.open = false;
    panel.classList.add('is-teaching');
    const index = course.topics.findIndex(t=>t.id===topic.id);
    query('.xrm-assistant-lesson-counter').textContent = topic.group+' · Aula '+(index+1)+' de '+course.topics.length;
    query('.xrm-assistant-lesson-title').textContent = topic.title;
    query('.xrm-assistant-lesson-intro').textContent = topic.intro;
    const steps=query('.xrm-assistant-lesson-steps');
    steps.replaceChildren();
    for (const step of topic.steps) { const li=document.createElement('li');li.textContent=step;steps.append(li); }
    query('.xrm-assistant-lesson-note').textContent = [topic.note,permissionNote(topic)].filter(Boolean).join(' ');
    query('.xrm-assistant-lesson-open').hidden = !topic.view && !topic.route;
    query('.xrm-assistant-lesson-open').textContent = topic.route?'Abrir Mensagens / Suporte':topic.mileage?'Ir para KM e Troca de Óleo':'Abrir '+(labels[topic.view]||'módulo');
    query('.xrm-assistant-lesson-prev').disabled = index<=0;
    query('.xrm-assistant-lesson-next').disabled = index>=course.topics.length-1;
  }
  function fullLessonText(topic) {
    if(!topic)return '';
    return course.answer(topic,'steps',context?.role) + (permissionNote(topic)?'\n'+permissionNote(topic):'');
  }
  function showCatalog(){
    if (!course) return;
    catalogResults.replaceChildren();
    const value=course.normalize(catalogSearch.value);
    const topics=course.topics.filter(topic=>{
      const hay=course.normalize([topic.title,topic.group,...topic.aliases].join(' '));
      return !value || value.split(' ').every(part=>hay.includes(part));
    });
    if (!topics.length) {const empty=document.createElement('p');empty.textContent='Nenhuma aula encontrada. Experimente outro termo.';catalogResults.append(empty);return;}
    let lastGroup='';
    for(const topic of topics){
      if(topic.group!==lastGroup){const heading=document.createElement('strong');heading.className='xrm-assistant-course-group';heading.textContent=topic.group;catalogResults.append(heading);lastGroup=topic.group;}
      const button=document.createElement('button');button.type='button';button.className='xrm-assistant-course-item';button.textContent=topic.title;
      button.addEventListener('click',()=>{
        showLesson(topic);
        const text='Aula: '+topic.title+'. '+topic.intro+' '+topic.steps.map((x,i)=>(i+1)+'. '+x).join(' ');
        log('guide',course.answer(topic));say(text);
      });catalogResults.append(button);
    }
  }
  query('.xrm-assistant-lesson-open').addEventListener('click',()=>{
    if(!selectedLesson)return;
    if(selectedLesson.route){window.location.assign(new URL(selectedLesson.route,location.href).href);return;}
    if(selectedLesson.mileage){
      const button=document.getElementById('xrm-mileage-nav');
      if(button){button.click();return;}
    }
    if(selectedLesson.view){
      const target=document.querySelector('.fleet-main-nav [data-view="'+selectedLesson.view+'"]');
      target?.click();
    }
  });
  query('.xrm-assistant-lesson-hear').addEventListener('click',()=>{if(selectedLesson)say(fullLessonText(selectedLesson));});
  for(const [direction,offset] of [['prev',-1],['next',1]]){
    query('.xrm-assistant-lesson-'+direction).addEventListener('click',()=>{
      if(!course||!selectedLesson)return;
      const index=course.topics.findIndex(t=>t.id===selectedLesson.id)+offset;
      const topic=course.topics[index];if(!topic)return;
      showLesson(topic);say('Aula '+(index+1)+': '+topic.title+'. '+topic.intro);
    });
  }
  courseToggle.addEventListener('click',()=>{
    catalog.hidden=!catalog.hidden;
    courseToggle.setAttribute('aria-expanded',String(!catalog.hidden));
    if(!catalog.hidden){
      lessonPanel.hidden=true;
      panel.classList.remove('is-teaching');
      chatDetails.open=false;
      showCatalog();catalogSearch.focus();
    } else if(selectedLesson){showLesson(selectedLesson);}
  });
  catalogSearch.addEventListener('input',showCatalog);
  function answer(question) {
    if (!context) return 'Aguardando os dados da empresa ativa. Atualize o painel.';
    const q = normalize(question);
    const current = labels[view] || context.view || 'Visão Geral';
    // Teach procedures before numeric reports, otherwise "como cadastrar combustível"
    // would be misread as a request for the current fuel bill.
    const followUp = /^(e depois|qual o proximo passo|me explica melhor|onde fica isso|onde fica|como faco isso|tem outro passo|me ensina|passo a passo|continua|continuar|proxima etapa)\??$/.test(q);
    const lesson = course && (followUp && lastCourseId ? course.getById(lastCourseId) : course.find(question));
    const wantsTutorial = /(^| )(como|onde|aprender|ensina|ensinar|tutorial|curso|passo a passo|guia|o que e|o que significa|qual a diferenca|como funciona|explica|explicar|significa|quais sao|me fale sobre)( |$)/.test(q)
      || /(^| )(cadastrar|registrar|adicionar|mudar|alterar|criar|gerar|configurar|salvar|baixar|exportar|concluir|atualizar|editar|vincular|recuperar|agendar|programar|corrigir|convidar|abrir chamado)( |$)/.test(q);
    if(lesson && (wantsTutorial || followUp || course.normalize(lesson.title)===course.normalize(question))){
      showLesson(lesson);
      const mode=/(o que (e|significa)|qual a diferenca|significa|seria)/.test(q)?'meaning':'steps';
      const result=course.answer(lesson,mode,context.role);
      lastTopic='course:'+lesson.id;
      return result+(permissionNote(lesson)?'\n'+permissionNote(lesson):'');
    }
    if (/(quais aulas|lista de aulas|todos os assuntos|curso completo)/.test(q)){
      catalog.hidden=false;courseToggle.setAttribute('aria-expanded','true');showCatalog();
      return 'Abri o Curso XRMOVI com '+(course?.topics?.length||0)+' aulas. Escolha um tema ou pesquise pelo nome do recurso.';
    }
    const status = context.statusCounts || {};
    const total = metric('Frota Total') || 'zero';
    const operational = metric('Operacionais') || 'zero';
    const nOther = Number(status.maintenance || 0) + Number(status.inactive || 0);
    const hasConcept = /(o que (e|significa|seria)|que (e|significa|seria)|qual (a|e) (diferenca|definicao)|por que|porque|quando|como funciona|explica|me explique|me fala|me diz|entender)/.test(q);
    const mentionsOperational = /operacion|nao operacional|inativ|disponib|status do (veicul|carro|ativo)|situacao (do|de) (veicul|carro|ativo)|em manutencao/.test(q);
    if (/(como|onde|qual (menu|aba|tela)|alterar|mudar|trocar|definir|marcar|corrigir|editar|atualizar)/.test(q) &&
        /(status|situacao|operacion|inativ|ativ|em manutencao)/.test(q)) {
      lastTopic = 'change-status';
      return 'Para alterar a situação de um veículo, abra Ativos / Veículos, localize a placa e clique em Editar. No campo Situação operacional, escolha Ativo, Em manutenção ou Inativo e clique em Salvar. Apenas o proprietário ou gestor pode fazer essa mudança. O histórico fica no mesmo cadastro.';
    }
    if (mentionsOperational && (hasConcept || /^(operacional|nao operacional|inativo|em manutencao)\??$/.test(q))) {
      lastTopic = 'operational';
      return 'No XRMOVI, operacional significa que o veículo foi cadastrado como Ativo e está disponível para uso. Não operacional é quando está Em manutenção ou Inativo. Uma revisão vencida gera alerta, mas não muda sozinha o status: o responsável decide se o veículo pode circular, considerando a segurança e as condições reais. Você altera isso em Ativos / Veículos, no botão Editar.';
    }
    if (/^(por que|porque|e por que|mas por que|como assim|e quando|e se|qual a diferenca)\??$/.test(q) && lastTopic === 'operational') {
      return 'Porque o sistema separa disponibilidade do veículo de pendências de manutenção. Ativo é o status escolhido pelo gestor; uma revisão vencida é um alerta diferente. Se o veículo não estiver apto, marque Em manutenção ou Inativo no cadastro.';
    }
    if (/nao operacion|inativ|em manutencao/.test(q)) {
      lastTopic = 'operational';
      return 'Na seleção atual há ' + nOther + ' veículos não operacionais: ' + (status.maintenance || 0) + ' em manutenção e ' + (status.inactive || 0) + ' inativos. O total de veículos operacionais é ' + operational + '.';
    }
    if (/operacion/.test(q)) {
      lastTopic = 'operational';
      return 'O painel mostra ' + operational + ' veículos operacionais, de um total de ' + total + '. Um veículo só é operacional aqui quando seu status cadastrado é Ativo. Para alterar, abra Ativos / Veículos e clique em Editar.';
    }
    if (/(abr|mostr|vai para|ir para|leva)/.test(q)) {
      const desired = /alerta|vencid|pendenc/.test(q) ? 'alerts' :
        /combust|abastec/.test(q) ? 'fuel' : /manuten|revis|servic/.test(q) ? 'maintenance' :
        /veicul|ativ|frota/.test(q) ? 'assets' : /financeir|relatorio|custo/.test(q) ? 'financial' : null;
      const target = desired && document.querySelector('.fleet-main-nav [data-view="' + desired + '"]');
      if (target) { target.click(); lastTopic = desired; return 'Abri ' + labels[desired] + '. Posso explicar os indicadores dessa tela.'; }
    }
    if (/quem (e|voce)|o que (voce|tu) faz|ajuda|pode fazer/.test(q)) {
      lastTopic = 'help';
      return 'Sou o guia de voz do XRMOVI. Posso explicar o que significa cada indicador, como alterar situações, apresentar alertas, custos e abrir as áreas da frota. Funcionamos com regras locais, sem uma API de inteligência artificial.';
    }
    if (/(revisao vencida|revisao atrasada|o que (e|significa) alerta|o que (e|significa) vencid)/.test(q) && hasConcept) {
      lastTopic = 'alerts';
      return 'Uma revisão vencida é um serviço cujo prazo por data ou quilometragem passou sem conclusão registrada. É um alerta, não uma mudança automática do veículo para Inativo. Confira se ele pode continuar em operação com segurança.';
    }
    if (/empresa|contrato|filtro|periodo|tela (atual|aberta)/.test(q)) {
      lastTopic = 'filters';
      return 'Você está em ' + current + ', na empresa ' + context.companyName + '. ' + (context.filters || 'Os indicadores seguem os filtros que aparecem na tela.') + '.';
    }
    if (/combust|abastec|gasolina|diesel/.test(q)) { lastTopic='fuel'; return cost('fuelCost','combustível'); }
    if (/custo|dinheiro|gasto|financeir|despesa|valor/.test(q)) {
      lastTopic='finance';
      return cost('fuelCost','combustível') + ' ' + cost('maintCost','manutenção');
    }
    if (/vencid|atrasad|urgente/.test(q)) {
      lastTopic='alerts';
      return 'Existem ' + (metric('Itens vencidos') || 'zero') + ' itens vencidos nos filtros atuais. Esse indicador pode incluir manutenção e outras obrigações. Confira os detalhes na Central de Alertas e nos cadastros.';
    }
    if (/alert|atenc|risco|pendenc/.test(q)) {
      lastTopic='alerts';
      return 'O painel indica ' + (metric('Em alerta') || 'zero') + ' situações de manutenção em alerta e ' + (metric('Itens vencidos') || 'zero') + ' itens vencidos. Um alerta não significa automaticamente veículo indisponível.';
    }
    if (/manuten|revis|servic|conserto/.test(q)) {
      lastTopic='maintenance';
      return 'Há ' + (metric('Revisões pendentes') || 'zero') + ' revisões pendentes na seleção atual. ' + (context.financialReady ? cost('maintCost','manutenção') : 'O custo de manutenção não está disponível nesta consulta.');
    }
    if (/veicul|frota|carro|ativo/.test(q)) {
      lastTopic='fleet';
      return 'Na seleção atual, o painel mostra ' + total + ' veículos, sendo ' + operational + ' operacionais. Os outros ' + nOther + ' estão em manutenção ou inativos.';
    }
    if (/resumo|painel|situac|visao|analise|como esta|bom dia|boa tarde|boa noite|ola|oi/.test(q)) {
      lastTopic='summary';
      const alerts = metric('Em alerta') || 'zero';
      const overdue = metric('Itens vencidos') || 'zero';
      const partial = context.healthy ? '' : ' Atenção: algumas consultas do sistema podem estar indisponíveis.';
      return 'Na empresa ' + context.companyName + ', você está em ' + current + '. A frota filtrada tem ' + total + ' veículos, ' + operational + ' operacionais, ' + alerts + ' em alerta e ' + overdue + ' itens vencidos. ' + (context.filters || '') + '.' + partial;
    }
    if (/^(por que|porque|como assim|me explica melhor|e isso)\??$/.test(q)) {
      if (lastTopic === 'alerts') return 'Alerta indica uma pendência; veículo não operacional depende do status cadastrado. São indicadores diferentes.';
      if (lastTopic === 'maintenance') return 'Revisão pendente significa serviço ainda não concluído. Quando vence por prazo ou quilometragem, o sistema passa a sinalizar a pendência.';
    }
    lastTopic='help';
    return 'Consigo ensinar os módulos do XRMOVI com aulas passo a passo e explicar os dados da sua empresa. Pergunte como cadastrar um veículo, concluir uma manutenção, atualizar o KM, gerar relatório, mudar plano ou usar o QR Code. Também pode clicar em Curso do XRMOVI para ver todas as aulas.';
  }
  async function respond(question) {
    if (!context) return;
    const clean = String(question || '').trim().slice(0,220);
    if (!clean) return;
    log('user', clean);
    const requestedCompany = context.companyId;
    const ticket = ++responseTicket;
    state.textContent = 'Analisando sua pergunta…';
    let brainAnswer = null;
    try {
      if (window.XrmoviAssistantBrain?.handle)
        brainAnswer = await window.XrmoviAssistantBrain.handle(clean, {course});
    } catch (error) {
      console.warn('XRMOVI VOZ: consulta não concluída:', error?.message||'falha');
    }
    if (ticket !== responseTicket || !context || requestedCompany !== context.companyId) return;
    let response = '';
    if (brainAnswer?.matched) {
      response = brainAnswer.text;
      if (brainAnswer.lessonId && course?.getById(brainAnswer.lessonId)) {
        const lesson = course.getById(brainAnswer.lessonId);
        showLesson(lesson);
        lastCourseId = lesson.id;
      } else {
        lessonPanel.hidden = true;
        panel.classList.remove('is-teaching');
        chatDetails.open = true;
      }
    } else {
      if(window.XrmoviLocalModel?.isReady?.()){
        try{
          state.textContent='IA local gerando resposta…';
          const generated=await window.XrmoviLocalModel.ask(clean);
          if(ticket!==responseTicket||!context||requestedCompany!==context.companyId)return;
          response='IA local experimental: '+generated+' Confira instruções e dados no painel.';
        }catch(error){
          response=answer(clean);
        }
      }else{
        response=answer(clean);
      }
      if (!lastTopic.startsWith('course:')) {
        lessonPanel.hidden = true;
        panel.classList.remove('is-teaching');
        chatDetails.open = true;
      }
    }
    log('guide', response);
    if (!catalog.hidden) {catalog.hidden=true;courseToggle.setAttribute('aria-expanded','false');}
    say(response);
    if (!voiceOn || !synthesis) state.textContent = 'Pronto para outra pergunta.';
  }
  function stop() {
    ++responseTicket;
    if (synthesis) synthesis.cancel();
    host.classList.remove('speaking', 'listening');
    if (recognizer && recognizing) { try { recognizer.abort(); } catch {} }
    recognizing = false;
    state.textContent = 'Pronto para outra pergunta.';
  }
  function open() {
    if (!context) return;
    active = !active;
    panel.hidden = !active;
    launcher.setAttribute('aria-expanded', String(active));
    if (!active) { stop(); launcher.focus(); return; }
    caption.textContent = 'Estou acompanhando a tela ' + (labels[view] || context.view) + ' da empresa ' + context.companyName + '.';
    input.focus();
  }
  launcher.addEventListener('click',open);
  query('.xrm-assistant-close').addEventListener('click',open);
  query('.xrm-assistant-form').addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    respond(text);
  });
  query('.xrm-assistant-shortcuts').addEventListener('click', e => {
    const button = e.target.closest('button[data-intent]');
    if (button) respond(button.dataset.intent);
  });
  sound.addEventListener('click', () => {
    voiceOn = !voiceOn;
    sound.setAttribute('aria-pressed',String(voiceOn));
    sound.textContent = voiceOn ? '🔊 Voz ligada' : '🔇 Voz desligada';
    if (!voiceOn) stop();
  });
  if (!Recognition) {
    mic.hidden = true;
  } else {
    mic.addEventListener('click', () => {
      if (recognizing) { stop(); return; }
      stop();
      recognizer = new Recognition();
      recognizer.lang = 'pt-BR';
      recognizer.interimResults = false;
      recognizer.maxAlternatives = 1;
      recognizer.onstart = () => { recognizing = true; host.classList.add('listening'); state.textContent = 'Ouvindo sua pergunta…'; };
      recognizer.onresult = e => { const transcript = e.results?.[0]?.[0]?.transcript; if (transcript) respond(transcript); };
      recognizer.onerror = e => { state.textContent = e.error === 'not-allowed' ? 'Permissão de microfone negada. Digite sua pergunta.' : 'Não consegui ouvir. Use o campo de texto.'; };
      recognizer.onend = () => { recognizing = false; host.classList.remove('listening'); if (!host.classList.contains('speaking')) state.textContent = 'Pronto para outra pergunta.'; };
      try { recognizer.start(); } catch { state.textContent = 'Não foi possível iniciar o microfone. Digite sua pergunta.'; }
    });
  }
  window.addEventListener('xrmovi:assistant-clear', () => {
    stop();
    context = null;
    window.XrmoviAssistantBrain?.reset?.();
    window.XrmoviLocalModel?.disable?.();
    host.hidden = true;
    panel.hidden = true;
    active = false;
    launcher.setAttribute('aria-expanded','false');
    history.replaceChildren();
    chatCount.textContent='0 mensagens';
    chatDetails.open=true;
    panel.classList.remove('is-teaching');
    lastTopic = '';
    lastCourseId='';
    selectedLesson=null;
    lessonPanel.hidden=true;
    catalog.hidden=true;
  });
  window.addEventListener('xrmovi:assistant-view', e => {
    view = e.detail?.view || 'dashboard';
    if (context && active && !host.classList.contains('speaking')) caption.textContent = 'Agora você está em ' + (labels[view] || view) + '. Pergunte sobre os indicadores.';
  });
  window.addEventListener('xrmovi:assistant-context', e => {
    const next = e.detail;
    if (!next || !next.companyName) return;
    if (context && context.companyId !== next.companyId) { window.XrmoviAssistantBrain?.reset?.(); stop(); history.replaceChildren(); chatCount.textContent='0 mensagens'; chatDetails.open=true; panel.classList.remove('is-teaching'); lastCourseId=''; selectedLesson=null; lessonPanel.hidden=true; catalog.hidden=true; }
    context = next;
    view = next.view || view;
    host.hidden = false;
    if (active && !host.classList.contains('speaking')) caption.textContent = 'Indicadores atualizados para ' + next.companyName + '. Posso explicar seus números.';
  });
  window.addEventListener('beforeunload',stop);
})();