import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

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
import { findTouchLineClub } from "../lib/touchlineArena/demo-data.ts";
import { selectPublicClubFixture } from "../lib/football-data/public-fixture-selection.ts";
import { TOUCHLINE_STADIUM_CATALOG, toTouchlineLiveFixture } from "../lib/touchlineArena/stadium-catalog.ts";
import type { TouchlineFixture } from "../lib/football-data/types.ts";

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
  assert.match(source, /<DocumentLocaleSync initialLocale=\{locale\} draftLocalesEnabled=\{draftLocalesEnabled\} \/>/);
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

async function routeModule(path: string, dependencies: Record<string, unknown>, extra = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8"), exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, Response, URL, ...extra, fetch: () => { throw Error("NO_NETWORK_ALLOWED"); }, require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `forbidden dependency ${name}`); return dependencies[name];
    } });
  return exports;
}
type QaGet = (request: Request, context: { params: Promise<{ teamId: string }> }) => Promise<Response>;
async function footballRouteFixture() {
  const calls: string[] = [], now = Date.now(), stamp = new Date(now - 60_000).toISOString();
  const freshTable = structuredClone(table); freshTable.asOf = stamp; freshTable.season!.sourceUpdatedAt = stamp;
  const source = (providerId: string) => ({ provider: "sportmonks" as const, providerId, lastSyncedAt: stamp });
  const fixture: TouchlineFixture = { id: "sportmonks:19876543", providerId: "19876543", provider: "sportmonks", source: source("19876543"),
    startsAt: new Date(now + 3_600_000).toISOString(), status: "Not Started", roundName: "Gameweek 3", homeScore: 0, awayScore: 0,
    homeTeam: { id: "19", providerId: "19", provider: "sportmonks", name: "Arsenal FC", shortCode: "ARS", source: source("19") },
    awayTeam: { id: "18", providerId: "18", provider: "sportmonks", name: "Chelsea FC", shortCode: "CHE", source: source("18") } };
  const state = { environment: "qa", failed: "", invalidTable: false, persisted: [fixture], scheduled: [] as TouchlineFixture[] };
  const read = <T>(name: string, value: () => T) => async () => { calls.push(name); if (state.failed === name) throw Error("PRIVATE_READER_ERROR"); return value(); };
  const mod = await routeModule("app/api/touchline-qa/read/clubhub/[teamId]/route.ts", {
    "next/server": createRequire(import.meta.url)("next/server"),
    "@/lib/football-data/fixture-schedule-store": { readPublicCompetitionFixtures: read("schedule", () => state.scheduled) },
    "@/lib/football-data/official-league-table-server": { loadTouchlineOfficialLeagueTable: read("table", () => state.invalidTable ? { ...freshTable, rows: [] } : freshTable) },
    "@/lib/football-data/public-fantasy-snapshot": { readPublicFantasyFixtureSnapshots: read("persisted-football", () => state.persisted.map(fixture => ({ fixture }))) },
    "@/lib/football-data/public-fixture-selection": { selectPublicClubFixture },
    "@/lib/touchlineArena/demo-data": { findTouchLineClub },
    "@/lib/touchlineArena/stadium-catalog": { TOUCHLINE_STADIUM_CATALOG, toTouchlineLiveFixture },
    "@/lib/touchlineMirror/qa-clubhub-mirror": { createTouchlineQaClubHubMirrorDto },
    "@/lib/touchlinePreview/isolation": { inspectTouchlineIsolatedPreviewEnvironment: () => ({ status: state.environment }) },
  });
  return { calls, state, fixture, freshTable, get: mod.GET as QaGet, module: mod,
    request: (teamId = "19") => (mod.GET as QaGet)(new Request(`${QA_ORIGIN}/api/touchline-qa/read/clubhub/${teamId}`), { params: Promise.resolve({ teamId }) }) };
}
function assertPrivate(response: Response, status: number) {
  assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff"); assert.equal(response.headers.has("location"), false);
}

test("retired QA feed artwork GET is an unconditional private 404 with no imports, params, environment or I/O", async () => {
  for (const environment of ["qa", "production", "isolated-preview", "malformed"]) {
    const mod = await routeModule("app/api/touchline-qa/read/clubhub/[teamId]/feed-art/[publicId]/route.ts", {}, {
      process: { get env() { throw Error(`ENV_MUST_NOT_BE_READ:${environment}`); } },
    });
    assert.deepEqual(Object.keys(mod).sort(), ["GET", "dynamic", "runtime"]);
    assert.equal(mod.runtime, "nodejs"); assert.equal(mod.dynamic, "force-dynamic");
    for (const [teamId, publicId] of [["19", "a".repeat(40)], ["arsenal", "bad"], ["", ""], ["999999", "../secret"]]) {
      const response = await (mod.GET as (request: Request, context: unknown) => Promise<Response>)(
        new Request(`${QA_ORIGIN}/api/touchline-qa/read/clubhub/${teamId}/feed-art/${publicId}`),
        { get params() { throw Error("PARAMS_MUST_NOT_BE_READ"); } });
      assertPrivate(response, 404); assert.deepEqual(await response.json(), { ok: false, error: "Not found" });
    }
  }
});

test("QA football handler preserves v1 facts, zero/null and row order without loading social or its converter", async () => {
  for (const scores of [0, undefined]) {
    const h = await footballRouteFixture(); h.fixture.homeScore = scores; h.fixture.awayScore = scores;
    if (scores === undefined) { h.state.persisted = []; h.state.scheduled = [h.fixture]; }
    const response = await h.request(); assertPrivate(response, 200); const value = await response.json();
    const dto = parseTouchlineQaClubHubMirrorDto(value); assert.ok(dto);
    assert.equal(dto.schemaVersion, 1); assert.deepEqual(dto.feed, { state: "unavailable", items: [] });
    assert.deepEqual(h.calls, ["table", "persisted-football", "schedule"]);
    assert.equal(dto.club.teamId, "19"); assert.equal(dto.club.name, "Arsenal FC"); assert.equal(dto.club.homeVenue?.id, "emirates-stadium");
    assert.equal(dto.nextFixture?.fixtureId, "19876543"); assert.equal(dto.nextFixture?.startsAt, h.fixture.startsAt);
    assert.equal(dto.nextFixture?.roundName, "Gameweek 3"); assert.equal(dto.nextFixture?.homeScore, scores ?? null); assert.equal(dto.nextFixture?.awayScore, scores ?? null);
    assert.equal(dto.nextFixture?.venue, null); assert.equal(dto.leagueTable.rows[0].goalsFor, 0); assert.equal(dto.leagueTable.rows[0].liveFixture, null);
    assert.deepEqual(dto.leagueTable.rows.map(row => row.team.teamId), h.freshTable.rows.map(row => row.team.providerTeamId));
    assert.equal(dto.leagueTable.season?.providerSeasonId, "28083"); assert.equal(dto.leagueTable.season?.sourceUpdatedAt, h.freshTable.season?.sourceUpdatedAt);
    assert.doesNotMatch(JSON.stringify(dto), /imagePath|publicId|signedUrl|token|PRIVATE_/);
  }
});

test("QA football handler retains guards, canonical club lookup and awaited params before football readers", async () => {
  for (const environment of ["production", "isolated-preview", "invalid", "local"]) {
    const h = await footballRouteFixture(); h.state.environment = environment;
    const response = await h.get(new Request(QA_ORIGIN), { params: new Promise(() => {}) });
    assertPrivate(response, 404); assert.deepEqual(h.calls, []);
  }
  for (const teamId of ["", "arsenal", "unknown", "999999"]) {
    const h = await footballRouteFixture(); assertPrivate(await h.request(teamId), 404); assert.deepEqual(h.calls, []);
  }
  const h = await footballRouteFixture(); let release!: (value: { teamId: string }) => void;
  const pending = h.get(new Request(QA_ORIGIN), { params: new Promise(resolve => { release = resolve; }) });
  await Promise.resolve(); assert.deepEqual(h.calls, []); release({ teamId: "19" }); assertPrivate(await pending, 200);
  const rejected = await footballRouteFixture(); await assert.rejects(rejected.get(new Request(QA_ORIGIN), { params: Promise.reject(Error("PARAMS_REJECTED")) }), /PARAMS_REJECTED/);
  assert.deepEqual(rejected.calls, []);
});

test("QA football handler preserves sanitized 503 on reader or model failure and null fixture when no current match exists", async () => {
  for (const failed of ["table", "persisted-football", "schedule", "invalid-model"]) {
    const h = await footballRouteFixture(); h.state.failed = failed; h.state.invalidTable = failed === "invalid-model";
    const response = await h.request(); assertPrivate(response, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "TL_QA_CLUBHUB_MIRROR_UNAVAILABLE" });
  }
  const h = await footballRouteFixture(); h.state.persisted = []; h.state.scheduled = [];
  const response = await h.request(); assertPrivate(response, 200); const dto = parseTouchlineQaClubHubMirrorDto(await response.json()); assert.ok(dto);
  assert.equal(dto.nextFixture, null); assert.deepEqual(dto.feed, { state: "unavailable", items: [] });
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
  assert.doesNotMatch(source, /readTouchlineClubSocialFeed/);
  assert.doesNotMatch(source, /loadTouchlineQaMirroredSocialFeed/);
  assert.doesNotMatch(mirrorServer, /createAdminClient|createFootballDataProvider|SPORTMONKS_API_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(mirrorServer, /loadTouchlineOfficialLeagueTable|readPublicPremierSquad|fallback/i);
});
