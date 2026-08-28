import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/qa/017_touchline_qa_score_points_engine_v2.sql", import.meta.url), "utf8");
const cardRankingAclMigration = await readFile(new URL("../supabase/qa/018_touchline_qa_score_points_engine_v2_card_ranking_acl.sql", import.meta.url), "utf8");
const coachStatusGateMigration = await readFile(new URL("../supabase/qa/019_touchline_qa_score_points_engine_v2_coach_status_gate.sql", import.meta.url), "utf8");
const coachRankingIdentityMigration = await readFile(new URL("../supabase/qa/020_touchline_qa_score_points_engine_v2_coach_ranking_identity.sql", import.meta.url), "utf8");
const coachFinalStatusMigration = await readFile(new URL("../supabase/qa/021_touchline_qa_score_points_engine_v2_final_status_normalization.sql", import.meta.url), "utf8");
const rankingBackupMigration = await readFile(new URL("../supabase/qa/022_touchline_qa_ranking_completion_backup.sql", import.meta.url), "utf8");
const rankingCompletionMigration = await readFile(new URL("../supabase/qa/023_touchline_qa_ranking_completion.sql", import.meta.url), "utf8");
const rankingNullSafetyMigration = await readFile(new URL("../supabase/qa/024_touchline_qa_ranking_publication_null_safety.sql", import.meta.url), "utf8");
const rankingFixtureSetMigration = await readFile(new URL("../supabase/qa/025_touchline_qa_ranking_fixture_set_integrity.sql", import.meta.url), "utf8");
const rankingFixtureCanonicalizationMigration = await readFile(new URL("../supabase/qa/026_touchline_qa_ranking_fixture_id_canonicalization.sql", import.meta.url), "utf8");
const rankingFixtureAsciiMigration = await readFile(new URL("../supabase/qa/027_touchline_qa_ranking_fixture_id_ascii_contract.sql", import.meta.url), "utf8");
const coachCanonicalOutcomesMigration = await readFile(new URL("../supabase/qa/028_touchline_qa_coach_scoring_v2_canonical_outcomes.sql", import.meta.url), "utf8");
const coachProvisionalBackfillMigration = await readFile(new URL("../supabase/qa/029_touchline_qa_coach_scoring_v2_provisional_backfill.sql", import.meta.url), "utf8");
const coachRankingBackfillPublishMigration = await readFile(new URL("../supabase/qa/030_touchline_qa_coach_ranking_provisional_backfill_publish.sql", import.meta.url), "utf8");
const competitionCoachRankingMigration = await readFile(new URL("../supabase/qa/034_touchline_qa_competition_coach_ranking_v2.sql", import.meta.url), "utf8");
const competitionCoachRankingCompatibilityMigration = await readFile(new URL("../supabase/qa/035_touchline_qa_competition_coach_ranking_deploy_compatibility.sql", import.meta.url), "utf8");
const competitionCoachProfileRecordsMigration = await readFile(new URL("../supabase/qa/036_touchline_qa_competition_coach_profile_records.sql", import.meta.url), "utf8");

test("V2 migration is pinned to QA and preserves versioned V1 history", () => {
  assert.match(migration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/i);
  assert.match(migration, /scoring_version in \('coach_scoring_v1','coach_scoring_v2'\)/i);
  assert.match(migration, /unique \(contract_id, fixture_id, scoring_version\)/i);
  assert.match(migration, /Existing v1 rows remain immutable history/i);
  assert.match(migration, /touchline_hire_coach_contract[\s\S]*'active','coach_scoring_v2'/i);
  assert.match(migration, /alter column scoring_version set default 'coach_scoring_v2'/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.touchline_coach_fixture_points/i);
});

test("V2 coach reconciliation applies every approved home and away result", () => {
  for (const rule of [
    /v_context='home' and v_outcome='win' then 3/i,
    /v_context='home' and v_outcome='draw' then 1/i,
    /v_context='home' then -2/i,
    /v_outcome='win' then 6/i,
    /v_outcome='draw' then 3 else -1/i,
  ]) assert.match(migration, rule);
  assert.match(migration, /full time/i);
  assert.match(migration, /fixture\.starts_at >= contract\.started_at/i);
  assert.match(migration, /fixture\.starts_at < contract\.ended_at/i);
});

test("canonical coach outcomes remove negative loss scoring while preserving final immutability", () => {
  assert.match(coachCanonicalOutcomesMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/i);
  assert.match(coachCanonicalOutcomesMigration, /v_context = 'home' and v_outcome = 'win' then 3/i);
  assert.match(coachCanonicalOutcomesMigration, /v_context = 'home' and v_outcome = 'draw' then 1/i);
  assert.match(coachCanonicalOutcomesMigration, /v_context = 'home' then 0/i);
  assert.match(coachCanonicalOutcomesMigration, /v_outcome = 'win' then 4/i);
  assert.match(coachCanonicalOutcomesMigration, /v_outcome = 'draw' then 2/i);
  assert.match(coachCanonicalOutcomesMigration, /else 0/i);
  assert.match(coachCanonicalOutcomesMigration, /settlement_status <> 'final'/i);
});

test("canonical coach backfill touches only mutable V2 settlements", () => {
  assert.match(coachProvisionalBackfillMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/i);
  assert.match(coachProvisionalBackfillMigration, /points\.scoring_version = 'coach_scoring_v2'/i);
  assert.match(coachProvisionalBackfillMigration, /points\.settlement_status = 'provisional'/i);
  assert.match(coachProvisionalBackfillMigration, /public\.touchline_is_scoreable_fixture_status\(fixture\.status\)/i);
  assert.doesNotMatch(coachProvisionalBackfillMigration, /delete\s+from/i);
});

test("canonical coach backfill publishes a replacement active ranking snapshot", () => {
  assert.match(coachRankingBackfillPublishMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/i);
  assert.match(coachRankingBackfillPublishMigration, /touchline_coach_ranking_snapshots/i);
  assert.match(coachRankingBackfillPublishMigration, /touchline_coach_ranking_active_snapshots/i);
  assert.match(coachRankingBackfillPublishMigration, /on conflict \(league_key\) do update/i);
  assert.match(coachRankingBackfillPublishMigration, /coach_scoring_v2/i);
});

test("V2 ranking snapshots are server-only, versioned and season scoped", () => {
  assert.match(migration, /create table if not exists public\.touchline_coach_ranking_snapshots/i);
  assert.match(migration, /scoring_version text not null check \(scoring_version = 'coach_scoring_v2'\)/i);
  assert.match(migration, /fixture_ids jsonb not null/i);
  assert.match(migration, /filter \(where fixture\.season_id=v_season_id\)/i);
  assert.match(migration, /order by touchline_points desc, wins desc, away_wins desc, coach_provider_id/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke all privileges on table public\.touchline_coach_ranking_snapshots from public, anon, authenticated/i);
  assert.match(migration, /revoke execute on function public\.touchline_rebuild_coach_ranking_v2\(\) from public, anon, authenticated/i);
});

test("player settlements and card rankings carry explicit V2 traceability", () => {
  assert.match(migration, /missing_scoring_facts jsonb not null default '\[\]'::jsonb/i);
  assert.match(migration, /scoring_coverage_status/i);
  assert.match(migration, /position_group/i);
  assert.match(migration, /alter table public\.touchline_card_ranking_snapshots[\s\S]*scoring_version text[\s\S]*fixture_ids jsonb/i);
});

test("card ranking snapshots are service-only even when legacy grants existed", () => {
  assert.match(cardRankingAclMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(cardRankingAclMigration, /touchline_card_ranking_snapshots force row level security/i);
  assert.match(cardRankingAclMigration, /touchline_card_ranking_active_snapshots force row level security/i);
  assert.match(cardRankingAclMigration, /revoke all privileges on table public\.touchline_card_ranking_snapshots[\s\S]*from public, anon, authenticated/i);
  assert.match(cardRankingAclMigration, /revoke all privileges on table public\.touchline_card_ranking_active_snapshots[\s\S]*from public, anon, authenticated/i);
  assert.match(cardRankingAclMigration, /grant select, insert on table public\.touchline_card_ranking_snapshots[\s\S]*to service_role/i);
  assert.match(cardRankingAclMigration, /grant select, insert, update on table public\.touchline_card_ranking_active_snapshots[\s\S]*to service_role/i);
});

test("coach V2 excludes scheduled fixtures even when a score was prefilled", () => {
  assert.match(coachStatusGateMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(coachStatusGateMigration, /touchline_is_scoreable_fixture_status\(fixture\.status\)/);
  assert.match(coachStatusGateMigration, /'live'[\s\S]*'in play'[\s\S]*'full time'/);
  assert.doesNotMatch(coachStatusGateMigration, /'not started'|'scheduled'|'ns'/i);
  assert.match(coachStatusGateMigration, /revoke all on function public\.touchline_is_scoreable_fixture_status\(text\)[\s\S]*from public, anon, authenticated/i);
});

test("coach V2 normalizes every accepted final status before locking settlement", () => {
  assert.match(coachFinalStatusMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(coachFinalStatusMigration, /regexp_replace\(lower\(trim\(coalesce\(p_status, ''\)\)\), '\[_-\]\+'/i);
  assert.match(coachFinalStatusMigration, /'full time'[\s\S]*'penalties finished'/i);
  assert.match(coachFinalStatusMigration, /touchline_is_final_fixture_status\(v_record\.status\) then 'final'/i);
  assert.match(coachFinalStatusMigration, /revoke all on function public\.touchline_is_final_fixture_status\(text\)[\s\S]*from public, anon, authenticated/i);
});

test("coach ranking deduplicates customer contracts by canonical coach and fixture", () => {
  assert.match(coachRankingIdentityMigration, /group by contract\.coach_provider_id, contract\.club_id, points\.fixture_id/i);
  assert.match(coachRankingIdentityMigration, /TL_COACH_RANKING_POINT_CONFLICT/);
  assert.match(coachRankingIdentityMigration, /TL_COACH_RANKING_CLUB_CONFLICT/);
  assert.doesNotMatch(coachRankingIdentityMigration, /'contractId'/);
  assert.match(coachRankingIdentityMigration, /group by coach\.coach_provider_id, coach\.club_id, coach\.club_name/i);
});

test("coach ranking v2 covers every canonical competition coach instead of customer contracts only", () => {
  assert.match(competitionCoachRankingMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/i);
  assert.match(competitionCoachRankingMigration, /jsonb_to_recordset\(p_competition_coaches\)/i);
  assert.match(competitionCoachRankingMigration, /TL_COACH_ASSIGNMENTS_INCOMPLETE/i);
  assert.match(competitionCoachRankingMigration, /fixture\.home_club_id = assignment\.club_id[\s\S]*fixture\.away_club_id = assignment\.club_id/i);
  assert.match(competitionCoachRankingMigration, /touchline_is_scoreable_fixture_status\(fixture\.status\)/i);
  assert.match(competitionCoachRankingMigration, /order by touchline_points desc, wins desc, away_wins desc, coach_provider_id/i);
  assert.match(competitionCoachRankingMigration, /touchline_rebuild_coach_ranking_v2\(p_competition_coaches\)/i);
  assert.match(competitionCoachRankingMigration, /revoke execute on function public\.touchline_reconcile_coach_fixture_points\(uuid, jsonb\)[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(competitionCoachRankingMigration, /insert into public\.touchline_coach_contracts/i);
});

test("coach ranking deploy transition preserves the active snapshot for legacy callers", () => {
  assert.match(competitionCoachRankingCompatibilityMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/i);
  assert.match(competitionCoachRankingCompatibilityMigration, /jsonb_array_length\(coalesce\(p_competition_coaches, '\[\]'::jsonb\)\) = 0/i);
  assert.match(competitionCoachRankingCompatibilityMigration, /competition-coaches-unavailable/i);
  assert.match(competitionCoachRankingCompatibilityMigration, /preservedActiveSnapshot/i);
  assert.match(competitionCoachRankingCompatibilityMigration, /touchline_rebuild_coach_ranking_v2\(p_competition_coaches\)/i);
  assert.match(competitionCoachRankingCompatibilityMigration, /revoke execute on function public\.touchline_reconcile_coach_fixture_points\(uuid, jsonb\)[\s\S]*from public, anon, authenticated/i);
});

test("coach ranking snapshot publishes the same Home and Away records consumed by every public coach surface", () => {
  assert.match(competitionCoachProfileRecordsMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/i);
  assert.match(competitionCoachProfileRecordsMigration, /create or replace function public\.touchline_rebuild_coach_ranking_v2/i);
  assert.match(competitionCoachProfileRecordsMigration, /'home', jsonb_build_object\([\s\S]*?'wins', home_wins[\s\S]*?'touchlinePoints', home_points/i);
  assert.match(competitionCoachProfileRecordsMigration, /'away', jsonb_build_object\([\s\S]*?'wins', away_wins[\s\S]*?'touchlinePoints', away_points/i);
  assert.match(competitionCoachProfileRecordsMigration, /home_points[\s\S]*?away_points/i);
  assert.match(competitionCoachProfileRecordsMigration, /order by touchline_points desc, wins desc, away_wins desc, coach_provider_id/i);
  assert.match(competitionCoachProfileRecordsMigration, /revoke execute on function public\.touchline_rebuild_coach_ranking_v2\(jsonb\)[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(competitionCoachProfileRecordsMigration, /touchline_coach_contracts|insert into public\.football_fixtures/i);
});

test("ranking completion takes a QA-only server-private backup before mutation", () => {
  assert.match(rankingBackupMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(rankingBackupMigration, /ranking_completion_player_fixture_20260823/i);
  assert.match(rankingBackupMigration, /ranking_completion_player_season_20260823/i);
  assert.match(rankingBackupMigration, /ranking_completion_card_snapshots_20260823/i);
  assert.match(rankingBackupMigration, /ranking_completion_active_snapshot_20260823/i);
  assert.match(rankingBackupMigration, /revoke all on all tables in schema touchline_qa_backup from public, anon, authenticated/i);
});

test("ranking publication is blocked unless fixture coverage and point totals are auditable", () => {
  assert.match(rankingCompletionMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(rankingCompletionMigration, /complete_for_scoring/i);
  assert.match(rankingCompletionMigration, /ranking_coverage_status/i);
  assert.match(rankingCompletionMigration, /candidate\.fixture_ids <> candidate\.expected_fixture_ids/i);
  assert.match(rankingCompletionMigration, /calculated_total_score_points <> candidate\.total_score_points/i);
  assert.match(rankingCompletionMigration, /candidate\.actual_player_count <> jsonb_array_length\(candidate\.ranking_payload -> 'players'\)/i);
  assert.match(rankingCompletionMigration, /auth\.jwt\(\) ->> 'role'[\s\S]*service_role/i);
  assert.match(rankingCompletionMigration, /revoke all on function public\.publish_touchline_card_ranking_snapshot\(text, text, timestamptz\) from public, anon, authenticated/i);
  assert.match(rankingCompletionMigration, /never converts absent facts to zero/i);
  assert.match(rankingNullSafetyMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(rankingNullSafetyMigration, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(rankingNullSafetyMigration, /jsonb_typeof\(candidate\.ranking_payload -> 'players'\) is distinct from 'array'/i);
  assert.match(rankingNullSafetyMigration, /jsonb_typeof\(candidate\.selection_payload -> 'players'\) is distinct from 'array'/i);
  assert.match(rankingNullSafetyMigration, /candidate\.actual_player_count is distinct from candidate\.expected_player_count/i);
  assert.match(rankingNullSafetyMigration, /sourceSnapshotId' is distinct from candidate\.snapshot_id/i);
  assert.match(rankingNullSafetyMigration, /requested_published_at is null/i);
  assert.match(rankingNullSafetyMigration, /revoke all on function public\.publish_touchline_card_ranking_snapshot[\s\S]*?from public, anon, authenticated/i);
  assert.match(rankingNullSafetyMigration, /grant execute on function public\.publish_touchline_card_ranking_snapshot[\s\S]*?to service_role/i);
});

test("ranking fixture evidence is a non-empty duplicate-free string set", () => {
  assert.match(rankingFixtureSetMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(rankingFixtureSetMigration, /jsonb_typeof\(candidate\) is distinct from 'array'/i);
  assert.match(rankingFixtureSetMigration, /jsonb_array_length\(candidate\) = 0/i);
  assert.match(rankingFixtureSetMigration, /jsonb_typeof\(element\.value\) is distinct from 'string'/i);
  assert.match(rankingFixtureSetMigration, /btrim\(fixture\.value\) = ''/i);
  assert.match(rankingFixtureSetMigration, /count\(distinct fixture\.value\)/i);
  assert.match(rankingFixtureSetMigration, /touchline_card_ranking_fixture_ids_set_check/i);
  assert.match(rankingFixtureSetMigration, /touchline_card_ranking_expected_fixture_ids_set_check/i);
  assert.match(rankingFixtureSetMigration, /revoke all on function public\.touchline_ranking_fixture_id_set_is_valid\(jsonb\)[\s\S]*from public, anon, authenticated/i);
  assert.match(rankingFixtureSetMigration, /grant execute on function public\.touchline_ranking_fixture_id_set_is_valid\(jsonb\)[\s\S]*to service_role/i);
  assert.match(rankingFixtureCanonicalizationMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(rankingFixtureCanonicalizationMigration, /fixture\.value is distinct from btrim\(fixture\.value\)/i);
  assert.match(rankingFixtureCanonicalizationMigration, /count\(distinct btrim\(fixture\.value\)\)/i);
  assert.match(rankingFixtureCanonicalizationMigration, /revoke all on function public\.touchline_ranking_fixture_id_set_is_valid\(jsonb\)[\s\S]*from public, anon, authenticated/i);
  assert.match(rankingFixtureCanonicalizationMigration, /grant execute on function public\.touchline_ranking_fixture_id_set_is_valid\(jsonb\)[\s\S]*to service_role/i);
  assert.match(rankingFixtureAsciiMigration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(rankingFixtureAsciiMigration, /fixture\.value !~ '\^\[A-Za-z0-9_-\]\+\$'/i);
  assert.match(rankingFixtureAsciiMigration, /count\(distinct fixture\.value\)/i);
  assert.match(rankingFixtureAsciiMigration, /revoke all on function public\.touchline_ranking_fixture_id_set_is_valid\(jsonb\)[\s\S]*from public, anon, authenticated/i);
  assert.match(rankingFixtureAsciiMigration, /grant execute on function public\.touchline_ranking_fixture_id_set_is_valid\(jsonb\)[\s\S]*to service_role/i);
});
