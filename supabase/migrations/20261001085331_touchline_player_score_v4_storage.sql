-- Additive player-only raw-rating storage. This does not publish V4, replace
-- historical V3 rows, change Fantasy RPCs, or change any coach scoring rule.
-- Keep points unconstrained numeric to reject mismatches instead of rounding
-- them into agreement with the provider rating (which remains numeric(5,2)).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.touchline_player_fixture_score_settlements
  drop constraint touchline_player_fixture_score_settlement_scoring_version_check,
  drop constraint touchline_player_fixture_score_settlemen_touchline_points_check,
  alter column touchline_points type numeric using touchline_points::numeric,
  add constraint touchline_player_settlement_version_check
    check (scoring_version in ('player_scoring_v3','player_scoring_v4')),
  add constraint touchline_player_settlement_points_version_check
    check (
      (scoring_version = 'player_scoring_v3' and
        (touchline_points is null or (touchline_points between -1 and 12 and touchline_points = trunc(touchline_points))))
      or
      (scoring_version = 'player_scoring_v4' and
        case when appearance_status in ('started','substitute')
          and coalesce(minutes_played,0) > 0 and rating is not null then
            touchline_points is not null and touchline_points = rating
              and scoring_coverage_status = 'complete'
        else touchline_points is null and scoring_coverage_status = 'unavailable' end)
    );

alter table public.football_player_season_statistics
  drop constraint football_player_season_statistics_scoring_version_check,
  add constraint football_player_season_statistics_scoring_version_check
    check (scoring_version in ('player_scoring_v2','player_scoring_v3','player_scoring_v4'));

alter table public.touchline_card_ranking_snapshots
  drop constraint touchline_card_ranking_scoring_version_check,
  add constraint touchline_card_ranking_scoring_version_check
    check (scoring_version is null or scoring_version in
      ('player_scoring_v1','player_scoring_v2','player_scoring_v3','player_scoring_v4'));

-- No DML, new grants/policies, FK/unique changes, or trigger/function changes.
-- Rollback before commit is safe; after V4 writes, never narrow back to integer
-- or remove the version without a separately reviewed data-preserving plan.
commit;
