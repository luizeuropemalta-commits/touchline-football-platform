import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { TouchlineOfficialLeagueTable } from "../lib/football-data/official-league-table.ts";
import type { TouchlinePublicFixture, TouchlinePublicVenue } from "../lib/football-data/public-fixture.ts";
import { TOUCHLINE_ENGLAND_CLUBS, type TouchLineClubVisual } from "../lib/touchlineArena/demo-data.ts";
import {
  TOUCHLINE_QA_CLUBHUB_MIRROR_MAX_BYTES,
  TOUCHLINE_QA_READ_HOST,
  createTouchlineQaClubHubMirrorDto,
  fetchTouchlineQaClubHubMirror,
  parseTouchlineQaClubHubMirrorDto,
  resolveTouchlineClubHubDataSource,
  resolveTouchlineQaReadOrigin,
} from "../lib/touchlineMirror/qa-clubhub-mirror.ts";
import { resolveTouchlineDataSource } from "../lib/touchlineMirror/runtime.ts";

const NOW = Date.parse("2026-09-03T18:00:00.000Z");
const QA_ORIGIN = `https://${TOUCHLINE_QA_READ_HOST}`;
const club: TouchLineClubVisual = {
  teamId: "19",
  name: "Arsenal FC",
  slug: "arsenal",
  shortCode: "ARS",
  logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png",
  accent: "#e30613",
  secondaryAccent: "#f6d45f",
  aliases: ["arsenal"],
  sponsorSlots: 3,
  licenseStatus: "provider-cached",
};
const table: TouchlineOfficialLeagueTable = {
  state: "ready",
  competitionProviderId: "8",
  season: {
    id: "private-database-season-uuid",
    providerSeasonId: "28083",
    name: "2026/2027",
    sourceUpdatedAt: "2026-09-03T17:59:00.000Z",
  },
  asOf: "2026-09-03T17:59:00.000Z",
  coverage: {
    expectedClubs: 20,
    mappedClubs: 20,
    fixturesInSeason: 30,
    completedFixtures: 10,
    liveFixtures: 0,
    duplicateFixtures: 0,
  },
  rows: [club, ...TOUCHLINE_ENGLAND_CLUBS.filter((candidate) => candidate.teamId !== club.teamId)].map((team, index) => ({
    sportsRank: 1,
    isTied: true,
    displayPosition: index + 1,
    team: {
      providerTeamId: team.teamId,
      name: team.name,
      shortCode: team.shortCode,
      slug: team.slug,
      logoUrl: team.logoUrl,
    },
    played: 1,
    won: 0,
    drawn: 1,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 1,
    form: ["D"] as const,
    liveFixture: null,
  })),
  reason: null,
};
const homeVenue: TouchlinePublicVenue = {
  id: "emirates-stadium",
  name: "Emirates Stadium",
  capacity: 60_704,
  homeClubName: "Arsenal",
  imageUrl: "/touchlineArena/stadiums/aerial/01-arsenal-emirates-stadium.webp",
  interiorImageUrl: "/touchlineArena/stadiums/interiors/01-arsenal-emirates-stadium-live.webp",
};
const nextFixture: TouchlinePublicFixture = {
  id: "sportmonks:19876543",
  providerId: "19876543",
  startsAt: "2026-09-06T16:30:00.000Z",
  status: "Not Started",
  roundName: "Gameweek 3",
  homeTeam: {
    id: "19",
    providerId: "19",
    name: "Arsenal FC",
    shortCode: "ARS",
    logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png",
  },
  awayTeam: {
    id: "18",
    providerId: "18",
    name: "Chelsea FC",
    shortCode: "CHE",
    logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/chelsea.png",
  },
  venue: homeVenue,
  verifiedAt: "2026-09-03T17:59:30.000Z",
};

function mirrorDto() {
  const dto = createTouchlineQaClubHubMirrorDto({
    club,
    table,
    nextFixture,
    homeVenue,
    feed: {
      state: "ready",
      items: [{
        publicId: "a".repeat(40),
        contentType: "MATCH_PREVIEW",
        copy: "Arsenal v Chelsea · verified match preview.",
        publishedAt: "2026-09-03T17:58:00.000Z",
        width: 1080,
        height: 1350,
        imagePath: `/api/touchline-qa/read/clubhub/19/feed-art/${"a".repeat(40)}`,
      }],
    },
    generatedAt: new Date(NOW).toISOString(),
  });
  assert.ok(dto);
  return dto;
}

test("QA ClubHub mirror serializes only the versioned public allowlist", () => {
  const dto = mirrorDto();
  const serialized = JSON.stringify(dto);

  assert.equal(dto.schemaVersion, 1);
  assert.deepEqual(Object.keys(dto).sort(), ["club", "feed", "generatedAt", "leagueTable", "nextFixture", "schemaVersion"]);
  assert.equal(dto.club.teamId, "19");
  assert.equal(dto.club.homeVenue?.name, "Emirates Stadium");
  assert.equal(dto.nextFixture?.fixtureId, "19876543");
  assert.equal(dto.nextFixture?.homeTeam.teamId, "19");
  assert.equal(dto.nextFixture?.awayTeam.teamId, "18");
  assert.equal(dto.nextFixture?.venue?.id, "emirates-stadium");
  assert.equal(dto.feed.state, "ready");
  assert.equal(dto.feed.items[0]?.publicId, "a".repeat(40));
  assert.doesNotMatch(dto.feed.items[0]?.imagePath ?? "", /token|supabase|https?:/i);
  assert.equal(dto.leagueTable.rows[0]?.team.teamId, "19");
  assert.doesNotMatch(serialized, /private-database-season-uuid/);
  assert.doesNotMatch(serialized, /service.?role|authorization|cookie|password|secret|token|artifactBucket|artifactKey|ownerId|userId/i);
});

test("QA ClubHub mirror replaces provider fixture crests with canonical TouchLine assets", () => {
  const dto = createTouchlineQaClubHubMirrorDto({
    club,
    table,
    nextFixture: {
      ...nextFixture,
      homeTeam: {
        ...nextFixture.homeTeam!,
        logoUrl: "https://cdn.sportmonks.com/images/soccer/teams/19/19.png",
      },
      awayTeam: {
        ...nextFixture.awayTeam!,
        logoUrl: "https://cdn.sportmonks.com/images/soccer/teams/18/18.png",
      },
    },
    homeVenue,
    feed: { state: "empty", items: [] },
    generatedAt: new Date(NOW).toISOString(),
  });

  assert.ok(dto);
  assert.equal(dto.nextFixture?.homeTeam.logoUrl, club.logoUrl);
  assert.equal(
    dto.nextFixture?.awayTeam.logoUrl,
    "/touchlineArena/shared/club-logos/2026-27/ui-512/chelsea.png",
  );
  assert.doesNotMatch(JSON.stringify(dto), /cdn\.sportmonks\.com/i);
});

test("QA ClubHub mirror parser rejects additions, leaked fields, mismatched shape and stale payloads", () => {
  const dto = mirrorDto();
  const fixture = dto.nextFixture;
  assert.ok(fixture);
  assert.ok(fixture.venue);
  assert.equal(parseTouchlineQaClubHubMirrorDto(dto, { now: NOW }), dto);
  assert.equal(parseTouchlineQaClubHubMirrorDto({ ...dto, extra: true }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({ ...dto, serviceRoleKey: "leak" }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    club: { ...dto.club, cookie: "leak" },
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    nextFixture: { ...fixture, internalFixtureUuid: "leak" },
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    feed: {
      ...dto.feed,
      items: dto.feed.items.map((item) => ({ ...item, imagePath: "https://qa.invalid/signed?token=leak" })),
    },
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    feed: {
      ...dto.feed,
      items: dto.feed.items.map((item) => ({
        ...item,
        imagePath: `/api/touchline-qa/read/clubhub/18/feed-art/${item.publicId}`,
      })),
    },
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: { ...dto.leagueTable, rows: dto.leagueTable.rows.slice(0, 19) },
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    nextFixture: { ...fixture, venue: { ...fixture.venue, imageUrl: "https://attacker.invalid/stadium.jpg" } },
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    nextFixture: {
      ...fixture,
      homeTeam: { ...fixture.homeTeam, teamId: "9" },
      awayTeam: { ...fixture.awayTeam, teamId: "14" },
    },
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    generatedAt: "2026-09-03T17:40:00.000Z",
  }, { now: NOW }), null);
});

test("QA ClubHub mirror rejects private material embedded inside allowlisted text", () => {
  const dto = mirrorDto();
  const privateCopies = [
    "Contact the owner at owner@example.com",
    "token=qa-private-token-value",
    "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.private.signature",
    "Internal reference 123e4567-e89b-12d3-a456-426614174000",
    "Download https://example.invalid/private-artwork",
  ];

  for (const copy of privateCopies) {
    assert.equal(parseTouchlineQaClubHubMirrorDto({
      ...dto,
      feed: {
        ...dto.feed,
        items: dto.feed.items.map((item) => ({ ...item, copy })),
      },
    }, { now: NOW }), null, copy);
  }

  const publicCopy = "⚽ Arsenal v Chelsea\nA verified public match preview.";
  const publicDto = {
    ...dto,
    feed: {
      ...dto.feed,
      items: dto.feed.items.map((item) => ({ ...item, copy: publicCopy })),
    },
  };
  assert.equal(parseTouchlineQaClubHubMirrorDto(publicDto, { now: NOW }), publicDto);
});

test("QA ClubHub mirror rejects stale or unverifiable football source timestamps", () => {
  const dto = mirrorDto();
  const fixture = dto.nextFixture;
  assert.ok(fixture);

  for (const verifiedAt of [null, "2026-09-01T17:59:30.000Z", "2026-09-03T18:02:00.000Z"]) {
    assert.equal(parseTouchlineQaClubHubMirrorDto({
      ...dto,
      nextFixture: { ...fixture, verifiedAt },
    }, { now: NOW }), null, String(verifiedAt));
  }

  for (const asOf of [null, "2026-08-20T17:59:00.000Z", "2026-09-03T18:02:00.000Z"]) {
    assert.equal(parseTouchlineQaClubHubMirrorDto({
      ...dto,
      leagueTable: { ...dto.leagueTable, asOf },
    }, { now: NOW }), null, String(asOf));
  }

  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: {
      ...dto.leagueTable,
      season: dto.leagueTable.season
        ? { ...dto.leagueTable.season, sourceUpdatedAt: "2025-01-01T00:00:00.000Z" }
        : null,
    },
  }, { now: NOW }), null);

  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    nextFixture: { ...fixture, startsAt: "2026-02-30T12:00:00.000Z" },
  }, { now: NOW }), null);
});

test("QA ClubHub mirror rejects impossible table and fixture relationships", () => {
  const dto = mirrorDto();
  const fixture = dto.nextFixture;
  assert.ok(fixture);
  assert.ok(fixture.venue);

  const replaceFirstRow = (changes: Record<string, unknown>) => ({
    ...dto.leagueTable,
    rows: dto.leagueTable.rows.map((row, index) => index === 0 ? { ...row, ...changes } : row),
  });

  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: replaceFirstRow({ played: 3 }),
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: replaceFirstRow({ goalDifference: 5 }),
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: replaceFirstRow({ points: 7 }),
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: replaceFirstRow({
      won: 1,
      drawn: 0,
      goalsFor: 1,
      goalDifference: 1,
      points: 3,
      form: ["W"],
    }),
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: replaceFirstRow({ goalsFor: 1, goalDifference: 1 }),
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: {
      ...dto.leagueTable,
      coverage: { ...dto.leagueTable.coverage, completedFixtures: 9 },
    },
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: {
      ...dto.leagueTable,
      coverage: { ...dto.leagueTable.coverage, completedFixtures: 31 },
    },
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: { ...dto.leagueTable, season: null },
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: replaceFirstRow({ displayPosition: 2 }),
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: {
      ...dto.leagueTable,
      rows: dto.leagueTable.rows.map((row, index) => index === 19
        ? { ...row, displayPosition: 21 }
        : row),
    },
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: replaceFirstRow({ sportsRank: 2 }),
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    leagueTable: replaceFirstRow({ isTied: false }),
  }, { now: NOW }), null);
  assert.equal(parseTouchlineQaClubHubMirrorDto({
    ...dto,
    nextFixture: {
      ...fixture,
      venue: { ...fixture.venue, homeClubName: "Chelsea" },
    },
  }, { now: NOW }), null);
});

test("QA mirror accepts only the exact HTTPS QA origin and remains local-only", () => {
  assert.equal(resolveTouchlineQaReadOrigin(QA_ORIGIN), QA_ORIGIN);
  assert.equal(resolveTouchlineQaReadOrigin(`${QA_ORIGIN}/`), QA_ORIGIN);
  for (const rejected of [
    `http://${TOUCHLINE_QA_READ_HOST}`,
    `https://user:pass@${TOUCHLINE_QA_READ_HOST}`,
    `https://${TOUCHLINE_QA_READ_HOST}.attacker.invalid`,
    `https://preview-other.vercel.app`,
    `${QA_ORIGIN}/api`,
    `${QA_ORIGIN}?redirect=https://attacker.invalid`,
    `${QA_ORIGIN}#fragment`,
    `${QA_ORIGIN}:444`,
  ]) assert.equal(resolveTouchlineQaReadOrigin(rejected), null, rejected);

  assert.equal(resolveTouchlineClubHubDataSource({
    NODE_ENV: "development",
    TOUCHLINE_DATA_SOURCE: "qa-mirror",
    TOUCHLINE_QA_READ_ORIGIN: QA_ORIGIN,
  }), "qa-mirror");
  assert.equal(resolveTouchlineClubHubDataSource({
    NODE_ENV: "production",
    TOUCHLINE_DATA_SOURCE: "qa-mirror",
    TOUCHLINE_QA_READ_ORIGIN: QA_ORIGIN,
  }), "invalid");
  assert.equal(resolveTouchlineClubHubDataSource({
    NODE_ENV: "development",
    VERCEL_ENV: "preview",
    TOUCHLINE_DATA_SOURCE: "qa-mirror",
    TOUCHLINE_QA_READ_ORIGIN: QA_ORIGIN,
  }), "invalid");
  assert.equal(resolveTouchlineDataSource({
    NODE_ENV: "development",
    TOUCHLINE_DATA_SOURCE: "qa-mirror",
    TOUCHLINE_QA_READ_ORIGIN: QA_ORIGIN,
  }), "qa-mirror");
  assert.equal(resolveTouchlineDataSource({ NODE_ENV: "development" }), "direct");
  assert.equal(resolveTouchlineDataSource({
    NODE_ENV: "development",
    TOUCHLINE_DATA_SOURCE: "unexpected-mode",
  }), "invalid");
});

test("root layout keeps locale sync but disables browser analytics for mirror and invalid modes", async () => {
  const source = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(source, /resolveTouchlineDataSource\(\)/);
  assert.match(source, /<DocumentLocaleSync initialLocale=\{locale\} \/>/);
  assert.match(source, /dataSource === "direct"\s*\?\s*<TouchlineActivityTracker \/>\s*:\s*null/);
});

test("QA mirror performs one credential-free GET and accepts a valid fresh response", async () => {
  let calls = 0;
  const dto = mirrorDto();
  const result = await fetchTouchlineQaClubHubMirror({
    teamId: "19",
    origin: QA_ORIGIN,
    now: NOW,
    fetchImplementation: async (url, init) => {
      calls += 1;
      assert.equal(url.href, `${QA_ORIGIN}/api/touchline-qa/read/clubhub/19`);
      assert.equal(init?.method, "GET");
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.redirect, "manual");
      assert.equal(init?.referrerPolicy, "no-referrer");
      assert.deepEqual(init?.headers, { Accept: "application/json" });
      const headers = new Headers(init?.headers);
      assert.equal(headers.has("authorization"), false);
      assert.equal(headers.has("cookie"), false);
      return Response.json(dto);
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { state: "ready", data: dto });
});

test("QA mirror fails closed without retries for redirects, oversize, stale and network failure", async () => {
  let redirectCalls = 0;
  const redirect = await fetchTouchlineQaClubHubMirror({
    teamId: "19",
    origin: QA_ORIGIN,
    fetchImplementation: async () => {
      redirectCalls += 1;
      return new Response(null, { status: 307, headers: { Location: "https://attacker.invalid" } });
    },
  });
  assert.deepEqual(redirect, { state: "unavailable", reason: "redirect" });
  assert.equal(redirectCalls, 1);

  const oversize = await fetchTouchlineQaClubHubMirror({
    teamId: "19",
    origin: QA_ORIGIN,
    fetchImplementation: async () => new Response("{}", {
      status: 200,
      headers: { "Content-Length": String(TOUCHLINE_QA_CLUBHUB_MIRROR_MAX_BYTES + 1) },
    }),
  });
  assert.deepEqual(oversize, { state: "unavailable", reason: "oversize" });

  const staleDto = { ...mirrorDto(), generatedAt: "2026-09-03T17:40:00.000Z" };
  const stale = await fetchTouchlineQaClubHubMirror({
    teamId: "19",
    origin: QA_ORIGIN,
    now: NOW,
    fetchImplementation: async () => Response.json(staleDto),
  });
  assert.deepEqual(stale, { state: "unavailable", reason: "stale" });

  let networkCalls = 0;
  const network = await fetchTouchlineQaClubHubMirror({
    teamId: "19",
    origin: QA_ORIGIN,
    fetchImplementation: async () => {
      networkCalls += 1;
      throw new Error("offline");
    },
  });
  assert.deepEqual(network, { state: "unavailable", reason: "network" });
  assert.equal(networkCalls, 1);
});

test("QA endpoint is GET-only, QA-gated, no-store and does not read private request state", async () => {
  const source = await readFile(
    new URL("../app/api/touchline-qa/read/clubhub/[teamId]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.match(source, /inspectTouchlineIsolatedPreviewEnvironment\(\)\.status !== "qa"/);
  assert.match(source, /private, no-store, max-age=0/);
  assert.doesNotMatch(source, /cookies\(|headers\(|authorization|SUPABASE_SERVICE_ROLE_KEY|SPORTMONKS_API_TOKEN|TOUCHLINE_LIVE_SYNC_SECRET/);
});

test("QA feed artwork endpoint exposes only the bounded published proxy contract", async () => {
  const source = await readFile(
    new URL("../app/api/touchline-qa/read/clubhub/[teamId]/feed-art/[publicId]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.match(source, /inspectTouchlineIsolatedPreviewEnvironment\(\)\.status !== "qa"/);
  assert.match(source, /PUBLIC_ID\.test\(publicId\)/);
  assert.match(source, /touchlineQaClubHubFeedPublicId\(candidate\.id\) === publicId/);
  assert.match(source, /url\.origin === expectedOrigin/);
  assert.match(source, /pathname\.startsWith\("\/storage\/v1\/object\/sign\/touchline-social-drafts\/"\)/);
  assert.match(source, /redirect:\s*"manual"/);
  assert.match(source, /MAX_ARTWORK_BYTES/);
  assert.match(source, /private, no-store, max-age=0/);
  assert.doesNotMatch(source, /cookies\(|headers\(|authorization|SPORTMONKS_API_TOKEN|TOUCHLINE_LIVE_SYNC_SECRET/);
});

test("ClubHub selects the mirror only through the local data-source gate", async () => {
  const source = await readFile(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const mirrorServer = await readFile(new URL("../lib/touchlineMirror/qa-clubhub-mirror-server.ts", import.meta.url), "utf8");
  assert.match(source, /resolveTouchlineClubHubDataSource\(\)/);
  assert.match(source, /loadTouchlineQaMirroredLeagueTable\(club\.teamId, mirrorResultPromise/);
  assert.match(source, /loadTouchlineQaClubHubMirror\(club\.teamId\)/);
  assert.match(source, /mirrorDtoToPublicFixture\(mirrorResult\.data\)/);
  assert.match(source, /dataSource === "invalid"/);
  assert.match(source, /if \(dataSource !== "direct"\)[\s\S]*?TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY/);
  assert.match(source, /dataSource === "direct" \? loadTouchLineActiveRanking\(\)/);
  assert.match(source, /dataSource === "direct"[\s\S]*?readTouchlineClubSocialFeed/);
  assert.match(source, /loadTouchlineQaMirroredSocialFeed\(club\.teamId, mirrorResultPromise/);
  assert.doesNotMatch(mirrorServer, /createAdminClient|createFootballDataProvider|SPORTMONKS_API_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(mirrorServer, /loadTouchlineOfficialLeagueTable|readPublicPremierSquad|fallback/i);
});
