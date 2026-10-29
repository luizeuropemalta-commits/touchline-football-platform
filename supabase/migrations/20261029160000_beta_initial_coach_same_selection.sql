-- Owner decision: Beta uses the same published coach selection as other plans.
-- Preserve budget deduction, authority, locking, idempotency and player allowlist.
begin;
set local lock_timeout = '5s';
do $patch$
declare
  target oid := to_regprocedure('public.touchline_club_initialize_collection(uuid,uuid,text,jsonb)');
  definition text; patched text;
  old_text text := $old$  if p_plan = 'beta' and p_coach->>'tier' is distinct from 'ruby-red' then raise exception 'CLUB_BETA_COACH_REQUIRED'; end if;$old$;
  owner_before oid; acl_before aclitem[]; config_before text[]; security_before boolean;
begin
  if target is null then raise exception 'CLUB_BETA_SOURCE_MISSING'; end if;
  select pg_get_functiondef(oid),proowner,proacl,proconfig,prosecdef
    into definition,owner_before,acl_before,config_before,security_before from pg_proc where oid=target;
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text) <> 1 then
    raise exception 'CLUB_BETA_SOURCE_MISMATCH';
  end if;
  patched := replace(definition,old_text,'');
  execute patched;
  if not exists(select 1 from pg_proc where oid=target and proowner=owner_before
    and proacl is not distinct from acl_before and proconfig is not distinct from config_before
    and prosecdef=security_before and pg_get_functiondef(oid)=patched) then
    raise exception 'CLUB_BETA_FUNCTION_DRIFT';
  end if;
end $patch$;
commit;
