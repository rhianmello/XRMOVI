-- Read-only catalog checks; no fixture, role switch, payment call or mutation.
-- Expected: all booleans true. Behavioral isolation still needs staging tests.
select
 not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='xrmovi' and c.relkind='r' and not c.relrowsecurity) as all_xrmovi_tables_have_rls,
 not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in
   ('xrmovi_checkout_attach','xrmovi_checkout_settle','xrmovi_checkout_provider_status','xrmovi_checkout_fail')
   and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))) as checkout_service_rpcs_reject_browser_roles,
 not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'xrmovi_%' and p.prosecdef
   and not exists(select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')) as privileged_rpc_search_paths_set,
 (select count(*)=4 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in
   ('xrmovi_checkout_attach','xrmovi_checkout_settle','xrmovi_checkout_provider_status','xrmovi_checkout_fail')) as expected_checkout_functions_present;
