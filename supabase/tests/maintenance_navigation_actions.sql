begin;
do $test$
declare
 uid uuid; cid uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); vid uuid:=gen_random_uuid(); tid uuid:=gen_random_uuid();
 task jsonb; snapshot jsonb; rows jsonb; denied boolean;
begin
 select user_id into uid from xrmovi.memberships where role='owner' limit 1;
 if uid is null then raise exception 'An existing authenticated owner is required for this rollback-only test';end if;
 insert into xrmovi.companies(id,name) values(cid,'Temporary maintenance verification'),(outsider,'Temporary isolated verification');
 insert into xrmovi.memberships(company_id,user_id,role) values(cid,uid,'owner');
 insert into xrmovi.vehicles(id,company_id,plate,model) values(vid,cid,'AUDIT-'||left(vid::text,8),'Rollback fixture');
 insert into xrmovi.maintenance_tasks(id,company_id,vehicle_id,title,due_date,notes,estimated_cost)
 values(tid,cid,vid,'Original service',current_date+30,'Original note',25);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);

 task:=public.xrmovi_maintenance_update(cid,tid,0,'Reprogrammed service',current_date+60,1000,'Revised note','Changed operation schedule');
 if task->>'title'<>'Reprogrammed service' or (task->>'revision')::integer<>1 or (task->>'estimated_cost')::numeric<>25 then raise exception 'Planning edit lost fields or revision';end if;
 rows:=public.xrmovi_maintenance_history(cid,tid);
 if jsonb_array_length(rows)<>1 or rows->0->'before_data'->>'title'<>'Original service' or rows->0->'after_data'->>'title'<>'Reprogrammed service' or rows->0->>'actor_id'<>uid::text then raise exception 'History snapshot or actor missing';end if;

 denied:=false;
 begin perform public.xrmovi_maintenance_update(cid,tid,0,'Stale edit',current_date,null,'','Stale update attempt');exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'Stale edit overwrote newer data';end if;
 snapshot:=(select to_jsonb(m) from xrmovi.maintenance_tasks m where id=tid);
 denied:=false;
 begin perform public.xrmovi_maintenance_record(cid,tid,1,30,null,1000,true);exception when invalid_parameter_value then denied:=true;end;
 if not denied or snapshot is distinct from (select to_jsonb(m) from xrmovi.maintenance_tasks m where id=tid) then raise exception 'Invalid completion partially saved';end if;

 task:=public.xrmovi_maintenance_record(cid,tid,1,30,28,1000,true);
 if task->>'status'<>'done' or task->>'completed_at' is null or (task->>'actual_cost')::numeric<>28 or (task->>'revision')::integer<>2 then raise exception 'Atomic completion failed';end if;
 if jsonb_array_length(public.xrmovi_maintenance_history(cid,tid))<>2 then raise exception 'Completion history missing';end if;
 denied:=false;
 begin perform public.xrmovi_maintenance_update(cid,tid,2,'Reopen completed',current_date,null,'','Attempt to reprogram completed service');exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Completed service reprogrammed';end if;

 update xrmovi.memberships set role='manager' where company_id=cid and user_id=uid;
 task:=public.xrmovi_maintenance_record(cid,tid,2,30,29,1000,false);
 if (task->>'revision')::integer<>3 or task->>'status'<>'done' then raise exception 'Manager cost update failed';end if;
 denied:=false;
 begin perform public.xrmovi_maintenance_record(cid,tid,3,-1,29,1000,false);exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Negative value allowed';end if;

 update xrmovi.memberships set role='driver' where company_id=cid and user_id=uid;
 denied:=false;
 begin perform public.xrmovi_maintenance_record(cid,tid,3,30,1,1000,false);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Driver edited costs';end if;
 denied:=false;
 begin perform public.xrmovi_maintenance_update(cid,tid,3,'Driver edit',current_date,null,'','Driver unauthorized edit');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Driver edited planning';end if;
 if jsonb_array_length(public.xrmovi_maintenance_history(cid,tid))<>3 then raise exception 'Member cannot consult history';end if;
 denied:=false;
 begin perform public.xrmovi_maintenance_history(outsider,tid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-company history accessible';end if;
 denied:=false;
 begin perform public.xrmovi_maintenance_record(outsider,tid,3,30,1,1000,false);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-company update allowed';end if;

 denied:=false;
 begin update xrmovi.maintenance_changes set reason='Tampered history' where task_id=tid;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Audit history could be overwritten';end if;
 perform set_config('request.jwt.claims','{}',true);
 denied:=false;
 begin perform public.xrmovi_maintenance_history(cid,tid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unauthenticated history accessible';end if;
 if has_function_privilege('anon','public.xrmovi_maintenance_update(uuid,uuid,integer,text,date,numeric,text,text)','execute')
 or has_function_privilege('anon','public.xrmovi_maintenance_record(uuid,uuid,integer,numeric,numeric,numeric,boolean)','execute')
 or has_function_privilege('anon','public.xrmovi_maintenance_history(uuid,uuid)','execute')
 or has_table_privilege('authenticated','xrmovi.maintenance_changes','update') then raise exception 'Unexpected public privileges';end if;
end $test$;
rollback;
select 'passed: planning audit, concurrency, atomic completion, owner/manager/driver, company isolation and immutable history; fixtures rolled back' as verification;
