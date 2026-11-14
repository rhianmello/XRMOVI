-- Relatorio seguro de quem efetivamente ativou o teste gratuito no XRMOVI.
-- Aplicada no projeto ztqtcbzjesrkuaijmylm na migracao 20261114173227.
CREATE OR REPLACE FUNCTION public.xrmovi_admin_trial_acquisition()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from xrmovi.platform_admins pa where pa.user_id = (select auth.uid())
  ) then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;

  with trials as (
    select
      a.id as account_id,
      u.email,
      a.plan_code as plan,
      a.status as billing_status,
      a.trial_started_at as started_at,
      a.trial_end as expires_at,
      u.last_sign_in_at as last_login_at,
      coalesce(l.classification,'unclassified') as classification,
      exists (select 1 from xrmovi.platform_admins pa where pa.user_id = a.owner_id) as owner_admin,
      ma.source, ma.medium, ma.campaign,
      case
        when ma.user_id is null then 'nao_atribuido'
        when ma.medium in ('cpc','ppc','paid','paid_search') then 'anuncio'
        when ma.source = 'direto' and ma.medium in ('none','direct') then 'direto'
        when ma.medium = 'organic' then 'organico'
        else 'referencia'
      end as channel,
      coalesce((
        select string_agg(coalesce(nullif(c.trade_name,''),nullif(c.name,''),'Empresa'),', ' order by c.name)
        from xrmovi.account_companies ac join xrmovi.companies c on c.id=ac.company_id
        where ac.account_id=a.id
      ),'—') as companies,
      (
        exists (select 1 from xrmovi.billing_ledger bl where bl.account_id=a.id)
        or exists (select 1 from xrmovi.pix_payment_intents pi
                   where pi.account_id=a.id and pi.status='paid'
                     and pi.provider_payment_id is not null)
      ) as paid_confirmed
    from xrmovi.billing_accounts a
    join auth.users u on u.id=a.owner_id
    left join xrmovi.marketing_attribution ma on ma.user_id=a.owner_id
    left join xrmovi.account_commercial_labels l on l.account_id=a.id
    where a.trial_started_at is not null
      and (a.trial_started_at >= now()-interval '90 days'
           or (a.status='trial' and a.trial_end > now()))
  )
  select jsonb_build_object(
    'scope','admin_trial_report',
    'server_now', now(),
    'history_days',90,
    'entries',coalesce(jsonb_agg(
      jsonb_build_object(
        'account_id',t.account_id,
        'email',t.email,
        'companies',t.companies,
        'plan',t.plan,
        'started_at',t.started_at,
        'expires_at',t.expires_at,
        'last_login_at',t.last_login_at,
        'billing_status',t.billing_status,
        'classification',t.classification,
        'owner_admin',t.owner_admin,
        'source',t.source,
        'medium',t.medium,
        'campaign',t.campaign,
        'channel',t.channel,
        'paid_confirmed',t.paid_confirmed
      ) order by t.started_at desc
    ),'[]'::jsonb)
  ) into result
  from trials t;
  return result;
end;
$function$


revoke all on function public.xrmovi_admin_trial_acquisition() from public, anon, authenticated;
grant execute on function public.xrmovi_admin_trial_acquisition() to authenticated;
