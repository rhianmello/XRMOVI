
create table if not exists xrmovi.billing_cancellations (
 id bigint generated always as identity primary key,
 account_id uuid not null references xrmovi.billing_accounts(id),
 provider_subscription_id text not null,
 canceled_by uuid not null,
 channel text not null check (channel in ('customer','administrator')),
 reason text not null,
 canceled_at timestamptz not null default now(),
 paid_through timestamptz,
 provider_status text not null default 'canceled',
 unique (provider_subscription_id)
);
create index if not exists billing_cancellations_account_id_idx on xrmovi.billing_cancellations(account_id);
revoke all on xrmovi.billing_cancellations from public, anon, authenticated;
alter table xrmovi.billing_cancellations enable row level security;

create or replace function public.xrmovi_billing_cancel_target(
 p_actor uuid, p_account uuid default null, p_company uuid default null
) returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare a xrmovi.billing_accounts%rowtype; i xrmovi.billing_checkout_intents%rowtype; is_admin boolean;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then
  raise exception 'Acesso exclusivo do serviço de cobrança.' using errcode='42501';
 end if;
 if p_actor is null or ((p_account is null) = (p_company is null)) then
  raise exception 'Informe apenas uma referência válida.' using errcode='22023';
 end if;
 is_admin:=exists(select 1 from xrmovi.platform_admins where user_id=p_actor);
 if p_account is not null then
  if not is_admin then raise exception 'Somente o administrador pode cancelar outra conta.' using errcode='42501'; end if;
  select * into a from xrmovi.billing_accounts where id=p_account;
 else
  select ba.* into a from xrmovi.billing_accounts ba
  join xrmovi.account_companies ac on ac.account_id=ba.id
  where ac.company_id=p_company and ba.owner_id=p_actor;
 end if;
 if a.id is null then raise exception 'Assinatura não encontrada ou sem autorização.' using errcode='42501'; end if;
 if a.provider is distinct from 'mercadopago' or nullif(a.provider_subscription_id,'') is null then
  raise exception 'Esta conta não possui renovação por cartão no Mercado Pago. Pix não possui cobrança recorrente.' using errcode='22023';
 end if;
 if a.status not in ('active','canceled','paused','pending') then
  raise exception 'A assinatura não pode ser cancelada neste estado.' using errcode='22023';
 end if;
 select * into i from xrmovi.billing_checkout_intents
 where account_id=a.id and provider='mercadopago' and provider_subscription_id=a.provider_subscription_id
 order by created_at desc limit 1;
 if i.id is null then raise exception 'Não foi possível confirmar a assinatura original.' using errcode='23514';end if;
 return jsonb_build_object('account_id',a.id,'preapproval_id',a.provider_subscription_id,
 'reference_id',i.id,'actor_id',p_actor,
 'channel',case when p_account is not null then 'administrator' else 'customer' end,
 'financial_status',a.status,'paid_through',a.paid_through,'amount_brl',i.amount_brl);
end $$;
revoke all on function public.xrmovi_billing_cancel_target(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.xrmovi_billing_cancel_target(uuid,uuid,uuid) to service_role;

create or replace function public.xrmovi_billing_cancel_record(
 p_actor uuid,p_account uuid,p_preapproval text,p_channel text,p_reason text
) returns jsonb language plpgsql security definer set search_path to ''
as $$
declare a xrmovi.billing_accounts%rowtype; c uuid; is_admin boolean;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then
  raise exception 'Acesso exclusivo do serviço de cobrança.' using errcode='42501';
 end if;
 if p_channel not in ('administrator','customer') or p_actor is null
 or length(trim(coalesce(p_reason,'')))<10 or length(p_reason)>500 then
  raise exception 'Dados de cancelamento inválidos.' using errcode='22023';
 end if;
 is_admin:=exists(select 1 from xrmovi.platform_admins where user_id=p_actor);
 select * into a from xrmovi.billing_accounts where id=p_account for update;
 if a.id is null or a.provider is distinct from 'mercadopago'
 or a.provider_subscription_id is distinct from p_preapproval then
  raise exception 'Assinatura não corresponde ao cliente.' using errcode='23514';
 end if;
 if (p_channel='administrator' and not is_admin)
 or (p_channel='customer' and a.owner_id is distinct from p_actor) then
  raise exception 'Ação não autorizada.' using errcode='42501';
 end if;
 -- The Edge Function has already confirmed canceled status with Mercado Pago.
 update xrmovi.billing_accounts
 set status='canceled',updated_at=now() where id=a.id and status<>'canceled';
 update xrmovi.subscriptions
 set status='canceled',updated_at=now()
 where company_id in (select ac.company_id from xrmovi.account_companies ac where ac.account_id=a.id)
 and status<>'canceled';
 insert into xrmovi.billing_cancellations(account_id,provider_subscription_id,canceled_by,channel,reason,paid_through)
 values(a.id,p_preapproval,p_actor,p_channel,trim(p_reason),a.paid_through)
 on conflict(provider_subscription_id) do nothing;
 if found then
  for c in select company_id from xrmovi.account_companies where account_id=a.id loop
   insert into xrmovi.admin_audit(actor_id,company_id,action,details)
   values(p_actor,c,'subscription_cancelled',
    jsonb_build_object('account_id',a.id,'channel',p_channel,'reason',left(trim(p_reason),500),'paid_through',a.paid_through));
  end loop;
 end if;
 return jsonb_build_object('status','canceled','paid_through',a.paid_through,
 'retains_access',a.paid_through>now(),'message','Renovação cancelada no Mercado Pago.');
end $$;
revoke all on function public.xrmovi_billing_cancel_record(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.xrmovi_billing_cancel_record(uuid,uuid,text,text,text) to service_role;
