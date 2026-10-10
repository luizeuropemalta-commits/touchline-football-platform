-- Forward-only squad admission protection. Local candidate; enables nothing.
begin;
set local lock_timeout = '5s';

create or replace function public.touchline_fixture_quota_admit(
  p_account_scope text, p_request_id uuid, p_endpoint text, p_attempt integer, p_budget_ms integer
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  s public.touchline_fixture_quota_scopes;
  a public.touchline_fixture_quota_attempts;
  t uuid; n timestamptz;
  entity text; observation jsonb; observed timestamptz; reset_at timestamptz; remaining numeric;
  observed_entity text; observed_operation text;
begin
  if p_account_scope is null or p_account_scope !~ '^[a-z][a-z0-9_-]{0,63}$'
    or p_request_id is null or p_endpoint is null or p_endpoint not in ('fixture','date','between','inplay','latest','league','season','stages','topscorers','squad','squadExtended')
    or p_attempt is null or p_attempt < 1 or p_budget_ms is null or p_budget_ms < 1 then
    return jsonb_build_object('allowed',false);
  end if;
  select * into s from public.touchline_fixture_quota_scopes where account_scope=p_account_scope for update;
  if not found or not s.enabled then return jsonb_build_object('allowed',false); end if;
  n:=clock_timestamp();
  if s.active_token is not null then
    if s.active_until <= n then
      update public.touchline_fixture_quota_scopes set blocked_unknown=true where account_scope=p_account_scope;
    end if;
    return jsonb_build_object('allowed',false);
  end if;
  if s.blocked_unknown or s.cooldown_until > n then return jsonb_build_object('allowed',false); end if;
  if exists(select 1 from public.touchline_fixture_quota_attempts
    where account_scope=p_account_scope and request_id=p_request_id and attempt=p_attempt) then
    return jsonb_build_object('allowed',false);
  end if;

  if p_endpoint in ('squad','squadExtended') then
    entity:=case p_endpoint when 'squad' then 'PlayerTeam' else 'Player' end;
    -- Recheck under the account lock before EVERY HTTP, including retries.
    -- Include any newer receipt declaring the same entity; never fall back to
    -- an old endpoint balance when another consumer spent that entity's pool.
    select * into a from public.touchline_fixture_quota_attempts q
      where q.account_scope=p_account_scope and q.completed_at is not null
        and (q.endpoint=p_endpoint or q.observation->>'requestedEntity'=entity)
      order by q.completed_at desc, q.admitted_at desc limit 1;
    if not found then return jsonb_build_object('allowed',false); end if;
    observation:=a.observation;
    if observation is null or jsonb_typeof(observation) is distinct from 'object' then
      return jsonb_build_object('allowed',false);
    end if;
    observed_entity:=case a.endpoint when 'squad' then 'PlayerTeam' when 'squadExtended' then 'Player'
      when 'league' then 'League' when 'season' then 'Season' when 'stages' then 'Stage'
      when 'topscorers' then 'Topscorer' else 'Fixture' end;
    observed_operation:=case when a.endpoint in ('fixture','date','between','inplay','latest') then 'fixture' else a.endpoint end;
    if observed_entity is distinct from entity
      or (select array_agg(k order by k) from jsonb_object_keys(observation) k) is distinct from
        array['attempt','cooldownUntil','observedAt','operation','remaining','requestId','requestedEntity','resetAt','status']::text[]
      or observation->>'requestId' is distinct from a.request_id::text
      or observation->'attempt' is distinct from to_jsonb(a.attempt)
      or observation->>'operation' is distinct from observed_operation
      or observation->>'requestedEntity' is distinct from entity
      or jsonb_typeof(observation->'status') is distinct from 'number'
      or (observation->>'status') !~ '^[0-9]{1,3}$'
      or jsonb_typeof(observation->'remaining') is distinct from 'number'
      or (observation->>'remaining') !~ '^[0-9]+$'
      or jsonb_typeof(observation->'observedAt') is distinct from 'string'
      or jsonb_typeof(observation->'resetAt') is distinct from 'string'
      or (observation->>'observedAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
      or (observation->>'resetAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
      return jsonb_build_object('allowed',false);
    end if;
    remaining:=(observation->>'remaining')::numeric;
    observed:=(observation->>'observedAt')::timestamptz;
    reset_at:=(observation->>'resetAt')::timestamptz;
    if (observation->>'status')::integer not between 200 and 299
      or remaining <= 500 or remaining > 9007199254740991
      or not isfinite(observed) or not isfinite(reset_at)
      or observed not between n-interval '2 minutes' and n or reset_at <= n then
      return jsonb_build_object('allowed',false);
    end if;
  end if;

  -- The one account lease reserves the in-flight request until completion.
  -- Unknown/expired completion stays blocked; never invent a refreshed balance.
  t:=gen_random_uuid();
  insert into public.touchline_fixture_quota_attempts(account_scope,request_id,attempt,endpoint,token,admitted_at)
    values(p_account_scope,p_request_id,p_attempt,p_endpoint,t,n);
  update public.touchline_fixture_quota_scopes
    set active_token=t,active_until=n+p_budget_ms*interval '1 millisecond' where account_scope=p_account_scope;
  return jsonb_build_object('allowed',true,'token',t);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  return jsonb_build_object('allowed',false);
end $$;

revoke all on function public.touchline_fixture_quota_admit(text,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.touchline_fixture_quota_admit(text,uuid,text,integer,integer) to service_role;
commit;
