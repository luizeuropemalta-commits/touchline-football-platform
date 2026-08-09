import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const eventsRoute = await readFile(
  new URL("../app/api/football-data/fantasy/events/route.ts", import.meta.url),
  "utf8",
);

test("the retired fantasy-event endpoint fails closed before auth or provider work", () => {
  assert.match(eventsRoute, /code: "TL_FOOTBALL_DATA_RETIRED"/);
  assert.match(eventsRoute, /status: 410/);
  assert.match(eventsRoute, /"cache-control": "private, no-store"/);
  assert.doesNotMatch(
    eventsRoute,
    /requireOwnerOrLocalTouchlineEditor|createFootballDataProvider|footballDataFetchJson|SPORTMONKS_|process\.env|fetch\(/,
  );
});
