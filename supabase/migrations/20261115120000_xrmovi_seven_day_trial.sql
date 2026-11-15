-- XRMOVI: novos testes gratuitos duram 7 dias (168h) desde o início autorizado no servidor.
-- Não reinicia testes já utilizados, não altera trials anteriores nem assinaturas/pagamentos.
-- Preserva owner check, uso único, verificações de checkout e limite de 5 veículos.
create or replace function public.xrmovi_start_trial(cid uuid)
returns jsonb language plpgsql security definer set search_path=''
as $xrm_trial$
declare a xrmovi.billing_accounts%rowtype; started timestamptz:=now(); expiration timestamptz;
begin
 if auth.uid() is null then raise exception 'Faça login para experimentar o XRMOVI.' using errcode='42501'; end if;
 select ba.* into a from xrmovi.billing_accounts ba
 join xrmovi.account_companies ac on ac.account_id=ba.id
 where ac.company_id=cid and ba.owner_id=auth.uid() for update of ba;
 if not found then raise exception 'Somente o titular da conta pode iniciar o teste.' using errcode='42501'; end if;
 if a.status<>'pending' or a.trial_started_at is not null or a.trial_used_at is not null
  or a.trial_end is not null or a.paid_through is not null or a.provider_subscription_id is not null
  or exists(select 1 from xrmovi.billing_ledger l where l.account_id=a.id)
  or exists(select 1 from xrmovi.billing_checkout_intents i where i.account_id=a.id and i.status in ('created','pending','paid'))
  or exists(select 1 from xrmovi.pix_payment_intents p where p.account_id=a.id and p.status in ('pending','paid'))
 then raise exception 'O teste gratuito já foi utilizado ou existe pagamento iniciado. Verifique a contratação atual.' using errcode='23514'; end if;
 if a.plan_code !~ '^fleet_([5-9]|[1-9][0-9]|100)$' then
  raise exception 'Selecione a capacidade de veículos antes de iniciar o teste.' using errcode='22023';
 end if;
 expiration:=started+interval '7 days';
 update xrmovi.billing_accounts set status='trial',trial_started_at=started,trial_used_at=started,
  trial_end=expiration,updated_at=started where id=a.id;
 update xrmovi.subscriptions set status='trial',trial_end=expiration,updated_at=started
 where company_id in(select company_id from xrmovi.account_companies where account_id=a.id);
 return jsonb_build_object('status','trial','trial_started_at',started,
  'trial_expires_at',expiration,'server_now',started,'vehicle_limit',5,'trial_duration_days',7);
end
$xrm_trial$;

revoke all on function public.xrmovi_start_trial(uuid) from public, anon;

grant execute on function public.xrmovi_start_trial(uuid) to authenticated;

-- Atualiza somente a mensagem enviada ao painel depois do fim do teste.
CREATE OR REPLACE FUNCTION public.xrmovi_access_status(cid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare admin_user boolean; a xrmovi.billing_accounts%rowtype; allowed boolean;
begin
 if auth.uid() is null or not exists(
 select 1 from xrmovi.memberships m where m.company_id=cid and m.user_id=auth.uid()
 ) then
 raise exception 'Conta não autorizada' using errcode='42501';
 end if;
 admin_user:=exists(select 1 from xrmovi.platform_admins pa where pa.user_id=auth.uid());
 select ba.* into a from xrmovi.billing_accounts ba
 join xrmovi.account_companies ac on ac.account_id=ba.id
 where ac.company_id=cid;
 allowed:=admin_user or xrmovi.company_is_paid(cid);
 return jsonb_build_object(
 'allowed',allowed,
 'admin',admin_user,
 'status',coalesce(a.status,'pending'),
 'plan',a.plan_code,
 'paid_through',a.paid_through,
 'trial_end',a.trial_end,
 'server_now',now(),
 'billing_required',not allowed,
 'message',case when allowed then 'Acesso liberado.' when a.status='trial' then 'Seu teste de 7 dias terminou. Selecione cartão ou Pix para continuar.' else 'Aguardando pagamento. Escolha uma forma de contratação para liberar a frota.' end
 );
end $function$;
