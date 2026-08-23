begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

-- Publish a replacement snapshot after migration 029's mutable-live correction.
do $$
declare
  v_season_id uuid;
  v_payload jsonb;
  v_fixture_ids jsonb;
  v_checksum text;
  v_snapshot_id text;
  v_now timestamptz := clock_timestamp();
begin
  select season.id into v_season_id
  from public.football_seasons season
  join public.football_competitions competition on competition.id = season.competition_id
  where season.is_current is true
    and competition.provider = 'sportmonks'
    and competition.provider_competition_id = '8'
  order by season.starts_at desc nulls last
  limit 1;

  if v_season_id is null then
    raise exception using errcode = 'P0001', message = 'TL_COACH_RANKING_SEASON_UNAVAILABLE';
  end if;

  with totals as (
    select contract.id as contract_id, contract.coach_provider_id, club.name as club_name,
      coalesce(sum(points.touchline_points) filter (where fixture.season_id = v_season_id), 0)::integer as touchline_points,
      count(*) filter (where fixture.season_id = v_season_id and points.outcome = 'win')::integer as wins,
      count(*) filter (where fixture.season_id = v_season_id and points.outcome = 'draw')::integer as draws,
      count(*) filter (where fixture.season_id = v_season_id and points.outcome = 'loss')::integer as losses,
      count(*) filter (where fixture.season_id = v_season_id and points.fixture_context = 'away' and points.outcome = 'win')::integer as away_wins
    from public.touchline_coach_contracts contract
    join public.football_clubs club on club.id = contract.club_id
    left join public.touchline_coach_fixture_points points
      on points.contract_id = contract.id and points.scoring_version = 'coach_scoring_v2'
    left join public.football_fixtures fixture on fixture.id = points.fixture_id
    where contract.scoring_version = 'coach_scoring_v2'
    group by contract.id, contract.coach_provider_id, club.name
  ), ranked as (
    select *, row_number() over (order by touchline_points desc, wins desc, away_wins desc, coach_provider_id) as rank
    from totals
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', rank, 'contractId', contract_id, 'coachProviderId', coach_provider_id,
    'clubName', club_name, 'touchlinePoints', touchline_points,
    'wins', wins, 'draws', draws, 'losses', losses, 'awayWins', away_wins,
    'tiebreaker', 'points,wins,awayWins,coachProviderId'
  ) order by rank), '[]'::jsonb) into v_payload from ranked;

  select coalesce(jsonb_agg(distinct fixture.provider_fixture_id order by fixture.provider_fixture_id), '[]'::jsonb)
  into v_fixture_ids
  from public.touchline_coach_fixture_points points
  join public.football_fixtures fixture on fixture.id = points.fixture_id
  where points.scoring_version = 'coach_scoring_v2' and fixture.season_id = v_season_id;

  v_checksum := md5(v_season_id::text || ':coach_scoring_v2:' || v_fixture_ids::text || ':' || v_payload::text);
  v_snapshot_id := 'coach-v2:' || v_season_id::text || ':' || v_checksum;
  insert into public.touchline_coach_ranking_snapshots (
    snapshot_id, league_key, season_id, scoring_version, fixture_ids, generated_at, checksum, ranking_payload
  ) values (
    v_snapshot_id, 'touchline-england', v_season_id, 'coach_scoring_v2', v_fixture_ids, v_now, v_checksum, v_payload
  ) on conflict (snapshot_id) do nothing;
  insert into public.touchline_coach_ranking_active_snapshots (league_key, snapshot_id, activated_at, updated_at)
  values ('touchline-england', v_snapshot_id, v_now, v_now)
  on conflict (league_key) do update set
    snapshot_id = excluded.snapshot_id,
    activated_at = excluded.activated_at,
    updated_at = excluded.updated_at
  where public.touchline_coach_ranking_active_snapshots.snapshot_id is distinct from excluded.snapshot_id;
end;
$$;

commit;
