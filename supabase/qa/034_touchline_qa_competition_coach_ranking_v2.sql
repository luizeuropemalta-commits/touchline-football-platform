begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

-- The ranking is a competition result, not a projection of customer-owned
-- contracts. Keep contract settlements intact for ClubOwner history, while
-- rebuilding the public table from the canonical 20 coach-to-club assignments.
drop function if exists public.touchline_rebuild_coach_ranking_v2();

create function public.touchline_rebuild_coach_ranking_v2(
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
    on (fixture.home_club_id = assignment.club_id
      or fixture.away_club_id = assignment.club_id)
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
      on (fixture.home_club_id = assignment.club_id
        or fixture.away_club_id = assignment.club_id)
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
      count(results.fixture_id) filter (
        where results.fixture_context = 'away' and results.outcome = 'win'
      )::integer as away_wins
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
    'fixtures', jsonb_array_length(v_fixture_ids)
  );
end;
$$;

drop function if exists public.touchline_reconcile_coach_fixture_points(uuid);

create function public.touchline_reconcile_coach_fixture_points(
  p_fixture_id uuid default null,
  p_competition_coaches jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record record;
  v_context text;
  v_outcome text;
  v_points integer;
  v_settlement text;
  v_count integer := 0;
  v_ranking jsonb;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_COACH_ADMIN_REQUIRED';
  end if;

  for v_record in
    select contract.id contract_id, contract.club_id, fixture.id fixture_id,
      fixture.home_club_id, fixture.away_club_id, fixture.starts_at, fixture.status,
      fixture.home_score, fixture.away_score, fixture.source_updated_at
    from public.touchline_coach_contracts contract
    join public.football_fixtures fixture
      on contract.club_id in (fixture.home_club_id, fixture.away_club_id)
    where contract.scoring_version = 'coach_scoring_v2'
      and (p_fixture_id is null or fixture.id = p_fixture_id)
      and fixture.starts_at >= contract.started_at
      and (contract.ended_at is null or fixture.starts_at < contract.ended_at)
      and public.touchline_is_scoreable_fixture_status(fixture.status)
      and fixture.home_score is not null
      and fixture.away_score is not null
  loop
    v_context := case when v_record.home_club_id = v_record.club_id then 'home' else 'away' end;
    v_outcome := case
      when v_record.home_score = v_record.away_score then 'draw'
      when (v_context = 'home' and v_record.home_score > v_record.away_score)
        or (v_context = 'away' and v_record.away_score > v_record.home_score) then 'win'
      else 'loss'
    end;
    v_points := case
      when v_context = 'home' and v_outcome = 'win' then 3
      when v_context = 'home' and v_outcome = 'draw' then 1
      when v_context = 'home' then 0
      when v_outcome = 'win' then 4
      when v_outcome = 'draw' then 2
      else 0
    end;
    v_settlement := case when public.touchline_is_final_fixture_status(v_record.status) then 'final' else 'provisional' end;

    insert into public.touchline_coach_fixture_points (
      contract_id, fixture_id, fixture_context, outcome, home_score, away_score,
      touchline_points, settlement_status, scoring_version,
      provider_source_updated_at, settled_at, updated_at
    ) values (
      v_record.contract_id, v_record.fixture_id, v_context, v_outcome,
      v_record.home_score, v_record.away_score, v_points, v_settlement,
      'coach_scoring_v2', v_record.source_updated_at,
      case when v_settlement = 'final' then clock_timestamp() end, clock_timestamp()
    )
    on conflict (contract_id, fixture_id, scoring_version) do update set
      fixture_context = excluded.fixture_context,
      outcome = excluded.outcome,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      touchline_points = excluded.touchline_points,
      settlement_status = excluded.settlement_status,
      provider_source_updated_at = excluded.provider_source_updated_at,
      settled_at = case when excluded.settlement_status = 'final' then excluded.settled_at end,
      updated_at = excluded.updated_at
    where public.touchline_coach_fixture_points.settlement_status <> 'final'
      and row(
        public.touchline_coach_fixture_points.fixture_context,
        public.touchline_coach_fixture_points.outcome,
        public.touchline_coach_fixture_points.home_score,
        public.touchline_coach_fixture_points.away_score,
        public.touchline_coach_fixture_points.touchline_points,
        public.touchline_coach_fixture_points.settlement_status,
        public.touchline_coach_fixture_points.provider_source_updated_at
      ) is distinct from row(
        excluded.fixture_context, excluded.outcome, excluded.home_score, excluded.away_score,
        excluded.touchline_points, excluded.settlement_status, excluded.provider_source_updated_at
      );
    if found then v_count := v_count + 1; end if;
  end loop;

  v_ranking := public.touchline_rebuild_coach_ranking_v2(p_competition_coaches);
  return jsonb_build_object(
    'ok', true,
    'reconciled', v_count,
    'scoringVersion', 'coach_scoring_v2',
    'ranking', v_ranking
  );
end;
$$;

revoke execute on function public.touchline_rebuild_coach_ranking_v2(jsonb)
  from public, anon, authenticated;
revoke execute on function public.touchline_reconcile_coach_fixture_points(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.touchline_rebuild_coach_ranking_v2(jsonb)
  to service_role;
grant execute on function public.touchline_reconcile_coach_fixture_points(uuid, jsonb)
  to service_role;

comment on function public.touchline_rebuild_coach_ranking_v2(jsonb) is
  'QA-only public coach ranking from the canonical 20-club map and official fixture outcomes; independent of customer contracts.';
comment on function public.touchline_reconcile_coach_fixture_points(uuid, jsonb) is
  'QA-only contract reconciliation plus full competition coach ranking refresh, preserving coach_scoring_v2.';

commit;
