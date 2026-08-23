import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TOUCHLINE_COACH_SCORING_VERSION,
  touchlineCoachContractCoversFixture,
  touchlineCoachOutcome,
  touchlineCoachPoints,
} from "../lib/touchlineArena/coach-scoring.ts";

const migration = await readFile(
  new URL("../supabase/qa/013_touchline_qa_coach_contract_scoring.sql", import.meta.url),
  "utf8",
);
const route = await readFile(
  new URL("../app/api/touchline-arena/coach/route.ts", import.meta.url),
  "utf8",
);
const arena = await readFile(
  new URL("../app/arena/ArenaClient.tsx", import.meta.url),
  "utf8",
);
const coachCard = await readFile(
  new URL("../components/touchline/cards/TouchlineCoachCard.tsx", import.meta.url),
  "utf8",
);
const coachProfile = await readFile(
  new URL("../app/touchline-coaches/[coach]/page.tsx", import.meta.url),
  "utf8",
);
const coachPerformance = await readFile(
  new URL("../components/touchline/cards/TouchlineCoachPerformance.tsx", import.meta.url),
  "utf8",
);
const coachZoom = await readFile(
  new URL("../components/touchline/cards/TouchlineCoachCardZoom.tsx", import.meta.url),
  "utf8",
);
const clubCoachPanel = await readFile(
  new URL("../components/touchline/ClubHubCanonicalCoachPanel.tsx", import.meta.url),
  "utf8",
);
const clubProfile = await readFile(
  new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url),
  "utf8",
);
const fixtureStore = await readFile(
  new URL("../lib/football-data/fixture-schedule-store.ts", import.meta.url),
  "utf8",
);
const contractReader = await readFile(
  new URL("../lib/touchlineArena/coach-contracts-server.ts", import.meta.url),
  "utf8",
);

test("coach_scoring_v2 preserves the approved home and away values", () => {
  assert.equal(TOUCHLINE_COACH_SCORING_VERSION, "coach_scoring_v2");
  assert.equal(touchlineCoachPoints("home", "win"), 3);
  assert.equal(touchlineCoachPoints("home", "draw"), 1);
  assert.equal(touchlineCoachPoints("home", "loss"), 0);
  assert.equal(touchlineCoachPoints("away", "win"), 4);
  assert.equal(touchlineCoachPoints("away", "draw"), 2);
  assert.equal(touchlineCoachPoints("away", "loss"), 0);
});

test("fixture outcome is evaluated from the contracted club context", () => {
  assert.equal(touchlineCoachOutcome("home", 2, 1), "win");
  assert.equal(touchlineCoachOutcome("away", 2, 1), "loss");
  assert.equal(touchlineCoachOutcome("away", 0, 1), "win");
  assert.equal(touchlineCoachOutcome("home", 1, 1), "draw");
});

test("a replacement coach never receives retroactive or post-cancellation points", () => {
  const contract = {
    startedAt: "2026-08-22T12:00:00.000Z",
    endedAt: "2026-08-30T12:00:00.000Z",
  };
  assert.equal(touchlineCoachContractCoversFixture(contract, "2026-08-22T11:59:59.999Z"), false);
  assert.equal(touchlineCoachContractCoversFixture(contract, "2026-08-22T12:00:00.000Z"), true);
  assert.equal(touchlineCoachContractCoversFixture(contract, "2026-08-30T11:59:59.999Z"), true);
  assert.equal(touchlineCoachContractCoversFixture(contract, "2026-08-30T12:00:00.000Z"), false);
});

test("migration enforces one active coach, server-only writes and immutable history", () => {
  assert.match(migration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/i);
  assert.match(migration, /touchline_qa_coach_contract_before/i);
  assert.match(migration, /on conflict \(user_id\) do nothing/i);
  assert.match(migration, /create unique index if not exists touchline_coach_contracts_one_active_owner_idx[\s\S]*where status = 'active'/i);
  assert.match(migration, /alter table public\.touchline_coach_contracts force row level security/i);
  assert.match(migration, /revoke all privileges on table public\.touchline_coach_contracts from public, anon, authenticated/i);
  assert.match(migration, /revoke execute on function public\.touchline_hire_coach_contract[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /revoke execute on function public\.touchline_end_coach_contract[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /TL_COACH_HISTORY_IMMUTABLE/i);
  assert.match(migration, /set search_path = ''/i);
});

test("reconciliation is idempotent, locks final points and uses contract time bounds", () => {
  assert.match(migration, /unique \(contract_id, fixture_id\)/i);
  assert.match(migration, /on conflict \(contract_id, fixture_id\) do update/i);
  assert.match(migration, /where touchline_coach_fixture_points\.settlement_status <> 'final'/i);
  assert.match(migration, /fixture\.starts_at >= contract\.started_at/i);
  assert.match(migration, /fixture\.starts_at < contract\.ended_at/i);
  assert.match(migration, /coach_scoring_v1/i);
});

test("contract writes derive owner identity from the authenticated server session", () => {
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /p_user_id: user\.id/);
  assert.doesNotMatch(route, /body\?\.userId/);
});

test("coach and club identity are resolved from the canonical registry", () => {
  assert.match(route, /touchlineLiveCoachForProviderId\(coachProviderId\)/);
  assert.match(route, /\.eq\("provider_team_id", coach\.coach\.teamId\)/);
  assert.doesNotMatch(route, /body\?\.clubId/);
});

test("mutation routes require a same-origin browser request", () => {
  assert.match(route, /fetchSite && fetchSite !== "same-origin"/);
  assert.match(route, /new URL\(origin\)\.origin === new URL\(request\.url\)\.origin/);
  assert.match(route, /TL_COACH_ORIGIN_FORBIDDEN/);
});

test("mutation payloads are bounded and fail closed", () => {
  assert.match(route, /declaredLength > 4_096/);
  assert.match(route, /source\.length > 4_096/);
  assert.match(route, /TL_COACH_HIRE_IDEMPOTENCY_REQUIRED/);
  assert.match(route, /TL_COACH_END_INVALID/);
});

test("direct browser reads and writes have no table privileges", () => {
  for (const table of [
    "touchline_coach_contracts",
    "touchline_coach_contract_events",
    "touchline_coach_fixture_points",
  ]) {
    assert.match(migration, new RegExp(`revoke all privileges on table public\\.${table} from public, anon, authenticated`, "i"));
  }
});

test("all administrative commands authorize internally and use a safe search path", () => {
  const securityDefiners = migration.match(/security definer/g) ?? [];
  const safePaths = migration.match(/set search_path = ''/g) ?? [];
  const internalChecks = migration.match(/auth\.jwt\(\) ->> 'role'/g) ?? [];
  assert.equal(securityDefiners.length, 3);
  assert.ok(safePaths.length >= 5);
  assert.equal(internalChecks.length, 3);
});

test("browser roles cannot execute the protected commands", () => {
  for (const fn of [
    "touchline_hire_coach_contract",
    "touchline_end_coach_contract",
    "touchline_reconcile_coach_fixture_points",
  ]) {
    assert.match(migration, new RegExp(`revoke execute on function public\\.${fn}\\([\\s\\S]*?from public, anon, authenticated`, "i"));
  }
});

test("hire is idempotent but rejects a reused key with different protected identity", () => {
  assert.match(migration, /TL_COACH_HIRE_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /v_existing\.coach_provider_id <> trim\(p_coach_provider_id\)/);
  assert.match(migration, /v_existing\.club_id <> p_club_id/);
});

test("one active coach must be ended before a different coach can be hired", () => {
  assert.match(migration, /TL_COACH_ACTIVE_CONTRACT_EXISTS/);
  assert.match(migration, /where user_id = p_user_id and status = 'active'/i);
});

test("cancellation is idempotent and preserves an immutable points snapshot", () => {
  assert.match(migration, /v_snapshot := public\.touchline_coach_points_snapshot\(v_contract\.id\)/);
  assert.match(migration, /event_type, idempotency_key, reason, points_snapshot/);
  assert.match(migration, /TL_COACH_END_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /TL_COACH_HISTORY_IMMUTABLE/);
});

test("cancelled contracts stop future points at an exclusive end boundary", () => {
  assert.match(migration, /fixture\.starts_at < contract\.ended_at/i);
  assert.match(migration, /status = 'ended', ended_at = v_now/);
});

test("legacy selections are backfilled from migration time with no retroactive points", () => {
  assert.match(migration, /Existing canonical coach selections become contracts from migration time/i);
  assert.match(migration, /started_at is now\(\)/i);
  assert.match(migration, /without retroactive points/i);
});

test("fixture ingestion reconciles coach points through the protected server path", () => {
  assert.match(fixtureStore, /touchline_reconcile_coach_fixture_points/);
  assert.match(fixtureStore, /p_fixture_id: null/);
});

test("current fixture selection skips recently finished fixtures", () => {
  assert.match(contractReader, /TERMINAL_FIXTURE_STATUS/);
  assert.match(contractReader, /\.limit\(6\)/);
  assert.match(contractReader, /\.find\(\(fixture\) => !isTerminalFixtureStatus\(fixture\.status\)\)/);
});

test("final provider results are locked while live scores remain provisional", () => {
  assert.match(migration, /settlement_status <> 'final'/i);
  assert.match(migration, /TL_COACH_FINAL_POINTS_IMMUTABLE/);
  assert.match(migration, /else 'provisional'/i);
});

test("the compact coach card renders exactly the verified Home or Away context", () => {
  assert.match(coachCard, /fixtureContext === "home"/);
  assert.match(coachCard, /Home fixture/);
  assert.match(coachCard, /Away fixture/);
  assert.doesNotMatch(coachCard, />AWAY</);
});

test("Arena exposes current contract, cancellation confirmation, and preserved history", () => {
  assert.match(arena, /Current contract/i);
  assert.match(arena, /Release coach/);
  assert.match(arena, /Confirm release/);
  assert.match(arena, /historical contract\(s\) preserved/i);
  assert.match(arena, /contractHistory/);
  assert.match(arena, /TouchlineCoachPerformance contract=\{activeCoachContract\}/);
});

test("coach profile separates real football history from TouchLine game data", () => {
  assert.match(coachProfile, /Real football history/i);
  assert.match(coachProfile, /TouchLine game data/i);
  assert.match(coachProfile, /TouchlineCoachPerformance contract=\{displayedContract\} contractHistory=\{coachContracts\}/);
  assert.match(coachProfile, /showHistory/);
  assert.match(coachPerformance, /data-coach-contract-history="true"/);
  assert.match(coachPerformance, /PRESERVED LIFECYCLE/);
  assert.match(coachPerformance, /item\.totalTouchlinePoints/);
  assert.match(coachPerformance, /item\.home\.touchlinePoints/);
  assert.match(coachPerformance, /item\.away\.touchlinePoints/);
});

test("coach zoom renders premium icon-led Home, Away and total TouchLine Points before profile navigation", () => {
  assert.match(coachZoom, /TouchlineCoachPerformance contract=\{contract\}/);
  assert.match(coachZoom, /data-coach-profile-action="true"/);
  assert.match(coachPerformance, /PlaneTakeoff/);
  assert.match(coachPerformance, /House/);
  assert.match(coachPerformance, /Trophy/);
  assert.match(coachPerformance, /ShieldCheck/);
  assert.match(coachPerformance, /record\?\.wins/);
  assert.match(coachPerformance, /record\?\.draws/);
  assert.match(coachPerformance, /record\?\.losses/);
  assert.match(coachPerformance, /record\?\.touchlinePoints/);
  assert.match(coachPerformance, /contract\?\.totalTouchlinePoints/);
  assert.match(coachPerformance, /Discipline data pending/);
  assert.match(coachPerformance, /record\?\.wins \?\? "—"/);
  assert.match(coachPerformance, /No points have been invented/);
});

test("Club Hub always shows the canonical club coach card without claiming an unverified matchday coach", () => {
  assert.match(clubProfile, /<ClubHubCanonicalCoachPanel/);
  assert.match(clubProfile, /teamId=\{club\.teamId\}/);
  assert.match(clubCoachPanel, /touchlineLiveCoachForTeam\(teamId\)/);
  assert.match(clubCoachPanel, /TouchlineCoachCardZoom/);
  assert.match(clubCoachPanel, /Open the card to review Home, Away, W-D-L and all TouchLine Points/);
});

test("TouchLine authority is preserved independently of provider refreshes", async () => {
  const overrides = await readFile(
    new URL("../lib/touchlineArena/card-editorial-overrides.ts", import.meta.url),
    "utf8",
  );
  const cardRoute = await readFile(
    new URL("../app/api/admin/manual-card-editorial/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(overrides, /Sportmonks sync therefore has no write path that can erase them/);
  assert.match(cardRoute, /providerConflict/);
  assert.match(cardRoute, /resolution: "TOUCHLINE_AUTHORITY"/);
  assert.match(cardRoute, /authority: "TouchLine"/);
});
