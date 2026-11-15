-- XRMOVI security hardening 2026-11-15.
-- Based exactly on the existing production functions. Preserve existing token
-- validation, pending-approval semantics, company/payment guards and grants.
-- These changes never read file bytes, modify stored images or affect payments.
-- QR mileage: preserve the 6/hour quota, make it race-safe.
-- QR fuel/oil: add 12/hour per vehicle quota, race-safe.
-- Both: enforce exact proof path for the token's vehicle and existing Storage
-- object with verified metadata length. Edge Function already uploads first
-- and removes its new file if a registration is rejected.

CREATE OR REPLACE FUNCTION public.xrmovi_qr_submit(token uuid, p_meter numeric, p_driver text, p_photo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v xrmovi.vehicles%rowtype; rule xrmovi.vehicle_mileage_rules%rowtype;
 previous timestamptz; days numeric; limit_km numeric;
 reason text; status_ text; recent integer;
begin
 if token is null or p_meter is null or p_meter::text in ('NaN','Infinity','-Infinity')
 or p_meter<0 or p_meter>10000000
 or length(trim(coalesce(p_driver,'')))<2 or length(trim(coalesce(p_driver,'')))>100
 or p_photo is null or length(p_photo)>350 or p_photo !~ '^[-a-z0-9/]+[.](jpg|jpeg|png|webp)$' then
  raise exception 'Dados inválidos para o envio' using errcode='22023';end if;
 select * into rule from xrmovi.vehicle_mileage_rules where qr_token=token;
 if not found then raise exception 'QR Code inválido ou cancelado' using errcode='22023';end if;
 if not xrmovi.company_is_paid(rule.company_id) then raise exception 'QR Code indisponível: assinatura não paga.' using errcode='42501';end if;
 -- Validate the exact newly uploaded proof path and real Storage metadata.
 if p_photo !~ ('^qr/' || rule.vehicle_id::text ||
   '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)
 -- Lock the vehicle first; this serializes simultaneous QR submissions and
 -- makes the existing six/hour limit effective under concurrency.
 select * into v from xrmovi.vehicles where id=rule.vehicle_id and company_id=rule.company_id for update;
 if not found then raise exception 'Veículo inválido' using errcode='22023'; end if;
 select count(*) into recent from xrmovi.odometer_reports
 where vehicle_id=rule.vehicle_id and source='qr' and submitted_at>now()-interval '1 hour';
 if recent>=6 then raise exception 'Limite de envios atingido. Tente novamente mais tarde.';end if;
 previous:=coalesce(rule.last_meter_at,v.created_at);
 days:=greatest(1,extract(epoch from(now()-previous))/86400);
 limit_km:=rule.weekly_max_km*greatest(1,days/7);
 reason:=case when p_meter<coalesce(v.odometer_value,0) then 'Leitura inferior à quilometragem confirmada'
  when p_meter-coalesce(v.odometer_value,0)>limit_km then 'Quilometragem acima do limite semanal configurado'
  else null end;
 status_:='pending';
 reason:=coalesce(reason,'Aguardando aprovação do gestor e conferência da foto');
 insert into xrmovi.odometer_reports(
   company_id,vehicle_id,meter,source,driver_name,photo_path,status,alert_reason,
   applied_meter,baseline_meter,submitted_by
 ) values(
   rule.company_id,rule.vehicle_id,p_meter,'qr',left(trim(p_driver),100),p_photo,status_,reason,
   case when reason is null then p_meter else null end,v.odometer_value,null
 );
 -- Leituras do motorista permanecem pendentes até decisão autenticada do gestor.
 return jsonb_build_object('status',status_,'reason',reason);
end $function$
)
   or not exists(
     select 1 from storage.objects o where o.bucket_id='xrmovi-odometer-proof'
       and o.name=p_photo
       and (o.metadata->>'size')::bigint between 100 and 5242880
   ) then raise exception 'Foto inválida ou inexistente' using errcode='22023'; end if;
 -- Lock the vehicle first; this serializes simultaneous QR submissions and
 -- makes the existing six/hour limit effective under concurrency.
 select * into v from xrmovi.vehicles where id=rule.vehicle_id and company_id=rule.company_id for update;
 if not found then raise exception 'Veículo inválido' using errcode='22023'; end if;
 select count(*) into recent from xrmovi.odometer_reports
 where vehicle_id=rule.vehicle_id and source='qr' and submitted_at>now()-interval '1 hour';
 if recent>=6 then raise exception 'Limite de envios atingido. Tente novamente mais tarde.';end if;
 previous:=coalesce(rule.last_meter_at,v.created_at);
 days:=greatest(1,extract(epoch from(now()-previous))/86400);
 limit_km:=rule.weekly_max_km*greatest(1,days/7);
 reason:=case when p_meter<coalesce(v.odometer_value,0) then 'Leitura inferior à quilometragem confirmada'
  when p_meter-coalesce(v.odometer_value,0)>limit_km then 'Quilometragem acima do limite semanal configurado'
  else null end;
 status_:='pending';
 reason:=coalesce(reason,'Aguardando aprovação do gestor e conferência da foto');
 insert into xrmovi.odometer_reports(
   company_id,vehicle_id,meter,source,driver_name,photo_path,status,alert_reason,
   applied_meter,baseline_meter,submitted_by
 ) values(
   rule.company_id,rule.vehicle_id,p_meter,'qr',left(trim(p_driver),100),p_photo,status_,reason,
   case when reason is null then p_meter else null end,v.odometer_value,null
 );
 -- Leituras do motorista permanecem pendentes até decisão autenticada do gestor.
 return jsonb_build_object('status',status_,'reason',reason);
end $function$


CREATE OR REPLACE FUNCTION public.xrmovi_qr_service_submit(token uuid, p_kind text, p_driver text, p_date date, p_meter numeric, p_liters numeric, p_cost numeric, p_station text, p_oil_type text, p_notes text, p_photo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; new_id uuid; recent integer;
begin
 select r.company_id,r.vehicle_id into v from xrmovi.vehicle_mileage_rules r
 where r.qr_token=token and xrmovi.company_is_paid(r.company_id);
 if not found then raise exception 'QR Code inválido ou acesso indisponível'; end if;
 if p_kind not in ('fuel','oil') or length(trim(coalesce(p_driver,''))) not between 2 and 100 or p_date is null or p_date>current_date or p_date<current_date-365 or p_meter is null or p_meter<0 or p_meter>10000000 then raise exception 'Dados inválidos'; end if;
 if p_kind='fuel' and (p_liters is null or p_liters<=0 or p_liters>10000 or p_cost is null or p_cost<0 or p_cost>1000000 or length(trim(coalesce(p_station,'')))<2) then raise exception 'Confira litros, valor e posto';end if;
 if p_kind='oil' and length(trim(coalesce(p_oil_type,'')))<2 then raise exception 'Informe o tipo de óleo';end if;
 -- Bind every receipt to this token's vehicle and to an object uploaded
 -- successfully by the QR Edge Function. No arbitrary DB path can be stored.
 if p_photo is null or p_photo !~ ('^qr-services/' || v.vehicle_id::text ||
   '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)
 insert into xrmovi.driver_service_submissions(company_id,vehicle_id,kind,driver_name,event_date,meter,liters,total_cost,station,oil_type,notes,photo_path)
 values(v.company_id,v.vehicle_id,p_kind,trim(p_driver),p_date,p_meter,p_liters,p_cost,left(trim(p_station),150),left(trim(p_oil_type),150),left(trim(p_notes),1000),p_photo) returning id into new_id;
 return new_id;
end $function$
)
   or not exists (
     select 1 from storage.objects o where o.bucket_id='xrmovi-odometer-proof'
       and o.name=p_photo
       and (o.metadata->>'size')::bigint between 100 and 5242880
   ) then raise exception 'Comprovante inválido' using errcode='22023'; end if;
 -- Serialize per-vehicle submissions before counting, so concurrent requests
 -- cannot exceed the same quota with a race between COUNT and INSERT.
 perform 1 from xrmovi.vehicles ve
   where ve.id=v.vehicle_id and ve.company_id=v.company_id for update;
 if not found then raise exception 'Veículo inválido' using errcode='22023'; end if;
 select count(*) into recent from xrmovi.driver_service_submissions s
   where s.vehicle_id=v.vehicle_id and s.created_at>now()-interval '1 hour';
 if recent>=12 then
   raise exception 'Limite de comprovantes por veículo atingido. Tente mais tarde.'
     using errcode='22023';
 end if;
 insert into xrmovi.driver_service_submissions(company_id,vehicle_id,kind,driver_name,event_date,meter,liters,total_cost,station,oil_type,notes,photo_path)
 values(v.company_id,v.vehicle_id,p_kind,trim(p_driver),p_date,p_meter,p_liters,p_cost,left(trim(p_station),150),left(trim(p_oil_type),150),left(trim(p_notes),1000),p_photo) returning id into new_id;
 return new_id;
end $function$


-- Do not expose service-role-only registration RPCs to the browser.
revoke all on function public.xrmovi_qr_submit(uuid,numeric,text,text) from public,anon,authenticated;
revoke all on function public.xrmovi_qr_service_submit(uuid,text,text,date,numeric,numeric,numeric,text,text,text,text) from public,anon,authenticated;
grant execute on function public.xrmovi_qr_submit(uuid,numeric,text,text) to service_role;
grant execute on function public.xrmovi_qr_service_submit(uuid,text,text,date,numeric,numeric,numeric,text,text,text,text) to service_role;
