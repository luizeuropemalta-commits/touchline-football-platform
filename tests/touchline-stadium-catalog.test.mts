import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import test from "node:test";

import type { TouchlineFixture } from "../lib/football-data/types.ts";
import {
  TOUCHLINE_STADIUM_CATALOG,
  toTouchlineLiveFixture,
} from "../lib/touchlineArena/stadium-catalog.ts";

function fixture(homeTeamProviderId: string, venueId: string, awayTeamProviderId = "9"): TouchlineFixture {
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
      id: `sportmonks:${awayTeamProviderId}`,
      providerId: awayTeamProviderId,
      provider: "sportmonks",
      name: "Manchester City",
      source: { provider: "sportmonks", providerId: awayTeamProviderId },
    },
    source: { provider: "sportmonks", providerId: "19722189" },
  };
}

test("stadium catalog is deduplicated by verified venue identity", () => {
  assert.equal(TOUCHLINE_STADIUM_CATALOG.length, 20);
  assert.equal(
    new Set(TOUCHLINE_STADIUM_CATALOG.map((entry) => entry.providerVenueId)).size,
    TOUCHLINE_STADIUM_CATALOG.length,
  );
  assert.equal(
    new Set(TOUCHLINE_STADIUM_CATALOG.map((entry) => entry.homeTeamProviderId)).size,
    TOUCHLINE_STADIUM_CATALOG.length,
  );
  assert.equal(
    new Set(TOUCHLINE_STADIUM_CATALOG.map((entry) => entry.id)).size,
    TOUCHLINE_STADIUM_CATALOG.length,
  );
});

test("all twenty home clubs use bounded aerial stadium assets", () => {
  const expected = [
    ["19", "204", "Emirates Stadium", "01-arsenal-emirates-stadium.webp"],
    ["15", "5", "Villa Park", "02-aston-villa-villa-park.webp"],
    ["52", "146", "Vitality Stadium", "03-bournemouth-vitality-stadium.webp"],
    ["236", "338817", "Gtech Community Stadium", "04-brentford-gtech-community-stadium.webp"],
    ["78", "480", "American Express Stadium", "05-brighton-american-express-stadium.webp"],
    ["18", "321614", "Stamford Bridge", "06-chelsea-stamford-bridge.webp"],
    ["117", "270", "Coventry Building Society Arena", "07-coventry-coventry-building-society-arena.webp"],
    ["51", "201", "Selhurst Park", "08-crystal-palace-selhurst-park.webp"],
    ["13", "343762", "Hill Dickinson Stadium", "09-everton-hill-dickinson-stadium.webp"],
    ["11", "485", "Craven Cottage", "10-fulham-craven-cottage.webp"],
    ["22", "199", "MKM Stadium", "11-hull-city-mkm-stadium.webp"],
    ["116", "504", "Portman Road", "12-ipswich-town-portman-road.webp"],
    ["71", "488", "Elland Road", "13-leeds-united-elland-road.webp"],
    ["8", "230", "Anfield", "14-liverpool-anfield.webp"],
    ["9", "151", "Etihad Stadium", "15-manchester-city-etihad-stadium.webp"],
    ["14", "206", "Old Trafford", "16-manchester-united-old-trafford.webp"],
    ["20", "449", "St James' Park", "17-newcastle-united-st-james-park.webp"],
    ["63", "542", "City Ground", "18-nottingham-forest-city-ground.webp"],
    ["3", "212", "Stadium of Light", "19-sunderland-stadium-of-light.webp"],
    ["6", "281313", "Tottenham Hotspur Stadium", "20-tottenham-hotspur-stadium.webp"],
  ] as const;

  for (const [homeTeamProviderId, providerVenueId, name, fileName] of expected) {
    const entry = TOUCHLINE_STADIUM_CATALOG.find((candidate) => candidate.homeTeamProviderId === homeTeamProviderId);
    assert.ok(entry, `missing stadium entry for home team ${homeTeamProviderId}`);
    assert.equal(entry.providerVenueId, providerVenueId);
    assert.equal(entry.name, name);
    assert.equal(entry.imageUrl, `/touchlineArena/stadiums/aerial/${fileName}`);
    const asset = new URL(`../public${entry.imageUrl}`, import.meta.url);
    assert.equal(existsSync(asset), true, `missing optimized stadium asset ${fileName}`);
    assert.ok(statSync(asset).size < 1_000_000, `${fileName} must stay below 1 MB`);
  }
});

test("Crystal Palace home fixture resolves the verified Selhurst Park card", () => {
  const publicFixture = toTouchlineLiveFixture(fixture("51", "201"));

  assert.deepEqual(publicFixture.venue, {
    id: "selhurst-park",
    name: "Selhurst Park",
    capacity: 25_486,
    homeClubName: "Crystal Palace",
    imageUrl: "/touchlineArena/stadiums/aerial/08-crystal-palace-selhurst-park.webp",
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

test("every verified home club resolves only with its exact venue identity", () => {
  for (const entry of TOUCHLINE_STADIUM_CATALOG) {
    assert.equal(toTouchlineLiveFixture(fixture(entry.homeTeamProviderId, entry.providerVenueId)).venue?.id, entry.id);
    assert.equal(toTouchlineLiveFixture(fixture(entry.homeTeamProviderId, `${entry.providerVenueId}-other`)).venue, undefined);
  }
});

test("only the four approved home grounds expose bounded interior hero artwork", () => {
  const entriesWithInterior = TOUCHLINE_STADIUM_CATALOG.filter((entry) => entry.interiorImageUrl);
  const expected = [
    ["19", "204", "01-arsenal-emirates-stadium-live.webp"],
    ["15", "5", "02-aston-villa-villa-park-live.webp"],
    ["52", "146", "03-bournemouth-vitality-stadium-live.webp"],
    ["14", "206", "16-manchester-united-old-trafford-interior.webp"],
  ] as const;

  assert.equal(entriesWithInterior.length, expected.length);
  for (const [homeTeamProviderId, providerVenueId, fileName] of expected) {
    const stadium = entriesWithInterior.find((entry) => entry.homeTeamProviderId === homeTeamProviderId);
    assert.ok(stadium, `missing interior mapping for home team ${homeTeamProviderId}`);
    assert.equal(stadium.providerVenueId, providerVenueId);
    assert.equal(stadium.interiorImageUrl, `/touchlineArena/stadiums/interiors/${fileName}`);

    const asset = new URL(`../public${stadium.interiorImageUrl}`, import.meta.url);
    assert.equal(existsSync(asset), true, `missing optimized interior asset ${fileName}`);
    assert.ok(statSync(asset).size < 1_000_000, `${fileName} must stay below 1 MB`);
    assert.equal(
      toTouchlineLiveFixture(fixture(homeTeamProviderId, providerVenueId)).venue?.interiorImageUrl,
      stadium.interiorImageUrl,
    );
  }

  assert.equal(toTouchlineLiveFixture(fixture("9", "151")).venue?.interiorImageUrl, undefined);
  assert.equal(toTouchlineLiveFixture(fixture("14", "151")).venue, undefined);
});

test("the visitor never selects or supplies the Live interior", () => {
  const arsenalHome = toTouchlineLiveFixture(fixture("19", "204", "15"));
  const villaHome = toTouchlineLiveFixture(fixture("15", "5", "19"));
  assert.equal(arsenalHome.venue?.interiorImageUrl, "/touchlineArena/stadiums/interiors/01-arsenal-emirates-stadium-live.webp");
  assert.equal(villaHome.venue?.interiorImageUrl, "/touchlineArena/stadiums/interiors/02-aston-villa-villa-park-live.webp");

  assert.equal(toTouchlineLiveFixture(fixture("19", "5", "15")).venue, undefined);
  assert.equal(toTouchlineLiveFixture(fixture("15", "204", "19")).venue, undefined);
  assert.equal(toTouchlineLiveFixture(fixture("9", "151", "14")).venue?.interiorImageUrl, undefined);
  assert.equal(toTouchlineLiveFixture(fixture("51", "201", "52")).venue?.interiorImageUrl, undefined);
});
