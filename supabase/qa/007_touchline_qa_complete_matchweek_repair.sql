-- QA-only repair for the representative Arena/Match Centre matchweek.
-- Never add this file to supabase/migrations and never apply it to Production.
-- It repairs the original QA pairing defect without fabricating football facts.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_qa_matchweek_repairs (
  run_id uuid primary key references public.touchline_qa_fixture_runs(id) on delete restrict,
  project_ref text not null check (project_ref = 'xgxbwqxjssxxuihuwmgy'),
  status text not null check (status in ('applying', 'applied', 'rolling_back', 'rolled_back', 'failed')),
  prior_pairings jsonb not null,
  prior_snapshot_payload jsonb,
  prior_snapshot_fetched_at timestamptz,
  prior_snapshot_updated_at timestamptz,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  check (jsonb_typeof(prior_pairings) = 'array'),
  check (prior_snapshot_payload is null or jsonb_typeof(prior_snapshot_payload) = 'object')
);

alter table public.touchline_qa_matchweek_repairs enable row level security;
revoke all on public.touchline_qa_matchweek_repairs from public, anon, authenticated;
grant select, insert, update on public.touchline_qa_matchweek_repairs to service_role;

create or replace function public.touchline_apply_qa_complete_matchweek_repair(
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
  v_repair public.touchline_qa_matchweek_repairs%rowtype;
  v_club_ids uuid[];
  v_snapshot public.football_live_snapshots%rowtype;
  v_snapshot_payload jsonb;
  v_first_round_clubs integer;
  v_second_round_clubs integer;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  if p_run_id is null then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHWEEK_REPAIR_RUN_ID_REQUIRED';
  end if;

  select * into v_scenario
    from public.touchline_qa_matchday_scenarios
   where run_id = p_run_id
     and project_ref = p_project_ref
     and status = 'applied'
   for update;
  if not found or cardinality(v_scenario.provider_fixture_ids) <> 20 then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHWEEK_SCENARIO_REQUIRED';
  end if;

  select * into v_repair
    from public.touchline_qa_matchweek_repairs
   where run_id = p_run_id
   for update;
  if found and v_repair.status = 'applied' then
    select count(distinct club_id) into v_first_round_clubs
      from (
        select home_club_id as club_id from public.football_fixtures
         where provider = 'sportmonks' and provider_fixture_id = any(v_scenario.provider_fixture_ids[1:10])
        union all
        select away_club_id from public.football_fixtures
         where provider = 'sportmonks' and provider_fixture_id = any(v_scenario.provider_fixture_ids[1:10])
      ) first_round;
    if v_first_round_clubs <> 20 then
      raise exception using errcode = 'P0001', message = 'TL_QA_MATCHWEEK_REPAIR_DRIFT';
    end if;
    return jsonb_build_object('ok', true, 'idempotentReplay', true, 'fixtures', 20, 'matchesPerRound', 10);
  end if;
  if found and v_repair.status = 'rolled_back' then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHWEEK_REPAIR_ROLLED_BACK';
  end if;
  if found then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHWEEK_REPAIR_INCOMPLETE_PREVIOUS_ATTEMPT';
  end if;

  select array_agg(id order by provider_team_id::bigint, id)
    into v_club_ids
    from public.football_clubs
   where provider = 'sportmonks';
  if cardinality(v_club_ids) <> 20 then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHWEEK_EXACT_20_CLUBS_REQUIRED';
  end if;

  select * into v_snapshot
    from public.football_live_snapshots
   where snapshot_key = 'touchline-england-live';

  insert into public.touchline_qa_matchweek_repairs (
    run_id, project_ref, status, prior_pairings,
    prior_snapshot_payload, prior_snapshot_fetched_at, prior_snapshot_updated_at
  )
  select
    p_run_id,
    p_project_ref,
    'applying',
    jsonb_agg(jsonb_build_object(
      'providerFixtureId', fixture.provider_fixture_id,
      'homeClubId', fixture.home_club_id,
      'awayClubId', fixture.away_club_id
    ) order by fixture.provider_fixture_id),
    case when v_snapshot.snapshot_key is not null then v_snapshot.payload else null end,
    case when v_snapshot.snapshot_key is not null then v_snapshot.fetched_at else null end,
    case when v_snapshot.snapshot_key is not null then v_snapshot.updated_at else null end
  from public.football_fixtures fixture
  where fixture.provider = 'sportmonks'
    and fixture.provider_fixture_id = any(v_scenario.provider_fixture_ids);

  if (select jsonb_array_length(prior_pairings) from public.touchline_qa_matchweek_repairs where run_id = p_run_id) <> 20 then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHWEEK_FIXTURE_DRIFT';
  end if;

  with pairings(provider_fixture_id, home_club_id, away_club_id) as (
    select
      'qa-representative-' || lpad(index::text, 2, '0'),
      v_club_ids[index],
      v_club_ids[index + 10]
    from generate_series(1, 10) index
    union all
    select
      'qa-representative-' || lpad((index + 10)::text, 2, '0'),
      v_club_ids[index + 10],
      v_club_ids[index]
    from generate_series(1, 10) index
  )
  update public.football_fixtures fixture
     set home_club_id = pairings.home_club_id,
         away_club_id = pairings.away_club_id,
         updated_at = clock_timestamp()
    from pairings
   where fixture.provider = 'sportmonks'
     and fixture.provider_fixture_id = pairings.provider_fixture_id;

  select count(distinct club_id) into v_first_round_clubs
    from (
      select home_club_id as club_id from public.football_fixtures
       where provider = 'sportmonks' and provider_fixture_id = any(v_scenario.provider_fixture_ids[1:10])
      union all
      select away_club_id from public.football_fixtures
       where provider = 'sportmonks' and provider_fixture_id = any(v_scenario.provider_fixture_ids[1:10])
    ) first_round;
  select count(distinct club_id) into v_second_round_clubs
    from (
      select home_club_id as club_id from public.football_fixtures
       where provider = 'sportmonks' and provider_fixture_id = any(v_scenario.provider_fixture_ids[11:20])
      union all
      select away_club_id from public.football_fixtures
       where provider = 'sportmonks' and provider_fixture_id = any(v_scenario.provider_fixture_ids[11:20])
    ) second_round;
  if v_first_round_clubs <> 20 or v_second_round_clubs <> 20 then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHWEEK_ROUND_INTEGRITY_FAILED';
  end if;

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
          'source', jsonb_build_object('provider', 'sportmonks', 'providerId', home_club.provider_team_id, 'lastSyncedAt', '2026-08-15T08:00:00Z')
        )),
        'awayTeam', jsonb_strip_nulls(jsonb_build_object(
          'id', 'sportmonks:' || away_club.provider_team_id,
          'providerId', away_club.provider_team_id,
          'provider', 'sportmonks',
          'name', away_club.name,
          'shortCode', away_club.short_code,
          'logoUrl', away_club.logo_url,
          'source', jsonb_build_object('provider', 'sportmonks', 'providerId', away_club.provider_team_id, 'lastSyncedAt', '2026-08-15T08:00:00Z')
        )),
        'homeScore', fixture.home_score,
        'awayScore', fixture.away_score,
        'source', jsonb_build_object('provider', 'sportmonks', 'providerId', fixture.provider_fixture_id, 'lastSyncedAt', '2026-08-15T08:00:00Z')
      )) order by fixture.starts_at, fixture.provider_fixture_id
    ),
    'fetchedAt', '2026-08-15T08:00:00Z',
    'storedAt', 1786780200000
  ) into v_snapshot_payload
  from public.football_fixtures fixture
  join public.football_clubs home_club on home_club.id = fixture.home_club_id
  join public.football_clubs away_club on away_club.id = fixture.away_club_id
  where fixture.provider = 'sportmonks'
    and fixture.provider_fixture_id = any(v_scenario.provider_fixture_ids);

  if jsonb_array_length(v_snapshot_payload -> 'fixtures') <> 20 then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHWEEK_SNAPSHOT_INVALID';
  end if;

  insert into public.football_live_snapshots (snapshot_key, payload, fetched_at, updated_at)
  values ('touchline-england-live', v_snapshot_payload, timestamptz '2026-08-15 08:00:00+00', clock_timestamp())
  on conflict (snapshot_key) do update set
    payload = excluded.payload,
    fetched_at = excluded.fetched_at,
    updated_at = excluded.updated_at;

  update public.touchline_qa_matchweek_repairs
     set status = 'applied', applied_at = clock_timestamp()
   where run_id = p_run_id;

  return jsonb_build_object('ok', true, 'idempotentReplay', false, 'fixtures', 20, 'matchesPerRound', 10);
end;
$$;

create or replace function public.touchline_rollback_qa_complete_matchweek_repair(
  p_project_ref text,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_repair public.touchline_qa_matchweek_repairs%rowtype;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  select * into v_repair
    from public.touchline_qa_matchweek_repairs
   where run_id = p_run_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHWEEK_REPAIR_NOT_FOUND';
  end if;
  if v_repair.status = 'rolled_back' then
    return jsonb_build_object('ok', true, 'idempotentReplay', true);
  end if;
  if v_repair.status <> 'applied' then
    raise exception using errcode = 'P0001', message = 'TL_QA_MATCHWEEK_REPAIR_NOT_APPLIED';
  end if;

  update public.touchline_qa_matchweek_repairs set status = 'rolling_back' where run_id = p_run_id;
  with prior as (
    select * from jsonb_to_recordset(v_repair.prior_pairings) as row(
      provider_fixture_id text,
      home_club_id uuid,
      away_club_id uuid
    )
  )
  update public.football_fixtures fixture
     set home_club_id = prior.home_club_id,
         away_club_id = prior.away_club_id,
         updated_at = clock_timestamp()
    from prior
   where fixture.provider = 'sportmonks'
     and fixture.provider_fixture_id = prior.provider_fixture_id;

  insert into public.football_live_snapshots (snapshot_key, payload, fetched_at, updated_at)
  values ('touchline-england-live', v_repair.prior_snapshot_payload, v_repair.prior_snapshot_fetched_at, v_repair.prior_snapshot_updated_at)
  on conflict (snapshot_key) do update set
    payload = excluded.payload,
    fetched_at = excluded.fetched_at,
    updated_at = excluded.updated_at;

  update public.touchline_qa_matchweek_repairs
     set status = 'rolled_back', rolled_back_at = clock_timestamp()
   where run_id = p_run_id;
  return jsonb_build_object('ok', true, 'idempotentReplay', false, 'restoredFixtures', 20);
end;
$$;

revoke all on function public.touchline_apply_qa_complete_matchweek_repair(text, uuid) from public, anon, authenticated;
revoke all on function public.touchline_rollback_qa_complete_matchweek_repair(text, uuid) from public, anon, authenticated;
grant execute on function public.touchline_apply_qa_complete_matchweek_repair(text, uuid) to service_role;
grant execute on function public.touchline_rollback_qa_complete_matchweek_repair(text, uuid) to service_role;

commit;
