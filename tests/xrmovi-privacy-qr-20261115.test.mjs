import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261115170000_xrmovi_qr_proof_boundary_rate_guards.sql'),'utf8');
const service=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.xrmovi_qr_service_submit'));
const mileage=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.xrmovi_qr_submit'),sql.indexOf('CREATE OR REPLACE FUNCTION public.xrmovi_qr_service_submit'));
test('exactly two complete PL/pgSQL function bodies, with no trailing replacement fragment',()=>{
 assert.equal((sql.match(/AS \\$function\\$/g)||[]).length,2);
 assert.equal((sql.match(/end \\$function\\$/g)||[]).length,2);
 assert.equal(mileage.trim().endsWith('end $function$;'),true);
 assert.equal((sql.match(/end \\$function\\$;/g)||[]).length,2);
 assert.equal((mileage.match(/insert into xrmovi\\.odometer_reports/g)||[]).length,1);
 assert.equal((service.match(/insert into xrmovi\\.driver_service_submissions/g)||[]).length,1);
 assert.ok(mileage.includes("[.](jpg|png|webp)$')"));
 assert.ok(service.includes("[.](jpg|png|webp)$')"));
});

test('QR mileage quota is still 6/hour and checks after row lock',()=>{
 const lock=mileage.indexOf('for update;');
 const quota=mileage.indexOf('select count(*) into recent');
 const insert=mileage.indexOf('insert into xrmovi.odometer_reports');
 assert.ok(lock>0&&quota>lock&&insert>quota);
 assert.match(mileage,/recent>=6/);
 assert.match(mileage,/vehicle_id=rule.vehicle_id and source='qr' and submitted_at>now\(\)-interval '1 hour'/);
 assert.match(mileage,/status_:='pending'/);
});
test('QR mileage proof must already exist for the token vehicle and be under 5MiB',()=>{
 assert.match(mileage,/\^qr\/' \|\| rule.vehicle_id::text/);
 assert.match(mileage,/o.bucket_id='xrmovi-odometer-proof'/);
 assert.match(mileage,/o.name=p_photo/);
 assert.match(mileage,/metadata->>'size'\)::bigint between 100 and 5242880/);
 assert.match(mileage,/Foto inválida ou inexistente/);
});
test('fuel and oil submissions are serially rate-limited per vehicle, not token',()=>{
 const lock=service.indexOf('for update;');
 const count=service.indexOf('select count(*) into recent');
 const insert=service.indexOf('insert into xrmovi.driver_service_submissions');
 assert.ok(lock>0&&count>lock&&insert>count);
 assert.match(service,/recent>=12/);
 assert.match(service,/s.vehicle_id=v.vehicle_id and s.created_at>now\(\)-interval '1 hour'/);
 assert.match(service,/p_kind not in \('fuel','oil'\)/);
 assert.match(service,/xrmovi.company_is_paid\(r.company_id\)/);
});
test('fuel and oil paths are unforgeably scoped to the current QR vehicle',()=>{
 assert.match(service,/\^qr-services\/' \|\| v.vehicle_id::text/);
 assert.match(service,/o.bucket_id='xrmovi-odometer-proof'/);
 assert.match(service,/o.name=p_photo/);
 assert.match(service,/metadata->>'size'\)::bigint between 100 and 5242880/);
 assert.match(service,/Comprovante inválido/);
});
test('QR write RPCs never become browser-callable and no customer data is erased',()=>{
 const functions=['xrmovi_qr_submit\(uuid,numeric,text,text\)',
                  'xrmovi_qr_service_submit\(uuid,text,text,date,numeric,numeric,numeric,text,text,text,text\)'];
 for(const sig of functions){
  assert.ok(sql.includes('revoke all on function public.'+sig+' from public,anon,authenticated;'));
  assert.ok(sql.includes('grant execute on function public.'+sig+' to service_role;'));
 }
 assert.doesNotMatch(sql,/\bdelete\s+from\s+(?:xrmovi|storage)\.|\btruncate\b|\bdrop\s+table\b|\bdrop\s+policy\b/i);
});
test('QR calls retain pending manager approval and do not touch commercial services',()=>{
 assert.match(service,/insert into xrmovi.driver_service_submissions/);
 assert.match(mileage,/Aguardando aprovação do gestor e conferência da foto/);
 assert.doesNotMatch(sql,/mercado_pago|mercadopago|xrmovi\.subscriptions|xrmovi\.billing_accounts/i);
});
