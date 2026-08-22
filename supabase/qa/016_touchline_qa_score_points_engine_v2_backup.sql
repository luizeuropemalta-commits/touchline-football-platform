-- Mandatory immutable pre-image for player_scoring_v2 / coach_scoring_v2.
-- TouchLine Development QA only. Production is deliberately outside scope.

begin;
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

create schema if not exists touchline_qa_backup;
revoke all on schema touchline_qa_backup from public;
grant usage on schema touchline_qa_backup to service_role;

create table if not exists touchline_qa_backup.score_v2_metadata_20260822 as
select
  'score-points-v2-preimage-20260822'::text as backup_id,
  'xgxbwqxjssxxuihuwmgy'::text as project_ref,
  clock_timestamp() as created_at,
  jsonb_build_object(
    'playerFixtureStatistics', (select count(*) from public.football_player_fixture_statistics),
    'playerSeasonStatistics', (select count(*) from public.football_player_season_statistics),
    'coachContracts', (select count(*) from public.touchline_coach_contracts),
    'coachFixturePoints', (select count(*) from public.touchline_coach_fixture_points),
    'cardRankingSnapshots', (select count(*) from public.touchline_card_ranking_snapshots),
    'cardRankingActiveSnapshots', (select count(*) from public.touchline_card_ranking_active_snapshots),
    'arenaStates', (select count(*) from public.touchline_user_arena_state),
    'cardContracts', (select count(*) from public.touchline_card_contracts),
    'cardInventory', (select count(*) from public.touchline_card_inventory)
  ) as row_counts;

create table if not exists touchline_qa_backup.score_v2_player_fixture_20260822 as
table public.football_player_fixture_statistics;
create table if not exists touchline_qa_backup.score_v2_player_season_20260822 as
table public.football_player_season_statistics;
create table if not exists touchline_qa_backup.score_v2_coach_contracts_20260822 as
table public.touchline_coach_contracts;
create table if not exists touchline_qa_backup.score_v2_coach_points_20260822 as
table public.touchline_coach_fixture_points;
create table if not exists touchline_qa_backup.score_v2_card_ranking_20260822 as
table public.touchline_card_ranking_snapshots;
create table if not exists touchline_qa_backup.score_v2_card_ranking_active_20260822 as
table public.touchline_card_ranking_active_snapshots;
create table if not exists touchline_qa_backup.score_v2_arena_state_20260822 as
table public.touchline_user_arena_state;
create table if not exists touchline_qa_backup.score_v2_card_contracts_20260822 as
table public.touchline_card_contracts;
create table if not exists touchline_qa_backup.score_v2_card_inventory_20260822 as
table public.touchline_card_inventory;

revoke all on all tables in schema touchline_qa_backup from public, anon, authenticated;
grant select on all tables in schema touchline_qa_backup to service_role;

comment on schema touchline_qa_backup is
  'QA-only immutable operational pre-images. Browser roles have no schema or table privileges.';

commit;
