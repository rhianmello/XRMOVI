// Public calculator: visual preview. The trusted Supabase checkout must quote the same
// integer-cent interpolation. No price may be accepted directly from browser input.
export const INCLUDED = 5;
export const MIN_VEHICLES = 5;
export const MAX_VEHICLES = 100;
export const BASE_CENTS = 1990;
export const TIERS = Object.freeze([
  {vehicles:5, cents:1990},
  {vehicles:10, cents:3990},
  {vehicles:40, cents:7990},
  {vehicles:100, cents:14990}
]);
export const money = cents => (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function quoteFleet(raw){
 const requested = Number(raw);
 if(!Number.isInteger(requested) || requested<1 || requested>MAX_VEHICLES)
  throw new RangeError('Informe de 1 a 100 veículos. Para mais de 100, consulte o atendimento.');
 const count = Math.max(INCLUDED, requested);
 let monthlyCents;
 if(count<=5) monthlyCents=1990;
 else if(count<=10) monthlyCents=1990+(count-5)*400;
 else if(count<=40) monthlyCents=3990+Math.round((count-10)*4000/30);
 else monthlyCents=7990+Math.round((count-40)*7000/60);
 const stage=count<=5?0:count<=10?1:count<=40?2:3;
 const steps=[
  'Até 5 veículos: R$ 19,90/mês',
  'Do 6º ao 10º: R$ 4,00 por veículo',
  'Do 11º ao 40º: R$ 40,00 distribuídos por 30 veículos',
  'Do 41º ao 100º: R$ 70,00 distribuídos por 60 veículos'
 ];
 const previous=count<=5?monthlyCents:count<=10?1990+(count-6)*400:count<=40?3990+Math.round((count-11)*4000/30):7990+Math.round((count-41)*7000/60);
 return {count, extra:count-INCLUDED, monthlyCents, baseCents:BASE_CENTS,
  additionalCents:monthlyCents-BASE_CENTS, marginalCents:monthlyCents-previous,
  tier:stage, tierDescription:steps[stage], code:'fleet_'+count};
}
export function wireFleetCalculator(root,{initial=5,onChange=()=>{}}={}){
 if(!root) return null;
 const input=root.querySelector('[data-fleet-count]');
 const slider=root.querySelector('[data-fleet-slider]');
 const minus=root.querySelector('[data-fleet-minus]');
 const plus=root.querySelector('[data-fleet-plus]');
 if(!input||!slider) return null;
 let count=5;
 const paint=value=>{
  const parsed=Number(value);
  const safe=Number.isFinite(parsed)?Math.max(1,Math.min(MAX_VEHICLES,Math.round(parsed))):5;
  const quote=quoteFleet(safe);
  count=quote.count;
  input.value=String(count);
  input.max=String(MAX_VEHICLES);
  slider.min=String(MIN_VEHICLES);
  slider.max=String(MAX_VEHICLES);
  slider.value=String(count);
  root.querySelectorAll('[data-fleet-price]').forEach(e=>e.textContent=money(quote.monthlyCents));
  root.querySelectorAll('[data-fleet-total]').forEach(e=>e.textContent=String(quote.count));
  root.querySelectorAll('[data-fleet-extra]').forEach(e=>e.textContent=String(quote.extra));
  root.querySelectorAll('[data-fleet-extra-cost]').forEach(e=>e.textContent=money(quote.additionalCents));
  root.querySelectorAll('[data-fleet-tier-detail]').forEach(e=>e.textContent=quote.tierDescription);
  root.querySelectorAll('[data-fleet-marginal]').forEach(e=>e.textContent=money(quote.marginalCents));
  onChange(quote);
  return quote;
 };
 input.addEventListener('input',()=>{if(input.value!=='')paint(input.value)});
 input.addEventListener('change',()=>paint(input.value));
 slider.addEventListener('input',()=>paint(slider.value));
 minus?.addEventListener('click',()=>paint(count-1));
 plus?.addEventListener('click',()=>paint(count+1));
 return {get quote(){return quoteFleet(count)},setCount:paint};
}
