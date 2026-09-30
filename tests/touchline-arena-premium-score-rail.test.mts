import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseTouchlinePublicFixtures } from "../lib/football-data/public-fixture-client.ts";
const publicParserSource = readFileSync(new URL("../lib/football-data/public-fixture-client.ts", import.meta.url), "utf8");

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
});
