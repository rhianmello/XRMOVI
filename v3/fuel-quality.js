// A missing liters declaration is auditable; without full-tank readings, km/L is indicative only.
export const litersMissing=record=>record?.liters==null||record?.liters===''||record?.liters_declined===true;
export function analyzeFuelQuality(records=[]){
 const byVehicle=new Map();
 for(const row of records){
  if(!row?.vehicle_id)continue;
  if(!byVehicle.has(row.vehicle_id))byVehicle.set(row.vehicle_id,[]);
  byVehicle.get(row.vehicle_id).push(row);
 }
 const perVehicle=[];
 for(const [vehicleId,entries] of byVehicle){
  const sorted=[...entries].sort((a,b)=>
   String(a.fueled_on||a.date||'').localeCompare(String(b.fueled_on||b.date||''))||
   Number(a.meter??a.odometer??0)-Number(b.meter??b.odometer??0)||
   String(a.id||'').localeCompare(String(b.id||'')));
  const incomplete=sorted.filter(litersMissing),hasOmission=incomplete.length>0;
  let distance=0,liters=0,validIntervals=0;
  for(let i=1;i<sorted.length;i++){
   const previous=sorted[i-1],current=sorted[i];
   if(litersMissing(previous)||litersMissing(current))continue;
   const start=Number(previous.meter??previous.odometer),end=Number(current.meter??current.odometer);
   const refilled=Number(current.liters);
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
     !Number.isFinite(refilled)||refilled<=0)continue;
   distance+=end-start;liters+=refilled;validIntervals++;
  }
  perVehicle.push({vehicleId,total:sorted.length,missing:incomplete.length,
   missingRecords:incomplete,
   completeness:sorted.length?Math.round(100*(sorted.length-incomplete.length)/sorted.length):100,
   referenceKmL:!hasOmission&&validIntervals&&liters>0?distance/liters:null,
   usedIntervals:validIntervals,hasOmission,
   status:hasOmission?'Dados incompletos':validIntervals?'Estimativa, não medição':'Sem intervalos suficientes'});
 }
 return {total:records.length,missing:perVehicle.reduce((n,v)=>n+v.missing,0),
  vehiclesAffected:perVehicle.filter(v=>v.hasOmission).length,perVehicle};
}