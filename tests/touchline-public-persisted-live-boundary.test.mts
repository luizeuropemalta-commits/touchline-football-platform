import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const liveRoute = readFileSync(
  new URL("../app/api/football-data/fantasy/livescores/route.ts", import.meta.url),
  "utf8",
);
const scheduleRoute = readFileSync(
  new URL("../app/api/football-data/fixture-schedule/route.ts", import.meta.url),
  "utf8",
);
const matchCentre = readFileSync(
  new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
  "utf8",
);

test("live scores read one durable snapshot or honest partial schedule without ingress or writes", () => {
  assert.match(liveRoute, /readPersistedLiveScoreSnapshot/);
  assert.match(liveRoute, /readPublicCompetitionFixtures/);
  assert.match(liveRoute, /persisted-live-snapshot/);
  assert.match(liveRoute, /partial-persisted-schedule/);
  assert.match(liveRoute, /persisted-live-data-unavailable/);
  assert.match(liveRoute, /liveSnapshot\?\.fixtures\.length/);
  assert.match(liveRoute, /completeTouchlineOfficialFixtureSchedule/);
  assert.match(liveRoute, /selectArenaFixtureRound\(completeTouchlineOfficialFixtureSchedule\(schedule\)\)/);
  assert.doesNotMatch(
    liveRoute,
    /createFootballDataProvider|persistLiveScoreSnapshot|writeLiveScoreSnapshot|readLiveScoreSnapshot|mergeTouchlineLiveFixtureDeltas|new Date\(/,
  );
});

test("Live prefers a fresh snapshot, then a usable weekly schedule, and only marks the final fallback stale", () => {
  assert.match(liveRoute, /const snapshotIsFresh = Boolean\(/);
  assert.match(liveRoute, /liveSnapshot\?\.fixtures\.length && snapshotIsFresh/);
  assert.match(liveRoute, /state: "partial-persisted-schedule"[\s\S]*?degraded: false/);
  assert.match(liveRoute, /if \(liveSnapshot\?\.fixtures\.length\) \{[\s\S]*?degraded: true/);
  assert.match(liveRoute, /degraded: true/);
  assert.match(matchCentre, /initialReadMetadata/);
  assert.match(matchCentre, /isTouchlineLiveReadMetadata/);
  assert.match(matchCentre, /touchlineMatchCentreDisplayState\(fixture, readMetadata, now\) === "live"/);
  assert.match(matchCentre, /dictionary\.liveDataUpdating/);
  assert.match(matchCentre, /dictionary\.lastVerified/);
  assert.doesNotMatch(matchCentre, /createFootballDataProvider|persistLiveScoreSnapshot|writeLiveScoreSnapshot/);
});

test("schedule endpoint is a read-only partial projection and POST is fail-closed", () => {
  assert.match(scheduleRoute, /readPublicCompetitionFixtures/);
  assert.match(scheduleRoute, /completeTouchlineOfficialFixtureSchedule/);
  assert.match(scheduleRoute, /partial-persisted-schedule/);
  assert.match(scheduleRoute, /capturedAt: null/);
  assert.match(scheduleRoute, /export async function POST\(\)[\s\S]*?status: 405/);
  assert.doesNotMatch(scheduleRoute, /syncSportmonksFixtureSchedule|createAdminClient|createClient|isAuthorizedScheduleEditor|new Date\(/);
});
