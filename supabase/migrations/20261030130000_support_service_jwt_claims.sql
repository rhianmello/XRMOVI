-- Recorded after live verification: migrate support queue service-only RPCs to signed JWT claims.
-- Retains job scheduling, message data, retries, and existing RLS grants.

CREATE OR REPLACE FUNCTION public.xrmovi_support_mail_claim(max_messages integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb;
begin
 if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Restricted to notification service' using errcode='42501';end if;
 with selected as (
  select id from xrmovi.support_email_outbox
  where delivery_status in ('queued','processing') and next_attempt_at<=now() and attempts<12
  order by created_at
  for update skip locked
  limit least(greatest(coalesce(max_messages,1),1),10)
 ), changed as (
  update xrmovi.support_email_outbox q
  set delivery_status='processing',attempts=q.attempts+1,next_attempt_at=now()+interval '5 minutes'
  from selected where q.id=selected.id
  returning q.id,q.account_id,q.message_id,q.attempts
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'message_id',c.message_id,
  'sender',(select u.email from xrmovi.client_messages cm join auth.users u on u.id=cm.sender_id where cm.id=c.message_id),
  'company',(select coalesce(min(comp.name),'Cliente XRMOVI') from xrmovi.account_companies ac join xrmovi.companies comp on comp.id=ac.company_id where ac.account_id=c.account_id),
  'created_at',(select cm.created_at from xrmovi.client_messages cm where cm.id=c.message_id),
  'attempts',c.attempts
  )),'[]'::jsonb) into payload from changed c;
 return payload;
end $function$
;

CREATE OR REPLACE FUNCTION public.xrmovi_support_mail_finish(p_id uuid, p_sent boolean, p_provider_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Restricted to notification service' using errcode='42501';end if;
 update xrmovi.support_email_outbox
 set delivery_status=case when p_sent then 'sent' else 'queued' end,
  sent_at=case when p_sent then now() else null end,
  provider_id=case when p_sent then left(coalesce(p_provider_id,''),150) else null end,
  last_error=case when p_sent then null else left(coalesce(p_error,'Falha de envio'),350) end,
  next_attempt_at=case when p_sent then now() else now()+(interval '5 minutes' * least(attempts,12)) end
 where id=p_id and delivery_status='processing';
end $function$
;

revoke all on function public.xrmovi_support_mail_claim(integer) from public, anon, authenticated;
grant execute on function public.xrmovi_support_mail_claim(integer) to service_role;
revoke all on function public.xrmovi_support_mail_finish(uuid,boolean,text,text) from public, anon, authenticated;
grant execute on function public.xrmovi_support_mail_finish(uuid,boolean,text,text) to service_role;
