-- Read-only, admin-scoped audit history for the XRMOVI commercial classification.
-- Existing classifications and customer billing/permissions remain untouched.
create or replace function public.xrmovi_admin_commercial_label_history(
  p_account uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  caller uuid := (select auth.uid());
  result jsonb;
begin
  if caller is null or not exists (
    select 1 from xrmovi.platform_admins pa where pa.user_id = caller
  ) then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id,
    'account_id', h.account_id,
    'account_email', owner_user.email,
    'previous_classification', h.previous_classification,
    'classification', h.classification,
    'reason', h.reason,
    'actor_email', actor_user.email,
    'changed_at', h.changed_at
  ) order by h.changed_at desc, h.id desc), '[]'::jsonb)
  into result
  from (
    select id, account_id, previous_classification, classification,
           reason, actor_id, changed_at
    from xrmovi.account_commercial_label_audit
    where p_account is null or account_id = p_account
    order by changed_at desc, id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
  ) h
  join xrmovi.billing_accounts ba on ba.id = h.account_id
  join auth.users owner_user on owner_user.id = ba.owner_id
  join auth.users actor_user on actor_user.id = h.actor_id;

  return result;
end;
$function$;

revoke all on function public.xrmovi_admin_commercial_label_history(uuid, integer)
from public, anon, authenticated;
grant execute on function public.xrmovi_admin_commercial_label_history(uuid, integer)
to authenticated, service_role;
