create or replace function public.xrmovi_admin_recurring_cancellations()
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
begin
 if auth.uid() is null or not exists(
  select 1 from xrmovi.platform_admins where user_id=auth.uid()
 ) then raise exception 'Acesso exclusivo do administrador.' using errcode='42501';end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'account_id',a.id,
   'has_recurring',a.provider='mercadopago' and a.provider_subscription_id is not null,
   'canceled',a.status='canceled',
   'canceled_at',(select x.canceled_at from xrmovi.billing_cancellations x
                  where x.account_id=a.id order by x.canceled_at desc limit 1),
   'paid_through',a.paid_through
  ))
  from xrmovi.billing_accounts a
 ),'[]'::jsonb);
end $$;
revoke all on function public.xrmovi_admin_recurring_cancellations() from public,anon;
grant execute on function public.xrmovi_admin_recurring_cancellations() to authenticated;