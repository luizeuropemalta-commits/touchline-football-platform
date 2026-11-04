-- Production retention capability, disabled until separately approved provisioning.
-- Preparation only. No Production identity, policy row, secret, cron or Storage action is seeded.
-- Prerequisite: the exact existing avatar publication/recovery/retention schema is installed.
-- Historical QA installers are not a Production bootstrap. Validate that prerequisite separately.
-- A policy is an operator assertion, not physical-project attestation. Verify the real target externally.
begin;
set local lock_timeout='250ms';
set local statement_timeout='30s';

do $$ begin
  if current_database()<>'postgres' or current_user<>'postgres'
    or to_regclass('touchline_avatar_private.operations') is null
    or to_regclass('touchline_avatar_private.receipts') is null
    or to_regclass('touchline_avatar_private.account_operations') is null
    or to_regclass('touchline_avatar_private.retention_candidates') is null
    or to_regclass('touchline_avatar_private.retention_attempts') is null
    or to_regclass('touchline_avatar_private.retention_discovery_claims') is null
    or to_regclass('touchline_avatar_private.retention_discovery_scans') is null
    or to_regprocedure('public.touchline_publish_club_owner_avatar_v2(uuid,uuid,text,text,text,text)') is null
  then raise exception 'AVATAR_PRODUCTION_RETENTION_PREREQUISITE_REQUIRED'; end if;
end $$;

create table touchline_avatar_private.production_retention_policy (
  singleton boolean primary key default true check(singleton),
  profile_id text not null check(profile_id ~ '^[a-z][a-z0-9-]{2,79}$' and profile_id !~ '[^a-z0-9-]'),
  project_ref text not null check(length(project_ref)=20 and project_ref ~ '^[a-z]{20}$' and project_ref<>'xgxbwqxjssxxuihuwmgy'),
  mode text not null default 'production' check(mode='production'),
  execution_enabled boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
alter table touchline_avatar_private.production_retention_policy enable row level security;
revoke all on touchline_avatar_private.production_retention_policy from public,anon,authenticated,service_role;

create function touchline_avatar_private.guard_production_retention_policy()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.execution_enabled is distinct from false then
      raise exception 'AVATAR_RETENTION_POLICY_INITIAL_OFF_REQUIRED';
    end if;
    return new;
  elsif tg_op='UPDATE' then
    if (to_jsonb(new)-'execution_enabled') is distinct from (to_jsonb(old)-'execution_enabled') then
      raise exception 'AVATAR_RETENTION_POLICY_IDENTITY_IMMUTABLE';
    end if;
    return new;
  end if;
  raise exception 'AVATAR_RETENTION_POLICY_REMOVAL_FORBIDDEN';
end $$;
revoke all on function touchline_avatar_private.guard_production_retention_policy() from public,anon,authenticated,service_role;
create trigger production_retention_policy_guard
before insert or update or delete on touchline_avatar_private.production_retention_policy
for each row execute function touchline_avatar_private.guard_production_retention_policy();
create trigger production_retention_policy_truncate_guard
before truncate on touchline_avatar_private.production_retention_policy
for each statement execute function touchline_avatar_private.guard_production_retention_policy();

-- Internal-only admission. A shared table lock serializes QA work with the first
-- deliberate Production policy insertion; it never serializes QA workers with each other.
create function touchline_avatar_private.qa_retention_admitted(p_project_ref text)
returns boolean language plpgsql security invoker set search_path='' set lock_timeout='1s' as $$
begin
  if p_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy' or auth.uid() is not null then return false; end if;
  lock table touchline_avatar_private.production_retention_policy in share mode;
  return not exists(select 1 from touchline_avatar_private.production_retention_policy);
end $$;
revoke all on function touchline_avatar_private.qa_retention_admitted(text) from public,anon,authenticated,service_role;

create function touchline_avatar_private.production_retention_admitted(p_profile_id text,p_project_ref text)
returns boolean language plpgsql security invoker set search_path='' set lock_timeout='1s' as $$
declare v_policy touchline_avatar_private.production_retention_policy%rowtype;
begin
  if auth.uid() is not null or p_profile_id is null or p_profile_id !~ '^[a-z][a-z0-9-]{2,79}$' or p_profile_id ~ '[^a-z0-9-]'
    or p_project_ref is null or length(p_project_ref)<>20 or p_project_ref !~ '^[a-z]{20}$'
    or p_project_ref='xgxbwqxjssxxuihuwmgy' then return false; end if;
  -- Held until the RPC transaction ends. Disabling waits for admitted SQL work;
  -- it cannot cancel a Storage request already authorized by a durable 30-second grant.
  select * into v_policy from touchline_avatar_private.production_retention_policy where singleton for share;
  return found and v_policy.mode='production' and v_policy.execution_enabled
    and v_policy.profile_id=p_profile_id and v_policy.project_ref=p_project_ref;
end $$;
revoke all on function touchline_avatar_private.production_retention_admitted(text,text) from public,anon,authenticated,service_role;

-- Each installed, fingerprinted business body becomes exactly one inaccessible
-- SECURITY INVOKER core. Only the old QA pin is extracted; auth.uid(), row locks,
-- exact identity, current/active exclusion, grace, leases and perpetual checks stay intact.
-- Existing public QA functions are not replaced. Their private entrypoints retain
-- signature, owner, settings and ACL, and become narrow admission wrappers.
do $extract$
declare
  v_item record; v_original pg_proc%rowtype; v_source text; v_core text;
  v_definition text; v_wrapper text; v_prod_args text; v_public_name text;
  v_core_signature text; v_prod_signature text; v_public_signature text;
begin
  for v_item in select * from (values
    ('authorize_retention_candidate','p_project_ref text,p_actor uuid,p_operation uuid,p_digest text,p_object_key text','text,uuid,uuid,text,text','p_project_ref,p_actor,p_operation,p_digest,p_object_key','1bd9ba666ec2549416e3d73f64f47e62','f545c65e8aa9ec759d1a8cce58c15969','{"version":1,"allowed":false}',1),
    ('register_retention_candidate','p_project_ref text,p_actor uuid,p_operation uuid,p_digest text,p_object_key text','text,uuid,uuid,text,text','p_project_ref,p_actor,p_operation,p_digest,p_object_key','26e71554142fd202224f912288fee0f4','bff3c5cbff9203fc9aa3d6c5b184c9a4','{"version":1,"allowed":false}',0),
    ('begin_retention_attempt','p_project_ref text,p_candidate uuid,p_attempt uuid','text,uuid,uuid','p_project_ref,p_candidate,p_attempt','a079ce0e86da895e6d2a9ce0d438b3eb','d6ff0f7198b8e12bfd704040b64fbc64','{"version":1,"allowed":false}',1),
    ('record_retention_attempt','p_project_ref text,p_attempt uuid,p_outcome text','text,uuid,text','p_project_ref,p_attempt,p_outcome','ae97089a7c02aefe82a7c3b34e7fa6a4','723aeb3b9f843e6eefe1b262e5b581bd','{"version":1,"recorded":false}',1),
    ('list_due_retention_candidates','p_project_ref text,p_limit integer','text,integer','p_project_ref,p_limit','2416b873acf57d68c2573b6e7f4da79c','f8ea438195870cbaad0f949b1c599d29','{"version":1,"candidates":[]}',1),
    ('claim_retention_discovery','p_project_ref text,p_attempt uuid,p_limit integer','text,uuid,integer','p_project_ref,p_attempt,p_limit','0a5dd7e27720b324396dd1eced62b099','6ca979e1cd787ce2440ae11e6da53add','{"version":1,"allowed":false,"scans":[]}',1),
    ('ack_retention_discovery','p_project_ref text,p_actor uuid,p_operation uuid,p_attempt uuid,p_expected_offset integer,p_next_offset integer,p_complete boolean','text,uuid,uuid,uuid,integer,integer,boolean','p_project_ref,p_actor,p_operation,p_attempt,p_expected_offset,p_next_offset,p_complete','37966b6c435a0d04aaa14408dbedfbc2','862c607e1ec090d5ead07ee9336efd82','{"version":1,"acknowledged":false}',1)
  ) expected(name,args,types,names,source_md5,core_md5,denied,pin_count) loop
    select * into v_original from pg_proc
      where oid=to_regprocedure('touchline_avatar_private.'||v_item.name||'('||v_item.types||')');
    if not found or md5(v_original.prosrc) is distinct from v_item.source_md5
      or v_original.proowner is distinct from 'postgres'::regrole
      or not v_original.prosecdef or v_original.prolang is distinct from (select oid from pg_language where lanname='plpgsql')
      or not coalesce(v_original.proconfig @> array['search_path=""'],false)
      or has_function_privilege('anon',v_original.oid,'EXECUTE')
      or has_function_privilege('authenticated',v_original.oid,'EXECUTE')
      or not has_function_privilege('service_role',v_original.oid,'EXECUTE')
      or exists(select 1 from aclexplode(coalesce(v_original.proacl,acldefault('f',v_original.proowner))) a
        where a.grantee not in (v_original.proowner,'service_role'::regrole) or (a.grantee='service_role'::regrole and a.is_grantable))
    then raise exception 'AVATAR_RETENTION_SOURCE_DRIFT: %',v_item.name; end if;
    v_source:=v_original.prosrc;
    v_core:=replace(v_source,'p_project_ref is distinct from ''xgxbwqxjssxxuihuwmgy'' or ','');
    if length(v_source)-length(v_core) <> v_item.pin_count*length('p_project_ref is distinct from ''xgxbwqxjssxxuihuwmgy'' or ') then
      raise exception 'AVATAR_RETENTION_PIN_DRIFT: %',v_item.name;
    end if;
    v_core:=replace(v_core,'touchline_avatar_private.authorize_retention_candidate(',
      'touchline_avatar_private.authorize_retention_candidate_core_v2(');
    if md5(v_core) is distinct from v_item.core_md5 then
      raise exception 'AVATAR_RETENTION_CORE_DRIFT: %',v_item.name;
    end if;
    v_core_signature:='touchline_avatar_private.'||v_item.name||'_core_v2('||v_item.types||')';
    if to_regprocedure(v_core_signature) is not null then raise exception 'AVATAR_RETENTION_CORE_ALREADY_EXISTS'; end if;
    execute format('create function touchline_avatar_private.%I(%s) returns jsonb language plpgsql security invoker set search_path='''' set lock_timeout=''1s'' as %L',
      v_item.name||'_core_v2',v_item.args,v_core);
    execute 'revoke all on function '||v_core_signature||' from public,anon,authenticated,service_role';

    v_wrapper:=format('begin
  if not touchline_avatar_private.qa_retention_admitted(p_project_ref) then return %L::jsonb; end if;
  return touchline_avatar_private.%I(%s);
end;',v_item.denied,v_item.name||'_core_v2',v_item.names);
    v_definition:=pg_get_functiondef(v_original.oid);
    if strpos(v_definition,v_source)=0 then raise exception 'AVATAR_RETENTION_DEFINITION_DRIFT'; end if;
    execute replace(v_definition,v_source,v_wrapper);

    -- Classification alone is not a durable deletion capability and gains no
    -- new public Production RPC. register/begin reach it inside the protected core.
    if v_item.name='authorize_retention_candidate' then continue; end if;
    v_prod_args:='p_profile_id text,'||v_item.args;
    v_prod_signature:='touchline_avatar_private.'||v_item.name||'_production(text,'||v_item.types||')';
    v_wrapper:=format('begin
  if not touchline_avatar_private.production_retention_admitted(p_profile_id,p_project_ref) then return %L::jsonb; end if;
  return touchline_avatar_private.%I(%s);
end;',v_item.denied,v_item.name||'_core_v2',v_item.names);
    execute format('create function touchline_avatar_private.%I(%s) returns jsonb language plpgsql security definer set search_path='''' set lock_timeout=''1s'' as %L',
      v_item.name||'_production',v_prod_args,v_wrapper);
    execute 'revoke all on function '||v_prod_signature||' from public,anon,authenticated,service_role';
    execute 'grant execute on function '||v_prod_signature||' to service_role';
    v_public_name:=case v_item.name
      when 'register_retention_candidate' then 'touchline_register_avatar_retention_candidate'
      when 'begin_retention_attempt' then 'touchline_begin_avatar_retention_attempt'
      when 'record_retention_attempt' then 'touchline_record_avatar_retention_attempt'
      when 'list_due_retention_candidates' then 'touchline_list_due_avatar_retention_candidates'
      when 'claim_retention_discovery' then 'touchline_claim_avatar_retention_discovery'
      when 'ack_retention_discovery' then 'touchline_ack_avatar_retention_discovery' end;
    v_public_signature:='public.'||v_public_name||'(text,'||v_item.types||')';
    execute format('create function public.%I(%s) returns jsonb language sql security invoker set search_path='''' as %L',
      v_public_name,v_prod_args,'select touchline_avatar_private.'||v_item.name||'_production(p_profile_id,'||v_item.names||')');
    execute 'revoke all on function '||v_public_signature||' from public,anon,authenticated,service_role';
    execute 'grant execute on function '||v_public_signature||' to service_role';
  end loop;
end $extract$;
commit;
