(function () {
  'use strict';
  let token = null, expiry = 0, timer = null, client = null;
  function getClient() {
    if (!client) {
      const cfg = window.EPC15_SUPABASE_CONFIG;
      if (!cfg?.enabled || !window.supabase?.createClient) throw new Error('Supabase indisponível. Tente atualizar a página.');
      client = window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    }
    return client;
  }
  async function rpc(name,args = {}) {
    const {data,error} = await getClient().rpc(name,args);
    if (error) {
      if (error.code === '42501') clear();
      const message = error.code === 'PGRST202' || error.code === '42883' ? 'O módulo de frota ainda precisa da migration no Supabase.' : error.message || 'Falha de comunicação com o banco.';
      throw new Error(message);
    }
    return typeof data === 'string' ? JSON.parse(data) : data;
  }
  function clear() { token = null; expiry = 0; clearTimeout(timer); window.dispatchEvent(new CustomEvent('fleet-edit-change')); }
  function isEditing() { if (token && Date.now() >= expiry) clear(); return Boolean(token); }
  function editToken() { if (!isEditing()) throw new Error('A sessão de edição expirou. Informe a senha master novamente.'); return token; }
  async function unlock(password,actor) {
    const data = await rpc('fleet_open_edit_session',{p_master_password:password,p_actor:String(actor || '').trim()});
    if (!data?.token || !data.expires_at) throw new Error('A sessão de edição não foi liberada.');
    token = data.token; expiry = Date.parse(data.expires_at);
    clearTimeout(timer); timer = setTimeout(clear,Math.max(0,expiry - Date.now()));
    window.dispatchEvent(new CustomEvent('fleet-edit-change'));
    return {expires_at:data.expires_at};
  }
  async function lock() { const current = token; clear(); if (current) await rpc('fleet_close_edit_session',{p_token:current}); }
  // Capability lives only in memory. pagehide clears immediately; server expiry protects
  // abrupt browser closure and network failure without storing a password or token.
  window.addEventListener('pagehide',()=>{ if (token) { const cfg=window.EPC15_SUPABASE_CONFIG; const current=token; clear(); fetch(cfg.url+'/rest/v1/rpc/fleet_close_edit_session',{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_token:current}),keepalive:true}).catch(()=>{}); } });
  window.FleetAPI = {
    unlock,lock,isEditing,expiresAt:()=>expiry ? new Date(expiry).toISOString() : null,
    listAssets:({search='',offset=0,limit=250}={})=>rpc('fleet_list_assets_public',{p_search:search,p_offset:offset,p_limit:limit}),
    detail:assetId=>rpc('fleet_asset_detail_public',{p_asset_id:assetId}),
    pendingImport:draftId=>rpc('fleet_pending_import',{p_token:editToken(),p_draft_id:draftId}),
    history:(filters={},offset=0,limit=100)=>rpc('fleet_history_public',{p_filters:filters,p_offset:offset,p_limit:limit}),
    saveAsset:(asset,expectedUpdatedAt=null)=>rpc('fleet_save_asset',{p_token:editToken(),p_asset:asset,p_expected_updated_at:expectedUpdatedAt}),
    addRecord:(kind,assetId,record,expectedUpdatedAt=null)=>rpc('fleet_add_record',{p_token:editToken(),p_kind:kind,p_asset_id:assetId,p_record:record,p_expected_updated_at:expectedUpdatedAt}),
    saveSchedule:(weekStart,assignments,notes,expectedUpdatedAt=null)=>rpc('fleet_save_weekly_schedule',{p_token:editToken(),p_week_start:weekStart,p_assignments:assignments,p_notes:notes,p_expected_updated_at:expectedUpdatedAt}),
    saveFuelReceipt:(fuelingId,imageData)=>rpc('fleet_fuel_receipt_save',{p_token:editToken(),p_fueling_id:fuelingId,p_image_data:imageData}),
    getFuelReceipt:fuelingId=>rpc('fleet_fuel_receipt_get',{p_token:editToken(),p_fueling_id:fuelingId}),
    fuelReceiptManifest:ids=>ids.length?rpc('fleet_fuel_receipt_manifest',{p_ids:ids}):Promise.resolve([]),
    fuelReport:(from,to,assetId=null,offset=0,limit=500)=>rpc('fleet_fuel_report_public',{p_from:from,p_to:to,p_asset_id:assetId,p_offset:offset,p_limit:limit}),
    publishImport:(batchId,fileName,rows)=>rpc('fleet_publish_import',{p_token:editToken(),p_batch_id:batchId,p_file_name:fileName,p_rows:rows})
  };
}());
