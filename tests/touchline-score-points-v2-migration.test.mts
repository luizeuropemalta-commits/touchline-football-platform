import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/qa/017_touchline_qa_score_points_engine_v2.sql", import.meta.url), "utf8");
const cardRankingAclMigration = await readFile(new URL("../supabase/qa/018_touchline_qa_score_points_engine_v2_card_ranking_acl.sql", import.meta.url), "utf8");
const coachStatusGateMigration = await readFile(new URL("../supabase/qa/019_touchline_qa_score_points_engine_v2_coach_status_gate.sql", import.meta.url), "utf8");
const coachRankingIdentityMigration = await readFile(new URL("../supabase/qa/020_touchline_qa_score_points_engine_v2_coach_ranking_identity.sql", import.meta.url), "utf8");
const coachFinalStatusMigration = await readFile(new URL("../supabase/qa/021_touchline_qa_score_points_engine_v2_final_status_normalization.sql", import.meta.url), "utf8");

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
