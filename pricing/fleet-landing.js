import {wireFleetCalculator} from './fleet-pricing.js';
const root=document.querySelector('[data-fleet-calculator]');
const controls=wireFleetCalculator(root,{initial:5,onChange:quote=>{
 const qty=quote.count;
 for(const link of document.querySelectorAll('[data-fleet-cta]')){
  const trial=link.hasAttribute('data-fleet-trial');
  link.href='/?login=1';
  link.onclick=null;
 }
}});
if(controls)controls.setCount(5);
