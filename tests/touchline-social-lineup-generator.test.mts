import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { touchlineSocialWatcherDelayMs } from "../scripts/qa/watch-touchline-social-lineup-drafts.mts";
import { checksumTouchlineSocialLineupRenderSource } from "../lib/touchlineArena/social-lineup-render-source.ts";
import {
  TOUCHLINE_SOCIAL_MAX_CANDIDATES_PER_CYCLE,
  TOUCHLINE_SOCIAL_STORAGE_REQUEST_TIMEOUT_MS,
  TOUCHLINE_SOCIAL_STORAGE_ROUND_TRIPS_PER_ARTIFACT,
  touchlineSocialWorkerCycleTimeoutMs,
} from "../lib/touchlineArena/social-lineup-worker-budget.ts";

const source = readFileSync(new URL("../scripts/qa/generate-touchline-social-lineup-drafts.mts", import.meta.url), "utf8");
const watcher = readFileSync(new URL("../scripts/qa/watch-touchline-social-lineup-drafts.mts", import.meta.url), "utf8");

test("automatic lineup worker is QA-bound and discovers first complete team sheets", () => {
  assert.match(source, /QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy"/);
  assert.match(source, /football_fixture_lifecycle_events/);
  assert.match(source, /event_type", "LINEUP_AVAILABLE"/);
  assert.match(source, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(source, /base\.hostname === "touchline\.com\.br"/);
  assert.match(source, /base\.hostname !== STABLE_QA_HOST/);
  assert.match(source, /tl-social-render/);
  assert.match(source, /TOUCHLINE_LIVE_SYNC_SECRET/);
  assert.doesNotMatch(source, /SPORTMONKS_API_TOKEN|graph\.facebook|instagram.*password/i);
});

test("worker fails closed unless exact 11+9 canonical render and immutable media pass", () => {
  assert.match(source, /metadata\.playerCount !== 11/);
  assert.match(source, /metadata\.benchCount !== 9/);
  assert.match(source, /metadata\.playerBenchOverlap/);
  assert.match(source, /metadata\.allCardsUpright/);
  assert.match(source, /metadata\.allImagesReady/);
  assert.match(source, /metadata\.fixtureKind !== "PERSISTED_OFFICIAL_FIXTURE"/);
  assert.match(source, /RENDER_CONTRACT_MISMATCH/);
  assert.match(source, /uploadCreateOnly/);
  assert.match(source, /createTouchlineSocialPublicationDraft/);
  assert.match(source, /touchline_social_claim_generation/);
  assert.match(source, /touchline_social_complete_generation/);
  assert.match(source, /touchline_social_claim_generation_cycle/);
  assert.match(source, /touchline_social_renew_generation_cycle/);
  assert.match(source, /touchline_social_complete_generation_cycle/);
  assert.match(source, /p_input_checksum: candidate\.inputChecksum/);
  assert.match(source, /football_fantasy_fixture_feeds/);
  assert.match(source, /readCurrentSource/);
  assert.match(source, /\/api\/admin\/social-publications\/source/);
  assert.match(source, /touchline_social_renew_generation/);
  assert.match(source, /current\.sourceChecksum/);
  assert.match(source, /metadata\.sourceChecksum !== candidate\.inputChecksum/);
  assert.match(source, /sourceReadiness: "REVIEW_REQUIRED"/);
  assert.match(source, /source incompleteness is a per-candidate review outcome/i);
  assert.match(source, /candidate\.sourceReadiness !== "READY"[\s\S]*completeGeneration\(candidate, leaseToken, "REVIEW_REQUIRED"/);
  const sourceGuard = source.indexOf('candidate.sourceReadiness !== "READY"');
  assert.ok(sourceGuard > 0);
  assert.ok(sourceGuard < source.indexOf("if (!browser)", sourceGuard));
  assert.match(source, /TOUCHLINE_SOCIAL_MAX_CANDIDATES_PER_CYCLE/);
  assert.match(source, /OFFICIAL_TEAM_SHEET_STABILITY_MS = 2 \* 60 \* 1000/);
  assert.match(source, /Date\.parse\(firstObservedAt\) > now - OFFICIAL_TEAM_SHEET_STABILITY_MS/);
  assert.ok(source.indexOf("claimGenerationCycle()") < source.indexOf("chromium.launch"));
  assert.match(source, /if \(!browser\)[\s\S]*chromium\.launch/);
  assert.match(source, /GENERATION_REVIEW_PERSIST_FAILED/);
});

test("worker records Arsenal acceptance telemetry without enabling dispatch", () => {
  assert.match(source, /firstObservedAt/);
  assert.match(source, /generatedAt/);
  assert.match(source, /generationLatencyMs/);
  assert.match(source, /touchline_social_publication_drafts/);
  assert.match(source, /touchline_social_create_draft/);
  assert.doesNotMatch(source, /touchline_social_enqueue_dispatch|planTouchlineInstagramDispatch/);
});

test("QA watcher continuously invokes the finite worker without overlap or Production fallback", () => {
  assert.match(watcher, /STABLE_QA_HOST = "touchline-arena-official-git-qa-fifa-agent-plataform\.vercel\.app"/);
  assert.match(watcher, /baseUrl\.hostname !== STABLE_QA_HOST/);
  assert.match(watcher, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(watcher, /if \(stopping \|\| child\) return/);
  assert.match(watcher, /generate-touchline-social-lineup-drafts\.mts/);
  assert.match(watcher, /touchlineSocialWatcherDelayMs/);
  assert.match(watcher, /consecutiveFailures/);
  assert.match(watcher, /WORKER_TIMEOUT_MS = touchlineSocialWorkerCycleTimeoutMs\(\)/);
  assert.match(watcher, /worker_timeout/);
  assert.match(watcher, /child\?\.kill\("SIGTERM"\)/);
  assert.match(watcher, /child\.kill\("SIGKILL"\)/);
  assert.doesNotMatch(watcher, /SPORTMONKS_API_TOKEN|graph\.facebook|instagram.*password/i);
  assert.equal(touchlineSocialWatcherDelayMs(0), 10_000);
  assert.equal(touchlineSocialWatcherDelayMs(1), 20_000);
  assert.equal(touchlineSocialWatcherDelayMs(2), 40_000);
  assert.equal(touchlineSocialWatcherDelayMs(3), 60_000);
  assert.equal(touchlineSocialWatcherDelayMs(20), 60_000);
  assert.throws(() => touchlineSocialWatcherDelayMs(-1), /TL_SOCIAL_WATCH_FAILURE_COUNT_INVALID/);
  assert.ok(
    touchlineSocialWorkerCycleTimeoutMs()
      > TOUCHLINE_SOCIAL_MAX_CANDIDATES_PER_CYCLE
        * TOUCHLINE_SOCIAL_STORAGE_REQUEST_TIMEOUT_MS
        * TOUCHLINE_SOCIAL_STORAGE_ROUND_TRIPS_PER_ARTIFACT,
    "watchdog deadline must exceed the complete supported storage budget",
  );
  assert.throws(() => touchlineSocialWorkerCycleTimeoutMs(0), /TL_SOCIAL_WORKER_MAX_CANDIDATES_INVALID/);
});

test("review cooldown fingerprint excludes volatile persistence timestamps", () => {
  const fingerprintStart = source.indexOf("const discoveryFingerprintByFixtureId");
  const fingerprintEnd = source.indexOf("const teamByClubId", fingerprintStart);
  const fingerprintBlock = source.slice(fingerprintStart, fingerprintEnd);
  assert.match(fingerprintBlock, /fixture_payload/);
  assert.match(fingerprintBlock, /lineups_payload/);
  assert.match(fingerprintBlock, /events_payload/);
  assert.doesNotMatch(fingerprintBlock, /last_synced_at|updated_at|lastSyncedAt|updatedAt/);
});

test("semantic source identity excludes volatile capture timestamps", () => {
  const draftServer = readFileSync(new URL("../lib/touchlineArena/social-lineup-draft-server.ts", import.meta.url), "utf8");
  const checksumStart = draftServer.indexOf("const renderSource =");
  const checksumEnd = draftServer.indexOf("\n\n  return {", checksumStart);
  const checksumBlock = draftServer.slice(checksumStart, checksumEnd);
  assert.match(checksumBlock, /lineupAvailableAt/);
  assert.match(checksumBlock, /sourceProvenance/);
  assert.match(checksumBlock, /players/);
  assert.match(checksumBlock, /bench/);
  assert.match(checksumBlock, /caption/);
  assert.match(checksumBlock, /coach/);
  assert.match(checksumBlock, /score/);
  assert.doesNotMatch(checksumBlock, /capturedAt\s*:/);
});

test("social render uses one provided admin reader and bypasses public projection cache", () => {
  const draftServer = readFileSync(new URL("../lib/touchlineArena/social-lineup-draft-server.ts", import.meta.url), "utf8");
  const squadServer = readFileSync(new URL("../lib/football-data/public-premier-squad-server.ts", import.meta.url), "utf8");
  const seasonPointsServer = readFileSync(new URL("../lib/touchlineArena/public-season-player-points-server.ts", import.meta.url), "utf8");
  assert.match(draftServer, /readPublicPremierSquad\(teamId, \{ providedAdmin: admin \}\)/);
  assert.match(draftServer, /readPublicSeasonPlayerPoints\([\s\S]*competitionId: String\(canonicalFixture\.competition_id\)[\s\S]*seasonId: String\(canonicalFixture\.season_id\)[\s\S]*providedAdmin: admin/);
  assert.match(squadServer, /options: Readonly<\{[\s\S]*providedAdmin\?: TouchlinePublicPlayerProjectionRequest\["providedAdmin"\][\s\S]*\}> = \{\}/);
  assert.match(squadServer, /loadTouchlinePublicPlayerProjections\(\{[\s\S]*providedAdmin,[\s\S]*\}\)/);
  assert.match(squadServer, /loadTouchlinePublishedCardPresentations\(\{[\s\S]*providedAdmin,[\s\S]*\}\)/);
  assert.match(seasonPointsServer, /const fixtureSeasonScoped = UUID\.test\(requestedCompetitionId\) && UUID\.test\(requestedSeasonId\)/);
  assert.match(seasonPointsServer, /fixtureSeasonScoped[\s\S]*Promise\.resolve\(\{ data: \{ id: requestedCompetitionId \}, error: null \}\)/);
  assert.match(seasonPointsServer, /\.eq\("season_id", seasonId\)/);
});

test("semantic render checksum is key-order stable and changes for every rendered family", () => {
  const base = {
    fixtureId: "19722192",
    startsAt: "2026-08-31T14:00:00.000Z",
    caption: "Arsenal official line-up",
    score: null,
    club: { name: "Arsenal", accent: "#ef0107", logoUrl: "/arsenal.png" },
    players: [{ card: { id: "1", name: "Player", shirtNumber: 7, cardTier: "gold" }, x: 50, y: 20 }],
    bench: [{ id: "2", name: "Sub", shirtNumber: 12, cardTier: "silver" }],
    coach: { identity: { coach: { providerId: "3", displayName: "Coach" } }, slot: { cardTier: "gold" } },
  };
  const checksum = checksumTouchlineSocialLineupRenderSource(base);
  assert.equal(checksum, checksumTouchlineSocialLineupRenderSource(Object.fromEntries(Object.entries(base).reverse())));
  for (const changed of [
    { ...base, caption: "Changed caption" },
    { ...base, score: { state: "finished", home: 1, away: 0 } },
    { ...base, club: { ...base.club, logoUrl: "/new-arsenal.png" } },
    { ...base, players: [{ ...base.players[0], x: 55 }] },
    { ...base, bench: [{ ...base.bench[0], shirtNumber: 15 }] },
    { ...base, coach: { ...base.coach, slot: { cardTier: "diamond" } } },
  ]) {
    assert.notEqual(checksum, checksumTouchlineSocialLineupRenderSource(changed));
  }
});
