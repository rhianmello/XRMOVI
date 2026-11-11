-- Prevent historic payments being attributed to advertisements clicked after a sale.
create or replace function public.xrmovi_marketing_attribution_record(
 p_source text, p_medium text, p_campaign text
) returns boolean language plpgsql security definer set search_path = ''
as $fn$
declare v_source text; v_medium text; v_campaign text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 -- Attribution must happen before the customer's first paid order.
 if exists(
   select 1 from xrmovi.billing_accounts a
   where a.owner_id=auth.uid()
     and (exists(select 1 from xrmovi.billing_ledger l where l.account_id=a.id)
       or exists(select 1 from xrmovi.pix_payment_intents p where p.account_id=a.id and p.status='paid' and p.provider_payment_id is not null))
 ) then return false; end if;
 v_source:=lower(left(trim(coalesce(p_source,'')),80));
 v_medium:=lower(left(trim(coalesce(p_medium,'')),80));
 v_campaign:=left(trim(coalesce(p_campaign,'')),120);
 if v_source='' then v_source:='direto'; end if;
 if v_medium='' then v_medium:='none'; end if;
 if v_campaign='' then v_campaign:='sem campanha'; end if;
 if v_source ~ '[@/?#]' or v_medium ~ '[@/?#]' or v_campaign ~ '[@/?#]' then
   raise exception 'Invalid campaign metadata' using errcode='22023';
 end if;
 insert into xrmovi.marketing_attribution (user_id,source,medium,campaign)
 values (auth.uid(),v_source,v_medium,v_campaign)
 on conflict (user_id) do nothing;
 return true;
end;
$fn$;
revoke all on function public.xrmovi_marketing_attribution_record(text,text,text) from public,anon;
grant execute on function public.xrmovi_marketing_attribution_record(text,text,text) to authenticated;