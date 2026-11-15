import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {formatTrialRemaining} from '../v3/trial-countdown.js';

const src=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('7-day trial is granted only by server for one account, no payment required',()=>{
 const sql=src('supabase/migrations/20261115120000_xrmovi_seven_day_trial.sql');
 assert.match(sql,/expiration:=started\+interval '7 days'/);
 assert.match(sql,/a\.trial_used_at is not null/);
 assert.match(sql,/ba\.owner_id=auth\.uid\(\)/);
 assert.match(sql,/exists\(select 1 from xrmovi\.billing_ledger/);
 assert.match(sql,/status='trial',trial_started_at=started,trial_used_at=started/);
 assert.match(sql,/'vehicle_limit',5,'trial_duration_days',7/);
 assert.match(sql,/revoke all on function public\.xrmovi_start_trial\(uuid\) from public, anon/);
 assert.match(sql,/grant execute on function public\.xrmovi_start_trial\(uuid\) to authenticated/);
 assert.doesNotMatch(sql,/update xrmovi\.billing_accounts.*trial_end\s*=\s*trial_started_at/s);
});

test('Countdown formats seven full days and the last seconds',()=>{
 assert.equal(formatTrialRemaining(7*86400000),'7 dias e 00:00:00 (h:min:s)');
 assert.equal(formatTrialRemaining(86400000),'1 dia e 00:00:00 (h:min:s)');
 assert.equal(formatTrialRemaining(86400000-1000),'23:59:59 (h:min:s)');
 assert.equal(formatTrialRemaining(0),'00:00:00 (h:min:s)');
 const timer=src('v3/trial-countdown.js');
 assert.match(timer,/server_now/);
 assert.match(timer,/performance\.now\(\)/);
 assert.match(timer,/onExpire/);
});

test('Marketing, signup, client access, and admin all announce seven days',()=>{
 for(const file of ['index.html','v3/onboarding.js','v3/xrmovi-adapter.js','v3/subscription-panel.js','admin/trial-panel.js','preco-sistema-gestao-frotas/index.html','perguntas-frequentes/index.html','controle-quilometragem-qr-code/index.html']){
  const content=src(file);
  assert.match(content,/7 dias/,file);
  assert.doesNotMatch(content,/teste (?:gratuito |grátis )?(?:de |por )?24 horas/i,file);
 }
 const onboarding=src('v3/onboarding.js');
 assert.match(onboarding,/client\.rpc\('xrmovi_start_trial'/);
 assert.match(onboarding,/trialRadio\.disabled=true/);
 assert.match(onboarding,/Sem cartão, sem Pix/);
});
