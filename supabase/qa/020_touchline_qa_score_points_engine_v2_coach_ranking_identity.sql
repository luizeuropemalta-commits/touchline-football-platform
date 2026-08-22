begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

create or replace function public.touchline_rebuild_coach_ranking_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_payload jsonb;
  v_fixture_ids jsonb;
  v_checksum text;
  v_snapshot_id text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_COACH_ADMIN_REQUIRED';
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

  if exists (
    select 1
    from public.touchline_coach_contracts contract
    where contract.scoring_version = 'coach_scoring_v2'
    group by contract.coach_provider_id
    having count(distinct contract.club_id) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'TL_COACH_RANKING_CLUB_CONFLICT';
  end if;

  if exists (
    select 1
    from public.touchline_coach_contracts contract
    join public.touchline_coach_fixture_points points
      on points.contract_id = contract.id
     and points.scoring_version = 'coach_scoring_v2'
    join public.football_fixtures fixture on fixture.id = points.fixture_id
    where contract.scoring_version = 'coach_scoring_v2'
      and fixture.season_id = v_season_id
    group by contract.coach_provider_id, contract.club_id, points.fixture_id
    having count(distinct row(
      points.fixture_context, points.outcome, points.home_score, points.away_score,
      points.touchline_points, points.settlement_status
    )) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'TL_COACH_RANKING_POINT_CONFLICT';
  end if;

  with coaches as (
    select contract.coach_provider_id, contract.club_id, club.name as club_name
    from public.touchline_coach_contracts contract
    join public.football_clubs club on club.id = contract.club_id
    where contract.scoring_version = 'coach_scoring_v2'
    group by contract.coach_provider_id, contract.club_id, club.name
  ), canonical_points as (
    select contract.coach_provider_id, contract.club_id, points.fixture_id,
      min(points.touchline_points)::integer as touchline_points,
      min(points.outcome) as outcome,
      min(points.fixture_context) as fixture_context
    from public.touchline_coach_contracts contract
    join public.touchline_coach_fixture_points points
      on points.contract_id = contract.id
     and points.scoring_version = 'coach_scoring_v2'
    join public.football_fixtures fixture on fixture.id = points.fixture_id
    where contract.scoring_version = 'coach_scoring_v2'
      and fixture.season_id = v_season_id
    group by contract.coach_provider_id, contract.club_id, points.fixture_id
  ), totals as (
    select coach.coach_provider_id, coach.club_id, coach.club_name,
      coalesce(sum(points.touchline_points), 0)::integer as touchline_points,
      count(*) filter (where points.outcome = 'win')::integer as wins,
      count(*) filter (where points.outcome = 'draw')::integer as draws,
      count(*) filter (where points.outcome = 'loss')::integer as losses,
      count(*) filter (where points.fixture_context = 'away' and points.outcome = 'win')::integer as away_wins
    from coaches coach
    left join canonical_points points
      on points.coach_provider_id = coach.coach_provider_id
     and points.club_id = coach.club_id
    group by coach.coach_provider_id, coach.club_id, coach.club_name
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

  select coalesce(jsonb_agg(distinct fixture.provider_fixture_id order by fixture.provider_fixture_id), '[]'::jsonb)
  into v_fixture_ids
  from public.touchline_coach_fixture_points points
  join public.football_fixtures fixture on fixture.id = points.fixture_id
  where points.scoring_version = 'coach_scoring_v2'
    and fixture.season_id = v_season_id;

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
    'rows', jsonb_array_length(v_payload)
  );
end;
$$;

revoke execute on function public.touchline_rebuild_coach_ranking_v2()
  from public, anon, authenticated;
grant execute on function public.touchline_rebuild_coach_ranking_v2()
  to service_role;

comment on function public.touchline_rebuild_coach_ranking_v2() is
  'Builds one coach_scoring_v2 ranking row per canonical coach, deduplicating identical contract settlements by fixture.';

commit;
