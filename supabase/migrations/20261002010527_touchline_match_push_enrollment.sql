-- Transaction-owned forward migration. No scheduler, network or activation.
-- Requires the separately installed source fence for feeds AND observations.
create function public.touchline_match_push_period_valid(p jsonb, fixture text)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare k text; lower_min integer;
begin
  if jsonb_typeof(p) is distinct from 'object' or p->>'fixtureId' is distinct from fixture
    or coalesce(p->>'providerId','') !~ '^[1-9][0-9]*$' then return false; end if;
  lower_min := case p->>'typeId' when '1' then 0 when '2' then 45 when '3' then 90 when '5314' then 90 when '39' then 105 end;
  if lower_min is null or jsonb_typeof(p->'ticking') is distinct from 'boolean'
    or jsonb_typeof(p->'hasTimer') is distinct from 'boolean' then return false; end if;
  foreach k in array array['started','countsFrom','sortOrder','minutes','seconds'] loop
    if jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric <> trunc((p->>k)::numeric)
      or (p->>k)::numeric not between 0 and 9007199254740991 then return false; end if;
  end loop;
  if (p->>'started')::numeric < 1 or (p->>'sortOrder')::numeric < 1
    or (p->>'countsFrom')::numeric <> lower_min or (p->>'minutes')::numeric < lower_min
    or (p->>'seconds')::numeric > 59 or (p->>'minutes')::numeric*60+(p->>'seconds')::numeric > 9007199254740991 then return false; end if;
  if p ? 'ended' and (jsonb_typeof(p->'ended') is distinct from 'number'
    or (p->>'ended')::numeric <> trunc((p->>'ended')::numeric)
    or (p->>'ended')::numeric not between (p->>'started')::numeric and 9007199254740991) then return false; end if;
  return true;
exception when others then return false;
end $$;

create function public.touchline_match_push_period_identity(p jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_array(p->'providerId',p->'fixtureId',p->'typeId',p->'started',p->'sortOrder',p->'countsFrom')
$$;

-- Parity seam with match-push-live-event-window.ts; no freshness/auth claim.
create function public.touchline_match_push_window(fixture text, periods jsonb, baseline jsonb, current_period jsonb, event jsonb, maximum_lag integer)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare p jsonb; prior jsonb; old_period jsonb; clock_now numeric; clock_then numeric; minute numeric; extra numeric; normal_end integer;
begin
  if maximum_lag is null or maximum_lag <= 0 or jsonb_typeof(periods) is distinct from 'array'
    or jsonb_array_length(periods) not between 1 and 10
    or not public.touchline_match_push_period_valid(baseline,fixture)
    or not public.touchline_match_push_period_valid(current_period,fixture)
    or baseline->'hasTimer' is distinct from 'true'::jsonb or current_period->'hasTimer' is distinct from 'true'::jsonb then return 'unavailable'; end if;
  for p in select value from jsonb_array_elements(periods) loop
    if not public.touchline_match_push_period_valid(p,fixture) then return 'unavailable'; end if;
  end loop;
  if (select count(distinct value->>'providerId') from jsonb_array_elements(periods)) <> jsonb_array_length(periods)
    or (select count(distinct value->>'sortOrder') from jsonb_array_elements(periods)) <> jsonb_array_length(periods)
    or (select count(*) from jsonb_array_elements(periods) where value->'ticking'='true'::jsonb) <> 1
    or current_period->'ticking' is distinct from 'true'::jsonb or current_period ? 'ended'
    or not exists(select 1 from jsonb_array_elements(periods) where value=current_period) then return 'unavailable'; end if;
  select value into old_period from jsonb_array_elements(periods) where value->>'providerId'=baseline->>'providerId';
  if old_period is null or public.touchline_match_push_period_identity(old_period) <> public.touchline_match_push_period_identity(baseline) then return 'rebaseline'; end if;
  clock_now := (current_period->>'minutes')::numeric*60+(current_period->>'seconds')::numeric;
  clock_then := (baseline->>'minutes')::numeric*60+(baseline->>'seconds')::numeric;
  if (old_period->>'minutes')::numeric*60+(old_period->>'seconds')::numeric < clock_then
    or (baseline ? 'ended' and (old_period->'ended' is distinct from baseline->'ended' or old_period->'ticking'='true'::jsonb)) then return 'rebaseline'; end if;
  if baseline->>'providerId'=current_period->>'providerId' then
    if clock_now < clock_then then return 'rebaseline'; end if;
  else
    if (current_period->>'sortOrder')::numeric <= (baseline->>'sortOrder')::numeric
      or (current_period->>'countsFrom')::numeric <= (baseline->>'countsFrom')::numeric then return 'rebaseline'; end if;
    for p in select value from jsonb_array_elements(periods)
      where (value->>'sortOrder')::numeric between (baseline->>'sortOrder')::numeric and (current_period->>'sortOrder')::numeric
      order by (value->>'sortOrder')::numeric loop
      if prior is not null and ((p->>'sortOrder')::numeric <> (prior->>'sortOrder')::numeric+1
        or prior->'ticking'='true'::jsonb or not(prior ? 'ended')
        or (prior->>'ended')::numeric > (p->>'started')::numeric
        or (p->>'countsFrom')::numeric <= (prior->>'countsFrom')::numeric) then return 'unavailable'; end if;
      prior := p;
    end loop;
  end if;
  if coalesce(event->>'periodId','') !~ '^[1-9][0-9]*$'
    or not exists(select 1 from jsonb_array_elements(periods) where value->>'providerId'=event->>'periodId') then return 'unavailable'; end if;
  if event->>'periodId' <> current_period->>'providerId' then return 'suppressed'; end if;
  if jsonb_typeof(event->'minute') is distinct from 'number' then return 'unavailable'; end if;
  minute := (event->>'minute')::numeric; extra := 0;
  if minute < 0 or minute <> trunc(minute) then return 'unavailable'; end if;
  if event ? 'extraMinute' then
    if jsonb_typeof(event->'extraMinute') is distinct from 'number' then return 'unavailable'; end if;
    extra := (event->>'extraMinute')::numeric;
    if extra < 0 or extra <> trunc(extra) then return 'unavailable'; end if;
  end if;
  normal_end := case current_period->>'typeId' when '1' then 45 when '2' then 90 when '3' then 120 when '5314' then 105 when '39' then 120 end;
  if extra > 0 and minute <> normal_end then return 'unavailable'; end if;
  minute := minute+extra;
  if minute < (current_period->>'countsFrom')::numeric or (minute+1)*60 > 9007199254740991 then return 'unavailable'; end if;
  if baseline->>'providerId'=current_period->>'providerId' and minute <= (baseline->>'minutes')::numeric then return 'suppressed'; end if;
  if (minute+1)*60 > clock_now or clock_now-minute*60 > maximum_lag then return 'suppressed'; end if;
  return 'eligible';
exception when others then return 'unavailable';
end $$;

create table public.touchline_match_push_enrollments (
  device_id uuid not null references public.notification_devices(id) on delete cascade,
  fixture_id uuid not null references public.football_fixtures(id) on delete cascade,
  generation bigint not null check(generation>0),
  interest_created_at timestamptz not null,
  consent_at timestamptz not null,
  subscription jsonb not null,
  subscription_fingerprint text not null check(subscription_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  baseline jsonb not null,
  last_checkpoint jsonb not null,
  excluded_event_ids text[] not null,
  needs_baseline boolean not null default true,
  primary key(device_id,fixture_id)
);
alter table public.touchline_match_push_enrollments enable row level security;
alter table public.touchline_match_push_enrollments force row level security;
revoke all on public.touchline_match_push_enrollments from public,anon,authenticated,service_role;
grant select,insert,update on public.touchline_match_push_enrollments to service_role;

-- Historical/legacy enqueue receipts deliberately remain NULL and cannot send.
-- Only the admission below binds a new receipt to the locked enrollment epoch.
alter table public.touchline_match_push_outbox add column enrollment_generation bigint
  check(enrollment_generation>0);
create function public.touchline_guard_match_push_enrollment_identity()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.enrollment_generation is distinct from old.enrollment_generation then
    raise exception using errcode='23514',message='PUSH_ENROLLMENT_IDENTITY_IMMUTABLE';
  end if;
  return new;
end $$;
revoke all on function public.touchline_guard_match_push_enrollment_identity() from public,anon,authenticated,service_role;
create trigger touchline_match_push_enrollment_identity_guard before update on public.touchline_match_push_outbox
  for each row execute function public.touchline_guard_match_push_enrollment_identity();

-- Parent writers already own their modified row. Never acquire another parent,
-- fixture advisory lock or source fence here: admission locks parents BEFORE
-- coverage. Internal definer is required for authenticated preference/device
-- updates, which must invalidate coverage without granting clients table access.
create function public.touchline_match_push_invalidate_enrollment()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb := '{}'; after_row jsonb := '{}'; affected record;
  users uuid[]; devices uuid[]; fixtures uuid[];
begin
  if tg_op<>'INSERT' then before_row:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then after_row:=to_jsonb(new); end if;
  if tg_table_name='notification_preferences' then
    if tg_op='UPDATE' and jsonb_build_array(before_row->'user_id',before_row->'channels'->'push',before_row->'settings'->'goalsAndEvents',before_row->'frequency',before_row->'explicit_consent_at')
      =jsonb_build_array(after_row->'user_id',after_row->'channels'->'push',after_row->'settings'->'goalsAndEvents',after_row->'frequency',after_row->'explicit_consent_at') then return null; end if;
    users:=array[(before_row->>'user_id')::uuid,(after_row->>'user_id')::uuid];
  elsif tg_table_name='notification_devices' then
    if tg_op='UPDATE' and jsonb_build_array(before_row->'id',before_row->'user_id',before_row->'installation_id',before_row->'permission',before_row->'push_subscription')
      =jsonb_build_array(after_row->'id',after_row->'user_id',after_row->'installation_id',after_row->'permission',after_row->'push_subscription') then return null; end if;
    devices:=array[(before_row->>'id')::uuid,(after_row->>'id')::uuid];
  elsif tg_table_name='touchline_fixture_alert_subscriptions' then
    if tg_op='UPDATE' and before_row=after_row then return null; end if;
    users:=array[(before_row->>'user_id')::uuid,(after_row->>'user_id')::uuid];
    fixtures:=array[(before_row->>'fixture_id')::uuid,(after_row->>'fixture_id')::uuid];
  else
    raise exception 'PUSH_ENROLLMENT_INVALID_TRIGGER';
  end if;
  -- Deterministic coverage-only lock order for multi-device/user invalidation.
  for affected in select e.device_id,e.fixture_id from public.touchline_match_push_enrollments e
    where (e.device_id=any(devices) or exists(select 1 from public.notification_devices d where d.id=e.device_id and d.user_id=any(users)))
      and (fixtures is null or e.fixture_id=any(fixtures))
    order by e.device_id,e.fixture_id for update of e
  loop
    update public.touchline_match_push_enrollments set generation=generation+1,needs_baseline=true
      where device_id=affected.device_id and fixture_id=affected.fixture_id;
  end loop;
  return null;
end $$;
revoke all on function public.touchline_match_push_invalidate_enrollment() from public,anon,authenticated,service_role;
create trigger touchline_match_push_preferences_epoch after insert or update or delete on public.notification_preferences
  for each row execute function public.touchline_match_push_invalidate_enrollment();
create trigger touchline_match_push_device_epoch after insert or update or delete on public.notification_devices
  for each row execute function public.touchline_match_push_invalidate_enrollment();
create trigger touchline_match_push_interest_epoch after insert or update or delete on public.touchline_fixture_alert_subscriptions
  for each row execute function public.touchline_match_push_invalidate_enrollment();

-- PostgreSQL row-locking SELECT requires UPDATE on at least one column.
-- Service already has INSERT/DELETE; no new client rights or identity UPDATE.
-- Admission only locks this column; it never changes the interest timestamp.
grant update(created_at) on public.touchline_fixture_alert_subscriptions to service_role;

create function public.touchline_match_push_enrollment(p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  device uuid := (p_request->>'deviceId')::uuid; fixture uuid := (p_request->>'fixtureId')::uuid;
  owner_id uuid; d record; pref record; interest timestamptz; provider_fixture text;
  feed record; observation jsonb; source jsonb; periods jsonb; current_period jsonb;
  coverage public.touchline_match_push_enrollments%rowtype; known text[]; event jsonb; decision text;
  needs_baseline boolean; queue_id uuid; kind text; now_at timestamptz := clock_timestamp(); deadline timestamptz;
  maximum_lag integer := (p_request->>'maximumEventLagSeconds')::integer; clock_revision bigint;
  maximum_source_age integer := (p_request->>'maximumSourceAgeSeconds')::integer; snapshot_at timestamptz;
  canonical_event record; event_kind text; fact_checksum text;
begin
  if (p_request->>'operation' in ('prepare','admit')) is not true or maximum_lag is null or maximum_lag <= 0
    or maximum_source_age is null or maximum_source_age<=0
    or coalesce(p_request->>'subscriptionFingerprint','') !~ '^sha256:[a-f0-9]{64}$'
    or coalesce(p_request->>'expectedClockRevision','') !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'PUSH_ENROLLMENT_INVALID_INPUT'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.touchline_social_confirmed_event_observations'::regclass
      and tgname='touchline_match_push_observation_revision' and tgenabled='O' and not tgisinternal)
    or not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.football_fantasy_fixture_feeds'::regclass
      and tgname='touchline_match_push_feed_freshness_revision' and tgenabled='O' and not tgisinternal)
    or (select count(*) from pg_catalog.pg_trigger where tgrelid='public.football_fantasy_fixture_feeds'::regclass and tgenabled='O' and not tgisinternal
      and tgname in ('touchline_social_fixture_feed_invalidation','touchline_social_fixture_feed_identity_revision','touchline_social_fixture_feed_presence_revision'))<>3 then
    raise exception 'PUSH_SOURCE_FENCE_UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision',0));
  select revision into clock_revision from public.touchline_social_source_clock where singleton=true;
  if clock_revision is null or clock_revision::text is distinct from p_request->>'expectedClockRevision' then return jsonb_build_object('status','stale-source'); end if;
  -- Queue/enrollment FKs also acquire KEY SHARE. Reserve it without waiting:
  -- a fixture deletion may already hold its row and be waiting for this fence.
  begin
    select provider_fixture_id into provider_fixture from public.football_fixtures
      where id=fixture and provider='sportmonks' for key share nowait;
  exception when lock_not_available then
    return jsonb_build_object('status','unavailable');
  end;
  if provider_fixture is null then return jsonb_build_object('status','unavailable'); end if;
  select user_id into owner_id from public.notification_devices where id=device;
  if owner_id is null then return jsonb_build_object('status','unavailable'); end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fixture-alert:'||fixture::text||':'||owner_id::text,0)) then
    return jsonb_build_object('status','unavailable'); end if;
  -- Protect direct service DELETE/UPDATE as well as the advisory-locked setter.
  -- Never wait on a parent writer while holding the shared source fence.
  begin
    select created_at into interest from public.touchline_fixture_alert_subscriptions where fixture_id=fixture and user_id=owner_id for share nowait;
    select * into pref from public.notification_preferences where user_id=owner_id for share nowait;
    select * into d from public.notification_devices where id=device for update nowait;
  exception when lock_not_available then
    return jsonb_build_object('status','unavailable');
  end;
  now_at := clock_timestamp(); -- Lock waits must not extend source/consent TTLs.
  if interest is null or pref.user_id is null or d.user_id is distinct from owner_id
    or d.permission is distinct from 'granted' or d.push_subscription is null
    or d.push_subscription is distinct from p_request->'expectedSubscription'
    or (pref.channels @> '{"push":true}'::jsonb) is not true
    or (pref.settings @> '{"goalsAndEvents":true}'::jsonb) is not true
    or pref.frequency is distinct from 'realtime' or pref.explicit_consent_at is null
    or not isfinite(pref.explicit_consent_at) or pref.explicit_consent_at>now_at
    or not isfinite(interest) or interest>now_at
    or pref.quiet_hours is distinct from p_request->'expectedQuietHours' then return jsonb_build_object('status','unavailable'); end if;
  select * into feed from public.football_fantasy_fixture_feeds where provider='sportmonks' and provider_fixture_id=provider_fixture;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  source := jsonb_build_object('fixture_payload',feed.fixture_payload,'events_payload',feed.events_payload,'last_synced_at',feed.last_synced_at);
  if source is distinct from p_request->'expectedSource' then return jsonb_build_object('status','stale-source'); end if;
  if feed.last_synced_at is null or not isfinite(feed.last_synced_at) or feed.last_synced_at>now_at
    or feed.last_synced_at<now_at-make_interval(secs=>maximum_source_age) then return jsonb_build_object('status','unavailable'); end if;
  if feed.fixture_payload->>'provider' is distinct from 'sportmonks' or feed.fixture_payload->>'providerId' is distinct from provider_fixture
    or (feed.fixture_payload->>'providerStateId' in ('2','22','6')) is not true
    or jsonb_typeof(feed.events_payload) is distinct from 'array' or jsonb_array_length(feed.events_payload)>500 then return jsonb_build_object('status','unavailable'); end if;
  periods := feed.fixture_payload->'periods';
  if jsonb_typeof(periods) is distinct from 'array' then return jsonb_build_object('status','unavailable'); end if;
  select value into current_period from jsonb_array_elements(periods) where value->'ticking'='true'::jsonb limit 1;
  if ((feed.fixture_payload->>'providerStateId'='2' and current_period->>'typeId'='1')
    or (feed.fixture_payload->>'providerStateId'='22' and current_period->>'typeId'='2')
    or (feed.fixture_payload->>'providerStateId'='6' and current_period->>'typeId' in ('3','5314','39'))) is not true then
    return jsonb_build_object('status','unavailable'); end if;
  if public.touchline_match_push_window(provider_fixture,periods,current_period,current_period,
    jsonb_build_object('periodId',current_period->>'providerId','minute',current_period->'minutes'),maximum_lag) is distinct from 'suppressed' then
    return jsonb_build_object('status','unavailable'); end if;
  if exists(select 1 from jsonb_array_elements(feed.events_payload) where coalesce(value->>'providerId','') !~ '^[1-9][0-9]{0,19}$'
    or value->>'provider' is distinct from 'sportmonks' or value->>'fixtureId' is distinct from provider_fixture)
    or (select count(distinct value->>'providerId') from jsonb_array_elements(feed.events_payload))<>jsonb_array_length(feed.events_payload) then return jsonb_build_object('status','unavailable'); end if;
  select coalesce(array_agg(distinct event_id order by event_id),array[]::text[]) into known from (
    select value->>'providerId' event_id from jsonb_array_elements(feed.events_payload)
    union select provider_event_id from public.football_fixture_events where fixture_id=fixture and provider='sportmonks'
  ) ids;
  if cardinality(known)>1000 then return jsonb_build_object('status','unavailable'); end if;
  select * into coverage from public.touchline_match_push_enrollments where device_id=device and fixture_id=fixture for update;
  needs_baseline := coverage.device_id is null or coverage.needs_baseline or coverage.interest_created_at<>interest
    or coverage.consent_at<>pref.explicit_consent_at or coverage.subscription<>d.push_subscription
    or coverage.subscription_fingerprint<>p_request->>'subscriptionFingerprint';
  if not needs_baseline then
    decision := public.touchline_match_push_window(provider_fixture,periods,coverage.last_checkpoint,current_period,
      jsonb_build_object('periodId',current_period->>'providerId','minute',current_period->'minutes'),maximum_lag);
    if decision='unavailable' then return jsonb_build_object('status','unavailable'); end if;
    needs_baseline := decision='rebaseline';
  end if;
  if needs_baseline then
    select coalesce(array_agg(distinct item order by item),array[]::text[]) into known from unnest(known||coalesce(coverage.excluded_event_ids,array[]::text[])) item;
    if cardinality(known)>2000 then return jsonb_build_object('status','unavailable'); end if;
    insert into public.touchline_match_push_enrollments(device_id,fixture_id,generation,interest_created_at,consent_at,
      subscription,subscription_fingerprint,baseline,last_checkpoint,excluded_event_ids,needs_baseline)
    values(device,fixture,coalesce(coverage.generation,0)+1,interest,pref.explicit_consent_at,
      d.push_subscription,p_request->>'subscriptionFingerprint',current_period,current_period,known,false)
    on conflict(device_id,fixture_id) do update set generation=excluded.generation,interest_created_at=excluded.interest_created_at,
      consent_at=excluded.consent_at,subscription=excluded.subscription,subscription_fingerprint=excluded.subscription_fingerprint,
      baseline=excluded.baseline,last_checkpoint=excluded.last_checkpoint,excluded_event_ids=excluded.excluded_event_ids,needs_baseline=false
    returning * into coverage;
    return jsonb_build_object('status','baselined','generation',coverage.generation::text,'baseline',coverage.baseline,'current',current_period);
  end if;
  if p_request->>'operation'='prepare' then
    update public.touchline_match_push_enrollments set last_checkpoint=current_period where device_id=device and fixture_id=fixture;
    return jsonb_build_object('status','ready','generation',coverage.generation::text,'baseline',coverage.baseline,'current',current_period);
  end if;
  if p_request->>'generation' is distinct from coverage.generation::text then return jsonb_build_object('status','stale-baseline'); end if;
  select value into event from jsonb_array_elements(feed.events_payload) where value->>'providerId'=p_request->>'eventId';
  if event is null or (event->>'status') is distinct from 'recorded' then return jsonb_build_object('status','unavailable'); end if;
  select * into canonical_event from public.football_fixture_events where fixture_id=fixture and provider='sportmonks' and provider_event_id=p_request->>'eventId';
  if not found or canonical_event.event_status is distinct from 'recorded'
    or canonical_event.event_type is distinct from event->>'type'
    or canonical_event.minute is distinct from (event->>'minute')::integer
    or canonical_event.extra_minute is distinct from (event->>'extraMinute')::integer
    or canonical_event.provider_team_id is distinct from event->>'teamId'
    or canonical_event.provider_player_id is distinct from event->>'playerId'
    or canonical_event.result is distinct from event->>'result'
    or concat_ws(' ',canonical_event.event_type,canonical_event.info,canonical_event.addition,event->>'info',event->>'addition') ~* '(VAR|REVIEW|PENDING|DISALLOW|CANCEL|RESCIND|OVERTURN)' then return jsonb_build_object('status','unavailable'); end if;
  event_kind := case upper(regexp_replace(canonical_event.event_type,'[[:space:]_-]+','','g'))
    when 'GOAL' then 'goal' when 'OWNGOAL' then 'own-goal' when 'PENALTY' then 'penalty'
    when 'REDCARD' then 'red-card' when 'YELLOWREDCARD' then 'second-yellow-red'
    when 'SECONDYELLOWCARD' then 'second-yellow-red' when 'SECONDYELLOWREDCARD' then 'second-yellow-red' end;
  if event_kind is null or coalesce(canonical_event.provider_team_id,'') !~ '^[1-9][0-9]{0,19}$'
    or coalesce(canonical_event.provider_player_id,'') !~ '^[1-9][0-9]{0,19}$' then return jsonb_build_object('status','unavailable'); end if;
  fact_checksum := 'sha256:'||encode(pg_catalog.sha256(convert_to(concat_ws('|',provider_fixture,p_request->>'eventId',event_kind,
    coalesce(canonical_event.result,''),canonical_event.provider_team_id,canonical_event.provider_player_id,
    canonical_event.minute::text,coalesce(canonical_event.extra_minute::text,'')),'UTF8')),'hex');
  select to_jsonb(o) into observation from public.touchline_social_confirmed_event_observations o
    where fixture_provider_id=provider_fixture and event_provider_id=p_request->>'eventId';
  if observation is null or observation is distinct from p_request->'expectedObservation'
    or observation->>'event_fact_checksum' is distinct from fact_checksum
    or observation->>'confirmation_state' is distinct from 'CONFIRMED' or (observation->>'stable_observation_count')::integer<2
    or (observation->>'confirmed_at')::timestamptz > now_at
    or (observation->>'confirmed_at')::timestamptz < (observation->>'first_observed_at')::timestamptz+interval '20 seconds'
    or (observation->>'last_observed_at')::timestamptz>now_at
    or (observation->>'last_observed_at')::timestamptz<now_at-make_interval(secs=>maximum_source_age)
    or coalesce(p_request->>'sourceChecksum','') !~ '^sha256:[a-f0-9]{64}$' then return jsonb_build_object('status','unavailable'); end if;
  select outbox_id into queue_id from public.touchline_match_push_identity_ledger where device_id=device and fixture_id=fixture
    and provider_event_id=p_request->>'eventId' and source_checksum=p_request->>'sourceChecksum';
  if found then return jsonb_build_object('status','stored-or-existing','id',queue_id); end if;
  if (p_request->>'eventId')=any(coverage.excluded_event_ids) then return jsonb_build_object('status','suppressed'); end if;
  decision := public.touchline_match_push_window(provider_fixture,periods,coverage.baseline,current_period,event,maximum_lag);
  if decision<>'eligible' then return jsonb_build_object('status',decision); end if;
  deadline := (p_request->>'expiresAt')::timestamptz;
  snapshot_at := (p_request->>'sourceSnapshotAt')::timestamptz;
  if deadline is null or not isfinite(deadline) or deadline<=now_at
    or deadline>feed.last_synced_at+make_interval(secs=>maximum_source_age)
    or deadline>(observation->>'last_observed_at')::timestamptz+make_interval(secs=>maximum_source_age)
    or snapshot_at is null or not isfinite(snapshot_at) or snapshot_at>now_at
    or snapshot_at<now_at-make_interval(secs=>maximum_source_age)
    or (p_request->>'locale' in ('en-GB','pt-BR')) is not true then return jsonb_build_object('status','unavailable'); end if;
  kind := case when exists(select 1 from public.touchline_match_push_identity_ledger where device_id=device and fixture_id=fixture
    and provider_event_id=p_request->>'eventId') then 'revision' else 'initial' end;
  insert into public.touchline_match_push_outbox(device_id,fixture_id,provider_event_id,source_checksum,source_snapshot_at,payload,created_at,expires_at,subscription_fingerprint,delivery_kind,enrollment_generation)
    values(device,fixture,p_request->>'eventId',p_request->>'sourceChecksum',snapshot_at,
      jsonb_build_object('schemaVersion',1,'locale',p_request->>'locale'),now_at,deadline,p_request->>'subscriptionFingerprint',kind,coverage.generation) returning id into queue_id;
  update public.touchline_match_push_enrollments set last_checkpoint=current_period where device_id=device and fixture_id=fixture;
  return jsonb_build_object('status','stored-or-existing','id',queue_id);
end $$;

revoke all on function public.touchline_match_push_period_valid(jsonb,text),public.touchline_match_push_period_identity(jsonb),public.touchline_match_push_window(text,jsonb,jsonb,jsonb,jsonb,integer),public.touchline_match_push_enrollment(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.touchline_match_push_period_valid(jsonb,text),public.touchline_match_push_period_identity(jsonb),public.touchline_match_push_window(text,jsonb,jsonb,jsonb,jsonb,integer),public.touchline_match_push_enrollment(jsonb) to service_role;
