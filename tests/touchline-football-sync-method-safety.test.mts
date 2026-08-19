import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const routeSource = fs.readFileSync(
  new URL("../app/api/football-data/sync-starter/route.ts", import.meta.url),
  "utf8",
);

test("football-data synchronization rejects state-changing GET requests", () => {
  const getHandler = routeSource.match(
    /export async function GET[\s\S]*?\n}\n\nexport async function POST/,
  )?.[0] ?? "";

  assert.match(getHandler, /status:\s*405/);
  assert.match(getHandler, /Allow:\s*"POST"/);
  assert.doesNotMatch(getHandler, /runStarterSync\(request\)/);
});

test("football-data synchronization remains available only through POST", () => {
  assert.match(
    routeSource,
    /export async function POST\(request: NextRequest\)\s*{\s*return runFootballDataSync\(request\);\s*}/,
  );
  assert.match(routeSource, /scope === "fixture_schedule"[\s\S]*?syncSportmonksFixtureSchedule/);
  assert.match(routeSource, /scope === "foundation"[\s\S]*?syncSportmonksStarterFoundation/);
  assert.match(routeSource, /scope === "capabilities"[\s\S]*?syncSportmonksProviderCapabilities/);
  assert.match(routeSource, /scope === "qa_country_sync"[\s\S]*?syncQaCountryData/);
  assert.match(routeSource, /randomUUID\(\)/);
  assert.match(routeSource, /Owner session or football data sync secret required/);
});
