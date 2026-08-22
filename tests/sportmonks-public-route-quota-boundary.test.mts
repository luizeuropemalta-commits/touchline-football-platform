import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixtureRoute = await readFile(
  new URL("../app/api/football-data/fantasy/fixture/route.ts", import.meta.url),
  "utf8",
);
const liveScoresRoute = await readFile(
  new URL("../app/api/football-data/fantasy/livescores/route.ts", import.meta.url),
  "utf8",
);

test("fixture GET authenticates before reading a persisted fixture and never reaches a provider", () => {
  const getHandler = fixtureRoute.slice(
    fixtureRoute.indexOf("export async function GET"),
    fixtureRoute.indexOf("export async function POST"),
  );

  assert.match(getHandler, /requireAuthenticatedOrLocalTouchlineEditor\(request\)/);
  assert.ok(
    getHandler.indexOf("requireAuthenticatedOrLocalTouchlineEditor(request)") <
      getHandler.indexOf("readPersistedFantasyFixtureFeedResult(fixtureId)"),
  );
  assert.match(getHandler, /canonical-fixture-feed-pending/);
  assert.match(getHandler, /canonical-fixture-feed-unavailable/);
  assert.match(getHandler, /toPublicFantasyFixtureFeed/);
  assert.doesNotMatch(getHandler, /createFootballDataProvider|persistFantasyFixtureFeed|getFixtureFantasyFeed/);
});

test("fixture POST is fail-closed and cannot be an ingestion path", () => {
  const postHandler = fixtureRoute.slice(fixtureRoute.indexOf("export async function POST"));

  assert.match(postHandler, /status: 405/);
  assert.match(postHandler, /Allow: "GET"/);
  assert.doesNotMatch(postHandler, /persistFantasyFixtureFeed|createFootballDataProvider|readPersistedFantasyFixtureFeed/);
});

test("public livescore reads use a durable snapshot or honest persisted schedule only", () => {
  assert.match(liveScoresRoute, /readPersistedLiveScoreSnapshot/);
  assert.match(liveScoresRoute, /readPublicCompetitionFixtures/);
  assert.match(liveScoresRoute, /partial-persisted-schedule/);
  assert.match(liveScoresRoute, /persisted-live-data-unavailable/);
  assert.doesNotMatch(
    liveScoresRoute,
    /createFootballDataProvider|persistLiveScoreSnapshot|writeLiveScoreSnapshot|readLiveScoreSnapshot|mergeTouchlineLiveFixtureDeltas|requireAuthenticatedOrLocalTouchlineEditor/,
  );
});
