// Aggregated session-only statistics. No names, paths, file contents, or
// cross-tenant data leave the browser. These are NOT server-wide storage totals.
import { formatBytes } from './upload-optimizer.js?v=20261113-4b-1';
const metrics=new Map();
const fresh=()=>({completed:0,originalBytes:0,storedBytes:0,savedBytes:0,failed:0,interrupted:0});
export function recordStorageMetric(companyId,status,stats){
 if(!companyId || !['complete','failed','interrupted'].includes(status))return null;
 const key=String(companyId), current=metrics.get(key)||fresh();
 if(status==='complete'){
  const original=Number(stats?.originalBytes),stored=Number(stats?.finalBytes);
  if(!Number.isFinite(original)||!Number.isFinite(stored)||original<stored||stored<0)return null;
  current.completed++;current.originalBytes+=original;current.storedBytes+=stored;
  current.savedBytes+=original-stored;
 }else if(status==='failed')current.failed++;
 else current.interrupted++;
 metrics.set(key,current);
 return {...current};
}
export function getStorageMetrics(companyId){
 return {...(metrics.get(String(companyId))||fresh())};
}
export function storageSessionSummary(companyId){
 const m=getStorageMetrics(companyId);
 return 'Nesta sessão · '+m.completed+' arquivo(s) enviados · '+formatBytes(m.originalBytes)+
  ' originais · '+formatBytes(m.storedBytes)+' armazenados · '+formatBytes(m.savedBytes)+
  ' economizados'+(m.failed||m.interrupted?' · '+m.failed+' falha(s), '+m.interrupted+' interrupção(ões)':'')+'.';
}
