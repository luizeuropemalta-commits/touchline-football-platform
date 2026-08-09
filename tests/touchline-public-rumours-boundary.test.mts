import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(
  new URL("../app/api/touchline-arena/rumours/route.ts", import.meta.url),
  "utf8",
);
const arenaSource = readFileSync(
  new URL("../app/arena/ArenaClient.tsx", import.meta.url),
  "utf8",
);

test("Arena signals fail closed until a canonical persisted projection exists", () => {
  assert.match(routeSource, /state: "unavailable"/);
  assert.match(routeSource, /No canonical persisted signal snapshot is available/);
  assert.match(routeSource, /cache-control": "private, no-store"/);
  assert.doesNotMatch(
    routeSource,
    /createFootballDataProvider|footballDataFetchJson|SPORTMONKS_|process\.env|withFootballDataCache|getFixtureFantasyFeed|getLiveFantasyEvents|new Date\(/,
  );
});

test("Arena news does not pass fixture identifiers to an unavailable route", () => {
  assert.match(arenaSource, />\("\/api\/touchline-arena\/rumours"\)/);
  assert.doesNotMatch(arenaSource, /rumours\$\{params\.toString\(\)/);
  assert.doesNotMatch(arenaSource, /params\.set\("fixtureIds", realFixtureIds\.join\(","\)\)/);
});
