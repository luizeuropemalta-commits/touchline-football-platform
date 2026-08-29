import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readerSource = readFileSync(
  new URL("../lib/football-data/public-premier-squad-server.ts", import.meta.url),
  "utf8",
);

test("the public squad route reads only the coherent persisted snapshot", () => {
  assert.match(readerSource, /readPersistedSquadSnapshot\(teamId\)/);
  assert.match(readerSource, /canonical-squad-unavailable/);
  assert.match(readerSource, /No coherent persisted squad snapshot is available/);
  assert.match(readerSource, /databaseSource: persistedSnapshot\.fresh \? "fresh-snapshot" : "outage-fallback"/);
  assert.match(readerSource, /degraded: !persistedSnapshot\.fresh/);
});

test("the public squad route has no provider, mutation, or request-upgrade path", () => {
  assert.doesNotMatch(
    readerSource,
    /createFootballDataProvider|persistSquadSnapshot|readSnapshotForLiveRefresh|backgroundRefresh|after\(|\.getSquad\(|preferSnapshot|searchParams\.get\("refresh"\)/,
  );
});

test("the public squad route uses the publication gate and server-only card catalogue", () => {
  assert.match(readerSource, /isTouchlineCardPublicationGateEnabled/);
  assert.match(readerSource, /includeMarketValues: true/);
  assert.match(readerSource, /loadTouchlinePublishedCardPresentations/);
  assert.doesNotMatch(readerSource, /football_player_market_values|resolveTouchlineVerifiedPlayerEconomy/);
});
