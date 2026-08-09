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
      getHandler.indexOf("readPersistedFantasyFixtureFeed(fixtureId)"),
  );
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

test("public livescore reads stop at sanitized snapshots before provider access", () => {
  const snapshotBranch = liveScoresRoute.indexOf("if (snapshotOnly)");
  const accessCheck = liveScoresRoute.indexOf("requireAuthenticatedOrLocalTouchlineEditor(request)");
  const providerCall = liveScoresRoute.indexOf('createFootballDataProvider("sportmonks")');

  assert.ok(snapshotBranch >= 0 && snapshotBranch < accessCheck);
  assert.ok(accessCheck >= 0 && accessCheck < providerCall);
  assert.match(
    liveScoresRoute,
    /if \(accessError\) \{[\s\S]*?snapshotResponse\("local-snapshot"\) \?\? accessError/,
  );
});
