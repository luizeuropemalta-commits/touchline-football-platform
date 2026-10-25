-- LOCAL CANDIDATE: central QA authority only, after private 015-018.
-- Deliberately outside application migrations. Do not include in app deploys.
-- Sportmonks ticket 113532: a controlled measurement is not an observed reset.
-- No HTTP, worker activation, receipt rewriting, or public EXECUTE grant here.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Refuse a drifted or pre-018 authority before changing any schema.
do $pre$ begin
  if to_regprocedure('touchline_quota_private.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)') is null
    or not exists(select 1 from pg_proc p
      where p.oid='touchline_quota_private.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)'::regprocedure
        and md5(p.prosrc)='10f804816b222b15ba49aa04aea8b27d' and p.prosecdef
        and p.proowner='postgres'::regrole
        and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          where a.grantee<>p.proowner and a.privilege_type='EXECUTE'))
    then raise exception 'TL_CONTROLLED_PROBE_PREIMAGE_MISMATCH';
  end if;
  if exists(select 1 from (values
    ('touchline_quota_private.prepare_recovery_case(uuid,timestamptz,timestamptz)','1303be3ad2f3129cc1b16b554c05d0b6'),
    ('touchline_quota_private.admit_recovery_measurement(uuid,text,uuid,text,integer)','49afabfe02f72cb3ebdc2ea6dcc99db2'),
    ('touchline_quota_private.finalize_recovery_case(uuid)','3cc422a564b887e1106f9f164a9e49e0')
  ) expected(signature,body_md5)
    where not exists(select 1 from pg_proc p where p.oid=to_regprocedure(expected.signature)
      and md5(p.prosrc)=expected.body_md5 and not p.prosecdef and p.proowner='postgres'::regrole
      and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee<>p.proowner and a.privilege_type='EXECUTE')))
    then raise exception 'TL_CONTROLLED_PROBE_METHOD_PREIMAGE_MISMATCH';
  end if;
end $pre$;

alter table touchline_quota_private.recovery_cases
  alter column reset_evidence_ref drop not null,
  add column recovery_mode text not null default 'observed_reset',
  add column support_evidence_ref text,
  add column authorization_ref text,
  add constraint recovery_case_evidence_mode check (
    (recovery_mode='observed_reset' and reset_evidence_ref is not null
      and support_evidence_ref is null and authorization_ref is null)
    or (recovery_mode='controlled_probe' and reset_evidence_ref is null
      and support_evidence_ref is not null and length(btrim(support_evidence_ref)) between 1 and 256
      and authorization_ref is not null and length(btrim(authorization_ref)) between 1 and 256));
alter table touchline_quota_private.recovery_preparations
  alter column reset_observed_at drop not null,
  add column preparation_mode text not null default 'observed_reset',
  add column last_activity_at timestamptz,
  add constraint recovery_preparation_evidence_mode check (
    (preparation_mode='observed_reset' and reset_observed_at is not null and last_activity_at is null)
    or (preparation_mode='controlled_probe' and reset_observed_at is null
      and last_activity_at is not null and isfinite(last_activity_at) and last_activity_at<=drained_at));

-- Keep old behavior under its original signature, but never mix evidence modes.
create or replace function touchline_quota_private.prepare_recovery_case(
  p_case uuid,p_drained_at timestamptz,p_reset_observed_at timestamptz
) returns boolean language plpgsql security invoker set search_path='' set lock_timeout='5s' set timezone='UTC' as $$
declare c touchline_quota_private.recovery_cases; s public.touchline_fixture_quota_scopes;
  prep touchline_quota_private.recovery_preparations; n timestamptz; scope_view jsonb;
  workers_view jsonb; attempts_view jsonb; last_activity timestamptz;
begin
  if p_case is null or p_drained_at is null or p_reset_observed_at is null
    or not isfinite(p_drained_at) or not isfinite(p_reset_observed_at) then return false; end if;
  -- Fetch only the immutable scope identity, then use the established lock order.
  select * into c from touchline_quota_private.recovery_cases where id=p_case;
  if not found or c.recovery_mode<>'observed_reset' then return false; end if;
  lock table touchline_quota_private.workers in share row exclusive mode;
  perform 1 from touchline_quota_private.workers where account_scope=c.account_scope order by worker_id for update;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=c.account_scope for update;
  select * into c from touchline_quota_private.recovery_cases where id=p_case for update;
  perform 1 from public.touchline_fixture_quota_attempts where account_scope=c.account_scope order by request_id,attempt for update;
  n:=clock_timestamp();
  if c.closed_at is not null or c.recovery_mode<>'observed_reset' or s.enabled or not s.blocked_unknown
    or exists(select 1 from touchline_quota_private.workers where account_scope=c.account_scope and enabled)
    or s.cooldown_until>n then return false; end if;

  select * into prep from touchline_quota_private.recovery_preparations where case_id=p_case;
  if found then
    -- Idempotent acknowledgement only. Never repeat lease retirement or certify
    -- a changed state under an old incident's evidence.
    return prep.preparation_mode='observed_reset' and prep.drained_at=p_drained_at and prep.reset_observed_at=p_reset_observed_at
      and prep.expected_state_digest=touchline_quota_private.recovery_state_digest(c.account_scope);
  end if;
  if p_reset_observed_at<p_drained_at or p_reset_observed_at>n-interval '5 seconds'
    or p_reset_observed_at<n-interval '5 minutes' then return false; end if;
  select greatest(max(greatest(admitted_at,completed_at)),s.active_until) into last_activity
    from public.touchline_fixture_quota_attempts where account_scope=c.account_scope;
  if last_activity is null or p_drained_at<last_activity
    or (s.active_token is not null and (s.active_until is null or s.active_until>n-interval '5 seconds')) then return false; end if;
  -- The active lease must belong to exactly one pending, owned attempt. An
  -- orphan token or legacy owner cannot be silently retired.
  if s.active_token is not null and not exists(select 1 from public.touchline_fixture_quota_attempts
    where account_scope=c.account_scope and token=s.active_token and completed_at is null and owner_worker_id is not null) then return false; end if;
  if exists(select 1 from public.touchline_fixture_quota_attempts
    where account_scope=c.account_scope and completed_at is null and owner_worker_id is null) then return false; end if;

  scope_view:=jsonb_build_object('enabled',s.enabled,'blockedUnknown',s.blocked_unknown,
    'cooldownUntil',s.cooldown_until,'leasePresent',s.active_token is not null,'activeUntil',s.active_until);
  select coalesce(jsonb_agg(jsonb_build_object('workerId',worker_id,'environment',environment,'enabled',enabled) order by worker_id),'[]'::jsonb)
    into workers_view from touchline_quota_private.workers where account_scope=c.account_scope;
  with latest as (
    select distinct on(policy.entity) a.request_id,a.attempt
    from public.touchline_fixture_quota_attempts a cross join lateral touchline_quota_private.endpoint_policy(a.endpoint) policy
    where a.account_scope=c.account_scope and a.completed_at is not null and a.owner_worker_id is not null
    order by policy.entity,a.completed_at desc,a.admitted_at desc,a.request_id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object('requestId',a.request_id,'attempt',a.attempt,'endpoint',a.endpoint,
    'ownerWorkerId',a.owner_worker_id,'ownerEnvironment',a.owner_environment,'admittedAt',a.admitted_at,
    'completedAt',a.completed_at,'observation',a.observation,'matchesActiveLease',a.token=s.active_token)
    order by a.admitted_at,a.request_id,a.attempt),'[]'::jsonb)
    into attempts_view from public.touchline_fixture_quota_attempts a where a.account_scope=c.account_scope
      and (a.completed_at is null or exists(select 1 from latest l where l.request_id=a.request_id and l.attempt=a.attempt));
  if scope_view is distinct from c.scope_snapshot or workers_view is distinct from c.worker_snapshot
    or attempts_view is distinct from c.attempt_snapshot or jsonb_array_length(attempts_view)=0 then return false; end if;

  insert into touchline_quota_private.recovery_preparations(case_id,account_scope,drained_at,reset_observed_at,expected_state_digest)
    values(p_case,c.account_scope,p_drained_at,p_reset_observed_at,touchline_quota_private.recovery_state_digest(c.account_scope));
  -- Conservatively remeasure EVERY entity represented by the incident snapshot;
  -- never infer which unknown call consumed an entity's capacity.
  insert into touchline_quota_private.recovery_entities(case_id,entity)
    select distinct p_case,policy.entity from jsonb_array_elements(attempts_view) a
      cross join lateral touchline_quota_private.endpoint_policy(a->>'endpoint') policy;
  insert into touchline_quota_private.recovery_quarantine(case_id,account_scope,request_id,attempt)
    select p_case,c.account_scope,request_id,attempt from public.touchline_fixture_quota_attempts
      where account_scope=c.account_scope and completed_at is null;
  update public.touchline_fixture_quota_scopes set active_token=null,active_until=null,blocked_unknown=true
    where account_scope=c.account_scope;
  update touchline_quota_private.recovery_preparations
    set expected_state_digest=touchline_quota_private.recovery_state_digest(c.account_scope) where case_id=p_case;
  return true;
end $$;
revoke all on function touchline_quota_private.prepare_recovery_case(uuid,timestamptz,timestamptz)
  from public,anon,authenticated,service_role;

create function touchline_quota_private.record_controlled_probe_case(
  p_scope text,p_drain_evidence text,p_support_evidence text,p_authorization text
) returns uuid language plpgsql security invoker set search_path='' set lock_timeout='5s' set timezone='UTC' as $$
declare s public.touchline_fixture_quota_scopes; existing touchline_quota_private.recovery_cases;
  workers jsonb; attempts jsonb; case_id uuid;
begin
  if p_scope is null or p_scope !~ '^[a-z][a-z0-9_-]{0,63}$'
    or p_drain_evidence is null or length(btrim(p_drain_evidence)) not between 1 and 256
    or p_support_evidence is null or length(btrim(p_support_evidence)) not between 1 and 256
    or p_authorization is null or length(btrim(p_authorization)) not between 1 and 256 then return null; end if;
  -- Prevent concurrent registration while following the normal worker->scope
  -- lock order. This operator operation is intentionally infrequent.
  lock table touchline_quota_private.workers in share row exclusive mode;
  perform 1 from touchline_quota_private.workers where account_scope=p_scope order by worker_id for update;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=p_scope for update;
  if not found or not s.blocked_unknown or s.enabled
    or exists(select 1 from touchline_quota_private.workers where account_scope=p_scope and environment<>'qa')
    or not exists(select 1 from touchline_quota_private.workers where account_scope=p_scope and environment='qa')
    or exists(select 1 from touchline_quota_private.workers where account_scope=p_scope and enabled)
    or (s.active_token is not null and (s.active_until is null or s.active_until>clock_timestamp()-interval '5 seconds'))
    or s.cooldown_until>clock_timestamp() then return null; end if;
  select * into existing from touchline_quota_private.recovery_cases where account_scope=p_scope and closed_at is null;
  if found then
    if existing.recovery_mode='controlled_probe' and existing.drain_evidence_ref=btrim(p_drain_evidence)
      and existing.support_evidence_ref=btrim(p_support_evidence) and existing.authorization_ref=btrim(p_authorization) then return existing.id; end if;
    return null;
  end if;
  perform 1 from public.touchline_fixture_quota_attempts where account_scope=p_scope and completed_at is null order by request_id,attempt for update;
  select coalesce(jsonb_agg(jsonb_build_object('workerId',worker_id,'environment',environment,'enabled',enabled) order by worker_id),'[]'::jsonb)
    into workers from touchline_quota_private.workers where account_scope=p_scope;
  with latest as (
    select distinct on(policy.entity) a.request_id,a.attempt
    from public.touchline_fixture_quota_attempts a cross join lateral touchline_quota_private.endpoint_policy(a.endpoint) policy
    where a.account_scope=p_scope and a.completed_at is not null and a.owner_worker_id is not null
    order by policy.entity,a.completed_at desc,a.admitted_at desc,a.request_id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object('requestId',a.request_id,'attempt',a.attempt,'endpoint',a.endpoint,
    'ownerWorkerId',a.owner_worker_id,'ownerEnvironment',a.owner_environment,'admittedAt',a.admitted_at,
    'completedAt',a.completed_at,'observation',a.observation,'matchesActiveLease',a.token=s.active_token)
    order by a.admitted_at,a.request_id,a.attempt),'[]'::jsonb)
  into attempts from public.touchline_fixture_quota_attempts a where a.account_scope=p_scope
    and (a.completed_at is null or exists(select 1 from latest l where l.request_id=a.request_id and l.attempt=a.attempt));
  insert into touchline_quota_private.recovery_cases(account_scope,drain_evidence_ref,reset_evidence_ref,recovery_mode,support_evidence_ref,authorization_ref,scope_snapshot,attempt_snapshot,worker_snapshot)
    values(p_scope,btrim(p_drain_evidence),null,'controlled_probe',btrim(p_support_evidence),btrim(p_authorization),jsonb_build_object('enabled',s.enabled,
      'blockedUnknown',s.blocked_unknown,'cooldownUntil',s.cooldown_until,'leasePresent',s.active_token is not null,'activeUntil',s.active_until),attempts,workers)
    returning id into case_id;
  return case_id;
end $$;

create function touchline_quota_private.prepare_controlled_probe_case(
  p_case uuid,p_drained_at timestamptz,p_entities text[]
) returns boolean language plpgsql security invoker set search_path='' set lock_timeout='5s' set timezone='UTC' as $$
declare c touchline_quota_private.recovery_cases; s public.touchline_fixture_quota_scopes;
  prep touchline_quota_private.recovery_preparations; n timestamptz; scope_view jsonb;
  workers_view jsonb; attempts_view jsonb; last_activity timestamptz; expected_entities text[];
begin
  if p_case is null or p_drained_at is null or p_entities is null
    or not isfinite(p_drained_at) or cardinality(p_entities) not between 1 and 32
    or array_ndims(p_entities)<>1 or array_position(p_entities,null) is not null then return false; end if;
  -- Fetch only the immutable scope identity, then use the established lock order.
  select * into c from touchline_quota_private.recovery_cases where id=p_case;
  if not found or c.recovery_mode<>'controlled_probe' then return false; end if;
  lock table touchline_quota_private.workers in share row exclusive mode;
  perform 1 from touchline_quota_private.workers where account_scope=c.account_scope order by worker_id for update;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=c.account_scope for update;
  select * into c from touchline_quota_private.recovery_cases where id=p_case for update;
  perform 1 from public.touchline_fixture_quota_attempts where account_scope=c.account_scope order by request_id,attempt for update;
  n:=clock_timestamp();
  if c.closed_at is not null or c.recovery_mode<>'controlled_probe'
    or exists(select 1 from touchline_quota_private.workers where account_scope=c.account_scope and environment<>'qa')
    or s.enabled or not s.blocked_unknown
    or exists(select 1 from touchline_quota_private.workers where account_scope=c.account_scope and enabled)
    or s.cooldown_until>n then return false; end if;

  select array_agg(distinct policy.entity collate "C" order by policy.entity collate "C") into expected_entities
    from jsonb_array_elements(c.attempt_snapshot) a
    cross join lateral touchline_quota_private.endpoint_policy(a->>'endpoint') policy;
  if p_entities is distinct from expected_entities then return false; end if;
  select * into prep from touchline_quota_private.recovery_preparations where case_id=p_case;
  if found then
    -- Idempotent acknowledgement only. Never repeat lease retirement or certify
    -- a changed state under an old incident's evidence.
    return prep.drained_at=p_drained_at and prep.preparation_mode='controlled_probe'
      and prep.reset_observed_at is null
      and prep.expected_state_digest=touchline_quota_private.recovery_state_digest(c.account_scope);
  end if;
  if p_drained_at>n-interval '5 seconds' or p_drained_at<n-interval '5 minutes' then return false; end if;
  select greatest(max(greatest(admitted_at,completed_at)),s.active_until) into last_activity
    from public.touchline_fixture_quota_attempts where account_scope=c.account_scope;
  if last_activity is null or p_drained_at<last_activity or last_activity>n-interval '1 hour'
    or (s.active_token is not null and (s.active_until is null or s.active_until>n-interval '5 seconds')) then return false; end if;
  -- The active lease must belong to exactly one pending, owned attempt. An
  -- orphan token or legacy owner cannot be silently retired.
  if s.active_token is not null and not exists(select 1 from public.touchline_fixture_quota_attempts
    where account_scope=c.account_scope and token=s.active_token and completed_at is null and owner_worker_id is not null) then return false; end if;
  if exists(select 1 from public.touchline_fixture_quota_attempts
    where account_scope=c.account_scope and completed_at is null and owner_worker_id is null) then return false; end if;

  scope_view:=jsonb_build_object('enabled',s.enabled,'blockedUnknown',s.blocked_unknown,
    'cooldownUntil',s.cooldown_until,'leasePresent',s.active_token is not null,'activeUntil',s.active_until);
  select coalesce(jsonb_agg(jsonb_build_object('workerId',worker_id,'environment',environment,'enabled',enabled) order by worker_id),'[]'::jsonb)
    into workers_view from touchline_quota_private.workers where account_scope=c.account_scope;
  with latest as (
    select distinct on(policy.entity) a.request_id,a.attempt
    from public.touchline_fixture_quota_attempts a cross join lateral touchline_quota_private.endpoint_policy(a.endpoint) policy
    where a.account_scope=c.account_scope and a.completed_at is not null and a.owner_worker_id is not null
    order by policy.entity,a.completed_at desc,a.admitted_at desc,a.request_id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object('requestId',a.request_id,'attempt',a.attempt,'endpoint',a.endpoint,
    'ownerWorkerId',a.owner_worker_id,'ownerEnvironment',a.owner_environment,'admittedAt',a.admitted_at,
    'completedAt',a.completed_at,'observation',a.observation,'matchesActiveLease',a.token=s.active_token)
    order by a.admitted_at,a.request_id,a.attempt),'[]'::jsonb)
    into attempts_view from public.touchline_fixture_quota_attempts a where a.account_scope=c.account_scope
      and (a.completed_at is null or exists(select 1 from latest l where l.request_id=a.request_id and l.attempt=a.attempt));
  if scope_view is distinct from c.scope_snapshot or workers_view is distinct from c.worker_snapshot
    or attempts_view is distinct from c.attempt_snapshot or jsonb_array_length(attempts_view)=0 then return false; end if;

  insert into touchline_quota_private.recovery_preparations(case_id,account_scope,drained_at,reset_observed_at,preparation_mode,last_activity_at,expected_state_digest)
    values(p_case,c.account_scope,p_drained_at,null,'controlled_probe',last_activity,touchline_quota_private.recovery_state_digest(c.account_scope));
  -- Conservatively remeasure EVERY entity represented by the incident snapshot;
  -- never infer which unknown call consumed an entity's capacity.
  insert into touchline_quota_private.recovery_entities(case_id,entity)
    select distinct p_case,policy.entity from jsonb_array_elements(attempts_view) a
      cross join lateral touchline_quota_private.endpoint_policy(a->>'endpoint') policy;
  insert into touchline_quota_private.recovery_quarantine(case_id,account_scope,request_id,attempt)
    select p_case,c.account_scope,request_id,attempt from public.touchline_fixture_quota_attempts
      where account_scope=c.account_scope and completed_at is null;
  update public.touchline_fixture_quota_scopes set active_token=null,active_until=null,blocked_unknown=true
    where account_scope=c.account_scope;
  update touchline_quota_private.recovery_preparations
    set expected_state_digest=touchline_quota_private.recovery_state_digest(c.account_scope) where case_id=p_case;
  return true;
end $$;

revoke all on function touchline_quota_private.record_controlled_probe_case(text,text,text,text),
  touchline_quota_private.prepare_controlled_probe_case(uuid,timestamptz,text[])
  from public,anon,authenticated,service_role;

-- A plan of affected entities is NOT permission for a batch. Each individual
-- entity needs an operator review reference, and only one may be outstanding.
create table touchline_quota_private.controlled_probe_authorizations (
  case_id uuid not null,
  entity text not null,
  review_ref text not null check(length(btrim(review_ref)) between 1 and 256),
  authorized_at timestamptz not null default clock_timestamp(),
  primary key(case_id,entity),
  foreign key(case_id,entity) references touchline_quota_private.recovery_entities(case_id,entity)
);
alter table touchline_quota_private.controlled_probe_authorizations enable row level security;
revoke all on touchline_quota_private.controlled_probe_authorizations from public,anon,authenticated,service_role;

-- Every previous receipt must be safe before another provider request, not just
-- before finalization. An unknown observation remains evidence of uncertainty.
create function touchline_quota_private.controlled_probe_receipts_valid(p_case uuid)
returns boolean language plpgsql security invoker set search_path='' set timezone='UTC' as $$
declare scope_id text; r record; observed timestamptz; reset_at timestamptz;
  deadline timestamptz; remaining numeric; status_code integer;
begin
  select account_scope into scope_id from touchline_quota_private.recovery_cases where id=p_case;
  if not found then return false; end if;
  for r in select m.entity,m.lease_until,m.owner_worker_id expected_worker,m.owner_environment expected_environment,a.*
    from touchline_quota_private.recovery_measurements m join public.touchline_fixture_quota_attempts a
      on a.account_scope=m.account_scope and a.request_id=m.request_id and a.attempt=m.attempt where m.case_id=p_case
  loop
    if r.completed_at is null or r.completed_at>r.lease_until
      or r.owner_worker_id is distinct from r.expected_worker or r.owner_environment is distinct from r.expected_environment
      or r.observation->>'requestedEntity' is distinct from r.entity
      or jsonb_typeof(r.observation->'status') is distinct from 'number'
      or jsonb_typeof(r.observation->'remaining') is distinct from 'number'
      or jsonb_typeof(r.observation->'observedAt') is distinct from 'string'
      or jsonb_typeof(r.observation->'resetAt') is distinct from 'string' then return false; end if;
    status_code:=(r.observation->>'status')::integer;
    remaining:=(r.observation->>'remaining')::numeric;
    observed:=(r.observation->>'observedAt')::timestamptz;
    reset_at:=(r.observation->>'resetAt')::timestamptz;
    deadline:=(r.observation->>'cooldownUntil')::timestamptz;
    if status_code not between 200 and 299 or remaining<500 or remaining>9007199254740991
      or observed<r.admitted_at-interval '5 seconds' or observed>r.completed_at+interval '5 seconds'
      or reset_at<observed or reset_at<=clock_timestamp() or not isfinite(observed) or not isfinite(reset_at)
      or deadline is not null then return false; end if;
    -- Expected-state fingerprint catches other writers; also assert positively
    -- that this is still the latest owned receipt for the measured entity.
    if r.request_id is distinct from (select a.request_id from public.touchline_fixture_quota_attempts a
      cross join lateral touchline_quota_private.endpoint_policy(a.endpoint) policy
      where a.account_scope=scope_id and a.completed_at is not null and a.owner_worker_id is not null and policy.entity=r.entity
      order by a.completed_at desc,a.admitted_at desc,a.request_id desc limit 1) then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range
  then return false;
end $$;
revoke all on function touchline_quota_private.controlled_probe_receipts_valid(uuid)
  from public,anon,authenticated,service_role;

create function touchline_quota_private.authorize_controlled_probe_entity(p_case uuid,p_entity text,p_review text)
returns boolean language plpgsql security invoker set search_path='' set timezone='UTC' set lock_timeout='5s' as $$
declare scope_id text; existing touchline_quota_private.controlled_probe_authorizations;
begin
  if p_case is null or p_entity is null or p_review is null or length(btrim(p_review)) not between 1 and 256
    then return false; end if;
  scope_id:=touchline_quota_private.lock_recovery_scope(p_case);
  if scope_id is null or not touchline_quota_private.recovery_matches_expected(p_case)
    or not exists(select 1 from touchline_quota_private.recovery_cases where id=p_case and recovery_mode='controlled_probe')
    or not exists(select 1 from touchline_quota_private.recovery_entities where case_id=p_case and entity=p_entity)
    or not exists(select 1 from touchline_quota_private.recovery_preparations where case_id=p_case and prepared_at>=clock_timestamp()-interval '5 minutes')
    or exists(select 1 from public.touchline_fixture_quota_scopes where account_scope=scope_id
      and (active_token is not null or cooldown_until>clock_timestamp())) then return false; end if;
  select * into existing from touchline_quota_private.controlled_probe_authorizations where case_id=p_case and entity=p_entity;
  if found then return existing.review_ref=btrim(p_review); end if;
  if exists(select 1 from touchline_quota_private.controlled_probe_authorizations p
    where p.case_id=p_case and not exists(select 1 from touchline_quota_private.recovery_measurements m
      where m.case_id=p.case_id and m.entity=p.entity)) then return false; end if;
  if not touchline_quota_private.controlled_probe_receipts_valid(p_case) then return false; end if;
  insert into touchline_quota_private.controlled_probe_authorizations(case_id,entity,review_ref)
    values(p_case,p_entity,btrim(p_review));
  return true;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range
  then return false;
end $$;
revoke all on function touchline_quota_private.authorize_controlled_probe_entity(uuid,text,text)
  from public,anon,authenticated,service_role;

create or replace function touchline_quota_private.admit_recovery_measurement(
  p_case uuid,p_worker text,p_request uuid,p_endpoint text,p_budget_ms integer
) returns jsonb language plpgsql security invoker set search_path='' set timezone='UTC' set lock_timeout='5s' as $$
declare scope_id text; entity_id text; worker touchline_quota_private.workers;
  s public.touchline_fixture_quota_scopes; n timestamptz; lease_token uuid;
begin
  if p_case is null or p_worker is null or p_request is null or p_budget_ms is null
    or p_budget_ms not between 1 and 20000 then return jsonb_build_object('allowed',false); end if;
  scope_id:=touchline_quota_private.lock_recovery_scope(p_case);
  if scope_id is null or not touchline_quota_private.recovery_matches_expected(p_case) then return jsonb_build_object('allowed',false); end if;
  select policy.entity into entity_id from touchline_quota_private.endpoint_policy(p_endpoint) policy;
  if not found then return jsonb_build_object('allowed',false); end if;
  select * into worker from touchline_quota_private.workers where worker_id=p_worker and account_scope=scope_id and not enabled;
  if not found then return jsonb_build_object('allowed',false); end if;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=scope_id;
  n:=clock_timestamp();
  if s.active_token is not null or s.cooldown_until>n
    or not exists(select 1 from touchline_quota_private.recovery_preparations where case_id=p_case and prepared_at>=n-interval '5 minutes')
    or not exists(select 1 from touchline_quota_private.recovery_entities where case_id=p_case and entity=entity_id)
    or exists(select 1 from touchline_quota_private.recovery_measurements where case_id=p_case and entity=entity_id)
    or exists(select 1 from public.touchline_fixture_quota_attempts where account_scope=scope_id and request_id=p_request and attempt=1)
    then return jsonb_build_object('allowed',false); end if;
  if exists(select 1 from touchline_quota_private.recovery_cases where id=p_case and recovery_mode='controlled_probe')
    and (worker.environment<>'qa'
      or not touchline_quota_private.controlled_probe_receipts_valid(p_case)
      or not exists(select 1 from touchline_quota_private.controlled_probe_authorizations
        where case_id=p_case and entity=entity_id and authorized_at>=n-interval '5 minutes'))
    then return jsonb_build_object('allowed',false); end if;
  lease_token:=gen_random_uuid();
  insert into public.touchline_fixture_quota_attempts(account_scope,request_id,attempt,endpoint,token,admitted_at,owner_worker_id,owner_environment)
    values(scope_id,p_request,1,p_endpoint,lease_token,n,worker.worker_id,worker.environment);
  insert into touchline_quota_private.recovery_measurements(case_id,entity,account_scope,request_id,owner_worker_id,owner_environment,lease_until)
    values(p_case,entity_id,scope_id,p_request,worker.worker_id,worker.environment,n+p_budget_ms*interval '1 millisecond');
  update public.touchline_fixture_quota_scopes set active_token=lease_token,active_until=n+p_budget_ms*interval '1 millisecond'
    where account_scope=scope_id;
  update touchline_quota_private.recovery_preparations set expected_state_digest=touchline_quota_private.recovery_state_digest(scope_id) where case_id=p_case;
  return jsonb_build_object('allowed',true,'token',lease_token);
end $$;
revoke all on function touchline_quota_private.admit_recovery_measurement(uuid,text,uuid,text,integer)
  from public,anon,authenticated,service_role;
create or replace function touchline_quota_private.finalize_recovery_case(p_case uuid)
returns boolean language plpgsql security invoker set search_path='' set timezone='UTC' set lock_timeout='5s' as $$
declare scope_id text; s public.touchline_fixture_quota_scopes; r record; observed timestamptz;
  reset_at timestamptz; deadline timestamptz; remaining numeric; status_code integer;
begin
  scope_id:=touchline_quota_private.lock_recovery_scope(p_case);
  if scope_id is null then return false; end if;
  -- Finalized-case replay certifies only the past outcome, never current state.
  if exists(select 1 from touchline_quota_private.recovery_cases where id=p_case and outcome='resolved') then return true; end if;
  if not touchline_quota_private.recovery_matches_expected(p_case) then return false; end if;
  if exists(select 1 from touchline_quota_private.recovery_cases where id=p_case and recovery_mode='controlled_probe')
    and not touchline_quota_private.controlled_probe_receipts_valid(p_case) then return false; end if;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=scope_id;
  if s.active_token is not null
    or not exists(select 1 from touchline_quota_private.recovery_entities where case_id=p_case)
    or not exists(select 1 from touchline_quota_private.recovery_preparations where case_id=p_case and prepared_at>=clock_timestamp()-interval '5 minutes')
    or exists(select 1 from touchline_quota_private.recovery_entities e where e.case_id=p_case
      and not exists(select 1 from touchline_quota_private.recovery_measurements m where m.case_id=p_case and m.entity=e.entity)) then return false; end if;
  for r in select m.entity,m.lease_until,m.owner_worker_id expected_worker,m.owner_environment expected_environment,a.*
    from touchline_quota_private.recovery_measurements m join public.touchline_fixture_quota_attempts a
      on a.account_scope=m.account_scope and a.request_id=m.request_id and a.attempt=m.attempt where m.case_id=p_case
  loop
    if r.completed_at is null or r.completed_at>r.lease_until
      or r.owner_worker_id is distinct from r.expected_worker or r.owner_environment is distinct from r.expected_environment
      or r.observation->>'requestedEntity' is distinct from r.entity
      or jsonb_typeof(r.observation->'remaining') is distinct from 'number'
      or jsonb_typeof(r.observation->'observedAt') is distinct from 'string'
      or jsonb_typeof(r.observation->'resetAt') is distinct from 'string' then return false; end if;
    status_code:=(r.observation->>'status')::integer;
    remaining:=(r.observation->>'remaining')::numeric;
    observed:=(r.observation->>'observedAt')::timestamptz;
    reset_at:=(r.observation->>'resetAt')::timestamptz;
    deadline:=(r.observation->>'cooldownUntil')::timestamptz;
    if (status_code not between 200 and 299 and status_code<>429) or remaining<0 or remaining>9007199254740991
      or observed<r.admitted_at-interval '5 seconds' or observed>r.completed_at+interval '5 seconds'
      or reset_at<observed or not isfinite(observed) or not isfinite(reset_at)
      or ((status_code=429 or remaining=0) and (deadline is null or deadline<observed or s.cooldown_until is null or s.cooldown_until<deadline)) then return false; end if;
    -- Expected-state fingerprint catches other writers; also assert positively
    -- that this is still the latest owned receipt for the measured entity.
    if r.request_id is distinct from (select a.request_id from public.touchline_fixture_quota_attempts a
      cross join lateral touchline_quota_private.endpoint_policy(a.endpoint) policy
      where a.account_scope=scope_id and a.completed_at is not null and a.owner_worker_id is not null and policy.entity=r.entity
      order by a.completed_at desc,a.admitted_at desc,a.request_id desc limit 1) then return false; end if;
  end loop;
  if exists(select 1 from public.touchline_fixture_quota_attempts a where a.account_scope=scope_id and a.completed_at is null
    and not exists(select 1 from touchline_quota_private.recovery_quarantine q where q.case_id=p_case and q.account_scope=a.account_scope and q.request_id=a.request_id and q.attempt=a.attempt)) then return false; end if;
  update public.touchline_fixture_quota_scopes set blocked_unknown=false where account_scope=scope_id;
  update touchline_quota_private.recovery_cases set closed_at=clock_timestamp(),outcome='resolved' where id=p_case;
  update touchline_quota_private.recovery_preparations set expected_state_digest=touchline_quota_private.recovery_state_digest(scope_id) where case_id=p_case;
  -- Scope and workers remain OFF; cooldown and 500 reserve policy are intact.
  return true;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return false;
end $$;
revoke all on function touchline_quota_private.finalize_recovery_case(uuid)
  from public,anon,authenticated,service_role;
commit;
