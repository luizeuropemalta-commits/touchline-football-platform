import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = [
  "../app/api/football-data/fantasy/events/route.ts",
  "../app/api/football-data/fantasy/capabilities/route.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

test("legacy fantasy browser endpoints are deterministically retired", () => {
  for (const route of routes) {
    assert.match(route, /code: "TL_FOOTBALL_DATA_RETIRED"/);
    assert.match(route, /status: 410/);
    assert.match(route, /"cache-control": "private, no-store"/);
    assert.doesNotMatch(
      route,
      /createFootballDataProvider|persistProviderCapabilities|footballDataFetchJson|SPORTMONKS_|process\.env|requireOwnerOrLocalTouchlineEditor|new Date\(/,
    );
  }
});
