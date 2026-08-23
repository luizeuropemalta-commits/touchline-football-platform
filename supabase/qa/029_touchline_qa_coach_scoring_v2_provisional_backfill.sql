begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

-- Bring only mutable live settlements onto the canonical 3/1/0 home and 4/2/0 away policy.
update public.touchline_coach_fixture_points points
set
  outcome = case
    when fixture.home_score = fixture.away_score then 'draw'
    when (points.fixture_context = 'home' and fixture.home_score > fixture.away_score)
      or (points.fixture_context = 'away' and fixture.away_score > fixture.home_score) then 'win'
    else 'loss'
  end,
  home_score = fixture.home_score,
  away_score = fixture.away_score,
  touchline_points = case
    when points.fixture_context = 'home' and fixture.home_score > fixture.away_score then 3
    when points.fixture_context = 'home' and fixture.home_score = fixture.away_score then 1
    when points.fixture_context = 'home' then 0
    when fixture.away_score > fixture.home_score then 4
    when fixture.away_score = fixture.home_score then 2
    else 0
  end,
  provider_source_updated_at = fixture.source_updated_at,
  updated_at = clock_timestamp()
from public.football_fixtures fixture
where points.fixture_id = fixture.id
  and points.scoring_version = 'coach_scoring_v2'
  and points.settlement_status = 'provisional'
  and public.touchline_is_scoreable_fixture_status(fixture.status)
  and fixture.home_score is not null
  and fixture.away_score is not null;

commit;
