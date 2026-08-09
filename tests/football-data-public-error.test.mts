import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { publicFootballDataFailure } from "../lib/football-data/public-error.ts";

const publicProviderRoutes = [
  "../app/api/football-data/fantasy/events/route.ts",
  "../app/api/football-data/fantasy/capabilities/route.ts",
  "../app/api/football-data/fantasy/fixture/route.ts",
  "../app/api/football-data/fantasy/livescores/route.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
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

test("shared football-data routes do not return raw provider error messages", () => {
  for (const source of publicProviderRoutes) {
    assert.match(source, /publicFootballDataFailure\(/);
    assert.doesNotMatch(source, /result\.error\.message/);
  }
  assert.doesNotMatch(rumoursRoute, /publicError\(result\.error\.message\)|publicError\(liveEvents\.error\.message\)/);
  assert.match(rumoursRoute, /return `\$\{PUBLIC_SOURCE_LABEL\} updates are temporarily unavailable\.`/);
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
