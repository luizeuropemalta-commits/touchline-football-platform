import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_QA_EXISTING_LIVERPOOL_CARDS,
  TOUCHLINE_QA_PROJECT_REF,
  assertTouchlineQaProjectRef,
  buildTouchlineRepresentativeQaPackage,
} from "../scripts/qa/build-touchline-representative-package.mts";
import {
  renderTouchlineRepresentativeQaApplySql,
  renderTouchlineRepresentativeQaRollbackSql,
} from "../scripts/qa/render-touchline-representative-package-sql.mts";
import { renderTouchlineRepresentativeQaStageFiles } from "../scripts/qa/stage-touchline-representative-package.mts";

const base = new URL("../docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/", import.meta.url);
const roster = JSON.parse(readFileSync(new URL("roster-audits/2026-08-11T18-31-00Z/canonical-roster-export.json", base), "utf8"));
const publication = JSON.parse(readFileSync(new URL("roster-audits/2026-08-11T18-31-00Z/owner-approved-card-publication-manifest.json", base), "utf8"));
const providerSnapshot = JSON.parse(readFileSync(new URL("provider-roster-audits/2026-08-09T19-11-27-889Z/sportmonks-roster-snapshot.json", base), "utf8"));

function build() {
  return buildTouchlineRepresentativeQaPackage({ projectRef: TOUCHLINE_QA_PROJECT_REF, roster, publication, providerSnapshot });
}

test("representative package fails closed for every target except the dedicated QA project", () => {
  assert.doesNotThrow(() => assertTouchlineQaProjectRef(TOUCHLINE_QA_PROJECT_REF));
  for (const target of ["", "production", "vxireiswggllwhbsmdcj", "xgxbwqxjssxxuihuwmgx"]) {
    assert.throws(() => assertTouchlineQaProjectRef(target), /TL_QA_REPRESENTATIVE_PACKAGE_TARGET_FORBIDDEN/);
  }
});

test("representative package is deterministic and covers canonical 20-club identity plus 562 cards", () => {
  const first = build();
  const second = build();
  assert.equal(first.packageFingerprintSha256, second.packageFingerprintSha256);
  assert.equal(first.fixture.runId, second.fixture.runId);
  assert.deepEqual(first.counts, {
    competitions: 1,
    clubs: 20,
    players: 588,
    memberships: 588,
    ownerApprovedCards: 533,
    preservedLiverpoolCards: TOUCHLINE_QA_EXISTING_LIVERPOOL_CARDS,
    expectedPublishedCards: 562,
  });
  assert.equal(new Set(first.clubs.map((club) => club.providerTeamId)).size, 20);
  assert.equal(new Set(first.inventory.map((card) => card.playerId)).size, 533);
});

test("all seven approved tiers and exact tier prices are preserved without inference", () => {
  const plan = build();
  const expected = new Map([
    ["ruby-red", 0],
    ["sapphire-blue", 1],
    ["amethyst-purple", 2],
    ["radiant-gold", 4],
    ["emerald-green", 7],
    ["clear-diamond", 10],
    ["diamond-gold", 15],
  ]);
  assert.deepEqual(new Set(plan.inventory.map((card) => card.tier)), new Set(expected.keys()));
  for (const row of plan.publicationRows) assert.equal(row.canonicalNominalPriceGbp, expected.get(String(row.calculatedTier)));
});

test("positions and shirt numbers come only from exact provider team/player matches", () => {
  const plan = build();
  assert.equal(plan.players.length, 588);
  assert.equal(plan.memberships.length, 588);
  assert.ok(plan.players.every((player) => ["Goalkeeper", "Defender", "Midfielder", "Attacker"].includes(String(player.position))));
  assert.ok(plan.memberships.every((membership) => membership.jerseyNumber === null || (Number.isInteger(membership.jerseyNumber) && membership.jerseyNumber > 0)));
});

test("package is explicitly QA-only and preserves the existing Liverpool batch", () => {
  const plan = build();
  assert.equal(plan.target.environment, "qa");
  assert.equal(plan.policy.productionAllowed, false);
  assert.equal(plan.policy.syntheticOfficialFootballFactsAllowed, false);
  assert.equal(plan.policy.existingLiverpoolBatchPreserved, true);
  assert.ok(plan.publicationRows.every((row) => String(row.providerTeamId) !== "8"));
});

test("QA tracking DDL is segregated from Production migrations and blocks non-QA project refs", () => {
  const source = readFileSync(new URL("../supabase/qa/001_touchline_qa_fixture_tracking.sql", import.meta.url), "utf8");
  assert.match(source, /Do not add this file to supabase\/migrations/);
  assert.match(source, /project_ref = 'xgxbwqxjssxxuihuwmgy'/);
  assert.match(source, /TL_QA_FIXTURE_TARGET_FORBIDDEN/);
  assert.match(source, /revoke all .* from public, anon, authenticated/);
  assert.doesNotMatch(source, /vxireiswggllwhbsmdcj|SUPABASE_SERVICE_ROLE_KEY/);
});

test("generated apply is one QA-only transaction with identity, publication, inventory and final fences", () => {
  const sql = renderTouchlineRepresentativeQaApplySql(build(), "072900f3-27fc-41a5-9881-6913a486754e");
  assert.match(sql, /^-- Generated QA-only application/);
  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.match(sql, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(sql, /TL_QA_FIXTURE_LIVERPOOL_BASELINE_INVALID/);
  assert.match(sql, /touchline_apply_owner_approved_533_card_publications/);
  assert.match(sql, /touchline_publish_owner_approved_533_card_publications/);
  assert.match(sql, /touchline_qa_fixture_version/);
  assert.match(sql, /qa_fixture_run_id/);
  assert.match(sql, /publishedCards', 562/);
  assert.doesNotMatch(sql, /vxireiswggllwhbsmdcj|SUPABASE_SERVICE_ROLE_KEY|on conflict[^\n]*do update/i);
});

test("generated rollback removes only run-owned inventory and fails closed with commercial dependencies", () => {
  const sql = renderTouchlineRepresentativeQaRollbackSql(build(), "072900f3-27fc-41a5-9881-6913a486754e");
  assert.match(sql, /^-- Generated QA-only rollback/);
  assert.match(sql, /ownership = 'created_by_run'/);
  assert.match(sql, /TL_QA_FIXTURE_ROLLBACK_DEPENDENCIES_EXIST/);
  assert.match(sql, /touchline_revert_owner_approved_533_card_publications/);
  assert.doesNotMatch(sql, /delete from public\.football_(clubs|players|squad_members)/);
  assert.doesNotMatch(sql, /vxireiswggllwhbsmdcj|SUPABASE_SERVICE_ROLE_KEY/);
});

test("SQL renderer refuses non-QA plans and malformed actor IDs", () => {
  const plan = build();
  assert.throws(() => renderTouchlineRepresentativeQaApplySql({ ...plan, target: { ...plan.target, projectRef: "vxireiswggllwhbsmdcj" } }, "072900f3-27fc-41a5-9881-6913a486754e"), /TARGET_FORBIDDEN/);
  assert.throws(() => renderTouchlineRepresentativeQaApplySql(plan, "not-a-user"), /TL_QA_SQL_ACTOR_INVALID/);
});

test("staged package keeps every connector payload bounded and applies only after all chunks", () => {
  const files = renderTouchlineRepresentativeQaStageFiles(build(), "072900f3-27fc-41a5-9881-6913a486754e", 50);
  const stage = files.filter((file) => /^\d{3}-(clubs|players|memberships|publication_rows|inventory)-/.test(file.name));
  assert.ok(stage.length > 20);
  assert.ok(stage.every((file) => Buffer.byteLength(file.sql) < 150_000));
  assert.equal(files.at(-2)?.name, "900-apply.sql");
  assert.equal(files.at(-1)?.name, "999-rollback.sql");
  assert.ok(stage.every((file) => file.sql.includes("touchline_stage_representative_qa_chunk")));
  assert.ok(stage.every((file) => file.sql.includes(TOUCHLINE_QA_PROJECT_REF)));
  assert.ok(files.every((file) => !file.sql.includes("vxireiswggllwhbsmdcj")));
});

test("QA representative package DDL is service-role only and not a Production migration", () => {
  const source = readFileSync(new URL("../supabase/qa/002_touchline_qa_representative_package.sql", import.meta.url), "utf8");
  assert.match(source, /Never add this file to supabase\/migrations/);
  assert.match(source, /touchline_stage_representative_qa_chunk/);
  assert.match(source, /touchline_apply_representative_qa_package/);
  assert.match(source, /touchline_rollback_representative_qa_package/);
  assert.match(source, /TL_QA_FIXTURE_ROLLBACK_DEPENDENCIES_EXIST/);
  assert.match(source, /revoke all .* from public, anon, authenticated/);
  assert.doesNotMatch(source, /vxireiswggllwhbsmdcj|SUPABASE_SERVICE_ROLE_KEY/);
});

test("QA owner scenario uses official zero-TC checkout and exact 35-player broad composition", () => {
  const source = readFileSync(new URL("../supabase/qa/003_touchline_qa_owner_scenario.sql", import.meta.url), "utf8");
  assert.match(source, /Never add this file to supabase\/migrations/);
  assert.match(source, /touchline_assert_qa_fixture_target\(p_project_ref\)/);
  assert.match(source, /checkout_touchline_market_cart/);
  assert.match(source, /competition_tier = 'ruby-red'/);
  assert.match(source, /'Goalkeeper', 3/);
  assert.match(source, /'Defender', 10/);
  assert.match(source, /'Midfielder', 11/);
  assert.match(source, /'Attacker', 11/);
  assert.match(source, /'startingEleven', 11/);
  assert.match(source, /'matchdayBench', 9/);
  assert.match(source, /'outsideMatchday', 15/);
  assert.match(source, /officialPositionMutation', false/);
  assert.match(source, /classificationAuthority', 'canonical_broad_position_plus_qa_tactical_slot'/);
  assert.doesNotMatch(source, /insert into auth\.users|update auth\.users|football_players[\s\S]{0,80}set position/i);
  assert.doesNotMatch(source, /vxireiswggllwhbsmdcj|SUPABASE_SERVICE_ROLE_KEY/);
});

test("QA owner scenario is idempotent, restores prior profile state and has no financial grant", () => {
  const source = readFileSync(new URL("../supabase/qa/003_touchline_qa_owner_scenario.sql", import.meta.url), "utf8");
  assert.match(source, /idempotentReplay', true/);
  assert.match(source, /release_touchline_card_contract/);
  assert.match(source, /prior_avatar_url/);
  assert.match(source, /prior_arena_state/);
  assert.match(source, /avatar_url = v_scenario\.prior_avatar_url/);
  assert.match(source, /status = 'reversed'/);
  assert.doesNotMatch(source, /claim_touchline_beta_welcome_grant|entry_type[\s\S]{0,60}admin_grant|insert into public\.clubowner_credit_ledger/i);
  assert.match(source, /revoke all .* from public, anon, authenticated/);
});

test("QA Match Centre scenario is reversible, representative and never a Production migration", () => {
  const source = readFileSync(new URL("../supabase/qa/004_touchline_qa_matchday_fixtures.sql", import.meta.url), "utf8");
  assert.match(source, /Never add this file to supabase\/migrations/);
  assert.match(source, /touchline_assert_qa_fixture_target\(p_project_ref\)/);
  assert.match(source, /TL_QA_MATCHDAY_EXACT_20_CLUBS_REQUIRED/);
  assert.match(source, /'Scheduled'[\s\S]*?'2nd Half'[\s\S]*?'Finished'[\s\S]*?'Postponed'[\s\S]*?'Cancelled'/);
  assert.match(source, /partialScoreFixtures', 1/);
  assert.match(source, /staleSnapshot', true/);
  assert.match(source, /synthetic_qa_only_not_official_football_fact/);
  assert.match(source, /productionAllowed', false/);
  assert.match(source, /prior_snapshot_payload/);
  assert.match(source, /touchline_rollback_qa_matchday_scenario/);
  assert.match(source, /revoke all .* from public, anon, authenticated/);
  assert.doesNotMatch(source, /vxireiswggllwhbsmdcj|SUPABASE_SERVICE_ROLE_KEY/);
});

test("QA Match Centre scenario preserves public snapshot shape and does not fabricate a verified venue", () => {
  const source = readFileSync(new URL("../supabase/qa/004_touchline_qa_matchday_fixtures.sql", import.meta.url), "utf8");
  for (const field of ["fixtures", "fetchedAt", "storedAt", "providerId", "homeTeam", "awayTeam", "source"]) {
    assert.match(source, new RegExp(`'${field}'`));
  }
  assert.match(source, /venueVerifiedScenarioAvailable', false/);
  assert.match(source, /public_fixture_contract_has_no_verified_venue_field/);
  assert.doesNotMatch(source, /'venue'\s*,\s*'[^']+'/);
});

test("QA tactical overlay covers the exact 35-player quotas without changing official positions", () => {
  const source = readFileSync(new URL("../supabase/qa/005_touchline_qa_tactical_slots.sql", import.meta.url), "utf8");
  assert.match(source, /Never add this file to supabase\/migrations/);
  assert.match(source, /touchline_assert_qa_fixture_target\(p_project_ref\)/);
  for (const [bucket, count] of [["GK", 3], ["CB", 6], ["RB", 2], ["LB", 2], ["CDM", 5], ["MID", 6], ["ATT", 6], ["ST", 5]] as const) {
    assert.match(source, new RegExp(`'${bucket}', ${count}`));
  }
  assert.match(source, /qa_only_tactical_slot_for_visual_and_rule_coverage/);
  assert.match(source, /officialFootballFact', false/);
  assert.match(source, /canonicalBroadPositionPreserved', true/);
  assert.match(source, /productionAllowed', false/);
  assert.match(source, /touchline_rollback_qa_owner_tactical_slots/);
  assert.doesNotMatch(source, /update public\.football_players|insert into public\.football_players|vxireiswggllwhbsmdcj|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(source, /revoke all .* from public, anon, authenticated/);
});

test("QA coverage catalogue is versioned, reversible and contains no canonical data mutation", () => {
  const source = readFileSync(new URL("../supabase/qa/006_touchline_qa_coverage_catalog.sql", import.meta.url), "utf8");
  assert.match(source, /Never add this file to supabase\/migrations/);
  assert.match(source, /touchline_assert_qa_fixture_target\(p_project_ref\)/);
  assert.match(source, /2026-08-15-representative-v1/);
  assert.match(source, /TL_QA_COVERAGE_EXACT_27_REQUIRED/);
  assert.match(source, /touchline_rollback_qa_coverage_catalog/);
  assert.match(source, /productionAllowed', false/);
  assert.doesNotMatch(source, /insert into public\.(football_|touchline_card_|touchline_market_|users)|vxireiswggllwhbsmdcj|SUPABASE_SERVICE_ROLE_KEY/i);
});
