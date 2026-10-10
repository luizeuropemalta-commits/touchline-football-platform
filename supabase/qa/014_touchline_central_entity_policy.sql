-- Central authority ONLY, after 013; preparation is not activation.
-- Shared per-entity accounting uses the latest owned receipt, not endpoint pools.
begin;
set local lock_timeout='5s';
lock table public.touchline_fixture_quota_scopes in access exclusive mode;
lock table public.touchline_fixture_quota_attempts in access exclusive mode;
do $$ begin
  if exists(select 1 from public.touchline_fixture_quota_scopes where enabled or active_token is not null)
    or exists(select 1 from public.touchline_fixture_quota_attempts where completed_at is null) then
    raise exception 'Central entity policy installation requires disabled, drained scopes.';
  end if;
end $$;
create function touchline_quota_private.endpoint_policy(p_endpoint text)
returns table(operation text,entity text) language sql immutable strict set search_path='' as $$
  select v.operation,v.entity from (values
    ('fixture','fixture','Fixture'),
    ('date','fixture','Fixture'),
    ('between','fixture','Fixture'),
    ('inplay','fixture','Fixture'),
    ('latest','fixture','Fixture'),
    ('league','league','League'),
    ('season','season','Season'),
    ('stages','stages','Stage'),
    ('topscorers','topscorers','Topscorer'),
    ('squad','squad','PlayerTeam'),
    ('squadExtended','squadExtended','Player'),
    ('player','player','Player'),
    ('playerSearch','player','Player'),
    ('team','team','Team'),
    ('coach','coach','Coach'),
    ('standings','standing','Standing'),
    ('playerTransfers','transfer','Transfer'),
    ('teamTransfers','transfer','Transfer'),
    ('seasons','season','Season'),
    ('leagueSeasons','season','Season'),
    ('leagues','league','League'),
    ('resources','resource','Resource'),
    ('enrichments','enrichment','Enrichment')
  ) as v(endpoint,operation,entity) where v.endpoint=p_endpoint;
$$;
revoke all on function touchline_quota_private.endpoint_policy(text) from public,anon,authenticated,service_role;
alter table public.touchline_fixture_quota_attempts drop constraint touchline_fixture_quota_attempts_endpoint_check;
alter table public.touchline_fixture_quota_attempts add constraint touchline_fixture_quota_attempts_endpoint_check
  check(endpoint in ('fixture','date','between','inplay','latest','league','season','stages','topscorers','squad','squadExtended','player','playerSearch','team','coach','standings','playerTransfers','teamTransfers','seasons','leagueSeasons','leagues','resources','enrichments'));

-- Operator-only one-shot bootstrap for a previously unobserved entity.
-- A grant is not a fabricated balance. No seed or activation is included.
-- A consumed grant remains audit history. No public grant/recovery RPC.
create table touchline_quota_private.bootstrap_grants (
  id uuid primary key default gen_random_uuid(),
  account_scope text not null references public.touchline_fixture_quota_scopes(account_scope),
  entity text not null check(entity in ('Fixture','League','Season','Stage','Topscorer','PlayerTeam','Player','Team','Coach','Standing','Transfer','Resource','Enrichment')),
  evidence_ref text not null check(length(evidence_ref) between 1 and 256),
  granted_at timestamptz not null default clock_timestamp() check(isfinite(granted_at)),
  expires_at timestamptz not null check(isfinite(expires_at)),
  consumed_at timestamptz check(isfinite(consumed_at)),
  cancelled_at timestamptz check(isfinite(cancelled_at)),
  cancellation_evidence_ref text check(length(btrim(cancellation_evidence_ref)) between 1 and 256),
  request_id uuid,
  check(expires_at>granted_at and expires_at<=granted_at+interval '5 minutes'),
  check((consumed_at is null)=(request_id is null)),
  check((cancelled_at is null)=(cancellation_evidence_ref is null)),
  check(cancelled_at is null or (consumed_at is null and cancelled_at>=expires_at))
);
create unique index central_bootstrap_one_pending on touchline_quota_private.bootstrap_grants(account_scope,entity)
  where consumed_at is null and cancelled_at is null;
alter table touchline_quota_private.bootstrap_grants enable row level security;
revoke all on touchline_quota_private.bootstrap_grants from public,anon,authenticated,service_role;

-- Operator-only retirement of an UNUSED, EXPIRED grant. This never grants a
-- request, clears unknown/cooldown/leases, or rewrites a consumed receipt.
-- Scope -> grant lock order matches admission; concurrent consumption wins
-- before retirement, or retirement makes the grant ineligible for admission.
create function touchline_quota_private.retire_expired_bootstrap(p_id uuid,p_evidence_ref text)
returns boolean language plpgsql set search_path='' set lock_timeout='5s' as $$
declare scope_id text; retired uuid;
begin
  if p_id is null or p_evidence_ref is null or length(btrim(p_evidence_ref)) not between 1 and 256 then
    return false;
  end if;
  select account_scope into scope_id from touchline_quota_private.bootstrap_grants where id=p_id;
  if not found then return false; end if;
  perform 1 from public.touchline_fixture_quota_scopes where account_scope=scope_id for update;
  if not found then return false; end if;
  update touchline_quota_private.bootstrap_grants
    set cancelled_at=clock_timestamp(),cancellation_evidence_ref=btrim(p_evidence_ref)
    where id=p_id and account_scope=scope_id and consumed_at is null
      and cancelled_at is null and expires_at<=clock_timestamp()
    returning id into retired;
  return retired is not null;
end $$;
revoke all on function touchline_quota_private.retire_expired_bootstrap(uuid,text)
  from public,anon,authenticated,service_role;

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
  if (select array_agg(k order by k) from jsonb_object_keys(p_observation) k) is distinct from
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
    cooldown_until=greatest(cooldown_until,deadline),
    blocked_unknown=blocked_unknown or unknown_reset or active_until <= clock_timestamp(),
    active_token=null,active_until=null where account_scope=p_account_scope;
  update public.touchline_fixture_quota_attempts set observation=p_observation,completed_at=clock_timestamp()
    where account_scope=p_account_scope and request_id=p_request_id and attempt=p_attempt;
  return jsonb_build_object('persisted',true);
end $$;

revoke all on function touchline_quota_private.touchline_fixture_quota_admit(text,uuid,text,integer,integer)
  from public,anon,authenticated,service_role;
revoke all on function touchline_quota_private.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)
  from public,anon,authenticated,service_role;
-- Public authenticated ownership wrappers from 013 remain the only interface.
commit;
