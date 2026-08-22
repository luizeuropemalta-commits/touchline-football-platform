import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(
  new URL("../app/api/football-data/premier-squad/route.ts", import.meta.url),
  "utf8",
);

test("the public squad route reads only the coherent persisted snapshot", () => {
  assert.match(routeSource, /readPersistedSquadSnapshot\(teamId\)/);
  assert.match(routeSource, /canonical-squad-unavailable/);
  assert.match(routeSource, /No coherent persisted squad snapshot is available/);
  assert.match(routeSource, /databaseSource: persistedSnapshot\.fresh \? "fresh-snapshot" : "outage-fallback"/);
  assert.match(routeSource, /degraded: !persistedSnapshot\.fresh/);
});

test("the public squad route has no provider, mutation, or request-upgrade path", () => {
  assert.doesNotMatch(
    routeSource,
    /createFootballDataProvider|persistSquadSnapshot|readSnapshotForLiveRefresh|backgroundRefresh|after\(|\.getSquad\(|preferSnapshot|searchParams\.get\("refresh"\)/,
  );
});

test("the public squad route uses the publication gate and server-only card catalogue", () => {
  assert.match(routeSource, /isTouchlineCardPublicationGateEnabled/);
  assert.match(routeSource, /includeMarketValues: true/);
  assert.match(routeSource, /loadTouchlinePublishedCardPresentations/);
  assert.doesNotMatch(routeSource, /football_player_market_values|resolveTouchlineVerifiedPlayerEconomy/);
});
