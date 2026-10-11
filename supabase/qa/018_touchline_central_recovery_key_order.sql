-- Forward-only QA central quota patch. Keep the shared Sportmonks authority OFF.
-- 014's key-set check depended on database-default collation. Under native
-- PostgreSQL 17, requestedEntity sorted before requestId and every otherwise
-- valid recovery completion returned persisted=false. Explicit C collation
-- makes the closed JSON contract deterministic across database locales.
-- This numbered QA authority script is not an application-content migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $pre$ begin
  if to_regprocedure('touchline_quota_private.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)') is null
    or not exists (select 1 from pg_proc p
      where p.oid='touchline_quota_private.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)'::regprocedure
        and md5(p.prosrc)='d5be3a64182844768c73b70013b33fe3' and p.prosecdef
        and p.proowner='postgres'::regrole
        and not exists (select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          where a.grantee<>p.proowner and a.privilege_type='EXECUTE'))
    then raise exception 'TL_CENTRAL_RECOVERY_KEY_ORDER_PREIMAGE_MISMATCH';
  end if;
end $pre$;

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
    cooldown_until=greatest(cooldown_until,deadline),
    blocked_unknown=blocked_unknown or unknown_reset or active_until <= clock_timestamp(),
    active_token=null,active_until=null where account_scope=p_account_scope;
  update public.touchline_fixture_quota_attempts set observation=p_observation,completed_at=clock_timestamp()
    where account_scope=p_account_scope and request_id=p_request_id and attempt=p_attempt;
  return jsonb_build_object('persisted',true);
end $$;

do $post$ begin
  if not exists (select 1 from pg_proc p
      where p.oid='touchline_quota_private.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)'::regprocedure
        and md5(p.prosrc)='10f804816b222b15ba49aa04aea8b27d' and p.prosecdef
        and p.proowner='postgres'::regrole
        and not exists (select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          where a.grantee<>p.proowner and a.privilege_type='EXECUTE'))
    then raise exception 'TL_CENTRAL_RECOVERY_KEY_ORDER_POSTIMAGE_MISMATCH';
  end if;
end $post$;
commit;
