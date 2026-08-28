begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

-- Extend the existing immutable competition ranking snapshot in place. Public
-- Coach Card, Zoom and Profile surfaces need the same Home/Away record that
-- produces the aggregate ranking; customer contract settlements remain a
-- separate private lifecycle and no second scoring system is introduced.
create or replace function public.touchline_rebuild_coach_ranking_v2(
  p_competition_coaches jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_expected_clubs integer := 0;
  v_assignment_count integer := 0;
  v_unique_coaches integer := 0;
  v_unique_clubs integer := 0;
  v_mapped_clubs integer := 0;
  v_scoreable_fixtures integer := 0;
  v_result_rows integer := 0;
  v_payload jsonb;
  v_fixture_ids jsonb;
  v_checksum text;
  v_snapshot_id text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_COACH_ADMIN_REQUIRED';
  end if;

  if jsonb_typeof(coalesce(p_competition_coaches, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'TL_COACH_ASSIGNMENTS_INCOMPLETE';
  end if;

  select season.id into v_season_id
  from public.football_seasons season
  join public.football_competitions competition on competition.id = season.competition_id
  where season.is_current is true
    and competition.provider = 'sportmonks'
    and competition.provider_competition_id = '8'
  order by season.starts_at desc nulls last
  limit 1;

  if v_season_id is null then
    return jsonb_build_object('ok', false, 'reason', 'season-unavailable');
  end if;

  with expected as (
    select fixture.home_club_id as club_id
    from public.football_fixtures fixture
    where fixture.season_id = v_season_id
    union
    select fixture.away_club_id as club_id
    from public.football_fixtures fixture
    where fixture.season_id = v_season_id
  )
  select count(*)::integer into v_expected_clubs from expected;

  with raw_assignment as (
    select trim(coach_provider_id) as coach_provider_id,
      trim(club_provider_id) as club_provider_id
    from jsonb_to_recordset(p_competition_coaches)
      as source(coach_provider_id text, club_provider_id text)
  )
  select count(*)::integer,
    count(distinct coach_provider_id)::integer,
    count(distinct club_provider_id)::integer,
    count(distinct club.id)::integer
  into v_assignment_count, v_unique_coaches, v_unique_clubs, v_mapped_clubs
  from raw_assignment
  left join public.football_clubs club
    on club.provider = 'sportmonks'
   and club.provider_team_id = raw_assignment.club_provider_id;

  if v_expected_clubs = 0
     or v_assignment_count <> v_expected_clubs
     or v_unique_coaches <> v_expected_clubs
     or v_unique_clubs <> v_expected_clubs
     or v_mapped_clubs <> v_expected_clubs
     or exists (
       with raw_assignment as (
         select trim(club_provider_id) as club_provider_id
         from jsonb_to_recordset(p_competition_coaches)
           as source(coach_provider_id text, club_provider_id text)
       ), expected as (
         select fixture.home_club_id as club_id
         from public.football_fixtures fixture
         where fixture.season_id = v_season_id
         union
         select fixture.away_club_id as club_id
         from public.football_fixtures fixture
         where fixture.season_id = v_season_id
       )
       select 1
       from expected
       join public.football_clubs club on club.id = expected.club_id
       left join raw_assignment on raw_assignment.club_provider_id = club.provider_team_id
       where raw_assignment.club_provider_id is null
     ) then
    raise exception using errcode = 'P0001', message = 'TL_COACH_ASSIGNMENTS_INCOMPLETE';
  end if;

  select count(*)::integer into v_scoreable_fixtures
  from public.football_fixtures fixture
  where fixture.season_id = v_season_id
    and public.touchline_is_scoreable_fixture_status(fixture.status)
    and fixture.home_score is not null
    and fixture.away_score is not null;

  with raw_assignment as (
    select trim(coach_provider_id) as coach_provider_id,
      trim(club_provider_id) as club_provider_id
    from jsonb_to_recordset(p_competition_coaches)
      as source(coach_provider_id text, club_provider_id text)
  ), assignment as (
    select raw_assignment.coach_provider_id, club.id as club_id
    from raw_assignment
    join public.football_clubs club
      on club.provider = 'sportmonks'
     and club.provider_team_id = raw_assignment.club_provider_id
  )
  select count(*)::integer into v_result_rows
  from assignment
  join public.football_fixtures fixture
    on fixture.home_club_id = assignment.club_id
    or fixture.away_club_id = assignment.club_id
  where fixture.season_id = v_season_id
    and public.touchline_is_scoreable_fixture_status(fixture.status)
    and fixture.home_score is not null
    and fixture.away_score is not null;

  if v_result_rows <> v_scoreable_fixtures * 2 then
    raise exception using errcode = 'P0001', message = 'TL_COACH_FIXTURE_COVERAGE_INCOMPLETE';
  end if;

  with raw_assignment as (
    select trim(coach_provider_id) as coach_provider_id,
      trim(club_provider_id) as club_provider_id
    from jsonb_to_recordset(p_competition_coaches)
      as source(coach_provider_id text, club_provider_id text)
  ), assignment as (
    select raw_assignment.coach_provider_id, club.id as club_id, club.name as club_name
    from raw_assignment
    join public.football_clubs club
      on club.provider = 'sportmonks'
     and club.provider_team_id = raw_assignment.club_provider_id
  ), results as (
    select assignment.coach_provider_id, assignment.club_id, assignment.club_name,
      fixture.id as fixture_id,
      case when fixture.home_club_id = assignment.club_id then 'home' else 'away' end as fixture_context,
      case
        when fixture.home_score = fixture.away_score then 'draw'
        when (fixture.home_club_id = assignment.club_id and fixture.home_score > fixture.away_score)
          or (fixture.away_club_id = assignment.club_id and fixture.away_score > fixture.home_score) then 'win'
        else 'loss'
      end as outcome,
      case
        when fixture.home_club_id = assignment.club_id and fixture.home_score > fixture.away_score then 3
        when fixture.home_club_id = assignment.club_id and fixture.home_score = fixture.away_score then 1
        when fixture.home_club_id = assignment.club_id then 0
        when fixture.away_score > fixture.home_score then 4
        when fixture.away_score = fixture.home_score then 2
        else 0
      end::integer as touchline_points
    from assignment
    join public.football_fixtures fixture
      on fixture.home_club_id = assignment.club_id
      or fixture.away_club_id = assignment.club_id
    where fixture.season_id = v_season_id
      and public.touchline_is_scoreable_fixture_status(fixture.status)
      and fixture.home_score is not null
      and fixture.away_score is not null
  ), totals as (
    select assignment.coach_provider_id, assignment.club_id, assignment.club_name,
      coalesce(sum(results.touchline_points), 0)::integer as touchline_points,
      count(results.fixture_id) filter (where results.outcome = 'win')::integer as wins,
      count(results.fixture_id) filter (where results.outcome = 'draw')::integer as draws,
      count(results.fixture_id) filter (where results.outcome = 'loss')::integer as losses,
      count(results.fixture_id) filter (where results.fixture_context = 'away' and results.outcome = 'win')::integer as away_wins,
      count(results.fixture_id) filter (where results.fixture_context = 'home' and results.outcome = 'win')::integer as home_wins,
      count(results.fixture_id) filter (where results.fixture_context = 'home' and results.outcome = 'draw')::integer as home_draws,
      count(results.fixture_id) filter (where results.fixture_context = 'home' and results.outcome = 'loss')::integer as home_losses,
      coalesce(sum(results.touchline_points) filter (where results.fixture_context = 'home'), 0)::integer as home_points,
      count(results.fixture_id) filter (where results.fixture_context = 'away' and results.outcome = 'draw')::integer as away_draws,
      count(results.fixture_id) filter (where results.fixture_context = 'away' and results.outcome = 'loss')::integer as away_losses,
      coalesce(sum(results.touchline_points) filter (where results.fixture_context = 'away'), 0)::integer as away_points
    from assignment
    left join results
      on results.coach_provider_id = assignment.coach_provider_id
     and results.club_id = assignment.club_id
    group by assignment.coach_provider_id, assignment.club_id, assignment.club_name
  ), ranked as (
    select *, row_number() over (
      order by touchline_points desc, wins desc, away_wins desc, coach_provider_id
    ) as rank
    from totals
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', rank,
    'coachProviderId', coach_provider_id,
    'clubName', club_name,
    'touchlinePoints', touchline_points,
    'wins', wins,
    'draws', draws,
    'losses', losses,
    'awayWins', away_wins,
    'home', jsonb_build_object(
      'wins', home_wins,
      'draws', home_draws,
      'losses', home_losses,
      'touchlinePoints', home_points
    ),
    'away', jsonb_build_object(
      'wins', away_wins,
      'draws', away_draws,
      'losses', away_losses,
      'touchlinePoints', away_points
    ),
    'tiebreaker', 'points,wins,awayWins,coachProviderId'
  ) order by rank), '[]'::jsonb)
  into v_payload
  from ranked;

  select coalesce(jsonb_agg(provider_fixture_id order by provider_fixture_id), '[]'::jsonb)
  into v_fixture_ids
  from (
    select distinct fixture.provider_fixture_id
    from public.football_fixtures fixture
    where fixture.season_id = v_season_id
      and public.touchline_is_scoreable_fixture_status(fixture.status)
      and fixture.home_score is not null
      and fixture.away_score is not null
  ) scoreable;

  v_checksum := md5(v_season_id::text || ':coach_scoring_v2:' || v_fixture_ids::text || ':' || v_payload::text);
  v_snapshot_id := 'coach-v2:' || v_season_id::text || ':' || v_checksum;

  insert into public.touchline_coach_ranking_snapshots (
    snapshot_id, league_key, season_id, scoring_version,
    fixture_ids, generated_at, checksum, ranking_payload
  ) values (
    v_snapshot_id, 'touchline-england', v_season_id, 'coach_scoring_v2',
    v_fixture_ids, v_now, v_checksum, v_payload
  ) on conflict (snapshot_id) do nothing;

  insert into public.touchline_coach_ranking_active_snapshots (
    league_key, snapshot_id, activated_at, updated_at
  ) values (
    'touchline-england', v_snapshot_id, v_now, v_now
  ) on conflict (league_key) do update set
    snapshot_id = excluded.snapshot_id,
    activated_at = excluded.activated_at,
    updated_at = excluded.updated_at
  where touchline_coach_ranking_active_snapshots.snapshot_id is distinct from excluded.snapshot_id;

  return jsonb_build_object(
    'ok', true,
    'snapshotId', v_snapshot_id,
    'checksum', v_checksum,
    'rows', jsonb_array_length(v_payload),
    'fixtures', jsonb_array_length(v_fixture_ids),
    'profileRecords', true
  );
end;
$$;

revoke execute on function public.touchline_rebuild_coach_ranking_v2(jsonb)
  from public, anon, authenticated;
grant execute on function public.touchline_rebuild_coach_ranking_v2(jsonb)
  to service_role;

comment on function public.touchline_rebuild_coach_ranking_v2(jsonb) is
  'QA-only canonical 20-coach ranking with aggregate and Home/Away records for shared Card, Zoom, Profile and Ranking presentation.';

commit;
