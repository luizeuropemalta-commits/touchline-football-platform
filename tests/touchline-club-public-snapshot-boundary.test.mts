import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { selectPublicClubFixture } from "../lib/football-data/public-fixture-selection.ts";
import type { TouchlineFixture } from "../lib/football-data/types.ts";

function fixture(overrides: Partial<TouchlineFixture> = {}): TouchlineFixture {
  return {
    id: overrides.id ?? "fixture-1",
    providerId: overrides.providerId ?? "1",
    provider: "sportmonks",
    startsAt: overrides.startsAt,
    status: overrides.status,
    source: {
      provider: "sportmonks",
      providerId: overrides.providerId ?? "1",
    },
  };
}

test("public club fixture selector prefers live and rejects stale finished rows", () => {
  const now = Date.parse("2026-07-28T20:00:00.000Z");
  const picked = selectPublicClubFixture([
    fixture({ providerId: "old", status: "FT", startsAt: "2026-07-27T18:00:00.000Z" }),
    fixture({ providerId: "old-penalties", status: "After Penalties", startsAt: "2026-07-27T18:00:00.000Z" }),
    fixture({ providerId: "next", status: "NS", startsAt: "2026-07-29T18:00:00.000Z" }),
    fixture({ providerId: "live", status: "LIVE", startsAt: "2026-07-28T19:00:00.000Z" }),
  ], () => true, now);

  assert.equal(picked?.providerId, "live");
});

test("public club page reads durable snapshots and never calls provider-backed fantasy routes", async () => {
  const pageSource = await readFile(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const snapshotSource = await readFile(new URL("../lib/football-data/public-fantasy-snapshot.ts", import.meta.url), "utf8");

  assert.match(pageSource, /readPublicFantasyFixtureSnapshots/);
  assert.match(pageSource, /readPublicCompetitionFixtures/);
  assert.doesNotMatch(pageSource, /readLiveScoreSnapshot|provider: "sportmonks"|competitionProviderId: "8"/);
  assert.doesNotMatch(pageSource, /\/api\/football-data\/fantasy\/livescores/);
  assert.doesNotMatch(pageSource, /\/api\/football-data\/fantasy\/fixture/);

  assert.match(snapshotSource, /sanitizeFantasyFixtureFeedForClient/);
  assert.match(snapshotSource, /football_fantasy_fixture_feeds/);
  assert.doesNotMatch(snapshotSource, /createFootballDataProvider|api_token|SPORTMONKS_API_TOKEN/);
});

test("ClubHub no longer presents a seeded demonstration as an England results table", async () => {
  const pageSource = await readFile(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /loadTouchlineOfficialLeagueTable/);
  assert.match(pageSource, /<TouchlineOfficialLeagueTable/);
  assert.match(pageSource, /official-league-table/);
  assert.doesNotMatch(pageSource, /buildOfficialStandings/);
  assert.doesNotMatch(pageSource, /buildTouchLineEnglandClubTable/);
  assert.doesNotMatch(pageSource, /tableDemoDescription/);
});
