import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { publicFootballDataFailure } from "../lib/football-data/public-error.ts";

const rumoursRoute = readFileSync(new URL("../app/api/touchline-arena/rumours/route.ts", import.meta.url), "utf8");

test("public football-data failures expose stable codes instead of provider messages", () => {
  assert.deepEqual(publicFootballDataFailure("provider_error"), {
    ok: false,
    error: "Football data is temporarily unavailable.",
    code: "TL_FOOTBALL_DATA_UNAVAILABLE",
  });
  assert.deepEqual(publicFootballDataFailure("not_found"), {
    ok: false,
    error: "Requested football data is not available.",
    code: "TL_FOOTBALL_DATA_NOT_FOUND",
  });
});

test("the retired signals surface does not return raw provider error messages", () => {
  assert.doesNotMatch(rumoursRoute, /publicError\(result\.error\.message\)|publicError\(liveEvents\.error\.message\)/);
  assert.match(rumoursRoute, /No canonical persisted signal snapshot is available/);
  assert.doesNotMatch(rumoursRoute, /createFootballDataProvider|footballDataFetchJson|process\.env/);
});

test("the public squad reader fails closed when its canonical snapshot is unavailable", () => {
  const squadRoute = readFileSync(
    new URL("../app/api/football-data/premier-squad/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(squadRoute, /canonical-squad-unavailable/);
  assert.match(squadRoute, /No coherent persisted squad snapshot is available/);
  assert.doesNotMatch(squadRoute, /createFootballDataProvider|persistSquadSnapshot|publicFootballDataFailure/);
});

test("the public fixture reader fails closed when its canonical feed is unavailable", () => {
  const fixtureRoute = readFileSync(
    new URL("../app/api/football-data/fantasy/fixture/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(fixtureRoute, /canonical-fixture-feed-unavailable/);
  assert.match(fixtureRoute, /No coherent persisted fixture feed is available/);
  assert.doesNotMatch(fixtureRoute, /createFootballDataProvider|persistFantasyFixtureFeed|publicFootballDataFailure/);
});
