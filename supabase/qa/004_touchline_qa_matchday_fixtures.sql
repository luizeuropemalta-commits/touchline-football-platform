-- QA-only representative Match Centre and Arena fixture scenarios.
-- Never add this file to supabase/migrations and never apply it to Production.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_qa_matchday_scenarios (
  run_id uuid primary key references public.touchline_qa_fixture_runs(id) on delete restrict,
  project_ref text not null check (project_ref = 'xgxbwqxjssxxuihuwmgy'),
  fixture_version text not null,
  status text not null check (status in ('applying', 'applied', 'rolling_back', 'rolled_back', 'failed')),
  provider_fixture_ids text[] not null default array[]::text[],
  prior_snapshot_exists boolean not null default false,
  prior_snapshot_payload jsonb,
  prior_snapshot_fetched_at timestamptz,
  prior_snapshot_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  check (prior_snapshot_payload is null or jsonb_typeof(prior_snapshot_payload) = 'object')
);

alter table public.touchline_qa_matchday_scenarios enable row level security;
revoke all on public.touchline_qa_matchday_scenarios from public, anon, authenticated;
grant select, insert, update on public.touchline_qa_matchday_scenarios to service_role;

create or replace function public.touchline_apply_qa_matchday_scenario(
  p_project_ref text,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.touchline_qa_fixture_runs%rowtype;
  v_scenario public.touchline_qa_matchday_scenarios%rowtype;
  v_competition_id uuid;
  v_club_ids uuid[];
  v_fixture_ids text[];
  v_fixture_count integer;
  v_snapshot public.football_live_snapshots%rowtype;
  v_snapshot_payload jsonb;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);

  if p_run_id is null then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_RUN_ID_REQUIRED';
  end if;

  select * into v_run
    from public.touchline_qa_fixture_runs
   where id = p_run_id
     and project_ref = p_project_ref
     and status = 'applied'
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_REPRESENTATIVE_RUN_REQUIRED';
  end if;

  select * into v_scenario
    from public.touchline_qa_matchday_scenarios
   where run_id = p_run_id
   for update;
  if found and v_scenario.status = 'applied' then
    select count(*) into v_fixture_count
      from public.football_fixtures
     where provider = 'sportmonks'
       and provider_fixture_id = any(v_scenario.provider_fixture_ids);
    if v_fixture_count <> 20 then
      raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_REPLAY_DRIFT';
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotentReplay', true,
      'runId', p_run_id,
      'fixtures', v_fixture_count,
      'snapshotKey', 'touchline-england-live'
    );
  end if;
  if found and v_scenario.status = 'rolled_back' then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_ROLLED_BACK_USE_NEW_VERSION';
  end if;
  if found then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_INCOMPLETE_PREVIOUS_ATTEMPT';
  end if;

  select id into v_competition_id
    from public.football_competitions
   where provider = 'sportmonks'
     and provider_competition_id = '8';
  if v_competition_id is null then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_COMPETITION_REQUIRED';
  end if;

  select array_agg(id order by provider_team_id::bigint, id)
    into v_club_ids
    from public.football_clubs
   where provider = 'sportmonks';
  if cardinality(v_club_ids) <> 20 then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_EXACT_20_CLUBS_REQUIRED';
  end if;

  select array_agg('qa-representative-' || lpad(value::text, 2, '0') order by value)
    into v_fixture_ids
    from generate_series(1, 20) value;
  if exists (
    select 1
      from public.football_fixtures
     where provider = 'sportmonks'
       and provider_fixture_id = any(v_fixture_ids)
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_FIXTURE_ID_COLLISION';
  end if;

  select * into v_snapshot
    from public.football_live_snapshots
   where snapshot_key = 'touchline-england-live';

  insert into public.touchline_qa_matchday_scenarios (
    run_id,
    project_ref,
    fixture_version,
    status,
    provider_fixture_ids,
    prior_snapshot_exists,
    prior_snapshot_payload,
    prior_snapshot_fetched_at,
    prior_snapshot_updated_at,
    metadata
  ) values (
    p_run_id,
    p_project_ref,
    v_run.fixture_version || ':matchday-v1',
    'applying',
    v_fixture_ids,
    found,
    case when found then v_snapshot.payload else null end,
    case when found then v_snapshot.fetched_at else null end,
    case when found then v_snapshot.updated_at else null end,
    jsonb_build_object(
      'touchline_qa_fixture_version', v_run.fixture_version || ':matchday-v1',
      'qa_fixture_run_id', p_run_id,
      'scenarioAuthority', 'synthetic_qa_only_not_official_football_fact',
      'syntheticOfficialFootballFacts', false,
      'productionAllowed', false,
      'venueVerifiedScenarioAvailable', false,
      'venueGap', 'public_fixture_contract_has_no_verified_venue_field'
    )
  );

  insert into public.football_fixtures (
    provider,
    provider_fixture_id,
    competition_id,
    season_id,
    home_club_id,
    away_club_id,
    starts_at,
    status,
    home_score,
    away_score,
    source_updated_at,
    created_at,
    updated_at
  )
  select
    'sportmonks',
    v_fixture_ids[index],
    v_competition_id,
    null,
    v_club_ids[index],
    v_club_ids[((index + 6) % 20) + 1],
    timestamptz '2026-08-20 18:00:00+00'
      + case when index > 10 then interval '7 days' else interval '0 days' end
      + ((index - 1) % 10) * interval '2 hours',
    case ((index - 1) % 5)
      when 0 then 'Scheduled'
      when 1 then '2nd Half'
      when 2 then 'Finished'
      when 3 then 'Postponed'
      else 'Cancelled'
    end,
    case ((index - 1) % 5)
      when 1 then case when index = 2 then 1 else 2 end
      when 2 then (index % 4)
      when 4 then 0
      else null
    end,
    case ((index - 1) % 5)
      when 1 then case when index = 2 then null else 1 end
      when 2 then ((index + 1) % 3)
      when 4 then 0
      else null
    end,
    timestamptz '2026-08-15 08:00:00+00',
    clock_timestamp(),
    clock_timestamp()
  from generate_series(1, 20) index;

  select jsonb_build_object(
    'fixtures', jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id', 'sportmonks:' || fixture.provider_fixture_id,
        'providerId', fixture.provider_fixture_id,
        'provider', 'sportmonks',
        'name', home_club.name || ' vs ' || away_club.name,
        'startsAt', to_char(fixture.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'status', fixture.status,
        'homeTeam', jsonb_strip_nulls(jsonb_build_object(
          'id', 'sportmonks:' || home_club.provider_team_id,
          'providerId', home_club.provider_team_id,
          'provider', 'sportmonks',
          'name', home_club.name,
          'shortCode', home_club.short_code,
          'logoUrl', home_club.logo_url,
          'source', jsonb_build_object(
            'provider', 'sportmonks',
            'providerId', home_club.provider_team_id,
            'lastSyncedAt', '2026-08-15T08:00:00Z'
          )
        )),
        'awayTeam', jsonb_strip_nulls(jsonb_build_object(
          'id', 'sportmonks:' || away_club.provider_team_id,
          'providerId', away_club.provider_team_id,
          'provider', 'sportmonks',
          'name', away_club.name,
          'shortCode', away_club.short_code,
          'logoUrl', away_club.logo_url,
          'source', jsonb_build_object(
            'provider', 'sportmonks',
            'providerId', away_club.provider_team_id,
            'lastSyncedAt', '2026-08-15T08:00:00Z'
          )
        )),
        'homeScore', fixture.home_score,
        'awayScore', fixture.away_score,
        'source', jsonb_build_object(
          'provider', 'sportmonks',
          'providerId', fixture.provider_fixture_id,
          'lastSyncedAt', '2026-08-15T08:00:00Z'
        )
      )) order by fixture.starts_at, fixture.provider_fixture_id
    ),
    'fetchedAt', '2026-08-15T08:00:00Z',
    'storedAt', 1786780200000
  ) into v_snapshot_payload
  from public.football_fixtures fixture
  join public.football_clubs home_club on home_club.id = fixture.home_club_id
  join public.football_clubs away_club on away_club.id = fixture.away_club_id
  where fixture.provider = 'sportmonks'
    and fixture.provider_fixture_id = any(v_fixture_ids);

  if jsonb_array_length(v_snapshot_payload -> 'fixtures') <> 20 then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_SNAPSHOT_INVALID';
  end if;

  insert into public.football_live_snapshots (snapshot_key, payload, fetched_at, updated_at)
  values (
    'touchline-england-live',
    v_snapshot_payload,
    timestamptz '2026-08-15 08:00:00+00',
    timestamptz '2026-08-15 08:10:00+00'
  )
  on conflict (snapshot_key) do update set
    payload = excluded.payload,
    fetched_at = excluded.fetched_at,
    updated_at = excluded.updated_at;

  update public.touchline_qa_matchday_scenarios
     set status = 'applied',
         applied_at = clock_timestamp(),
         metadata = metadata || jsonb_build_object(
           'fixtureCount', 20,
           'statusCounts', jsonb_build_object(
             'Scheduled', 4,
             '2nd Half', 4,
             'Finished', 4,
             'Postponed', 4,
             'Cancelled', 4
           ),
           'fullScoreFixtures', 11,
           'partialScoreFixtures', 1,
           'staleSnapshot', true
         )
   where run_id = p_run_id;

  return jsonb_build_object(
    'ok', true,
    'idempotentReplay', false,
    'runId', p_run_id,
    'fixtures', 20,
    'snapshotKey', 'touchline-england-live',
    'staleSnapshot', true
  );
end;
$$;

create or replace function public.touchline_rollback_qa_matchday_scenario(
  p_project_ref text,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scenario public.touchline_qa_matchday_scenarios%rowtype;
  v_removed integer;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);

  select * into v_scenario
    from public.touchline_qa_matchday_scenarios
   where run_id = p_run_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_NOT_FOUND';
  end if;
  if v_scenario.status = 'rolled_back' then
    return jsonb_build_object('ok', true, 'idempotentReplay', true, 'removedFixtures', 20);
  end if;
  if v_scenario.status <> 'applied' then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_NOT_APPLIED';
  end if;

  update public.touchline_qa_matchday_scenarios
     set status = 'rolling_back'
   where run_id = p_run_id;

  if v_scenario.prior_snapshot_exists then
    insert into public.football_live_snapshots (snapshot_key, payload, fetched_at, updated_at)
    values (
      'touchline-england-live',
      v_scenario.prior_snapshot_payload,
      v_scenario.prior_snapshot_fetched_at,
      v_scenario.prior_snapshot_updated_at
    )
    on conflict (snapshot_key) do update set
      payload = excluded.payload,
      fetched_at = excluded.fetched_at,
      updated_at = excluded.updated_at;
  else
    delete from public.football_live_snapshots where snapshot_key = 'touchline-england-live';
  end if;

  delete from public.football_fixtures
   where provider = 'sportmonks'
     and provider_fixture_id = any(v_scenario.provider_fixture_ids);
  get diagnostics v_removed = row_count;
  if v_removed <> 20 then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHDAY_ROLLBACK_FIXTURE_DRIFT';
  end if;

  update public.touchline_qa_matchday_scenarios
     set status = 'rolled_back', rolled_back_at = clock_timestamp()
   where run_id = p_run_id;

  return jsonb_build_object('ok', true, 'idempotentReplay', false, 'removedFixtures', v_removed);
end;
$$;

revoke all on function public.touchline_apply_qa_matchday_scenario(text, uuid) from public, anon, authenticated;
revoke all on function public.touchline_rollback_qa_matchday_scenario(text, uuid) from public, anon, authenticated;
grant execute on function public.touchline_apply_qa_matchday_scenario(text, uuid) to service_role;
grant execute on function public.touchline_rollback_qa_matchday_scenario(text, uuid) to service_role;

commit;
