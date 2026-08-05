import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const factorySource = readFileSync(
  new URL("../lib/football-data/provider-factory.ts", import.meta.url),
  "utf8",
);
const typesSource = readFileSync(
  new URL("../lib/football-data/types.ts", import.meta.url),
  "utf8",
);
const publicSnapshotSource = readFileSync(
  new URL("../lib/football-data/public-fantasy-snapshot.ts", import.meta.url),
  "utf8",
);
const environmentExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

test("Sportmonks is the only selectable external football-data API", () => {
  const activeProviderBoundary = `${factorySource}\n${typesSource}\n${publicSnapshotSource}`;

  assert.match(typesSource, /FootballDataProviderName = "sportmonks"/);
  assert.match(factorySource, /return "sportmonks"/);
  assert.doesNotMatch(factorySource, /process\.env\.FOOTBALL_DATA_PROVIDER/);
  assert.doesNotMatch(environmentExample, /FOOTBALL_DATA_PROVIDER/);
  assert.doesNotMatch(activeProviderBoundary, /\b(?:opta|sportradar|statsperform)\b/i);
});
