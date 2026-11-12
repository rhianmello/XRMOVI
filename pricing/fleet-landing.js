import {wireFleetCalculator} from './fleet-pricing.js?v=20261112-ladder1';
const root=document.querySelector('[data-fleet-calculator]');
const controls=wireFleetCalculator(root,{initial:5,onChange:quote=>{
 const qty=quote.count;
 for(const link of document.querySelectorAll('[data-fleet-cta]')){
  const trial=link.hasAttribute('data-fleet-trial');
  link.href='/?login=1&vehicles='+qty+(trial?'&trial=1':'');
  link.onclick=()=>{try{localStorage.setItem('xrmovi_fleet_vehicles',String(qty));localStorage.setItem('xrmovi_fleet_trial_intent',trial?'1':'0')}catch{}};
 }
}});
if(controls)controls.setCount(5);
