-- Security boundary: paid status is NOT equivalent to tenant membership.
-- The previous helpers accepted unrelated authenticated callers whenever another
-- company's subscription was paid. Preserve platform-admin bypass and the
-- existing paid/trial/manual-grant decision for actual company members.
create or replace function public.xrmovi_assert_company_access(cid uuid)
returns void
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or cid is null then
    raise exception 'Conta não autorizada' using errcode = '42501';
  end if;

  if exists (
    select 1 from xrmovi.platform_admins pa where pa.user_id = caller
  ) then
    return;
  end if;

  if not exists (
    select 1 from xrmovi.memberships m
    where m.company_id = cid and m.user_id = caller
  ) then
    raise exception 'Empresa não autorizada' using errcode = '42501';
  end if;

  if not xrmovi.company_is_paid(cid) then
    raise exception
      'Assinatura ainda não paga ou acesso suspenso. Escolha um plano e conclua o pagamento em Minha assinatura.'
      using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.xrmovi_client_account_allowed(cid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and (
      exists(
        select 1 from xrmovi.platform_admins pa
        where pa.user_id = (select auth.uid())
      )
      or (
        exists(
          select 1 from xrmovi.memberships m
          where m.company_id = cid and m.user_id = (select auth.uid())
        )
        and xrmovi.company_is_paid(cid)
      )
    );
$function$;
