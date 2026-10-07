-- Local candidate only: no scope, worker, scheduler or provider is activated.
-- Extend the existing shared account authority, preserving its history and locks.
-- New raw entities require isolated evidence before deployment/activation.
begin;
set local lock_timeout = '5s';
alter table public.touchline_fixture_quota_attempts drop constraint touchline_fixture_quota_attempts_endpoint_check;
alter table public.touchline_fixture_quota_attempts add constraint touchline_fixture_quota_attempts_endpoint_check
  check (endpoint in ('fixture','date','between','inplay','latest','league','season','stages','topscorers'));

create or replace function public.touchline_fixture_quota_admit(
  p_account_scope text, p_request_id uuid, p_endpoint text, p_attempt integer, p_budget_ms integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.touchline_fixture_quota_scopes; t uuid; n timestamptz;
begin
  if p_account_scope is null or p_account_scope !~ '^[a-z][a-z0-9_-]{0,63}$'
    or p_request_id is null or p_endpoint is null or p_endpoint not in ('fixture','date','between','inplay','latest','league','season','stages','topscorers')
    or p_attempt is null or p_attempt < 1 or p_budget_ms is null or p_budget_ms < 1 then
    return jsonb_build_object('allowed',false);
  end if;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=p_account_scope for update;
  if not found or not s.enabled then return jsonb_build_object('allowed',false); end if;
  n:=clock_timestamp();
  -- Never assume a timed-out owner means the provider has reset its quota.
  if s.active_token is not null then
    if s.active_until <= n then
      update public.touchline_fixture_quota_scopes set blocked_unknown=true where account_scope=p_account_scope;
    end if;
    return jsonb_build_object('allowed',false);
  end if;
  if s.blocked_unknown or s.cooldown_until > n then return jsonb_build_object('allowed',false); end if;
  -- A replay of admission is not permission for another HTTP request.
  if exists(select 1 from public.touchline_fixture_quota_attempts
    where account_scope=p_account_scope and request_id=p_request_id and attempt=p_attempt) then
    return jsonb_build_object('allowed',false);
  end if;
  t:=gen_random_uuid();
  insert into public.touchline_fixture_quota_attempts(account_scope,request_id,attempt,endpoint,token,admitted_at)
    values(p_account_scope,p_request_id,p_attempt,p_endpoint,t,n);
  update public.touchline_fixture_quota_scopes
    set active_token=t,active_until=n + p_budget_ms * interval '1 millisecond' where account_scope=p_account_scope;
  return jsonb_build_object('allowed',true,'token',t);
end $$;

create or replace function public.touchline_fixture_quota_complete(
  p_account_scope text, p_request_id uuid, p_endpoint text, p_attempt integer, p_token uuid, p_observation jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.touchline_fixture_quota_scopes; a public.touchline_fixture_quota_attempts;
  observed timestamptz; deadline timestamptz; reset_at timestamptz;
  status_code integer; remaining numeric; entity text; unknown_reset boolean; throttled boolean;
  expected_operation text; expected_entity text;
begin
  if p_account_scope is null or p_request_id is null or p_token is null or p_attempt is null
    or p_endpoint is null or p_endpoint not in ('fixture','date','between','inplay','latest','league','season','stages','topscorers') or p_observation is null or jsonb_typeof(p_observation) <> 'object' then
    return jsonb_build_object('persisted',false);
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_observation) k) is distinct from
    array['attempt','cooldownUntil','observedAt','operation','remaining','requestId','requestedEntity','resetAt','status']::text[] then
    return jsonb_build_object('persisted',false);
  end if;
  expected_operation:=case p_endpoint when 'league' then 'league' when 'season' then 'season'
    when 'stages' then 'stages' when 'topscorers' then 'topscorers' else 'fixture' end;
  expected_entity:=case p_endpoint when 'league' then 'League' when 'season' then 'Season'
    when 'stages' then 'Stage' when 'topscorers' then 'Topscorer' else 'Fixture' end;
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
  -- A throttle may use a reliable absolute Retry-After deadline even when
  -- the provider omitted its remaining-count payload.
  unknown_reset:=status_code=0 or observed is null
    or (expected_operation='fixture' and entity is not null and lower(entity)<>'fixture')
    or (expected_operation<>'fixture' and entity is distinct from expected_entity)
    or (throttled and deadline is null)
    or (not throttled and (remaining is null or entity is null));
  update public.touchline_fixture_quota_scopes set
    cooldown_until=greatest(cooldown_until,deadline),
    blocked_unknown=blocked_unknown or unknown_reset or active_until <= clock_timestamp(),
    active_token=null,active_until=null where account_scope=p_account_scope;
  update public.touchline_fixture_quota_attempts set observation=p_observation,completed_at=clock_timestamp()
    where account_scope=p_account_scope and request_id=p_request_id and attempt=p_attempt;
  return jsonb_build_object('persisted',true);
end $$;
revoke all on function public.touchline_fixture_quota_admit(text,uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.touchline_fixture_quota_admit(text,uuid,text,integer,integer) to service_role;
grant execute on function public.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb) to service_role;
commit;
