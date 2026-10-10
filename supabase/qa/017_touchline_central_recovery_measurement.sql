-- Central operator-only protocol after 016. Never exposed to ordinary workers.
-- SQL authorizes/accountably records one measurement; an operator executor
-- must perform at most ONE HTTP attempt with that lease, without retry.
begin;
set local lock_timeout='5s';
alter table touchline_quota_private.recovery_cases add column outcome text
  check(outcome in ('resolved','aborted'));
alter table touchline_quota_private.recovery_cases add constraint recovery_closed_outcome
  check((closed_at is null)=(outcome is null));
create table touchline_quota_private.recovery_measurements (
  case_id uuid not null,
  entity text not null,
  account_scope text not null,
  request_id uuid not null,
  attempt integer not null default 1 check(attempt=1),
  owner_worker_id text not null,
  owner_environment text not null,
  lease_until timestamptz not null check(isfinite(lease_until)),
  primary key(case_id,entity),
  unique(account_scope,request_id,attempt),
  foreign key(case_id,entity) references touchline_quota_private.recovery_entities(case_id,entity),
  foreign key(case_id,account_scope) references touchline_quota_private.recovery_preparations(case_id,account_scope),
  foreign key(account_scope,request_id,attempt) references public.touchline_fixture_quota_attempts(account_scope,request_id,attempt),
  foreign key(owner_worker_id,owner_environment,account_scope) references touchline_quota_private.workers(worker_id,environment,account_scope)
);
alter table touchline_quota_private.recovery_measurements enable row level security;
revoke all on touchline_quota_private.recovery_measurements from public,anon,authenticated,service_role;

create function touchline_quota_private.lock_recovery_scope(p_case uuid)
returns text language plpgsql security invoker set search_path='' set timezone='UTC' set lock_timeout='5s' as $$
declare scope_id text;
begin
  select account_scope into scope_id from touchline_quota_private.recovery_cases where id=p_case;
  if not found then return null; end if;
  lock table touchline_quota_private.workers in share row exclusive mode;
  perform 1 from touchline_quota_private.workers where account_scope=scope_id order by worker_id for update;
  perform 1 from public.touchline_fixture_quota_scopes where account_scope=scope_id for update;
  perform 1 from touchline_quota_private.recovery_cases where id=p_case for update;
  perform 1 from public.touchline_fixture_quota_attempts where account_scope=scope_id order by request_id,attempt for update;
  return scope_id;
end $$;
revoke all on function touchline_quota_private.lock_recovery_scope(uuid) from public,anon,authenticated,service_role;

create function touchline_quota_private.recovery_matches_expected(p_case uuid)
returns boolean language sql stable security invoker set search_path='' set timezone='UTC' as $$
  select coalesce((select not s.enabled and s.blocked_unknown and c.closed_at is null
    and not exists(select 1 from touchline_quota_private.workers w where w.account_scope=s.account_scope and w.enabled)
    and p.expected_state_digest=touchline_quota_private.recovery_state_digest(s.account_scope)
    from touchline_quota_private.recovery_cases c
    join touchline_quota_private.recovery_preparations p on p.case_id=c.id
    join public.touchline_fixture_quota_scopes s on s.account_scope=c.account_scope
    where c.id=p_case),false);
$$;
revoke all on function touchline_quota_private.recovery_matches_expected(uuid) from public,anon,authenticated,service_role;

create function touchline_quota_private.admit_recovery_measurement(
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
revoke all on function touchline_quota_private.admit_recovery_measurement(uuid,text,uuid,text,integer) from public,anon,authenticated,service_role;

create function touchline_quota_private.complete_recovery_measurement(
  p_case uuid,p_worker text,p_request uuid,p_endpoint text,p_token uuid,p_observation jsonb
) returns jsonb language plpgsql security invoker set search_path='' set timezone='UTC' set lock_timeout='5s' as $$
declare scope_id text; m touchline_quota_private.recovery_measurements;
  a public.touchline_fixture_quota_attempts; result jsonb;
begin
  scope_id:=touchline_quota_private.lock_recovery_scope(p_case);
  if scope_id is null then return jsonb_build_object('persisted',false); end if;
  select * into m from touchline_quota_private.recovery_measurements where case_id=p_case and request_id=p_request;
  if not found or m.owner_worker_id is distinct from p_worker then return jsonb_build_object('persisted',false); end if;
  select * into a from public.touchline_fixture_quota_attempts where account_scope=scope_id and request_id=p_request and attempt=m.attempt;
  if not found or a.token is distinct from p_token or a.endpoint is distinct from p_endpoint
    or a.owner_worker_id is distinct from m.owner_worker_id or a.owner_environment is distinct from m.owner_environment
    or m.entity is distinct from (select entity from touchline_quota_private.endpoint_policy(p_endpoint)) then
    return jsonb_build_object('persisted',false); end if;
  -- Even after a resolved/aborted case, replay only acknowledges an identical
  -- durable receipt. It never changes the case, lease or quota.
  if a.completed_at is not null then return jsonb_build_object('persisted',coalesce(a.observation=p_observation,false)); end if;
  if not touchline_quota_private.recovery_matches_expected(p_case) then return jsonb_build_object('persisted',false); end if;
  result:=touchline_quota_private.touchline_fixture_quota_complete(scope_id,p_request,p_endpoint,m.attempt,p_token,p_observation);
  if result->'persisted'='true'::jsonb then
    update touchline_quota_private.recovery_preparations set expected_state_digest=touchline_quota_private.recovery_state_digest(scope_id) where case_id=p_case;
  end if;
  return result;
end $$;
revoke all on function touchline_quota_private.complete_recovery_measurement(uuid,text,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;

create function touchline_quota_private.finalize_recovery_case(p_case uuid)
returns boolean language plpgsql security invoker set search_path='' set timezone='UTC' set lock_timeout='5s' as $$
declare scope_id text; s public.touchline_fixture_quota_scopes; r record; observed timestamptz;
  reset_at timestamptz; deadline timestamptz; remaining numeric; status_code integer;
begin
  scope_id:=touchline_quota_private.lock_recovery_scope(p_case);
  if scope_id is null then return false; end if;
  -- Finalized-case replay certifies only the past outcome, never current state.
  if exists(select 1 from touchline_quota_private.recovery_cases where id=p_case and outcome='resolved') then return true; end if;
  if not touchline_quota_private.recovery_matches_expected(p_case) then return false; end if;
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
revoke all on function touchline_quota_private.finalize_recovery_case(uuid) from public,anon,authenticated,service_role;

create function touchline_quota_private.abort_recovery_case(p_case uuid)
returns boolean language plpgsql security invoker set search_path='' set timezone='UTC' set lock_timeout='5s' as $$
declare scope_id text; s public.touchline_fixture_quota_scopes;
begin
  scope_id:=touchline_quota_private.lock_recovery_scope(p_case);
  if scope_id is null then return false; end if;
  if exists(select 1 from touchline_quota_private.recovery_cases where id=p_case and outcome='aborted') then return true; end if;
  if exists(select 1 from touchline_quota_private.recovery_cases where id=p_case and closed_at is not null) then return false; end if;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=scope_id;
  if s.enabled or exists(select 1 from touchline_quota_private.workers where account_scope=scope_id and enabled)
    or (s.active_token is not null and (s.active_until is null or s.active_until>clock_timestamp()-interval '5 seconds')) then return false; end if;
  update public.touchline_fixture_quota_scopes set blocked_unknown=true where account_scope=scope_id;
  update touchline_quota_private.recovery_cases set closed_at=clock_timestamp(),outcome='aborted' where id=p_case;
  -- Preserve even an expired lease; another case requires NEW drain/reset.
  return true;
end $$;
revoke all on function touchline_quota_private.abort_recovery_case(uuid) from public,anon,authenticated,service_role;
commit;
