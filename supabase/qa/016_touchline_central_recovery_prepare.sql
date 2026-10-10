-- Operator-only recovery preparation, after 015. No HTTP or activation.
-- A recorded incident alone never authorizes retiring a lost lease.
begin;
set local lock_timeout='5s';
-- Forward configuration for an authority that installed an earlier 015.
-- Existing snapshots are NOT rewritten: a mismatch remains fail-closed.
alter function touchline_quota_private.record_recovery_case(text,text,text) set timezone='UTC';

create table touchline_quota_private.recovery_preparations (
  case_id uuid primary key,
  account_scope text not null,
  prepared_at timestamptz not null default clock_timestamp(),
  drained_at timestamptz not null check(isfinite(drained_at)),
  reset_observed_at timestamptz not null check(isfinite(reset_observed_at)),
  expected_state_digest text not null check(expected_state_digest ~ '^[0-9a-f]{64}$'),
  foreign key(case_id,account_scope) references touchline_quota_private.recovery_cases(id,account_scope),
  unique(case_id,account_scope),
  check(reset_observed_at>=drained_at)
);
create table touchline_quota_private.recovery_entities (
  case_id uuid not null references touchline_quota_private.recovery_preparations(case_id),
  entity text not null,
  primary key(case_id,entity)
);
create table touchline_quota_private.recovery_quarantine (
  case_id uuid not null,
  account_scope text not null,
  request_id uuid not null,
  attempt integer not null,
  quarantined_at timestamptz not null default clock_timestamp(),
  primary key(case_id,account_scope,request_id,attempt),
  foreign key(case_id,account_scope) references touchline_quota_private.recovery_preparations(case_id,account_scope),
  foreign key(account_scope,request_id,attempt) references public.touchline_fixture_quota_attempts(account_scope,request_id,attempt)
);
alter table touchline_quota_private.recovery_preparations enable row level security;
alter table touchline_quota_private.recovery_entities enable row level security;
alter table touchline_quota_private.recovery_quarantine enable row level security;
revoke all on touchline_quota_private.recovery_preparations,touchline_quota_private.recovery_entities,
  touchline_quota_private.recovery_quarantine from public,anon,authenticated,service_role;

-- A private fingerprint detects drift in scope, registry OR ANY receipt.
-- Raw tokens remain in the authority only; they are not copied to the case.
-- Call under the same workers->scope->attempt locks as recovery preparation.
create function touchline_quota_private.recovery_state_digest(p_scope text)
returns text language sql stable security invoker set search_path='' set timezone='UTC' as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'scope',(select to_jsonb(s) from public.touchline_fixture_quota_scopes s where s.account_scope=p_scope),
    'workers',(select coalesce(jsonb_agg(to_jsonb(w) order by w.worker_id),'[]'::jsonb)
      from touchline_quota_private.workers w where w.account_scope=p_scope),
    'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.request_id,a.attempt),'[]'::jsonb)
      from public.touchline_fixture_quota_attempts a where a.account_scope=p_scope)
  )::text,'UTF8')),'hex');
$$;
revoke all on function touchline_quota_private.recovery_state_digest(text) from public,anon,authenticated,service_role;

create function touchline_quota_private.prepare_recovery_case(
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
  if not found then return false; end if;
  lock table touchline_quota_private.workers in share row exclusive mode;
  perform 1 from touchline_quota_private.workers where account_scope=c.account_scope order by worker_id for update;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=c.account_scope for update;
  select * into c from touchline_quota_private.recovery_cases where id=p_case for update;
  perform 1 from public.touchline_fixture_quota_attempts where account_scope=c.account_scope order by request_id,attempt for update;
  n:=clock_timestamp();
  if c.closed_at is not null or s.enabled or not s.blocked_unknown
    or exists(select 1 from touchline_quota_private.workers where account_scope=c.account_scope and enabled)
    or s.cooldown_until>n then return false; end if;

  select * into prep from touchline_quota_private.recovery_preparations where case_id=p_case;
  if found then
    -- Idempotent acknowledgement only. Never repeat lease retirement or certify
    -- a changed state under an old incident's evidence.
    return prep.drained_at=p_drained_at and prep.reset_observed_at=p_reset_observed_at
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
commit;
