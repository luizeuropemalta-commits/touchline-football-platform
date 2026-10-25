import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const liveHandler = readFileSync(
  new URL("../app/api/football-data/fantasy/livescores/route.ts", import.meta.url),
  "utf8",
);
const scheduleRoute = readFileSync(
  new URL("../app/api/football-data/fixture-schedule/route.ts", import.meta.url),
  "utf8",
);
const liveRoute = liveHandler + readFileSync(new URL("../lib/touchlineArena/persisted-live-rail-server.ts", import.meta.url), "utf8");
const matchCentre = readFileSync(
  new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
  "utf8",
);
const sharedClient = readFileSync(new URL("../lib/touchlineArena/sports-publication-client.ts", import.meta.url), "utf8");
const sharedStore = readFileSync(new URL("../lib/touchlineArena/live-presentation-client-store.ts", import.meta.url), "utf8");
const sharedReader = readFileSync(new URL("../lib/touchlineArena/sports-publication-reader.ts", import.meta.url), "utf8");
const sharedLiveView = readFileSync(new URL("../lib/touchlineArena/sports-publication-live-view.ts", import.meta.url), "utf8");

test("live scores read one durable snapshot or honest partial schedule without ingress or writes", () => {
  assert.match(liveHandler, /await readPersistedLiveRail\(\)/);
  assert.match(liveRoute, /readPersistedLiveScoreSnapshot/);
  assert.match(liveRoute, /readPublicCompetitionFixtures/);
  assert.match(liveRoute, /persisted-live-snapshot/);
  assert.match(liveRoute, /partial-persisted-schedule/);
  assert.match(liveRoute, /persisted-live-data-unavailable/);
  assert.match(liveRoute, /liveSnapshot\?\.fixtures\.length/);
  assert.match(liveRoute, /selectArenaFixtureRound\(schedule, now \?\? Date\.now\(\)\)/);
  assert.doesNotMatch(liveRoute, /completeTouchlineOfficialFixtureSchedule/);
  assert.doesNotMatch(
    liveRoute,
    /createFootballDataProvider|persistLiveScoreSnapshot|writeLiveScoreSnapshot|readLiveScoreSnapshot|mergeTouchlineLiveFixtureDeltas|new Date\(/,
  );
});

test("Live prefers a fresh snapshot and marks every non-live fallback degraded", () => {
  assert.match(liveRoute, /const snapshotReadNow = now \?\? Date\.now\(\)/);
  assert.match(liveRoute, /const freshness = touchlineLiveFreshness\(liveSnapshot, snapshotReadNow\)/);
  assert.match(liveRoute, /const snapshotIsFresh = freshness !== null && !freshness\.degraded/);
  assert.match(liveRoute, /liveSnapshot\?\.fixtures\.length && snapshotIsFresh/);
  assert.match(liveRoute, /state: "partial-persisted-schedule"[\s\S]*?degraded: true/);
  assert.match(liveRoute, /if \(liveSnapshot\?\.fixtures\.length\) \{[\s\S]*?degraded: true/);
  assert.match(liveRoute, /degraded: true/);
  assert.match(matchCentre, /initialReadMetadata/);
  // The metadata validator now lives at the shared publication boundary;
  // requiring it inside each surface would restore independent live pollers.
  assert.match(matchCentre, /useTouchlinePublishedLive\(initialFixtures, initialReadMetadata, now, liveUpdates\)/);
  assert.match(sharedClient, /createTouchlinePublishedLiveReader\(touchlineLivePresentationStore, fixtures, initialMetadata\)/);
  assert.match(sharedStore, /parseTouchlineSportsPublication\(/);
  assert.match(sharedReader, /read\.state\.livePresentationSnapshotId !== publication\.publication\.contentDigest/);
  assert.match(sharedReader, /read\.state\.liveFreshness\.fetchedAt !== publication\.live\.fetchedAt/);
  assert.match(sharedLiveView, /freshness\.degraded[\s\S]*?freshness\.ageMs \+ Math\.max\(0, now - read\.receivedAt\) > TOUCHLINE_LIVE_SNAPSHOT_STALE_AFTER_MS/);
  assert.match(sharedLiveView, /retainedLiveFacts[\s\S]*?degraded: true/);
  assert.match(matchCentre, /touchlineMatchCentreDisplayState\(fixture, readMetadata, now\) === "live"/);
  assert.match(matchCentre, /dictionary\.liveDataUpdating/);
  assert.match(matchCentre, /dictionary\.lastVerified/);
  assert.doesNotMatch(matchCentre, /createFootballDataProvider|persistLiveScoreSnapshot|writeLiveScoreSnapshot/);
});

test("schedule endpoint is a read-only partial projection and POST is fail-closed", () => {
  assert.match(scheduleRoute, /readPublicCompetitionFixtures/);
  assert.doesNotMatch(scheduleRoute, /completeTouchlineOfficialFixtureSchedule/);
  assert.match(scheduleRoute, /partial-persisted-schedule/);
  assert.match(scheduleRoute, /capturedAt: null/);
  assert.match(scheduleRoute, /export async function POST\(\)[\s\S]*?status: 405/);
  assert.doesNotMatch(scheduleRoute, /syncSportmonksFixtureSchedule|createAdminClient|createClient|isAuthorizedScheduleEditor|new Date\(/);
});
