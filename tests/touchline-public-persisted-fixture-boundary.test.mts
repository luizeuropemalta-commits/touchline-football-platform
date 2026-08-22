import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(
  new URL("../app/api/football-data/fantasy/fixture/route.ts", import.meta.url),
  "utf8",
);
const snapshotSource = readFileSync(
  new URL("../lib/football-data/public-fantasy-snapshot.ts", import.meta.url),
  "utf8",
);
const arenaSource = readFileSync(
  new URL("../app/arena/ArenaClient.tsx", import.meta.url),
  "utf8",
);

test("the fixture endpoint is a persisted-only public reader", () => {
  assert.match(routeSource, /readPersistedFantasyFixtureFeedResult\(fixtureId\)/);
  assert.match(routeSource, /toPublicFantasyFixtureFeed/);
  assert.match(routeSource, /canonical-fixture-feed-pending/);
  assert.match(routeSource, /status: 200/);
  assert.match(routeSource, /canonical-fixture-feed-unavailable/);
  assert.doesNotMatch(routeSource, /createFootballDataProvider|persistFantasyFixtureFeed|getFixtureFantasyFeed|publicFootballDataFailure/);
  assert.match(routeSource, /export async function POST\(\)[\s\S]*?status: 405/);
});

test("the exact fixture snapshot reader does not fetch or write", () => {
  assert.match(snapshotSource, /export async function readPersistedFantasyFixtureFeedResult/);
  assert.match(snapshotSource, /export async function readPersistedFantasyFixtureFeed/);
  assert.match(snapshotSource, /if \(!data\) return \{ status: "pending" \}/);
  assert.match(snapshotSource, /if \(error\) return \{ status: "unavailable" \}/);
  assert.doesNotMatch(snapshotSource, /createFootballDataProvider|persistFantasyFixtureFeed|\.upsert\(/);
});

test("Arena consumes the public feed and has no persisted-fixture write hint", () => {
  assert.match(arenaSource, /TouchlinePublicFantasyFixtureFeed/);
  assert.match(arenaSource, /fixture\.homeTeam\?\.id/);
  assert.doesNotMatch(arenaSource, /fantasy\/fixture\?fixtureId=\$\{encodeURIComponent\(providerFixtureId\)\}&persist=0/);
});
