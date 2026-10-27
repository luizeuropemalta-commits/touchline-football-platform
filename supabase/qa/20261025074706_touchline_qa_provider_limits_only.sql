-- QA authority only; owner requested provider limits without internal reserves.
-- Not an application/Production migration. Opt-in starts OFF; activation separate.
-- No provider call, fabricated completion, worker grant or credential change.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
do $pre$ begin
  if exists(select 1 from (values
    ('touchline_quota_private.touchline_fixture_quota_admit(text,uuid,text,integer,integer)','7156a445f72b5fad0e5178e382f66123'),
    ('touchline_quota_private.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)','10f804816b222b15ba49aa04aea8b27d'),
    ('public.touchline_qa_roster_quota_checkpoint(text,text,integer)','ab23daf97b422858d381dc03d1b835df')
  ) e(signature,digest) where not exists(select 1 from pg_proc p where p.oid=to_regprocedure(e.signature)
    and md5(p.prosrc)=e.digest and p.proowner='postgres'::regrole and p.prosecdef)) then
    raise exception 'PROVIDER_POLICY_PREIMAGE_MISMATCH';
  end if;
end $pre$;
do $acl$ begin
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid in ('touchline_quota_private.touchline_fixture_quota_admit(text,uuid,text,integer,integer)'::regprocedure,
    'touchline_quota_private.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)'::regprocedure,
    'public.touchline_qa_roster_quota_checkpoint(text,text,integer)'::regprocedure)
   and a.privilege_type='EXECUTE' and a.grantee<>p.proowner
   and not (p.oid='public.touchline_qa_roster_quota_checkpoint(text,text,integer)'::regprocedure and a.grantee='service_role'::regrole))
 then raise exception 'PROVIDER_POLICY_ACL_MISMATCH'; end if;
end $acl$;
create table touchline_quota_private.provider_limit_policies (
  account_scope text primary key references public.touchline_fixture_quota_scopes(account_scope),
  enabled boolean not null default false,
  authorization_ref text not null check(length(btrim(authorization_ref)) between 1 and 256)
);
create table touchline_quota_private.expired_lease_audit (
  token uuid primary key,
  account_scope text not null references public.touchline_fixture_quota_scopes(account_scope),
  expired_at timestamptz not null,
  retired_at timestamptz not null,
  reason text not null default 'expired_without_completion'
);
create table touchline_quota_private.provider_policy_preimages (
  signature text primary key, definition text not null, digest text not null
);
insert into touchline_quota_private.provider_policy_preimages
select p.oid::regprocedure::text,pg_get_functiondef(p.oid),md5(p.prosrc) from pg_proc p
where p.oid in ('touchline_quota_private.touchline_fixture_quota_admit(text,uuid,text,integer,integer)'::regprocedure,
 'touchline_quota_private.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)'::regprocedure,
 'public.touchline_qa_roster_quota_checkpoint(text,text,integer)'::regprocedure);
alter table touchline_quota_private.provider_limit_policies enable row level security;
alter table touchline_quota_private.expired_lease_audit enable row level security;
alter table touchline_quota_private.provider_policy_preimages enable row level security;
revoke all on touchline_quota_private.provider_limit_policies,touchline_quota_private.expired_lease_audit,
 touchline_quota_private.provider_policy_preimages from public,anon,authenticated,service_role;
create function touchline_quota_private.provider_limits_only(p_scope text)
returns boolean language sql stable security invoker set search_path='' as $$
 select p_scope='touchline_sportmonks_football_starter'
   and exists(select 1 from touchline_quota_private.provider_limit_policies where account_scope=p_scope and enabled)
   and exists(select 1 from touchline_quota_private.workers where account_scope=p_scope and environment='qa')
   and not exists(select 1 from touchline_quota_private.workers where account_scope=p_scope and environment<>'qa');
$$;
revoke all on function touchline_quota_private.provider_limits_only(text) from public,anon,authenticated,service_role;

create or replace function touchline_quota_private.touchline_fixture_quota_admit(
  p_account_scope text,p_request_id uuid,p_endpoint text,p_attempt integer,p_budget_ms integer
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  s public.touchline_fixture_quota_scopes;
  a public.touchline_fixture_quota_attempts;
  n timestamptz; t uuid; expected_entity text; expected_operation text;
  observed timestamptz; reset_at timestamptz; remaining numeric; grant_id uuid;
begin
  if p_account_scope is null or p_request_id is null or p_endpoint is null
    or p_attempt is null or p_attempt<1 or p_budget_ms is null or p_budget_ms<1 then
    return jsonb_build_object('allowed',false);
  end if;
  select operation,entity into expected_operation,expected_entity from touchline_quota_private.endpoint_policy(p_endpoint);
  if not found then return jsonb_build_object('allowed',false); end if;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=p_account_scope for update;
  if not found or not s.enabled then return jsonb_build_object('allowed',false); end if;
  n:=clock_timestamp();
  -- Owner-authorized policy: provider limits only; keep ownership, serialization
  -- and same-request replay protection. Historical receipts remain unchanged.
  if touchline_quota_private.provider_limits_only(p_account_scope) then
    if s.cooldown_until>n then return jsonb_build_object('allowed',false); end if;
    if s.active_token is not null then
      if s.active_until is null or s.active_until+interval '5 seconds'>n then
        return jsonb_build_object('allowed',false);
      end if;
      insert into touchline_quota_private.expired_lease_audit(token,account_scope,expired_at,retired_at)
        values(s.active_token,p_account_scope,s.active_until,n) on conflict(token) do nothing;
      update public.touchline_fixture_quota_scopes set active_token=null,active_until=null
        where account_scope=p_account_scope;
    end if;
    if exists(select 1 from public.touchline_fixture_quota_attempts
      where account_scope=p_account_scope and request_id=p_request_id and attempt=p_attempt) then
      return jsonb_build_object('allowed',false);
    end if;
    -- A real provider refusal still waits for its reported deadline. Existing
    -- cooldown is independent of later receipts. Unknown quota is not a refusal.
    select q.* into a from public.touchline_fixture_quota_attempts q
      cross join lateral touchline_quota_private.endpoint_policy(q.endpoint) policy
      where q.account_scope=p_account_scope and q.completed_at is not null
        and q.owner_worker_id is not null and policy.entity=expected_entity
      order by q.completed_at desc,q.admitted_at desc,q.request_id desc limit 1;
    if found and (a.observation->>'status'='429' or a.observation->>'remaining'='0') then
      reset_at:=greatest((a.observation->>'resetAt')::timestamptz,
        (a.observation->>'cooldownUntil')::timestamptz);
      if coalesce(reset_at,a.completed_at+interval '60 seconds')>n then
        return jsonb_build_object('allowed',false);
      end if;
    end if;
    t:=gen_random_uuid();
    insert into public.touchline_fixture_quota_attempts(account_scope,request_id,attempt,endpoint,token,admitted_at)
      values(p_account_scope,p_request_id,p_attempt,p_endpoint,t,n);
    update public.touchline_fixture_quota_scopes set active_token=t,
      active_until=n+p_budget_ms*interval '1 millisecond',blocked_unknown=false where account_scope=p_account_scope;
    return jsonb_build_object('allowed',true,'token',t);
  end if;
  if s.active_token is not null then
    if s.active_until<=n then
      update public.touchline_fixture_quota_scopes set blocked_unknown=true where account_scope=p_account_scope;
    end if;
    return jsonb_build_object('allowed',false);
  end if;
  if s.blocked_unknown or s.cooldown_until>n then return jsonb_build_object('allowed',false); end if;
  if exists(select 1 from public.touchline_fixture_quota_attempts
    where account_scope=p_account_scope and request_id=p_request_id and attempt=p_attempt) then
    return jsonb_build_object('allowed',false);
  end if;

  -- All consumers of Player (including extended squad) spend ONE entity pool.
  -- Do not select an older successful endpoint receipt over a newer failure.
  select q.* into a from public.touchline_fixture_quota_attempts q
    cross join lateral touchline_quota_private.endpoint_policy(q.endpoint) policy
    where q.account_scope=p_account_scope and q.completed_at is not null
      and q.owner_worker_id is not null and policy.entity=expected_entity
    order by q.completed_at desc,q.admitted_at desc,q.request_id desc limit 1;
  if not found then
    select id into grant_id from touchline_quota_private.bootstrap_grants
      where account_scope=p_account_scope and entity=expected_entity and consumed_at is null and cancelled_at is null
        and granted_at<=n and expires_at>n for update;
    if not found then return jsonb_build_object('allowed',false); end if;
  else
    -- Receipts were schema-checked by completion, but revalidate primitives
    -- here so corrupt/operator-edited history cannot grant permission.
    if a.observation is null or jsonb_typeof(a.observation) is distinct from 'object'
      or a.observation->>'requestedEntity' is distinct from expected_entity
      or a.observation->>'requestId' is distinct from a.request_id::text
      or a.observation->'attempt' is distinct from to_jsonb(a.attempt)
      or a.observation->>'operation' is distinct from
        (select operation from touchline_quota_private.endpoint_policy(a.endpoint))
      or jsonb_typeof(a.observation->'remaining') is distinct from 'number'
      or (a.observation->>'remaining') !~ '^[0-9]+$'
      or jsonb_typeof(a.observation->'status') is distinct from 'number'
      or (a.observation->>'status') !~ '^[0-9]{1,3}$'
      or ((a.observation->>'status')::integer not between 200 and 299 and (a.observation->>'status')::integer<>429)
      or jsonb_typeof(a.observation->'observedAt') is distinct from 'string'
      or jsonb_typeof(a.observation->'resetAt') is distinct from 'string' then
      return jsonb_build_object('allowed',false);
    end if;
    remaining:=(a.observation->>'remaining')::numeric;
    observed:=(a.observation->>'observedAt')::timestamptz;
    reset_at:=(a.observation->>'resetAt')::timestamptz;
    if remaining>9007199254740991 or not isfinite(observed) or not isfinite(reset_at)
      or observed<a.admitted_at-interval '5 seconds' or observed>a.completed_at+interval '5 seconds'
      or reset_at<observed then return jsonb_build_object('allowed',false); end if;
    if reset_at>n then
      if remaining<=500 or (a.observation->>'status')::integer=429 then return jsonb_build_object('allowed',false); end if;
    elsif reset_at+interval '5 seconds'>n then
      return jsonb_build_object('allowed',false);
    end if;
    -- After a known reset, only ONE measurement request is leased. Never
    -- manufacture a refreshed 2000 balance; completion supplies actual quota.
  end if;
  t:=gen_random_uuid();
  insert into public.touchline_fixture_quota_attempts(account_scope,request_id,attempt,endpoint,token,admitted_at)
    values(p_account_scope,p_request_id,p_attempt,p_endpoint,t,n);
  update public.touchline_fixture_quota_scopes set active_token=t,active_until=n+p_budget_ms*interval '1 millisecond'
    where account_scope=p_account_scope;
  if grant_id is not null then
    update touchline_quota_private.bootstrap_grants set consumed_at=n,request_id=p_request_id where id=grant_id;
  end if;
  -- Outer central wrapper attaches worker ownership in THIS transaction.
  return jsonb_build_object('allowed',true,'token',t);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  return jsonb_build_object('allowed',false);
end $$;
create or replace function touchline_quota_private.touchline_fixture_quota_complete(
  p_account_scope text, p_request_id uuid, p_endpoint text, p_attempt integer, p_token uuid, p_observation jsonb
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare s public.touchline_fixture_quota_scopes; a public.touchline_fixture_quota_attempts;
  observed timestamptz; deadline timestamptz; reset_at timestamptz;
  status_code integer; remaining numeric; entity text; unknown_reset boolean; throttled boolean;
  expected_operation text; expected_entity text;
begin
  if p_account_scope is null or p_request_id is null or p_token is null or p_attempt is null
    or p_endpoint is null or p_endpoint not in ('fixture','date','between','inplay','latest','league','season','stages','topscorers','squad','squadExtended','player','playerSearch','team','coach','standings','playerTransfers','teamTransfers','seasons','leagueSeasons','leagues','resources','enrichments') or p_observation is null or jsonb_typeof(p_observation) <> 'object' then
    return jsonb_build_object('persisted',false);
  end if;
  if (select array_agg(k order by k collate "C") from jsonb_object_keys(p_observation) k) is distinct from
    array['attempt','cooldownUntil','observedAt','operation','remaining','requestId','requestedEntity','resetAt','status']::text[] then
    return jsonb_build_object('persisted',false);
  end if;
  select policy.operation, policy.entity into expected_operation, expected_entity
    from touchline_quota_private.endpoint_policy(p_endpoint) policy;
  if not found then return jsonb_build_object('persisted',false); end if;
  if p_observation->>'requestId' is distinct from p_request_id::text
    or p_observation->>'operation' is distinct from expected_operation
    or p_observation->'attempt' is distinct from to_jsonb(p_attempt)
    or jsonb_typeof(p_observation->'status') <> 'number'
    or (p_observation->>'status') !~ '^[0-9]{1,3}$' then return jsonb_build_object('persisted',false); end if;
  status_code:=(p_observation->>'status')::integer;
  if status_code > 599 then return jsonb_build_object('persisted',false); end if;
  if p_observation->'remaining' <> 'null'::jsonb then
    if jsonb_typeof(p_observation->'remaining') <> 'number' or (p_observation->>'remaining') !~ '^[0-9]+$' then
      return jsonb_build_object('persisted',false);
    end if;
    remaining:=(p_observation->>'remaining')::numeric;
    if remaining > 9007199254740991 then return jsonb_build_object('persisted',false); end if;
  end if;
  entity:=p_observation->>'requestedEntity';
  if entity is not null and (jsonb_typeof(p_observation->'requestedEntity') <> 'string'
    or entity !~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$') then return jsonb_build_object('persisted',false); end if;
  -- Accept only normalized UTC instants; never re-anchor a relative reset.
  if exists(select 1 from jsonb_each(p_observation) e where e.key in ('observedAt','resetAt','cooldownUntil')
    and e.value <> 'null'::jsonb and (jsonb_typeof(e.value) <> 'string'
      or (e.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$')) then
    return jsonb_build_object('persisted',false);
  end if;
  begin
    observed:=(p_observation->>'observedAt')::timestamptz;
    reset_at:=(p_observation->>'resetAt')::timestamptz;
    deadline:=(p_observation->>'cooldownUntil')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('persisted',false);
  end;
  if not isfinite(observed) or not isfinite(reset_at) or not isfinite(deadline) then
    return jsonb_build_object('persisted',false);
  end if;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=p_account_scope for update;
  if not found then return jsonb_build_object('persisted',false); end if;
  select * into a from public.touchline_fixture_quota_attempts
    where account_scope=p_account_scope and request_id=p_request_id and attempt=p_attempt for update;
  if not found or a.token <> p_token or a.endpoint <> p_endpoint then return jsonb_build_object('persisted',false); end if;
  if a.completed_at is not null then
    return jsonb_build_object('persisted',a.observation=p_observation);
  end if;
  if s.active_token is distinct from p_token then return jsonb_build_object('persisted',false); end if;
  throttled:=status_code=429 or coalesce(remaining=0,false);
  -- A transport failure or missing quota is not evidence of spare capacity.
  -- Missing quota needs operator reconciliation, not a made-up reset balance.
  unknown_reset:=status_code=0 or observed is null or remaining is null or reset_at is null
    or entity is distinct from expected_entity
    or observed < a.admitted_at - interval '5 seconds'
    or observed > clock_timestamp() + interval '5 seconds'
    or reset_at < observed
    or (throttled and deadline is null);
  update public.touchline_fixture_quota_scopes set
    cooldown_until=greatest(cooldown_until,deadline,
      case when touchline_quota_private.provider_limits_only(p_account_scope)
        and ((throttled and deadline is null) or status_code=0 or status_code>=500)
        then clock_timestamp()+interval '60 seconds' else null end),
    blocked_unknown=case when touchline_quota_private.provider_limits_only(p_account_scope)
      then false else blocked_unknown or unknown_reset or active_until <= clock_timestamp() end,
    active_token=null,active_until=null where account_scope=p_account_scope;
  update public.touchline_fixture_quota_attempts set observation=p_observation,completed_at=clock_timestamp()
    where account_scope=p_account_scope and request_id=p_request_id and attempt=p_attempt;
  return jsonb_build_object('persisted',true);
end $$;
create or replace function public.touchline_qa_roster_quota_checkpoint(
  p_project_ref text,
  p_account_scope text,
  p_remaining_clubs integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope public.touchline_fixture_quota_scopes;
  v_basic jsonb;
  v_extended jsonb;
  v_now timestamptz := clock_timestamp();
  v_floor integer;
begin
  if p_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy'
    or p_account_scope is null or p_account_scope !~ '^[a-z][a-z0-9_-]{0,63}$'
    or p_remaining_clubs is null or p_remaining_clubs < 0 or p_remaining_clubs > 20 then
    return jsonb_build_object('allowed',false);
  end if;
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  select * into v_scope from public.touchline_fixture_quota_scopes
    where account_scope = p_account_scope for share;
  if found and touchline_quota_private.provider_limits_only(p_account_scope) then
    return jsonb_build_object('allowed',v_scope.enabled and v_scope.active_token is null
      and (v_scope.cooldown_until is null or v_scope.cooldown_until<=v_now),'remaining_clubs',p_remaining_clubs);
  end if;
  if not found or not v_scope.enabled or v_scope.blocked_unknown
    or v_scope.active_token is not null or v_scope.cooldown_until > v_now then
    return jsonb_build_object('allowed',false);
  end if;
  select observation into v_basic from public.touchline_fixture_quota_attempts
    where account_scope = p_account_scope and endpoint = 'squad' and completed_at is not null
    order by admitted_at desc limit 1;
  select observation into v_extended from public.touchline_fixture_quota_attempts
    where account_scope = p_account_scope and endpoint = 'squadExtended' and completed_at is not null
    order by admitted_at desc limit 1;
  v_floor := 500 + 3 * p_remaining_clubs;
  if v_basic is null or v_extended is null
    or v_basic->>'requestedEntity' is distinct from 'PlayerTeam'
    or v_extended->>'requestedEntity' is distinct from 'Player'
    or v_basic->>'status' is null or v_extended->>'status' is null
    or v_basic->>'remaining' is null or v_extended->>'remaining' is null
    or v_basic->>'observedAt' is null or v_extended->>'observedAt' is null
    or v_basic->>'resetAt' is null or v_extended->>'resetAt' is null
    or (v_basic->>'status')::integer not between 200 and 299
    or (v_extended->>'status')::integer not between 200 and 299
    or (v_basic->>'remaining')::integer < v_floor
    or (v_extended->>'remaining')::integer < v_floor
    or (v_basic->>'observedAt')::timestamptz not between v_now - interval '2 minutes' and v_now
    or (v_extended->>'observedAt')::timestamptz not between v_now - interval '2 minutes' and v_now
    or (v_basic->>'resetAt')::timestamptz <= v_now
    or (v_extended->>'resetAt')::timestamptz <= v_now then
    return jsonb_build_object('allowed',false);
  end if;
  return jsonb_build_object('allowed',true,'remaining_clubs',p_remaining_clubs);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  return jsonb_build_object('allowed',false);
end;
$$;

do $acl$ begin
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid in ('touchline_quota_private.touchline_fixture_quota_admit(text,uuid,text,integer,integer)'::regprocedure,
    'touchline_quota_private.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)'::regprocedure,
    'public.touchline_qa_roster_quota_checkpoint(text,text,integer)'::regprocedure)
   and a.privilege_type='EXECUTE' and a.grantee<>p.proowner
   and not (p.oid='public.touchline_qa_roster_quota_checkpoint(text,text,integer)'::regprocedure and a.grantee='service_role'::regrole))
 then raise exception 'PROVIDER_POLICY_ACL_MISMATCH'; end if;
end $acl$;
commit;
