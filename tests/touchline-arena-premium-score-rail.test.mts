import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseTouchlinePublicFixtures } from "../lib/football-data/public-fixture-client.ts";

const arenaSource = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
const publicParserSource = readFileSync(new URL("../lib/football-data/public-fixture-client.ts", import.meta.url), "utf8");

function sourceFunction(name: string) {
  const start = arenaSource.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const nextFunction = arenaSource.indexOf("\nfunction ", start + 1);
  return arenaSource.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

test("the premium Arena score rail never promotes a kickoff date above the Live surface", () => {
  const matcher = sourceFunction("buildFixtureClubMatches");

  assert.match(matcher, /centerLabel: fixtureHasScore\(fixture\) \? formatFixtureScore\(fixture\) : "vs"/);
  assert.match(matcher, /isFixtureActuallyLive\(fixture\)[\s\S]*?fixture\.status \|\| "LIVE"/);
  assert.match(matcher, /isFixtureFinished\(fixture\)[\s\S]*?"FT"/);
  assert.match(matcher, /fixtureHasScore\(fixture\)[\s\S]*?formatFixtureScore\(fixture\)[\s\S]*?: "Next"/);
  assert.doesNotMatch(matcher, /formatFixtureDateTime\(fixture\.startsAt\)/);
});

test("the rail preserves the localized Next label and identifies the two teams", () => {
  assert.match(arenaSource, /function displayFixtureStatus\(status: string, nextLabel: string\)[\s\S]*?status\.toLowerCase\(\) === "next" \? nextLabel : status/);
  assert.match(arenaSource, /<strong>\{match\.home\.shortCode\} vs \{match\.away\.shortCode\}<\/strong>/);
  assert.match(arenaSource, /<small>\{displayFixtureStatus\(match\.status, t\("nextMatchShort"\)\)\}<\/small>/);
});

test("the normal Arena retries the read-only Live snapshot when schedule hydration is delayed", () => {
  assert.match(arenaSource, /const ARENA_LIVE_SCHEDULE_REQUEST_TIMEOUT_MS = 3_500;/);
  assert.match(arenaSource, /timeoutMs: ARENA_LIVE_SCHEDULE_REQUEST_TIMEOUT_MS/);

  const start = arenaSource.indexOf("async function loadPersistedSchedule()");
  const end = arenaSource.indexOf("\n    async function refreshLiveFixtures()", start);
  const loader = arenaSource.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(loader, /!applyPersistedSchedule\(payload\)[\s\S]*?await refreshLiveFixtures\(\)/);
  assert.match(loader, /catch \{[\s\S]*?await refreshLiveFixtures\(\)/);
});

test("the Arena accepts only the allowlisted public fixture DTO and rejects stale internal snapshots", () => {
  const fixtures = Array.from({ length: 10 }, (_, index) => ({
    id: String(19_722_194 + index),
    providerId: String(19_722_194 + index),
    competitionId: "8",
    seasonId: "28083",
    roundId: "339001",
    roundName: "1",
    startsAt: `2026-08-${String(21 + Math.floor(index / 4)).padStart(2, "0")}T12:00:00.000Z`,
    status: "Not Started",
    homeTeam: { id: String(1_000 + index * 2), providerId: String(1_000 + index * 2), name: `Home ${index}` },
    awayTeam: { id: String(1_001 + index * 2), providerId: String(1_001 + index * 2), name: `Away ${index}` },
    verifiedAt: "2026-08-20T10:00:00.000Z",
  }));

  assert.equal(parseTouchlinePublicFixtures(fixtures)?.length, 10);
  assert.equal(parseTouchlinePublicFixtures([{ ...fixtures[0], provider: "sportmonks" }]), null);
  assert.equal(parseTouchlinePublicFixtures([{ ...fixtures[0], id: "qa-fixture-1", providerId: "qa-fixture-1" }]), null);
  assert.match(publicParserSource, /const PROVIDER_ID = \/\^\[1-9\]\\d\{0,19\}\$\//);
  assert.match(publicParserSource, /fixture\.id === fixture\.providerId/);
  assert.match(publicParserSource, /!\("provider" in fixture\)/);
  assert.match(arenaSource, /parseTouchlinePublicFixtures\(payload\.data\)/);
  assert.match(arenaSource, /touchline:arena:live-fixtures:v2/);
  assert.match(arenaSource, /stored\.version === 2/);
});
