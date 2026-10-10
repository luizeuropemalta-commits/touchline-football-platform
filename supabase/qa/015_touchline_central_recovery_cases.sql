-- Central authority ONLY, after 013/014. Audit preparation is NOT recovery.
-- No grants, lease clearing, receipt rewriting, worker or scope activation.
begin;
set local lock_timeout='5s';
create table touchline_quota_private.recovery_cases (
  id uuid primary key default gen_random_uuid(),
  account_scope text not null references public.touchline_fixture_quota_scopes(account_scope),
  created_at timestamptz not null default clock_timestamp(),
  operator_name text not null default session_user,
  drain_evidence_ref text not null check(length(btrim(drain_evidence_ref)) between 1 and 256),
  reset_evidence_ref text not null check(length(btrim(reset_evidence_ref)) between 1 and 256),
  scope_snapshot jsonb not null check(jsonb_typeof(scope_snapshot)='object'),
  attempt_snapshot jsonb not null check(jsonb_typeof(attempt_snapshot)='array'),
  worker_snapshot jsonb not null check(jsonb_typeof(worker_snapshot)='array'),
  closed_at timestamptz,
  unique(id,account_scope)
);
create unique index central_recovery_one_open on touchline_quota_private.recovery_cases(account_scope) where closed_at is null;
alter table touchline_quota_private.recovery_cases enable row level security;
revoke all on touchline_quota_private.recovery_cases from public,anon,authenticated,service_role;

-- Scope must already be OFF and workers revoked. Evidence references are
-- operator attestations, not SQL proof that remote processes stopped or reset.
-- Records exact pending and latest-owned-per-entity identities without tokens.
create function touchline_quota_private.record_recovery_case(
  p_scope text,p_drain_evidence text,p_reset_evidence text
) returns uuid language plpgsql security invoker set search_path='' set lock_timeout='5s' set timezone='UTC' as $$
declare s public.touchline_fixture_quota_scopes; existing touchline_quota_private.recovery_cases;
  workers jsonb; attempts jsonb; case_id uuid;
begin
  if p_scope is null or p_scope !~ '^[a-z][a-z0-9_-]{0,63}$'
    or p_drain_evidence is null or length(btrim(p_drain_evidence)) not between 1 and 256
    or p_reset_evidence is null or length(btrim(p_reset_evidence)) not between 1 and 256 then return null; end if;
  -- Prevent concurrent registration while following the normal worker->scope
  -- lock order. This operator operation is intentionally infrequent.
  lock table touchline_quota_private.workers in share row exclusive mode;
  perform 1 from touchline_quota_private.workers where account_scope=p_scope order by worker_id for update;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=p_scope for update;
  if not found or s.enabled or exists(select 1 from touchline_quota_private.workers where account_scope=p_scope and enabled)
    or (s.active_token is not null and (s.active_until is null or s.active_until>clock_timestamp()-interval '5 seconds'))
    or s.cooldown_until>clock_timestamp() then return null; end if;
  select * into existing from touchline_quota_private.recovery_cases where account_scope=p_scope and closed_at is null;
  if found then
    if existing.drain_evidence_ref=btrim(p_drain_evidence) and existing.reset_evidence_ref=btrim(p_reset_evidence) then return existing.id; end if;
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
  insert into touchline_quota_private.recovery_cases(account_scope,drain_evidence_ref,reset_evidence_ref,scope_snapshot,attempt_snapshot,worker_snapshot)
    values(p_scope,btrim(p_drain_evidence),btrim(p_reset_evidence),jsonb_build_object('enabled',s.enabled,
      'blockedUnknown',s.blocked_unknown,'cooldownUntil',s.cooldown_until,'leasePresent',s.active_token is not null,'activeUntil',s.active_until),attempts,workers)
    returning id into case_id;
  return case_id;
end $$;
revoke all on function touchline_quota_private.record_recovery_case(text,text,text) from public,anon,authenticated,service_role;
commit;
