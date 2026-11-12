import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {quoteFleet} from '../pricing/fleet-pricing.js';

const examples=[
 [1,2990],[5,2990],[6,3580],[10,5940],[15,8890],
 [20,11840],[30,17740],[50,29540],[100,59040],[10000,5900040]
];

test('Fleet pricing: five included and R$5.90 per additional vehicle',()=>{
 for(const [count,amount] of examples){
  const result=quoteFleet(count);
  assert.equal(result.monthlyCents,amount);
  assert.equal(result.count,Math.max(5,count));
  assert.equal(result.code,'fleet_'+Math.max(5,count));
 }
});

test('Fleet pricing: invalid and fractional quantity is rejected',()=>{
 for(const raw of [-1,0,1.2,10001,NaN,Infinity,'abc'])
  assert.throws(()=>quoteFleet(raw),RangeError);
});

test('The client does not grant a free trial with localStorage or browser time',()=>{
 const js=readFileSync(new URL('../v3/onboarding.js',import.meta.url),'utf8');
 assert.match(js,/client\.rpc\('xrmovi_start_trial'/);
 assert.match(js,/client\.rpc\('xrmovi_vehicle_quote'/);
 assert.match(js,/trialRadio\.disabled=true/);
 const timer=readFileSync(new URL('../v3/trial-countdown.js',import.meta.url),'utf8');
 assert.match(timer,/server_now/);
 assert.match(timer,/onExpire/);
});

test('Pricing and account limits are enforced by the server migration',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261112060000_xrmovi_fleet_pricing_trial_24h.sql',import.meta.url),'utf8');
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/trial_used_at/);
 assert.match(sql,/trial_end>now\(\)/);
 assert.match(sql,/status='trial' and kind='vehicle'/);
 assert.match(sql,/revoke all on function public\.xrmovi_start_trial/);
 assert.match(sql,/revoke all on function public\.xrmovi_set_checkout_capacity/);
 assert.match(sql,/Novo cadastro requer o valor atualizado por veículo/);
 assert.match(sql,/current_plan ~ '\^fleet_'/);
});

test('Legacy recurring checkout remains supported but has verified fleet plan code',()=>{
 const checkout=readFileSync(new URL('../supabase/functions/xrmovi-create-subscription/index.ts',import.meta.url),'utf8');
 assert.match(checkout,/\['?fleet_|\^fleet_/);
 assert.match(checkout,/xrmovi_checkout_prepare/);
 assert.match(checkout,/mercadopago/);
});
