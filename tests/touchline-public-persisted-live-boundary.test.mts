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

test("live scores read one durable snapshot or honest partial schedule without ingress or writes", () => {
  assert.match(liveRoute, /readPersistedLiveScoreSnapshot/);
  assert.match(liveRoute, /readPublicCompetitionFixtures/);
  assert.match(liveRoute, /persisted-live-snapshot/);
  assert.match(liveRoute, /partial-persisted-schedule/);
  assert.match(liveRoute, /persisted-live-data-unavailable/);
  assert.doesNotMatch(
    liveRoute,
    /createFootballDataProvider|persistLiveScoreSnapshot|writeLiveScoreSnapshot|readLiveScoreSnapshot|mergeTouchlineLiveFixtureDeltas|new Date\(/,
  );
});

test("schedule endpoint is a read-only partial projection and POST is fail-closed", () => {
  assert.match(scheduleRoute, /readPublicCompetitionFixtures/);
  assert.match(scheduleRoute, /partial-persisted-schedule/);
  assert.match(scheduleRoute, /capturedAt: null/);
  assert.match(scheduleRoute, /export async function POST\(\)[\s\S]*?status: 405/);
  assert.doesNotMatch(scheduleRoute, /syncSportmonksFixtureSchedule|createAdminClient|createClient|isAuthorizedScheduleEditor|new Date\(/);
});
