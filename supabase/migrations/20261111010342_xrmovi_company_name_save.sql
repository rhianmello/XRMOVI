create or replace function public.xrmovi_company_name_save(cid uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := regexp_replace(coalesce(p_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  saved jsonb;
begin
  perform public.xrmovi_assert_company_access(cid);
  if not exists (
    select 1 from xrmovi.memberships m
    where m.company_id = cid and m.user_id = (select auth.uid())
      and m.role in ('owner', 'manager')
  ) then
    raise exception 'Você não tem permissão para alterar este nome.' using errcode = '42501';
  end if;
  if char_length(clean_name) not between 2 and 160 then
    raise exception 'Informe um nome com 2 a 160 caracteres.' using errcode = '22023';
  end if;
  update xrmovi.companies c set name = clean_name where c.id = cid
  returning jsonb_build_object('id', c.id, 'name', c.name) into saved;
  return saved;
end;
$$;

revoke execute on function public.xrmovi_company_name_save(uuid, text) from public, anon;
grant execute on function public.xrmovi_company_name_save(uuid, text) to authenticated;
