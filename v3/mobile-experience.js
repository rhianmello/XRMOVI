
/* XRMOVI Mobile V4. Presentation layer only: uses the existing authenticated navigation,
   fleet filters, company selector and database-backed KPIs. No copied data or new APIs. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const phone = window.matchMedia('(max-width:760px)');
  const glyphs = {
    truck:'<rect x="2" y="6" width="12" height="11" rx="2"/><path d="M14 10h4l4 4v3h-8"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>',
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z"/>',
    car:'<path d="m5 16-1 3m15-3 1 3M5 9l2-5h10l2 5"/><path d="M3 16v-5l2-2h14l2 2v5H3z"/><circle cx="7" cy="14" r="1"/><circle cx="17" cy="14" r="1"/>',
    fuel:'<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M3 21h14"/><path d="M6 7h8v5H6zM16 8l3 3v7a2 2 0 0 0 4 0v-8l-3-3"/>',
    wrench:'<path d="M14.7 6.3a5.5 5.5 0 0 0-7 7L3 18l3 3 4.7-4.7a5.5 5.5 0 0 0 7-7l-3.2 3.2-3-3z"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    sliders:'<path d="M4 7h6m4 0h6M4 17h3m4 0h9"/><circle cx="12" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 12-2L20 12M4 12l2.4 5a7 7 0 0 0 12-2"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.4 9.2a2.8 2.8 0 0 1 5.3 1.2c0 1.6-2.7 2.2-2.7 4M12 18h.01"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    document:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
    chart:'<path d="M4 20V12M10 20V5M16 20v-8M22 20v-13M2 21h21"/>',
    credit:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 8a3 3 0 0 1 0 6M17 16a5 5 0 0 1 4 5"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    warning:'<path d="m12 3 10 18H2L12 3zM12 9v5M12 18h.01"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    close:'<path d="M5 5 19 19M19 5 5 19"/>'
  };
  function icon(name) {
    return '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">'+(glyphs[name] || glyphs.menu)+'</svg>';
  }
  function init() {
    const topbar = $('.fleet-topbar');
    const dashboard = $('#view-dashboard');
    const hero = $('.xrm-company-header');
    const filterbar = $('.fleet-commandbar');
    const contract = $('.xrm-header-contract');
    if (!topbar || !dashboard || !hero || !filterbar) return;

    /* Keeps the only real contract selector wired to the application's filters. */
    const contractHome = contract?.parentNode;
    const contractNext = contract?.nextSibling;
    function positionContract() {
      if (!contract || !contractHome) return;
      if (phone.matches) {
        if (contract.parentNode !== filterbar) filterbar.prepend(contract);
      } else if (contract.parentNode !== contractHome) {
        contractHome.insertBefore(contract, contractNext?.parentNode === contractHome ? contractNext : null);
      }
    }
    positionContract();

    const brand = document.createElement('div');
    brand.className = 'xrm-mobile-brand';
    brand.setAttribute('aria-label','XRMOVI Gestão de Frotas');
    brand.innerHTML = '<span class="xrm-mobile-brand-mark">'+icon('truck')+'</span><span class="xrm-mobile-brand-title">XRMOVI<small>Minha frota</small></span>';
    topbar.prepend(brand);

    const support = $('.xrm-mobile-support-link');
    if (support) {
      support.innerHTML = icon('help');
      support.setAttribute('aria-label','Mensagens e suporte');
      support.title = 'Mensagens e suporte';
    }
    const refresh = $('#refresh-button');
    if (refresh) {
      refresh.innerHTML = icon('refresh');
      refresh.title='Atualizar dados';
      refresh.setAttribute('aria-label','Atualizar dados');
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'xrm-mobile-dashboard-toolbar';
    toolbar.innerHTML = '<h2>Visão Geral</h2><button id="xrm-mobile-filters" type="button" class="xrm-mobile-filter-toggle" aria-expanded="false" aria-controls="xrm-mobile-filter-container">'+icon('sliders')+'<span>Filtros</span><span class="xrm-mobile-filter-count" hidden>0</span></button>';
    dashboard.prepend(toolbar);
    const filterWrapper = $('.xrm-hero-filters', hero);
    if (filterWrapper) filterWrapper.id = 'xrm-mobile-filter-container';
    const toggle = $('#xrm-mobile-filters');
    const counter = $('.xrm-mobile-filter-count',toggle);
    const tracked = ['xrm-contract-filter','fleet-search','xrm-filter-category','xrm-filter-status','xrm-filter-expiry'];

    function countFilters() {
      const n = tracked.filter(id => Boolean(document.getElementById(id)?.value?.trim())).length;
      if (counter) {
        counter.hidden = n === 0;
        counter.textContent = String(n);
      }
      return n;
    }
    let filtersOpen = false;
    function setFilters(open) {
      filtersOpen=Boolean(open && phone.matches && !$('#view-dashboard')?.classList.contains('hidden'));
      document.body.classList.toggle('xrm-mobile-filters-open',filtersOpen);
      toggle.setAttribute('aria-expanded',String(filtersOpen));
    }
    toggle.addEventListener('click',()=>setFilters(!filtersOpen));
    for (const id of tracked) {
      const node = document.getElementById(id);
      if (!node) continue;
      node.addEventListener('change',countFilters);
      if(node.tagName === 'INPUT') node.addEventListener('input',countFilters);
    }
    $('#xrm-clear-filters')?.addEventListener('click',()=>queueMicrotask(countFilters));
    countFilters();

    const status = document.createElement('div');
    status.className = 'xrm-mobile-load-status';
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    status.innerHTML = '<span id="xrm-mobile-load-message">Consultando dados da frota...</span> <button id="xrm-mobile-retry" type="button" hidden>Tentar novamente</button>';
    const kpigrid = $('#fleet-kpis');
    kpigrid?.before(status);
    $('#xrm-mobile-retry')?.addEventListener('click',()=>refresh?.click());
    function updateKpis() {
      if(!kpigrid) return;
      const typeIcon = {
        'Frota Total':'car','Operacionais':'check','Em alerta':'warning',
        'Itens vencidos':'bell','Revisões pendentes':'wrench'
      };
      for (const card of kpigrid.querySelectorAll('.fleet-kpi')) {
        const label=card.querySelector('.fleet-kpi-label');
        if(!label)continue;
        const name=label.textContent.trim();
        if(label.querySelector('svg'))continue;
        const glyph=typeIcon[name];
        if(glyph)label.insertAdjacentHTML('beforeend',icon(glyph));
      }
      const count=kpigrid.children.length;
      const loadMessage = $('#xrm-mobile-load-message');
      const retry = $('#xrm-mobile-retry');
      const notice = $('#page-notice');
      const hasError=Boolean(notice && !notice.classList.contains('hidden') &&
        /erro|falh|não foi possível|indisponível/i.test(notice.textContent));
      if (hasError) {
        if(loadMessage)loadMessage.textContent='Não foi possível consultar os dados. Verifique a conexão e tente atualizar.';
        if(retry)retry.hidden=false;
        status.hidden=false;
      } else if(!count) {
        if(loadMessage)loadMessage.textContent='Consultando dados da frota...';
        if(retry)retry.hidden=true;
        status.hidden=false;
      } else {
        const total=Number(kpigrid.querySelector('.fleet-kpi-value')?.textContent?.trim());
        const connected=/conectad|parcial/i.test($('#connection-status')?.textContent||'');
        if(connected && total===0){
          if(loadMessage)loadMessage.textContent='Nenhum veículo cadastrado nesta empresa. Use Frota para adicionar o primeiro.';
          if(retry)retry.hidden=true;
          status.hidden=false;
        }else status.hidden=true;
      }
    }
    if(kpigrid){
      const observer = new MutationObserver(()=>window.requestAnimationFrame(updateKpis));
      observer.observe(kpigrid,{childList:true,subtree:true,characterData:true});
    }
    if($('#page-notice'))new MutationObserver(()=>window.requestAnimationFrame(updateKpis))
      .observe($('#page-notice'),{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
    if($('#connection-status'))new MutationObserver(()=>window.requestAnimationFrame(updateKpis))
      .observe($('#connection-status'),{childList:true,subtree:true,characterData:true});
    updateKpis();

    const navigation = [
      ['dashboard','home','Início'],['assets','car','Frota'],['fuel','fuel','Abastec.'],
      ['maintenance','wrench','Manutenção']
    ];
    const bottom=document.createElement('nav');
    bottom.className='xrm-mobile-bottom-nav';
    bottom.setAttribute('aria-label','Navegação rápida');
    bottom.innerHTML=navigation.map(([view,ico,label])=>
      '<button type="button" data-mobile-view="'+view+'" aria-label="'+(view==='fuel'?'Abastecimentos':label)+'">'+icon(ico)+'<span>'+label+'</span></button>'
    ).join('')+'<button type="button" id="xrm-mobile-more" aria-haspopup="dialog" aria-expanded="false">'+icon('menu')+'<span>Menu</span></button>';
    document.body.append(bottom);

    const mainViews=[
      ['dashboard','home','Visão Geral'],['assets','car','Ativos / Veículos'],['mileage','clock','KM e Troca de Óleo'],
      ['maintenance','wrench','Manutenção / Despesas'],['drivers','users','Motoristas'],
      ['documents','document','Documentos'],['alerts','bell','Alertas'],
      ['history','history','Histórico'],['fuel','fuel','Abastecimentos'],
      ['fines','document','Multas e Infrações'],['financial','chart','Relatórios'],['subscription','credit','Minha assinatura']
    ];
    const quickActions=[
      {label:'Cadastrar ativo',view:'assets',selector:'#assets-actions button',icon:'car'},
      {label:'Cadastrar motorista',view:'drivers',selector:'#driver-new',icon:'users'},
      {label:'Lançar abastecimento',view:'fuel',selector:'#fuel-actions button',icon:'fuel'},
      {label:'Programar manutenção',view:'maintenance',selector:'#maintenance-new',icon:'wrench'},
      {label:'Registrar despesa',view:'maintenance',selector:'#expense-new',icon:'credit'},
      {label:'Registrar multa',view:'fines',selector:'#xrm-fines-add',icon:'document'},
      {label:'Atualizar KM',view:'mileage',selector:'#xrm-mileage-nav',icon:'clock',always:true},
      {label:'Emitir relatório',view:'financial',icon:'chart',always:true}
    ];
    const sheet=document.createElement('section');
    sheet.className='xrm-mobile-more-sheet';
    sheet.hidden=true;
    sheet.setAttribute('role','dialog');
    sheet.setAttribute('aria-modal','true');
    sheet.setAttribute('aria-label','Menu de módulos e ações do XRMOVI');
    sheet.innerHTML='<button type="button" class="xrm-mobile-more-backdrop" aria-label="Fechar menu"></button>'+
      '<div class="xrm-mobile-more-panel"><div class="xrm-mobile-more-title"><strong>Menu XRMOVI</strong><button type="button" id="xrm-mobile-close-menu" aria-label="Fechar menu">'+icon('close')+'</button></div>'+
      '<p class="xrm-mobile-menu-caption">O que você precisa fazer?</p>'+
      '<div class="xrm-mobile-quick-actions" aria-label="Ações rápidas"></div>'+
      '<p class="xrm-mobile-menu-section-label">Módulos do sistema</p>'+
      '<div class="xrm-mobile-more-links">'+mainViews.map(([view,ico,label])=>
        '<button type="button" data-mobile-view="'+view+'">'+icon(ico)+'<span>'+label+'</span></button>'
      ).join('')+
      '<a href="../cliente/">'+icon('help')+'<span>Mensagens / Suporte</span></a>'+
      '<button type="button" class="xrm-mobile-logout">'+icon('logout')+'<span>Sair da conta</span></button></div></div>';
    document.body.append(sheet);
    const moreButton=$('#xrm-mobile-more');
    const headerMenu=document.createElement('button');
    headerMenu.type='button';headerMenu.id='xrm-mobile-header-menu';
    headerMenu.className='xrm-mobile-header-menu';
    headerMenu.setAttribute('aria-label','Abrir menu de ações e módulos');
    headerMenu.setAttribute('aria-haspopup','dialog');
    headerMenu.setAttribute('aria-expanded','false');
    headerMenu.innerHTML=icon('menu');
    topbar.querySelector('.fleet-top-actions')?.append(headerMenu);
    function eligibleAction(item){
      if(item.always)return true;
      const control=document.querySelector(item.selector);
      return !!control&&!control.disabled&&!control.hidden&&getComputedStyle(control).display!=='none';
    }
    function drawQuickActions(){
      const panel=$('.xrm-mobile-quick-actions',sheet);
      if(!panel)return;
      panel.replaceChildren();
      for(const item of quickActions.filter(eligibleAction)){
        const button=document.createElement('button');button.type='button';
        button.className='xrm-mobile-quick-action';
        button.dataset.mobileAction=item.label;
        button.innerHTML=icon(item.icon)+'<span>'+item.label+'</span>';
        button.addEventListener('click',()=>{
          setMenu(false);
          if(item.selector==='#xrm-mileage-nav'){
            document.getElementById('xrm-mileage-nav')?.click();return;
          }
          go(item.view);
          if(!item.selector)return;
          requestAnimationFrame(()=>{
            const target=document.querySelector(item.selector);
            if(target&&!target.disabled&&!target.hidden&&getComputedStyle(target).display!=='none')target.click();
          });
        });
        panel.append(button);
      }
      if(!panel.children.length){
        const note=document.createElement('p');
        note.textContent='As ações de cadastro dependem da permissão desta empresa.';
        panel.append(note);
      }
    }
    function setMenu(open){
      if(!phone.matches)open=false;
      if(open)drawQuickActions();
      sheet.hidden=!open;
      document.body.classList.toggle('xrm-mobile-menu-open',open);
      moreButton.setAttribute('aria-expanded',String(open));
      headerMenu.setAttribute('aria-expanded',String(open));
      if(open)$('#xrm-mobile-close-menu')?.focus();
    }
    moreButton.addEventListener('click',()=>setMenu(sheet.hidden));
    headerMenu.addEventListener('click',()=>setMenu(sheet.hidden));
    $('.xrm-mobile-more-backdrop',sheet).addEventListener('click',()=>setMenu(false));
    $('#xrm-mobile-close-menu')?.addEventListener('click',()=>{setMenu(false);headerMenu.focus()});
    $('.xrm-mobile-logout',sheet).addEventListener('click',()=>{
      setMenu(false);
      ($('#xrm-fleet-logout-mobile') || $('#xrm-fleet-logout'))?.click();
    });
    function currentView() {
      return [...document.querySelectorAll('.fleet-view')].find(node=>!node.classList.contains('hidden'))?.id.replace(/^view-/,'') || 'dashboard';
    }
    function syncRoute(view=currentView()) {
      const direct=navigation.some(([v])=>v===view);
      for(const button of bottom.querySelectorAll('[data-mobile-view]')){
        if(button.dataset.mobileView===view)button.setAttribute('aria-current','page');
        else button.removeAttribute('aria-current');
      }
      if(!direct && view && view!=='dashboard') moreButton.setAttribute('aria-current','page');
      else moreButton.removeAttribute('aria-current');
      if(view!=='dashboard')setFilters(false);
      if(!sheet.hidden)setMenu(false);
    }
    function go(view){
      setMenu(false);
      const existing = document.querySelector('.fleet-main-nav [data-view="'+view+'"]');
      if(existing)existing.click(); /* Adapter's own payment/role checks still apply. */
      syncRoute();
    }
    document.querySelectorAll('[data-mobile-view]').forEach(button=>{
      button.addEventListener('click',()=>go(button.dataset.mobileView));
    });
    window.addEventListener('xrmovi:assistant-view',event=>syncRoute(event.detail?.view||currentView()));
    window.addEventListener('popstate',()=>window.requestAnimationFrame(()=>syncRoute()));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape' && !sheet.hidden){setMenu(false);moreButton.focus()}
      if(event.key==='Escape' && filtersOpen)setFilters(false);
      if(event.key==='Tab' && !sheet.hidden){
        const focusables=[...sheet.querySelectorAll('button:not([disabled]),a[href]')];
        if(!focusables.length)return;
        const first=focusables[0],last=focusables[focusables.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus()}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus()}
      }
    });
    // Turn existing desktop data tables into fully readable mobile cards, without
    // duplicating records or changing table editing / selection handlers.
    function decorateTables(){
      const tables=document.querySelectorAll(
        '.fleet-content table.fleet-table, .fleet-content table.xrm-mileage-table'
      );
      for(const table of tables){
        // DocumentCenter has its own six-field card layout; do not override it.
        if(table.closest('#vehicle-documents')||table.closest('.xrm-doc-dialog'))continue;
        table.classList.add('xrm-mobile-card-table');
        const labels=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim()||'Selecionar');
        if(!labels.length)continue;
        for(const tr of table.querySelectorAll('tbody tr')){
          const cells=[...tr.children].filter(el=>el.tagName==='TD');
          if(cells.length!==labels.length)continue;
          cells.forEach((cell,i)=>{
            if(cell.dataset.xrmLabel!==labels[i])cell.dataset.xrmLabel=labels[i];
          });
        }
      }
    }
    let cardsScheduled=false;
    new MutationObserver(()=>{
      if(cardsScheduled)return;
      cardsScheduled=true;
      requestAnimationFrame(()=>{cardsScheduled=false;decorateTables()});
    }).observe(document.querySelector('.fleet-content'),{subtree:true,childList:true});
    decorateTables();
    const onBreakpoint=()=>{
      positionContract();
      if(!phone.matches){setMenu(false);setFilters(false)}
      syncRoute();
      updateKpis();
      decorateTables();
    };
    if(phone.addEventListener)phone.addEventListener('change',onBreakpoint);
    else phone.addListener(onBreakpoint);
    syncRoute();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
