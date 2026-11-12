// Public pricing is a preview only. Supabase recomputes and authorizes every charge.
export const INCLUDED=5;
export const BASE_CENTS=2990;
export const EXTRA_CENTS=590;
export function quoteFleet(raw){
 const n=Number(raw);
 if(!Number.isInteger(n)||n<1||n>10000)throw new RangeError('Informe de 1 a 10.000 veículos.');
 const count=Math.max(INCLUDED,n),extra=count-INCLUDED;
 return {count,extra,monthlyCents:BASE_CENTS+extra*EXTRA_CENTS,code:'fleet_'+count};
}
export const money=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function wireFleetCalculator(root,{initial=5,onChange=()=>{}}={}){
 if(!root)return null;
 const input=root.querySelector('[data-fleet-count]');
 const slider=root.querySelector('[data-fleet-slider]');
 const minus=root.querySelector('[data-fleet-minus]');
 const plus=root.querySelector('[data-fleet-plus]');
 if(!input||!slider)return null;
 let count=5;
 function paint(n){
  const quote=quoteFleet(Math.max(1,Math.min(10000,Number(n)||5)));
  count=quote.count;
  input.value=String(count);
  slider.value=String(Math.min(Number(slider.max)||200,count));
  root.querySelectorAll('[data-fleet-price]').forEach(e=>e.textContent=money(quote.monthlyCents));
  root.querySelectorAll('[data-fleet-total]').forEach(e=>e.textContent=String(quote.count));
  root.querySelectorAll('[data-fleet-extra]').forEach(e=>e.textContent=String(quote.extra));
  root.querySelectorAll('[data-fleet-extra-cost]').forEach(e=>e.textContent=money(quote.extra*EXTRA_CENTS));
  onChange(quote);
  return quote;
 }
 input.addEventListener('input',()=>{if(input.value!=='')paint(input.value)});
 input.addEventListener('change',()=>paint(input.value));
 slider.addEventListener('input',()=>paint(slider.value));
 minus?.addEventListener('click',()=>paint(count-1));
 plus?.addEventListener('click',()=>paint(count+1));
 return {get quote(){return quoteFleet(count)},setCount:paint};
}
