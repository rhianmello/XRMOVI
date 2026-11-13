-- Non-destructive, admin-only sales report: count real external customers ONLY when
-- the owner has explicitly classified the billing account as external.
-- No payment is created, reclassified, resent or changed by this read-only RPC.
create or replace function public.xrmovi_marketing_admin_dashboard_verified()
returns jsonb language plpgsql stable security definer
set search_path = ''
as $function$
declare result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from xrmovi.platform_admins pa where pa.user_id = (select auth.uid())
  ) then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;
  with
    eligible as (
      select a.id, a.owner_id, a.status, a.paid_through, a.created_at
      from xrmovi.billing_accounts a
      join xrmovi.account_commercial_labels c
        on c.account_id = a.id and c.classification = 'external'
      where not exists (
        select 1 from xrmovi.platform_admins p where p.user_id = a.owner_id
      )
    ),
    all_payments as (
      select l.account_id,l.amount_brl,l.confirmed_at,l.provider_payment_id
      from xrmovi.billing_ledger l
      union all
      select p.account_id,p.amount_brl,p.paid_at,p.provider_payment_id
      from xrmovi.pix_payment_intents p
      where p.status='paid' and p.paid_at is not null
        and not exists (
          select 1 from xrmovi.billing_ledger l
          where l.provider_payment_id = p.provider_payment_id
            and p.provider_payment_id is not null
        )
    ),
    recent as (
      select account_id,amount_brl,confirmed_at from all_payments
      where confirmed_at >= now() - interval '30 days'
    ),
    commercial_recent as (
      select p.account_id,p.amount_brl,p.confirmed_at
      from recent p join eligible a on a.id = p.account_id
    ),
    per_account as (
      select account_id,count(*) as payments,sum(amount_brl) as revenue
      from commercial_recent group by account_id
    ),
    campaign_report as (
      select coalesce(t.source,'não atribuído') source,
             coalesce(t.medium,'—') medium,
             coalesce(t.campaign,'—') campaign,
             count(*) filter (where a.created_at >= now()-interval '30 days') as signups,
             count(ap.account_id) as customers_paid,
             coalesce(sum(ap.payments),0) as payments,
             coalesce(sum(ap.revenue),0) as revenue
      from eligible a
      left join xrmovi.marketing_attribution t on t.user_id = a.owner_id
      left join per_account ap on ap.account_id = a.id
      where a.created_at >= now()-interval '30 days' or ap.account_id is not null
      group by 1,2,3
    )
    select jsonb_build_object(
      'period_days',30,
      'scope','classified_external_only',
      'accounts_created',(select count(*) from eligible where created_at>=now()-interval '30 days'),
      'checkout_attempts',(
        (select count(*) from xrmovi.billing_checkout_intents i
           join eligible a on a.id=i.account_id
           where i.created_at>=now()-interval '30 days')+
        (select count(*) from xrmovi.pix_payment_intents i
           join eligible a on a.id=i.account_id
           where i.created_at>=now()-interval '30 days')
      ),
      'confirmed_payments',(select count(*) from commercial_recent),
      'paying_customers',(select count(distinct account_id) from commercial_recent),
      'confirmed_revenue',(select coalesce(sum(amount_brl),0) from commercial_recent),
      'active_verified_customers',(
        select count(*) from eligible a
        where a.status='active' and a.paid_through>now()
          and exists(select 1 from all_payments p where p.account_id=a.id)
      ),
      'unclassified_accounts',(
        select count(*) from xrmovi.billing_accounts a
        left join xrmovi.account_commercial_labels c on c.account_id=a.id
        where coalesce(c.classification,'unclassified')='unclassified'
          and not exists (select 1 from xrmovi.platform_admins ad where ad.user_id=a.owner_id)
      ),
      'historical_payments',(select count(*) from recent),
      'historical_revenue',(select coalesce(sum(amount_brl),0) from recent),
      'excluded_payments',(
        select count(*) from recent r
        where not exists (select 1 from eligible a where a.id=r.account_id)
      ),
      'campaigns',coalesce((select jsonb_agg(jsonb_build_object(
        'source',s.source,'medium',s.medium,'campaign',s.campaign,
        'signups',s.signups,'paying_customers',s.customers_paid,
        'payments',s.payments,'revenue',s.revenue
      ) order by s.revenue desc,s.signups desc)
      from (select * from campaign_report order by revenue desc,signups desc limit 20) s),'[]'::jsonb)
    ) into result;
  return result;
end;
$function$;

revoke all on function public.xrmovi_marketing_admin_dashboard_verified()
  from public,anon,authenticated;
grant execute on function public.xrmovi_marketing_admin_dashboard_verified()
  to authenticated,service_role;
