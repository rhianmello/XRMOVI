-- XRMOVI: last-activity signal for signed-in customers.
-- No IP, e-mail address, URL or browsing history is stored.
-- Readable only through owner-verified RPC. No anonymous or direct client reads.
create table if not exists xrmovi.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
comment on table xrmovi.user_presence is 'XRMOVI ephemeral authenticated last-seen timestamps; owner-only read via RPC.';
alter table xrmovi.user_presence enable row level security;
revoke all on xrmovi.user_presence from public, anon, authenticated;

create or replace function public.xrmovi_presence_ping()
returns void
language plpgsql volatile security definer
set search_path to ''
as $fn$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Autenticação necessária' using errcode='42501';
  end if;
  insert into xrmovi.user_presence (user_id, last_seen_at)
  values (v_user, now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
    where xrmovi.user_presence.last_seen_at < excluded.last_seen_at - interval '30 seconds';
end;
$fn$;
revoke all on function public.xrmovi_presence_ping() from public, anon;
grant execute on function public.xrmovi_presence_ping() to authenticated;

create or replace function public.xrmovi_admin_presence_list()
returns table (user_id uuid, last_seen_at timestamptz)
language plpgsql stable security definer
set search_path to ''
as $fn$
begin
  if auth.uid() is null or not exists (
    select 1 from xrmovi.platform_admins where platform_admins.user_id = auth.uid()
  ) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  return query
  select p.user_id, p.last_seen_at
  from xrmovi.user_presence as p
  where p.last_seen_at >= now() - interval '14 days';
end;
$fn$;
revoke all on function public.xrmovi_admin_presence_list() from public, anon;
grant execute on function public.xrmovi_admin_presence_list() to authenticated;
