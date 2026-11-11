-- XRMOVI: first-touch campaign attribution and confirmed-payment conversion metrics.
-- No payment state is changed by this migration.
create table if not exists xrmovi.marketing_attribution (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source text not null,
  medium text not null,
  campaign text not null,
  captured_at timestamptz not null default now()
);
alter table xrmovi.marketing_attribution enable row level security;
revoke all on table xrmovi.marketing_attribution from anon, authenticated;

create or replace function public.xrmovi_marketing_attribution_record(
 p_source text, p_medium text, p_campaign text
) returns boolean language plpgsql security definer set search_path = ''
as $fn$
declare v_source text; v_medium text; v_campaign text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 -- Only non-identifying campaign metadata. Do not store e-mails, URLs, ad click IDs or IP addresses.
 v_source:=lower(left(trim(coalesce(p_source,'')),80));
 v_medium:=lower(left(trim(coalesce(p_medium,'')),80));
 v_campaign:=left(trim(coalesce(p_campaign,'')),120);
 if v_source='' then v_source:='direto'; end if;
 if v_medium='' then v_medium:='none'; end if;
 if v_campaign='' then v_campaign:='sem campanha'; end if;
 if v_source ~ '[@/?#]' or v_medium ~ '[@/?#]' or v_campaign ~ '[@/?#]' then
   raise exception 'Invalid campaign metadata' using errcode='22023';
 end if;
 insert into xrmovi.marketing_attribution (user_id,source,medium,campaign)
 values (auth.uid(),v_source,v_medium,v_campaign)
 on conflict (user_id) do nothing;
 return true;
end;
$fn$;
revoke all on function public.xrmovi_marketing_attribution_record(text,text,text) from public,anon;
grant execute on function public.xrmovi_marketing_attribution_record(text,text,text) to authenticated;

create or replace function public.xrmovi_marketing_admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = ''
as $fn$
declare result jsonb;
begin
 if auth.uid() is null or not exists (select 1 from xrmovi.platform_admins where user_id=auth.uid()) then
   raise exception 'Acesso negado' using errcode='42501';
 end if;
 with payments as (
   select l.account_id,l.amount_brl,l.confirmed_at,l.provider_payment_id
     from xrmovi.billing_ledger l
   union all
   select p.account_id,p.amount_brl,p.paid_at as confirmed_at,p.provider_payment_id
     from xrmovi.pix_payment_intents p
    where p.status='paid' and p.paid_at is not null and p.provider_payment_id is not null
      and not exists (select 1 from xrmovi.billing_ledger l
                       where l.provider_payment_id=p.provider_payment_id)
 ), recent_payments as (
   select account_id,amount_brl,confirmed_at from payments
    where confirmed_at >= now()-interval '30 days'
 ), account_payments as (
   select account_id,count(*) as payments,sum(amount_brl) as revenue
     from recent_payments group by account_id
 ), campaign_report as (
   select coalesce(t.source,'não atribuído') as source,
          coalesce(t.medium,'—') as medium,
          coalesce(t.campaign,'—') as campaign,
          count(*) filter (where a.created_at >= now()-interval '30 days') as signups,
          count(ap.account_id) as customers_paid,
          coalesce(sum(ap.payments),0) as payments,
          coalesce(sum(ap.revenue),0) as revenue
     from xrmovi.billing_accounts a
     left join xrmovi.marketing_attribution t on t.user_id=a.owner_id
     left join account_payments ap on ap.account_id=a.id
    group by 1,2,3
 )
 select jsonb_build_object(
   'period_days',30,
   'accounts_created',(select count(*) from xrmovi.billing_accounts a where a.created_at>=now()-interval '30 days'),
   'checkout_attempts',(
     (select count(*) from xrmovi.billing_checkout_intents i where i.created_at>=now()-interval '30 days')+
     (select count(*) from xrmovi.pix_payment_intents i where i.created_at>=now()-interval '30 days')
   ),
   'confirmed_payments',(select count(*) from recent_payments),
   'paying_customers',(select count(distinct account_id) from recent_payments),
   'confirmed_revenue',(select coalesce(sum(amount_brl),0) from recent_payments),
   'active_verified_customers',(select count(*) from xrmovi.billing_accounts a
      where a.status='active' and a.paid_through>now()
      and exists(select 1 from payments p where p.account_id=a.id)),
   'campaigns',coalesce((select jsonb_agg(jsonb_build_object(
     'source',s.source,'medium',s.medium,'campaign',s.campaign,
     'signups',s.signups,'paying_customers',s.customers_paid,'payments',s.payments,'revenue',s.revenue
   ) order by s.revenue desc,s.signups desc) from
   (select * from campaign_report order by revenue desc, signups desc limit 20) s),'[]'::jsonb)
 ) into result;
 return result;
end;
$fn$;
revoke all on function public.xrmovi_marketing_admin_dashboard() from public,anon;
grant execute on function public.xrmovi_marketing_admin_dashboard() to authenticated;