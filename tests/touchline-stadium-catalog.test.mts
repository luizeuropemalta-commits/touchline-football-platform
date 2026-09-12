import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import type { TouchlineFixture } from "../lib/football-data/types.ts";
import {
  TOUCHLINE_STADIUM_CATALOG,
  isFieldSpecificTouchlineStadiumSource,
  isApprovedTouchlineStadiumSourceUrl,
  resolveTouchlineClubHomeStadium,
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

test("Liverpool ClubHub profile resolves Anfield facts, never a current away-fixture venue", () => {
  const liverpool = resolveTouchlineClubHomeStadium("8");
  assert.ok(liverpool);
  assert.equal(liverpool.name, "Anfield");
  assert.deepEqual(liverpool.clubProfile?.address, {
    line1: "Anfield Road",
    city: "Liverpool",
    postalCode: "L4 0TH",
    country: "England",
  });
  assert.equal(liverpool.clubProfile?.homeClubLabel, "Liverpool FC");
  assert.equal(liverpool.clubProfile?.capacity, 61_276);
  assert.equal(liverpool.clubProfile?.openedYear, 1884);
  assert.equal(liverpool.clubProfile?.sources.every((source) => source.url.startsWith("https://")), true);
  const liverpoolCapacitySource = liverpool.clubProfile?.sources.find((source) => source.field === "capacity");
  assert.deepEqual(liverpoolCapacitySource, {
    field: "capacity",
    publisher: "Liverpool FC",
    url: "https://www.liverpoolfc.com/news/new-anfield-capacity-confirmed-ahead-2024-25",
    evidence: "Liverpool FC announcement confirms Anfield capacity of 61,276.",
    checkedAt: "2026-09-10",
  });
  assert.ok(
    new Set(liverpool.clubProfile?.sources.map((source) => source.url)).size >= 2,
    "a complete profile cannot manufacture all five proofs from one generic URL",
  );
  assert.equal(resolveTouchlineClubHomeStadium("116")?.name, "Portman Road");
  assert.equal(resolveTouchlineClubHomeStadium("not-a-club"), null);
});

test("only facts with independent field-level evidence are published to ClubHub", () => {
  const requiredFields = ["stadiumName", "homeClubLabel", "address", "capacity", "openedYear"] as const;
  const verifiedProfiles = TOUCHLINE_STADIUM_CATALOG.filter((stadium) => stadium.clubProfile);

  assert.deepEqual(verifiedProfiles.map((stadium) => stadium.id), [
    "gtech-community-stadium",
    "anfield",
  ]);
  for (const stadium of verifiedProfiles) {
    const profile = stadium.clubProfile;
    assert.ok(profile, `missing permanent ClubHub stadium profile for ${stadium.homeClubName}`);
    assert.ok(profile.homeClubLabel.length > 0, `missing home-club label for ${stadium.name}`);
    assert.ok(profile.address.city.length > 0, `missing city for ${stadium.name}`);
    assert.ok(profile.address.country.length > 0, `missing country for ${stadium.name}`);
    assert.ok(profile.capacity !== null && profile.capacity > 0, `missing capacity for ${stadium.name}`);
    assert.ok(profile.openedYear !== null && profile.openedYear > 1800, `missing opening year for ${stadium.name}`);
    assert.equal(profile.verifiedAt, "2026-09-10", `missing verification date for ${stadium.name}`);

    for (const field of requiredFields) {
      const source = profile.sources.find((candidate) => candidate.field === field);
      assert.ok(source, `missing ${field} source for ${stadium.name}`);
      assert.match(source.url, /^https:\/\//, `source must use HTTPS for ${stadium.name}:${field}`);
      assert.equal(isApprovedTouchlineStadiumSourceUrl(source.url), true, `source host/path must be approved for ${stadium.name}:${field}`);
      assert.ok(source.publisher.length > 0, `missing publisher for ${stadium.name}:${field}`);
      assert.ok(source.evidence.length >= 24, `missing field-level source scope for ${stadium.name}:${field}`);
      assert.equal(source.checkedAt, "2026-09-10", `missing checked date for ${stadium.name}:${field}`);
      assert.equal(
        isFieldSpecificTouchlineStadiumSource(stadium, source),
        true,
        `evidence must substantiate the displayed ${field} value for ${stadium.name}`,
      );
    }
    assert.equal(
      new Set(profile.sources.map((source) => source.evidence.trim())).size,
      requiredFields.length,
      `citations must not clone generic evidence across fields for ${stadium.name}`,
    );
  }

  for (const stadium of TOUCHLINE_STADIUM_CATALOG.filter((candidate) => !candidate.clubProfile)) {
    assert.equal(
      stadium.clubProfile,
      undefined,
      `${stadium.name} must remain unavailable until each displayed fact has direct evidence`,
    );
  }
});

test("Arsenal and Aston Villa preserve fixture venue identity but fail closed for ClubHub facts", () => {
  const arsenal = TOUCHLINE_STADIUM_CATALOG.find((entry) => entry.id === "emirates-stadium");
  const villa = TOUCHLINE_STADIUM_CATALOG.find((entry) => entry.id === "villa-park");

  assert.equal(arsenal?.clubProfile, undefined);
  assert.equal(villa?.clubProfile, undefined);
  assert.equal(toTouchlineLiveFixture(fixture("19", "204")).venue?.name, "Emirates Stadium");
  assert.equal(toTouchlineLiveFixture(fixture("15", "5")).venue?.name, "Villa Park");
});

test("field-specific stadium verification rejects cloned or mismatched evidence", () => {
  const anfield = TOUCHLINE_STADIUM_CATALOG.find((entry) => entry.id === "anfield");
  assert.ok(anfield?.clubProfile);
  const capacity = anfield.clubProfile.sources.find((source) => source.field === "capacity");
  assert.ok(capacity);

  assert.equal(
    isFieldSpecificTouchlineStadiumSource(anfield, {
      ...capacity,
      evidence: "Official stadium record identifying the stadium by name.",
    }),
    false,
  );
  assert.equal(
    isFieldSpecificTouchlineStadiumSource(anfield, {
      ...capacity,
      evidence: "Liverpool FC announcement confirms Anfield capacity of 60,704.",
    }),
    false,
  );
});

test("stadium source policy rejects generic, stale and wrong-club citation paths", () => {
  for (const url of [
    "http://www.premierleague.com/en/clubs/1/arsenal/stadium",
    "https://example.invalid/stadium",
    "https://www.premierleague.com/clubs/1/club/stadium",
    "https://www.premierleague.com/clubs/4/Manutd/stadium",
    "https://www.premierleague.com/clubs/34/West-Ham/stadium",
    "https://www.cpfc.co.uk/club/selhurst-park/",
  ]) {
    assert.equal(isApprovedTouchlineStadiumSourceUrl(url), false, `must reject ${url}`);
  }

  for (const url of [
    "https://www.premierleague.com/en/clubs/1/arsenal/stadium",
    "https://www.premierleague.com/en/clubs/94/brentford/stadium",
    "https://www.cpfc.co.uk/selhurst-park/stadium/",
    "https://www.liverpoolfc.com/news/new-anfield-capacity-confirmed-ahead-2024-25",
  ]) {
    assert.equal(isApprovedTouchlineStadiumSourceUrl(url), true, `must accept ${url}`);
  }
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
    interiorImageUrl: "/touchlineArena/stadiums/interiors/08-crystal-palace-selhurst-park-live.webp",
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

test("all twenty approved home grounds expose bounded interior hero artwork", async () => {
  const entriesWithInterior = TOUCHLINE_STADIUM_CATALOG.filter((entry) => entry.interiorImageUrl);
  const expected = [
    ["19", "204", "01-arsenal-emirates-stadium-live.webp"],
    ["15", "5", "02-aston-villa-villa-park-live.webp"],
    ["52", "146", "03-bournemouth-vitality-stadium-live.webp"],
    ["236", "338817", "04-brentford-gtech-community-stadium-live.webp"],
    ["78", "480", "05-brighton-american-express-stadium-live.webp"],
    ["18", "321614", "06-chelsea-stamford-bridge-live.webp"],
    ["117", "270", "07-coventry-cbs-arena-live.webp"],
    ["51", "201", "08-crystal-palace-selhurst-park-live.webp"],
    ["13", "343762", "09-everton-hill-dickinson-stadium-live.webp"],
    ["11", "485", "10-fulham-craven-cottage-live.webp"],
    ["22", "199", "11-hull-city-mkm-stadium-live.webp"],
    ["116", "504", "12-ipswich-town-portman-road-live.webp"],
    ["71", "488", "13-leeds-united-elland-road-live.webp"],
    ["8", "230", "14-liverpool-anfield-live.webp"],
    ["9", "151", "15-manchester-city-etihad-stadium-live.webp"],
    ["14", "206", "16-manchester-united-old-trafford-interior.webp"],
    ["20", "449", "17-newcastle-united-st-james-park-live.webp"],
    ["63", "542", "18-nottingham-forest-city-ground-live.webp"],
    ["3", "212", "19-sunderland-stadium-of-light-live.webp"],
    ["6", "281313", "20-tottenham-hotspur-stadium-live.webp"],
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
    const metadata = await sharp(fileURLToPath(asset)).metadata();
    assert.equal(metadata.format, "webp", `${fileName} must be delivered as WebP`);
    assert.equal(metadata.width, 1_600, `${fileName} must retain the approved 1600px width`);
    assert.equal(metadata.height, 1_000, `${fileName} must retain the approved 1000px height`);
    assert.equal(
      toTouchlineLiveFixture(fixture(homeTeamProviderId, providerVenueId)).venue?.interiorImageUrl,
      stadium.interiorImageUrl,
    );
  }

  assert.equal(
    toTouchlineLiveFixture(fixture("9", "151")).venue?.interiorImageUrl,
    "/touchlineArena/stadiums/interiors/15-manchester-city-etihad-stadium-live.webp",
  );
  assert.equal(toTouchlineLiveFixture(fixture("14", "151")).venue, undefined);
});

test("the visitor never selects or supplies the Live interior", () => {
  const arsenalHome = toTouchlineLiveFixture(fixture("19", "204", "15"));
  const villaHome = toTouchlineLiveFixture(fixture("15", "5", "19"));
  assert.equal(arsenalHome.venue?.interiorImageUrl, "/touchlineArena/stadiums/interiors/01-arsenal-emirates-stadium-live.webp");
  assert.equal(villaHome.venue?.interiorImageUrl, "/touchlineArena/stadiums/interiors/02-aston-villa-villa-park-live.webp");

  assert.equal(toTouchlineLiveFixture(fixture("19", "5", "15")).venue, undefined);
  assert.equal(toTouchlineLiveFixture(fixture("15", "204", "19")).venue, undefined);
  const etihadInterior = "/touchlineArena/stadiums/interiors/15-manchester-city-etihad-stadium-live.webp";
  assert.equal(toTouchlineLiveFixture(fixture("9", "151", "14")).venue?.interiorImageUrl, etihadInterior);
  assert.equal(
    toTouchlineLiveFixture(fixture("51", "201", "52")).venue?.interiorImageUrl,
    "/touchlineArena/stadiums/interiors/08-crystal-palace-selhurst-park-live.webp",
  );

  for (const awayTeamProviderId of TOUCHLINE_STADIUM_CATALOG.map((entry) => entry.homeTeamProviderId)) {
    assert.equal(
      toTouchlineLiveFixture(fixture("9", "151", awayTeamProviderId)).venue?.interiorImageUrl,
      etihadInterior,
      `away team ${awayTeamProviderId} must not supply the Live interior`,
    );
  }

  const tottenhamHome = toTouchlineLiveFixture(fixture("6", "281313", "9"));
  const tottenhamAway = toTouchlineLiveFixture(fixture("9", "151", "6"));
  assert.equal(
    tottenhamHome.venue?.interiorImageUrl,
    "/touchlineArena/stadiums/interiors/20-tottenham-hotspur-stadium-live.webp",
  );
  assert.equal(tottenhamAway.venue?.interiorImageUrl, etihadInterior);
});
