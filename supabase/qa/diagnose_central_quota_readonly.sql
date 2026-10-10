-- OPERATOR DIAGNOSTIC ONLY, on the approved central database after 013/014.
-- Replace the scope below with the approved account identifier, not a token.
-- No grant, reset, lease deletion, owner reassignment or provider call.
begin transaction isolation level repeatable read read only;
set local statement_timeout='5s';
set local lock_timeout='1s';
set local touchline.diagnostic_scope='REPLACE_WITH_APPROVED_SCOPE';
do $$ begin
  if current_setting('touchline.diagnostic_scope') !~ '^[a-z][a-z0-9_-]{0,63}$'
    or not exists(select 1 from public.touchline_fixture_quota_scopes
      where account_scope=current_setting('touchline.diagnostic_scope')) then
    raise exception 'Choose one existing approved central account scope.';
  end if;
end $$;

-- Categories are independent; a scope can have more than one blocker.
select clock_timestamp() as checked_at, s.account_scope, s.enabled,
  s.blocked_unknown, s.cooldown_until,
  coalesce(s.cooldown_until>clock_timestamp(),false) as cooldown_active,
  s.active_token is not null as lease_present,
  coalesce(s.active_until<=clock_timestamp(),false) as lease_expired,
  s.active_until,
  (select count(*) from public.touchline_fixture_quota_attempts a
    where a.account_scope=s.account_scope and a.completed_at is null) as incomplete_attempts,
  (select count(*) from touchline_quota_private.workers w
    where w.account_scope=s.account_scope and w.enabled) as enabled_workers
from public.touchline_fixture_quota_scopes s
where s.account_scope=current_setting('touchline.diagnostic_scope');

-- Never emit lease tokens, secret material, full observations or football data.
select a.request_id,a.attempt,a.endpoint,a.owner_worker_id,a.owner_environment,
  w.enabled as owner_enabled,a.admitted_at,a.completed_at,
  (a.token=s.active_token) as matches_active_lease
from public.touchline_fixture_quota_attempts a
join public.touchline_fixture_quota_scopes s using(account_scope)
left join touchline_quota_private.workers w
  on w.worker_id=a.owner_worker_id and w.environment=a.owner_environment
    and w.account_scope=a.account_scope
where a.account_scope=current_setting('touchline.diagnostic_scope')
  and a.completed_at is null
order by a.admitted_at,a.request_id,a.attempt limit 50;

-- Same latest-owned-receipt ordering as 014, one row per shared entity.
-- Raw scalar text is intentional: malformed history must remain diagnosable.
select distinct on(policy.entity) policy.entity,a.endpoint,a.request_id,a.attempt,
  a.owner_worker_id,a.owner_environment,a.admitted_at,a.completed_at,
  a.observation->>'status' as http_status,
  a.observation->>'requestedEntity' as reported_entity,
  a.observation->>'remaining' as reported_remaining,
  a.observation->>'observedAt' as observed_at,
  a.observation->>'resetAt' as reset_at,
  a.observation->>'cooldownUntil' as reported_cooldown
from public.touchline_fixture_quota_attempts a
cross join lateral touchline_quota_private.endpoint_policy(a.endpoint) policy
where a.account_scope=current_setting('touchline.diagnostic_scope')
  and a.completed_at is not null and a.owner_worker_id is not null
order by policy.entity,a.completed_at desc,a.admitted_at desc,a.request_id desc;

select entity,count(*) as unused_grants,
  count(*) filter(where cancelled_at is not null) as retired_grants,
  count(*) filter(where cancelled_at is null and expires_at<=clock_timestamp()) as expired_pending_retirement,
  count(*) filter(where cancelled_at is null and granted_at<=clock_timestamp() and expires_at>clock_timestamp()) as currently_valid_grants
from touchline_quota_private.bootstrap_grants
where account_scope=current_setting('touchline.diagnostic_scope') and consumed_at is null
group by entity order by entity;
rollback;
