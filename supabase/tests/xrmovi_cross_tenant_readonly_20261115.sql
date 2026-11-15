-- XRMOVI 2026-11-15: non-destructive tenant authorization regression.
-- A transaction declared READ ONLY prevents persistent changes.
-- No client document, image, password, token, note or financial data is read.
-- It uses existing company/vehicle IDs internally solely to verify DENIAL.
-- No identifiers are emitted by the test.
begin read only;
do $privacy_test$
declare
  p_user uuid;
  p_victim_company uuid;
  p_victim_vehicle uuid;
  fake_path text;
  blocked boolean := false;
begin
  select m.user_id,v.company_id,v.id
    into p_user,p_victim_company,p_victim_vehicle
  from xrmovi.memberships m
  join xrmovi.vehicles v on v.company_id <> m.company_id
  where not exists (
    select 1 from xrmovi.memberships x
    where x.company_id=v.company_id and x.user_id=m.user_id
  )
  and not exists(
    select 1 from xrmovi.platform_admins a where a.user_id=m.user_id
  )
  limit 1;
  if p_user is null then
    raise exception 'Teste entre empresas bloqueado: nenhum par autorizado de identidades disponível';
  end if;
  fake_path:=p_victim_company::text||'/vehicle/'||p_victim_vehicle::text||
    '/00000000-0000-4000-8000-000000000001.pdf';

  perform set_config('request.jwt.claim.sub',p_user::text,true);
  execute 'set local role authenticated';

  if public.xrmovi_platform_is_admin() then
    raise exception 'Falha: membro de outra empresa foi reconhecido como administrador';
  end if;
  if coalesce(public.xrmovi_attachment_access(fake_path,false),false) then
    raise exception 'Falha: acesso a anexo de empresa estranha';
  end if;
  if coalesce(public.xrmovi_logo_access(p_victim_company::text||
    '/00000000-0000-4000-8000-000000000001.webp',false),false) then
    raise exception 'Falha: acesso a logo de empresa estranha';
  end if;

  begin
    perform public.xrmovi_assert_company_access(p_victim_company);
  exception when insufficient_privilege then
    blocked:=true;
  end;
  if not blocked then
    raise exception 'Falha: função de acesso a empresa não rejeitou usuário estranho';
  end if;
end
$privacy_test$;
rollback;
