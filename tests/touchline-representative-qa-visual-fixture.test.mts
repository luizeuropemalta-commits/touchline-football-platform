import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/visual-qa/representative-package/page.tsx", import.meta.url), "utf8");
const fixtures = readFileSync(new URL("../lib/touchlineArena/qa-representative-fixtures.ts", import.meta.url), "utf8");
const coverage = readFileSync(new URL("../supabase/qa/006_touchline_qa_coverage_catalog.sql", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

test("representative visual package is admin-gated and explicitly non-production", () => {
  assert.match(proxy, /adminOnlyArenaPaths = \[[\s\S]*?"\/visual-qa"/);
  assert.match(page, /data-representative-qa-package="static"/);
  assert.match(page, /data-production-allowed="false"/);
  assert.match(page, /ADMIN-GATED · QA FIXTURE · NOT PRODUCTION DATA/);
  assert.match(fixtures, /officialFootballFact: false/);
  assert.match(fixtures, /productionAllowed: false/);
});
test("fixture covers full compact zoom long/short names missing-image fallback and active-contract authority", () => {
  for (const token of [
    'data-qa-card-case="published-long-name-missing-image"',
    'data-qa-card-case="published-short-name-compact"',
    'data-qa-card-case="active-contract-authority"',
    'name: "Alexandre Representative-Santos"',
    'name: "Kai"',
    'avatarImageUrl: "/touchlineArena/qa-fixtures/missing-player-image.webp"',
    'activeContractCard: { tierKey: "emerald-green", cardPrice: "£7.00" }',
    "<TouchlineCardZoom",
    "optimizeForLiveCompact={compact}",
  ]) assert.ok(page.includes(token), `missing representative token: ${token}`);
});

test("synthetic coach is presentation-only and cannot enter the canonical coach registry", () => {
  assert.match(page, /data-qa-card-case="synthetic-coach"/);
  assert.match(page, /layoutOverride=\{TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT\}/);
  assert.match(page, /enableInteractiveNeon=\{false\}/);
  assert.match(fixtures, /qa-fixture:coach:representative/);
  assert.match(fixtures, /QA Fixture Coach/);
  assert.doesNotMatch(fixtures, /export const TOUCHLINE_LIVE_COACHES|retailPrice|externalUrl/);
});

test("all ten product UI states are represented without data access", () => {
  for (const state of ["loading", "empty", "success", "error", "unavailable", "pending", "stale", "unauthorized", "forbidden", "not-found"]) {
    assert.match(fixtures, new RegExp(`"${state}"`));
  }
  for (const forbidden of [/\bfetch\s*\(/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bcreateClient\b/, /\bcreateAdminClient\b/]) {
    assert.doesNotMatch(page, forbidden);
  }
});

test("coverage catalogue is QA-only reversible service-role metadata with exact 27 rows", () => {
  assert.match(coverage, /Never add this file to supabase\/migrations/);
  assert.match(coverage, /touchline_assert_qa_fixture_target\(p_project_ref\)/);
  assert.match(coverage, /TL_QA_COVERAGE_EXACT_27_REQUIRED/);
  assert.match(coverage, /touchline_rollback_qa_coverage_catalog/);
  assert.match(coverage, /revoke all .* from public, anon, authenticated/);
  assert.doesNotMatch(coverage, /insert into public\.(football_|touchline_card_|touchline_market_|users)|update public\.(football_|touchline_card_|touchline_user_)/i);
  assert.doesNotMatch(coverage, /vxireiswggllwhbsmdcj|SUPABASE_SERVICE_ROLE_KEY/);
});
