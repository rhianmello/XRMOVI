import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {quoteFleet} from '../pricing/fleet-pricing.js';

const examples=[
 [1,1990],[5,1990],[6,2390],[9,3590],[10,3990],
 [11,4123],[12,4257],[20,5323],[30,6657],[40,7990],
 [41,8107],[42,8223],[50,9157],[75,12073],[100,14990]
];

test('Vehicle-by-vehicle prices interpolate exactly between commercial milestones',()=>{
 for(const [count,amount] of examples){
  const result=quoteFleet(count);
  assert.equal(result.monthlyCents,amount,'quantity '+count);
  assert.equal(result.count,Math.max(5,count));
  assert.equal(result.code,'fleet_'+Math.max(5,count));
 }
 for(let count=6;count<=100;count++)
  assert.ok(quoteFleet(count).monthlyCents>quoteFleet(count-1).monthlyCents);
});

test('Invalid or over-100 vehicle quantities are rejected',()=>{
 for(const raw of [-1,0,1.2,101,10001,NaN,Infinity,'abc'])
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
 const sql=readFileSync(new URL('../supabase/migrations/20261112134633_xrmovi_fleet_exact_vehicle_pricing_and_one_time_trial.sql',import.meta.url),'utf8');
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
