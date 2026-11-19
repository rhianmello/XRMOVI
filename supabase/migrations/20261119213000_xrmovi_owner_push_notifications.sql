-- XRMOVI: Web Push do proprietário (eventos privados, envio desacoplado e auditável).
-- Não modifica cobranças, permissões comerciais nem mensagens existentes.
create table if not exists xrmovi.owner_push_state (
 id smallint primary key default 1 check (id=1),
 public_key text not null,
 private_secret_id uuid not null,
 webhook_secret_id uuid not null,
 created_at timestamptz not null default now()
);
create table if not exists xrmovi.owner_push_subscriptions (
 id bigserial primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique,
 p256dh text not null,
 auth_key text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists xrmovi.owner_push_events (
 id bigserial primary key,
 event_key text not null unique,
 kind text not null check (kind in ('signup','support','test')),
 title text not null,
 body text not null,
 url text not null,
 created_at timestamptz not null default now()
);
create table if not exists xrmovi.owner_push_outbox (
 id bigserial primary key,
 event_id bigint not null references xrmovi.owner_push_events(id) on delete cascade,
 subscription_id bigint not null references xrmovi.owner_push_subscriptions(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
 attempts integer not null default 0,
 claimed_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 error_text text,
 created_at timestamptz not null default now(),
 unique(event_id,subscription_id)
);
create index if not exists owner_push_outbox_pending_idx
 on xrmovi.owner_push_outbox(status,next_attempt_at,id) where status in ('pending','sending');
create index if not exists owner_push_events_time_idx on xrmovi.owner_push_events(created_at desc);

alter table xrmovi.owner_push_state enable row level security;
alter table xrmovi.owner_push_subscriptions enable row level security;
alter table xrmovi.owner_push_events enable row level security;
alter table xrmovi.owner_push_outbox enable row level security;
revoke all on xrmovi.owner_push_state,xrmovi.owner_push_subscriptions,xrmovi.owner_push_events,xrmovi.owner_push_outbox from public,anon,authenticated;
revoke all on sequence xrmovi.owner_push_subscriptions_id_seq,xrmovi.owner_push_events_id_seq,xrmovi.owner_push_outbox_id_seq from public,anon,authenticated;

create or replace function public.xrmovi_owner_push_bootstrap(p_public text,p_private text,p_hook text)
returns text language plpgsql security definer set search_path='' as $$
declare k text;
begin
 perform pg_catalog.pg_advisory_xact_lock(973715012);
 select s.public_key into k from xrmovi.owner_push_state s where s.id=1;
 if k is not null then return k; end if;
 if length(coalesce(p_public,''))<40 or length(coalesce(p_private,''))<30 or length(coalesce(p_hook,''))<32 then
  raise exception 'Chaves de push inválidas';
 end if;
 insert into xrmovi.owner_push_state(id,public_key,private_secret_id,webhook_secret_id)
 values(1,p_public,
  vault.create_secret(p_private,'xrmovi_owner_push_vapid','VAPID private key; server-side only'),
  vault.create_secret(p_hook,'xrmovi_owner_push_webhook','Autenticação de eventos Web Push'));
 return p_public;
end $$;

create or replace function public.xrmovi_owner_push_state()
returns jsonb language sql stable security definer set search_path='' as $$
 select pg_catalog.jsonb_build_object(
  'public_key',s.public_key,
  'private_key',(select v.decrypted_secret from vault.decrypted_secrets v where v.id=s.private_secret_id),
  'webhook_secret',(select v.decrypted_secret from vault.decrypted_secrets v where v.id=s.webhook_secret_id)
 )
 from xrmovi.owner_push_state s where s.id=1
$$;

create or replace function public.xrmovi_owner_push_register(p_endpoint text,p_p256dh text,p_auth text)
returns boolean language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();
begin
 if who is null or not exists(select 1 from xrmovi.platform_admins where user_id=who) then
  raise exception 'Acesso negado' using errcode='42501';
 end if;
 if length(coalesce(p_endpoint,'')) not between 50 and 2048
 or p_endpoint !~ '^https://'
 or length(coalesce(p_p256dh,'')) not between 60 and 140
 or length(coalesce(p_auth,'')) not between 15 and 90 then
  raise exception 'Inscrição push inválida';
 end if;
 insert into xrmovi.owner_push_subscriptions(owner_id,endpoint,p256dh,auth_key)
 values(who,p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set owner_id=excluded.owner_id,p256dh=excluded.p256dh,
 auth_key=excluded.auth_key,updated_at=now();
 return true;
end $$;

create or replace function public.xrmovi_owner_push_unregister(p_endpoint text)
returns boolean language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();
begin
 if who is null or not exists(select 1 from xrmovi.platform_admins where user_id=who) then
  raise exception 'Acesso negado' using errcode='42501';
 end if;
 delete from xrmovi.owner_push_subscriptions where endpoint=p_endpoint and owner_id=who;
 return true;
end $$;

create or replace function public.xrmovi_owner_push_claim(p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 with chosen as (
  select q.id from xrmovi.owner_push_outbox q
  where (q.status='pending' and q.next_attempt_at<=now())
     or (q.status='sending' and q.claimed_at<now()-interval '5 minutes')
  order by q.id limit least(greatest(coalesce(p_limit,30),1),50) for update skip locked
 ), claims as (
  update xrmovi.owner_push_outbox o
  set status='sending', attempts=o.attempts+1, claimed_at=now()
  from chosen c where o.id=c.id
  returning o.id,o.event_id,o.subscription_id,o.attempts
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'job_id',c.id,'attempts',c.attempts,'endpoint',s.endpoint,'p256dh',s.p256dh,
  'auth_key',s.auth_key,'title',e.title,'body',e.body,'url',e.url,'event_id',e.id
 )),'[]'::jsonb) into result
 from claims c join xrmovi.owner_push_subscriptions s on s.id=c.subscription_id
 join xrmovi.owner_push_events e on e.id=c.event_id;
 return result;
end $$;

create or replace function public.xrmovi_owner_push_complete(p_job bigint,p_ok boolean,p_gone boolean default false,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare sub_id bigint;
begin
 update xrmovi.owner_push_outbox o set
  status=case when p_ok then 'sent' when o.attempts>=3 or p_gone then 'failed' else 'pending' end,
  claimed_at=null,
  next_attempt_at=now()+interval '2 minutes',
  error_text=case when p_ok then null else left(coalesce(p_error,'Falha de envio'),300) end
 where o.id=p_job and o.status='sending' returning subscription_id into sub_id;
 if p_gone and sub_id is not null then
  delete from xrmovi.owner_push_subscriptions where id=sub_id;
 end if;
 return sub_id is not null;
end $$;

create or replace function public.xrmovi_owner_push_test(p_user uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare eid bigint;
begin
 if not exists(select 1 from xrmovi.platform_admins where user_id=p_user) then
  raise exception 'Proprietário não autorizado';
 end if;
 insert into xrmovi.owner_push_events(event_key,kind,title,body,url)
 values('test:'||gen_random_uuid(),'test','Teste de notificação XRMOVI',
  'Seu celular está conectado aos avisos do proprietário.','/admin/')
 returning id into eid;
 return eid;
end $$;

revoke all on function public.xrmovi_owner_push_bootstrap(text,text,text),public.xrmovi_owner_push_state(),
 public.xrmovi_owner_push_claim(integer),public.xrmovi_owner_push_complete(bigint,boolean,boolean,text),
 public.xrmovi_owner_push_test(uuid) from public,anon,authenticated;
grant execute on function public.xrmovi_owner_push_bootstrap(text,text,text),public.xrmovi_owner_push_state(),
 public.xrmovi_owner_push_claim(integer),public.xrmovi_owner_push_complete(bigint,boolean,boolean,text),
 public.xrmovi_owner_push_test(uuid) to service_role;
revoke all on function public.xrmovi_owner_push_register(text,text,text),
 public.xrmovi_owner_push_unregister(text) from public,anon;
grant execute on function public.xrmovi_owner_push_register(text,text,text),
 public.xrmovi_owner_push_unregister(text) to authenticated;

create or replace function xrmovi.owner_push_fire()
returns void language plpgsql security definer set search_path='' as $$
declare secret text;
begin
 if not exists(select 1 from xrmovi.owner_push_outbox
  where (status='pending' and next_attempt_at<=now())
   or (status='sending' and claimed_at<now()-interval '5 minutes')) then return; end if;
 select v.decrypted_secret into secret from xrmovi.owner_push_state s
 join vault.decrypted_secrets v on v.id=s.webhook_secret_id where s.id=1;
 if secret is null then return; end if;
 perform net.http_post(
  url:='https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/xrmovi-owner-push',
  headers:=jsonb_build_object('Content-Type','application/json','X-Owner-Push-Secret',secret),
  body:='{"action":"flush"}'::jsonb,
  timeout_milliseconds:=1500
 );
exception when others then
 raise warning 'XRMOVI owner push queue: %',sqlerrm;
end $$;

create or replace function xrmovi.owner_push_event_enqueued()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into xrmovi.owner_push_outbox(event_id,subscription_id)
 select new.id,s.id from xrmovi.owner_push_subscriptions s
 where exists(select 1 from xrmovi.platform_admins a where a.user_id=s.owner_id)
 on conflict do nothing;
 perform xrmovi.owner_push_fire();
 return new;
exception when others then
 raise warning 'XRMOVI push enrollment: %',sqlerrm;
 return new;
end $$;
drop trigger if exists xrmovi_owner_push_event_enqueued on xrmovi.owner_push_events;
create trigger xrmovi_owner_push_event_enqueued after insert on xrmovi.owner_push_events
for each row execute function xrmovi.owner_push_event_enqueued();

create or replace function xrmovi.owner_push_auth_signup()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.raw_user_meta_data->>'signup_product'='xrmovi'
 and not exists(select 1 from xrmovi.platform_admins where user_id=new.id) then
  insert into xrmovi.owner_push_events(event_key,kind,title,body,url)
  values('signup:'||new.id,'signup','Novo cadastro no XRMOVI',
   left(coalesce(new.email,'Novo cliente'),180),'/admin/?tab=signups')
  on conflict(event_key) do nothing;
 end if;
 return new;
exception when others then
 raise warning 'XRMOVI push signup: %',sqlerrm;
 return new;
end $$;
drop trigger if exists xrmovi_owner_push_auth_signup on auth.users;
create trigger xrmovi_owner_push_auth_signup after insert on auth.users
for each row execute function xrmovi.owner_push_auth_signup();

create or replace function xrmovi.owner_push_billing_signup()
returns trigger language plpgsql security definer set search_path='' as $$
declare email_label text;
begin
 if not exists(select 1 from xrmovi.platform_admins where user_id=new.owner_id) then
  select left(coalesce(u.email,'Novo cliente'),180) into email_label
  from auth.users u where u.id=new.owner_id;
  insert into xrmovi.owner_push_events(event_key,kind,title,body,url)
  values('signup:'||new.owner_id,'signup','Novo cliente no XRMOVI',
   coalesce(email_label,'Novo cliente'),'/admin/?tab=signups')
  on conflict(event_key) do nothing;
 end if;
 return new;
exception when others then
 raise warning 'XRMOVI push billing: %',sqlerrm;
 return new;
end $$;
drop trigger if exists xrmovi_owner_push_billing_signup on xrmovi.billing_accounts;
create trigger xrmovi_owner_push_billing_signup after insert on xrmovi.billing_accounts
for each row execute function xrmovi.owner_push_billing_signup();

create or replace function xrmovi.owner_push_support_message()
returns trigger language plpgsql security definer set search_path='' as $$
declare company_label text;
begin
 if new.sender_side <> 'client' then return new; end if;
 select left(coalesce((
  select c.name from xrmovi.account_companies ac
  join xrmovi.companies c on c.id=ac.company_id
  where ac.account_id=new.account_id order by ac.created_at limit 1
 ),u.email,'Cliente'),140)
 into company_label
 from xrmovi.billing_accounts a left join auth.users u on u.id=a.owner_id
 where a.id=new.account_id;
 insert into xrmovi.owner_push_events(event_key,kind,title,body,url)
 values('support:'||new.id,'support','Nova mensagem de suporte',
  coalesce(company_label,'Cliente')||' enviou uma mensagem.',
  '/admin/?tab=messages&account='||new.account_id);
 return new;
exception when others then
 raise warning 'XRMOVI push support: %',sqlerrm;
 return new;
end $$;
drop trigger if exists xrmovi_owner_push_support_message on xrmovi.client_messages;
create trigger xrmovi_owner_push_support_message after insert on xrmovi.client_messages
for each row execute function xrmovi.owner_push_support_message();

-- Retries em intervalos curtos; o SQL contém apenas uma chamada ao servidor do próprio projeto.
select cron.schedule('xrmovi-owner-push-retry','* * * * *','select xrmovi.owner_push_fire();');
