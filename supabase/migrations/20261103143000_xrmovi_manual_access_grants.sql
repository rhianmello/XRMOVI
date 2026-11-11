-- XRMOVI: concessões manuais, auditáveis e temporárias por conta.
-- Não altera faturamento, cobranças, nem o status de pagamento.
create table if not exists xrmovi.manual_access_grants(
 account_id uuid primary key references xrmovi.billing_accounts(id) on delete cascade,
 valid_until timestamptz not null,
 reason text not null check (char_length(btrim(reason)) between 10 and 500),
 granted_by uuid not null references auth.users(id),
 granted_at timestamptz not null default now(),
 revoked_at timestamptz,
 revoked_by uuid references auth.users(id)
);
alter table xrmovi.manual_access_grants enable row level security;
revoke all on table xrmovi.manual_access_grants from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.xrmovi_admin_manual_access(p_account uuid, p_days integer, p_reason text, p_revoke boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 who uuid := auth.uid();
 a xrmovi.billing_accounts%rowtype;
 new_until timestamptz;
 clean_reason text := btrim(coalesce(p_reason,''));
 cid uuid;
begin
 if who is null or not exists (select 1 from xrmovi.platform_admins p where p.user_id=who)
 then raise exception 'Somente o proprietário da plataforma pode autorizar acesso manual.' using errcode='42501'; end if;

 if char_length(clean_reason) not between 10 and 500
 then raise exception 'Informe um motivo entre 10 e 500 caracteres.' using errcode='22023'; end if;
 select * into a from xrmovi.billing_accounts where id=p_account for update;
 if not found then raise exception 'Conta de faturamento não encontrada.' using errcode='22023'; end if;

 if coalesce(p_revoke,false) then
   update xrmovi.manual_access_grants
      set revoked_at=now(),revoked_by=who
    where account_id=a.id and revoked_at is null;
   if not found then raise exception 'Não há autorização manual ativa para revogar.' using errcode='22023'; end if;
   new_until := null;
 else
   if p_days not in (1,7,15,30) then
     raise exception 'Prazo permitido: 1, 7, 15 ou 30 dias.' using errcode='22023';
   end if;
   if exists (select 1 from xrmovi.client_access ca where ca.account_id=a.id and ca.blocked)
   then raise exception 'Conta bloqueada. Remova o bloqueio administrativo antes de conceder acesso.' using errcode='42501'; end if;
   new_until := now() + make_interval(days=>p_days);
   insert into xrmovi.manual_access_grants(account_id,valid_until,reason,granted_by,granted_at,revoked_at,revoked_by)
   values(a.id,new_until,clean_reason,who,now(),null,null)
   on conflict(account_id) do update
     set valid_until=excluded.valid_until,reason=excluded.reason,
         granted_by=excluded.granted_by,granted_at=excluded.granted_at,
         revoked_at=null,revoked_by=null;
 end if;

 for cid in select company_id from xrmovi.account_companies where account_id=a.id loop
  insert into xrmovi.admin_audit(actor_id,company_id,action,details)
  values(who,cid,case when coalesce(p_revoke,false) then 'manual_access_revoked' else 'manual_access_granted' end,
   jsonb_build_object('account_id',a.id,'owner_id',a.owner_id,'reason',clean_reason,
                      'duration_days',case when p_revoke then null else p_days end,
                      'valid_until',new_until,'billing_status',a.status));
 end loop;
 return jsonb_build_object('account_id',a.id,'active',not coalesce(p_revoke,false),
                           'valid_until',new_until,'billing_status',a.status);
end
$function$
;
revoke all on function public.xrmovi_admin_manual_access(uuid,integer,text,boolean) from public, anon;
grant execute on function public.xrmovi_admin_manual_access(uuid,integer,text,boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.xrmovi_admin_manual_access_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare out_json jsonb;
begin
 if auth.uid() is null or not exists(select 1 from xrmovi.platform_admins p where p.user_id=auth.uid()) then
  raise exception 'Acesso negado.' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
     'account_id',g.account_id,'active',g.revoked_at is null and g.valid_until>now(),
     'valid_until',g.valid_until,'reason',g.reason,'granted_at',g.granted_at,
     'revoked_at',g.revoked_at,'granted_by',g.granted_by
 ) order by g.granted_at desc),'[]'::jsonb)
 into out_json from xrmovi.manual_access_grants g;
 return out_json;
end
$function$
;
revoke all on function public.xrmovi_admin_manual_access_list() from public, anon;
grant execute on function public.xrmovi_admin_manual_access_list() to authenticated;

CREATE OR REPLACE FUNCTION xrmovi.company_is_paid(cid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select exists(
 select 1
 from xrmovi.account_companies ac
 join xrmovi.billing_accounts a on a.id=ac.account_id
 where ac.company_id=cid
 and not exists(select 1 from xrmovi.client_access ca where ca.account_id=a.id and ca.blocked)
 and (
  (
   a.status in ('active','canceled') and a.paid_through>now()
   and (
    (a.provider='mercadopago' and a.provider_subscription_id is not null
      and exists(select 1 from xrmovi.billing_ledger l where l.account_id=a.id and l.provider='mercadopago'))
    or
    (a.provider='mercadopago_pix' and a.provider_subscription_id like 'pix:%'
      and exists(select 1 from xrmovi.pix_payment_intents i where i.account_id=a.id and i.status='paid'
        and 'pix:'||i.provider_payment_id=a.provider_subscription_id))
   )
  )
  or exists (
   select 1 from xrmovi.manual_access_grants g
   where g.account_id=a.id and g.revoked_at is null and g.valid_until>now()
  )
 )
);
$function$
;
