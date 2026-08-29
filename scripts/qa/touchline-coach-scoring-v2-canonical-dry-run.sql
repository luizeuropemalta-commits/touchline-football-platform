-- READ ONLY. Exact QA impact preview for migration 037.
-- This file contains SELECT/CTE statements only and must run before any
-- migration or ranking publication is authorized.

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

-- Contract settlement rows whose derived points would change in place.
select
  points.id as settlement_id,
  points.contract_id,
  contract.coach_provider_id,
  club.name as club_name,
  fixture.provider_fixture_id,
  fixture.starts_at,
  points.fixture_context,
  points.outcome,
  points.settlement_status,
  points.touchline_points as old_points,
  case
    when points.fixture_context = 'home' and points.outcome = 'win' then 3
    when points.fixture_context = 'home' and points.outcome = 'draw' then 1
    when points.fixture_context = 'home' then -2
    when points.outcome = 'win' then 6
    when points.outcome = 'draw' then 3
    else -1
  end as new_points
from public.touchline_coach_fixture_points points
join public.touchline_coach_contracts contract on contract.id = points.contract_id
join public.football_clubs club on club.id = contract.club_id
join public.football_fixtures fixture on fixture.id = points.fixture_id
where points.scoring_version = 'coach_scoring_v2'
  and points.touchline_points is distinct from case
    when points.fixture_context = 'home' and points.outcome = 'win' then 3
    when points.fixture_context = 'home' and points.outcome = 'draw' then 1
    when points.fixture_context = 'home' then -2
    when points.outcome = 'win' then 6
    when points.outcome = 'draw' then 3
    else -1
  end
order by fixture.starts_at, points.id;

-- Full current-season public ranking projection. The assignment set is the
-- same immutable provider-ID registry passed by the application to the
-- server-only rebuild RPC. No snapshot is inserted or activated here.
with current_season as (
  select season.id
  from public.football_seasons season
  join public.football_competitions competition on competition.id = season.competition_id
  where season.is_current is true
    and competition.provider = 'sportmonks'
    and competition.provider_competition_id = '8'
  order by season.starts_at desc nulls last
  limit 1
), assignment(coach_provider_id, club_provider_id) as (
  values
    ('307','19'), ('455907','15'), ('29710','52'), ('255','236'), ('37679','78'),
    ('511','18'), ('95','117'), ('37732840','51'), ('455355','13'), ('515','11'),
    ('74546','22'), ('270','116'), ('460535','71'), ('19960388','8'), ('107439','9'),
    ('645','14'), ('523911','20'), ('51518','63'), ('529482','3'), ('127889','6')
), mapped as (
  select assignment.coach_provider_id, club.id as club_id, club.name as club_name
  from assignment
  join public.football_clubs club
    on club.provider = 'sportmonks'
   and club.provider_team_id = assignment.club_provider_id
), results as (
  select mapped.coach_provider_id, mapped.club_id, mapped.club_name,
    fixture.id as fixture_id, fixture.provider_fixture_id, fixture.starts_at,
    case when fixture.home_club_id = mapped.club_id then 'home' else 'away' end as fixture_context,
    case
      when fixture.home_score = fixture.away_score then 'draw'
      when (fixture.home_club_id = mapped.club_id and fixture.home_score > fixture.away_score)
        or (fixture.away_club_id = mapped.club_id and fixture.away_score > fixture.home_score) then 'win'
      else 'loss'
    end as outcome
  from mapped
  join public.football_fixtures fixture
    on fixture.home_club_id = mapped.club_id or fixture.away_club_id = mapped.club_id
  join current_season on current_season.id = fixture.season_id
  where public.touchline_is_scoreable_fixture_status(fixture.status)
    and fixture.home_score is not null
    and fixture.away_score is not null
), scored as (
  select results.*,
    case
      when fixture_context = 'home' and outcome = 'win' then 3
      when fixture_context = 'home' and outcome = 'draw' then 1
      when fixture_context = 'home' then 0
      when outcome = 'win' then 4
      when outcome = 'draw' then 2
      else 0
    end as old_points,
    case
      when fixture_context = 'home' and outcome = 'win' then 3
      when fixture_context = 'home' and outcome = 'draw' then 1
      when fixture_context = 'home' then -2
      when outcome = 'win' then 6
      when outcome = 'draw' then 3
      else -1
    end as new_points
  from results
), totals as (
  select mapped.coach_provider_id, mapped.club_name,
    coalesce(sum(scored.old_points), 0)::integer as old_total,
    coalesce(sum(scored.new_points), 0)::integer as new_total,
    count(scored.fixture_id) filter (where scored.outcome = 'win')::integer as wins,
    count(scored.fixture_id) filter (
      where scored.fixture_context = 'away' and scored.outcome = 'win'
    )::integer as away_wins
  from mapped
  left join scored on scored.coach_provider_id = mapped.coach_provider_id
  group by mapped.coach_provider_id, mapped.club_name
), ranked as (
  select totals.*,
    row_number() over (
      order by old_total desc, wins desc, away_wins desc, coach_provider_id
    )::integer as old_rank,
    row_number() over (
      order by new_total desc, wins desc, away_wins desc, coach_provider_id
    )::integer as new_rank
  from totals
)
select coach_provider_id, club_name, old_total, new_total,
  new_total - old_total as delta, old_rank, new_rank
from ranked
order by new_rank;
