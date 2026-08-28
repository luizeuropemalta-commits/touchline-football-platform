import assert from "node:assert/strict";
import test from "node:test";

import type { TouchlineFixture } from "../lib/football-data/types.ts";
import {
  TOUCHLINE_STADIUM_CATALOG,
  toTouchlineLiveFixture,
} from "../lib/touchlineArena/stadium-catalog.ts";

function fixture(homeTeamProviderId: string, venueId: string): TouchlineFixture {
  return {
    id: "sportmonks:19722189",
    providerId: "19722189",
    provider: "sportmonks",
    name: "Crystal Palace vs Manchester City",
    startsAt: "2026-08-28T19:00:00+00:00",
    homeTeam: {
      id: `sportmonks:${homeTeamProviderId}`,
      providerId: homeTeamProviderId,
      provider: "sportmonks",
      name: homeTeamProviderId === "51" ? "Crystal Palace" : "Manchester City",
      venueId,
      source: { provider: "sportmonks", providerId: homeTeamProviderId },
    },
    awayTeam: {
      id: "sportmonks:9",
      providerId: "9",
      provider: "sportmonks",
      name: "Manchester City",
      source: { provider: "sportmonks", providerId: "9" },
    },
    source: { provider: "sportmonks", providerId: "19722189" },
  };
}

test("stadium catalog is deduplicated by verified venue identity", () => {
  assert.equal(TOUCHLINE_STADIUM_CATALOG.length, 2);
  assert.equal(
    new Set(TOUCHLINE_STADIUM_CATALOG.map((entry) => entry.providerVenueId)).size,
    TOUCHLINE_STADIUM_CATALOG.length,
  );
  assert.equal(
    new Set(TOUCHLINE_STADIUM_CATALOG.map((entry) => entry.id)).size,
    TOUCHLINE_STADIUM_CATALOG.length,
  );
});

test("Crystal Palace home fixture resolves the verified Selhurst Park card", () => {
  const publicFixture = toTouchlineLiveFixture(fixture("51", "201"));

  assert.deepEqual(publicFixture.venue, {
    id: "selhurst-park",
    name: "Selhurst Park",
    capacity: 25_486,
    homeClubName: "Crystal Palace",
    imageUrl: "/touchlineArena/stadiums/selhurst-park.webp",
    photoCredit: {
      label: "Ashley Martin",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Selhurst_Park_Stadium.jpg",
      licenseLabel: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    },
  });
  assert.equal("source" in publicFixture, false);
  assert.equal("venueId" in (publicFixture.homeTeam ?? {}), false);
});

test("stadium resolution requires the exact venue and its verified home club", () => {
  assert.equal(toTouchlineLiveFixture(fixture("9", "201")).venue, undefined);

  const etihad = toTouchlineLiveFixture(fixture("9", "151")).venue;
  assert.equal(etihad?.name, "Etihad Stadium");
  assert.equal(etihad?.homeClubName, "Manchester City");
  assert.equal(etihad?.capacity, undefined);
});
