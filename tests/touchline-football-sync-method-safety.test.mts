import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../app/api/football-data/sync-starter/route.ts", import.meta.url),
  "utf8",
);

test("football data sync is POST-only and keeps the existing authorization boundary", () => {
  assert.match(source, /export async function GET\(_request: NextRequest\)/);
  assert.match(source, /status: "method_not_allowed"/);
  assert.match(source, /status: 405/);
  assert.match(source, /Allow: "POST"/);
  assert.match(source, /export async function POST\(request: NextRequest\)/);
  assert.match(source, /authorization === `Bearer \$\{secret\}`/);
  assert.match(source, /hasTouchLineArenaAccess\(user\) && isOwnerEmail\(user\?\.email\)/);
});

test("the protected route exposes only foundation and official fixture schedule scopes", () => {
  assert.match(source, /scope === "fixture_schedule"/);
  assert.match(source, /syncSportmonksFixtureSchedule\(admin/);
  assert.match(source, /scope === "foundation"/);
  assert.match(source, /syncSportmonksStarterFoundation\(admin/);
  assert.match(source, /status: "invalid_scope"/);
  assert.match(source, /Use scope=foundation or scope=fixture_schedule/);
  assert.doesNotMatch(source, /scope === "(?:clubs|players|rosters|countries|coaches)"/);
});

test("fixture schedule forwards a bounded provider date window", () => {
  assert.match(source, /competitionId/);
  assert.match(source, /fromDate: request\.nextUrl\.searchParams\.get\("fromDate"\)/);
  assert.match(source, /throughDate: request\.nextUrl\.searchParams\.get\("throughDate"\)/);
});
