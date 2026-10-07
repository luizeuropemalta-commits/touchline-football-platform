-- Preserve the QA043 observer and its privileges; accept provider extra_minute=0
-- as normal time. No points, scheduler or notification sender is changed.
do $$ begin
  if pg_catalog.to_regprocedure('public.touchline_social_043_observe_confirmed_event(text,text)') is null then
    raise exception 'CONFIRMED_EVENT_OBSERVER_REQUIRED';
  end if;
end $$;
create or replace function public.touchline_social_043_observe_confirmed_event(
  p_fixture_provider_id text, p_event_provider_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event record; v_kind text; v_fact_checksum text; v_existing record;
  v_now timestamptz := clock_timestamp(); v_count integer; v_first timestamptz;
  v_confirmed timestamptz; v_state text;
begin
  if coalesce(p_fixture_provider_id, '') !~ '^[1-9][0-9]{0,19}$'
     or coalesce(p_event_provider_id, '') !~ '^[1-9][0-9]{0,19}$' then
    raise exception 'TL_SOCIAL_CONFIRMED_EVENT_OBSERVATION_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-043-observation:' || p_fixture_provider_id || ':' || p_event_provider_id, 0));
  select event.provider_event_id, event.event_type, event.event_status, event.result,
    event.provider_team_id, event.provider_player_id, event.minute, event.extra_minute,
    event.info, event.addition
  into v_event
  from public.football_fixture_events event
  join public.football_fixtures fixture on fixture.id = event.fixture_id
  where event.provider = 'sportmonks' and fixture.provider = 'sportmonks'
    and fixture.provider_fixture_id = p_fixture_provider_id
    and event.provider_event_id = p_event_provider_id;
  if v_event.provider_event_id is null then
    raise exception 'TL_SOCIAL_CONFIRMED_EVENT_OBSERVATION_SOURCE_NOT_FOUND';
  end if;
  if v_event.event_status <> 'recorded'
     or concat_ws(' ', v_event.event_type, v_event.info, v_event.addition)
       ~* '(VAR|REVIEW|PENDING|DISALLOW|CANCEL|RESCIND|OVERTURN)' then
    v_kind := null;
  else
    v_kind := case upper(regexp_replace(v_event.event_type, '[[:space:]_-]+', '', 'g'))
      when 'GOAL' then 'goal'
      when 'OWNGOAL' then 'own-goal'
      when 'PENALTY' then 'penalty'
      when 'REDCARD' then 'red-card'
      when 'YELLOWREDCARD' then 'second-yellow-red'
      when 'SECONDYELLOWCARD' then 'second-yellow-red'
      when 'SECONDYELLOWREDCARD' then 'second-yellow-red'
      else null end;
  end if;
  if v_kind is null or coalesce(v_event.provider_team_id, '') !~ '^[1-9][0-9]{0,19}$'
     or coalesce(v_event.provider_player_id, '') !~ '^[1-9][0-9]{0,19}$'
     or v_event.minute is null or v_event.minute < 0
     or (v_event.extra_minute is not null and v_event.extra_minute < 0) then
    v_state := 'REVIEW_REQUIRED';
    v_fact_checksum := 'sha256:' || encode(extensions.digest(convert_to(
      p_fixture_provider_id || '|' || p_event_provider_id || '|invalid', 'UTF8'), 'sha256'), 'hex');
  else
    v_fact_checksum := 'sha256:' || encode(extensions.digest(convert_to(concat_ws('|',
      p_fixture_provider_id, p_event_provider_id, v_kind, coalesce(v_event.result, ''),
      v_event.provider_team_id, v_event.provider_player_id, v_event.minute::text,
      coalesce(v_event.extra_minute::text, '')), 'UTF8'), 'sha256'), 'hex');
    v_state := 'OBSERVING';
  end if;
  select * into v_existing from public.touchline_social_confirmed_event_observations
    where fixture_provider_id = p_fixture_provider_id and event_provider_id = p_event_provider_id for update;
  if v_existing.event_provider_id is null or v_existing.event_fact_checksum <> v_fact_checksum then
    v_count := 1; v_first := v_now;
  else
    v_count := least(v_existing.stable_observation_count + 1, 1000);
    v_first := v_existing.first_observed_at;
  end if;
  if v_state <> 'REVIEW_REQUIRED' and v_count >= 2 and v_now >= v_first + interval '20 seconds' then
    v_state := 'CONFIRMED';
  end if;
  v_confirmed := case
    when v_state <> 'CONFIRMED' then null
    when v_existing.event_fact_checksum = v_fact_checksum
      and v_existing.confirmation_state = 'CONFIRMED'
      and v_existing.confirmed_at is not null then v_existing.confirmed_at
    else v_now
  end;
  perform set_config('touchline.social_confirmed_event_observation_transition', 'observe', true);
  insert into public.touchline_social_confirmed_event_observations(
    fixture_provider_id, event_provider_id, content_type, event_fact_checksum, confirmation_state,
    stable_observation_count, first_observed_at, last_observed_at, confirmed_at, last_reason_code
  ) values (
    p_fixture_provider_id, p_event_provider_id,
    case when v_kind in ('red-card', 'second-yellow-red') then 'RED_CARD_CONFIRMED' else 'GOAL_CONFIRMED' end,
    v_fact_checksum, v_state,
    v_count, v_first, v_now, v_confirmed,
    case when v_state = 'CONFIRMED' then 'CANONICAL_EVENT_STABLE'
      when v_state = 'REVIEW_REQUIRED' then 'CANONICAL_EVENT_INELIGIBLE'
      else 'AWAITING_STABLE_CONFIRMATION' end
  ) on conflict (fixture_provider_id, event_provider_id) do update set
    event_fact_checksum = excluded.event_fact_checksum,
    content_type = excluded.content_type,
    confirmation_state = excluded.confirmation_state,
    stable_observation_count = excluded.stable_observation_count,
    first_observed_at = excluded.first_observed_at,
    last_observed_at = excluded.last_observed_at,
    confirmed_at = excluded.confirmed_at,
    last_reason_code = excluded.last_reason_code;
  return jsonb_build_object('ok', true, 'state', v_state, 'stableObservationCount', v_count,
    'eventFactChecksum', v_fact_checksum, 'firstObservedAt', v_first);
end
$$;
