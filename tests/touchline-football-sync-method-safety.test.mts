import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const routeSource = fs.readFileSync(
  new URL("../app/api/football-data/sync-starter/route.ts", import.meta.url),
  "utf8",
);
const controlSource = fs.readFileSync(
  new URL("../components/admin-football-data-sync-controls.tsx", import.meta.url),
  "utf8",
);
const diagnosticSource = fs.readFileSync(
  new URL("../app/api/football-data/provider-diagnostic/route.ts", import.meta.url),
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

test("QA country reconciliation is an explicit owner POST control", () => {
  assert.match(controlSource, /scope:\s*"qa_country_sync"/);
  assert.match(controlSource, /runId:\s*crypto\.randomUUID\(\)/);
  assert.match(controlSource, /method:\s*"POST"/);
  assert.match(controlSource, /Reconcile QA country data/);
});

test("twenty-club provider diagnostic remains owner-only and read-only", () => {
  assert.match(diagnosticSource, /if \(!await authorizeOwner\(\)\)/);
  assert.match(diagnosticSource, /scope === "twenty"/);
  assert.match(diagnosticSource, /sportmonks-live-read-only/);
  assert.doesNotMatch(diagnosticSource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
