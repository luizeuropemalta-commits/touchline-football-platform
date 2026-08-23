-- Mandatory immutable pre-image for ranking completion and publication.
-- TouchLine Development QA only. Production is deliberately outside scope.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

create schema if not exists touchline_qa_backup;
revoke all on schema touchline_qa_backup from public, anon, authenticated;
grant usage on schema touchline_qa_backup to service_role;

create table if not exists touchline_qa_backup.ranking_completion_metadata_20260823 as
select
  'ranking-completion-preimage-20260823'::text as backup_id,
  'xgxbwqxjssxxuihuwmgy'::text as project_ref,
  clock_timestamp() as created_at,
  jsonb_build_object(
    'playerFixtureStatistics', (select count(*) from public.football_player_fixture_statistics),
    'playerSeasonStatistics', (select count(*) from public.football_player_season_statistics),
    'cardRankingSnapshots', (select count(*) from public.touchline_card_ranking_snapshots),
    'cardRankingActiveSnapshots', (select count(*) from public.touchline_card_ranking_active_snapshots)
  ) as row_counts;

create table if not exists touchline_qa_backup.ranking_completion_player_fixture_20260823 as
table public.football_player_fixture_statistics;
create table if not exists touchline_qa_backup.ranking_completion_player_season_20260823 as
table public.football_player_season_statistics;
create table if not exists touchline_qa_backup.ranking_completion_card_snapshots_20260823 as
table public.touchline_card_ranking_snapshots;
create table if not exists touchline_qa_backup.ranking_completion_active_snapshot_20260823 as
table public.touchline_card_ranking_active_snapshots;

revoke all on all tables in schema touchline_qa_backup from public, anon, authenticated;
grant select on all tables in schema touchline_qa_backup to service_role;

comment on table touchline_qa_backup.ranking_completion_metadata_20260823 is
  'Immutable QA pre-image metadata for the 2026-08-23 ranking completion audit.';
comment on table touchline_qa_backup.ranking_completion_player_fixture_20260823 is
  'Immutable QA pre-image of per-player fixture scoring settlements.';
comment on table touchline_qa_backup.ranking_completion_player_season_20260823 is
  'Immutable QA pre-image of player season aggregates.';
comment on table touchline_qa_backup.ranking_completion_card_snapshots_20260823 is
  'Immutable QA pre-image of audited card ranking snapshots.';
comment on table touchline_qa_backup.ranking_completion_active_snapshot_20260823 is
  'Immutable QA pre-image of active card ranking pointers.';

commit;

-- Rollback (documented, not executed): restore the four public tables from
-- these QA pre-images only after explicit authority. Never apply to Production.
