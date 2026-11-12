create or replace function public.xrmovi_can_access_odometer_photo(p_path text)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
select auth.uid() is not null and exists (
  select 1
  from (
    select company_id from xrmovi.odometer_reports where photo_path = p_path
    union all
    select company_id from xrmovi.driver_service_submissions where photo_path = p_path
  ) as proof
  join xrmovi.memberships m on m.company_id = proof.company_id
    and m.user_id = auth.uid() and m.role in ('owner', 'manager')
  where xrmovi.company_is_paid(proof.company_id)
     or exists (select 1 from xrmovi.platform_admins pa where pa.user_id = auth.uid())
)
$function$;
