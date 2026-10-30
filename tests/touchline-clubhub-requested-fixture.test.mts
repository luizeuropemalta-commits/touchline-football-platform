import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/touchlineArena/club-hub-requested-fixture.ts", import.meta.url), "utf8");
const moduleExports = {} as typeof import("../lib/touchlineArena/club-hub-requested-fixture");
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: moduleExports });
const parse = moduleExports.parseClubHubFixtureQuery;
const read = moduleExports.readClubHubRequestedFixture;
const formation = moduleExports.selectClubHubRequestedFormation;
const fixture = { provider: "sportmonks", providerId: "123", homeTeam: { providerId: "1" }, awayTeam: { providerId: "2" } };
const belongsToClub = (candidate: typeof fixture) => [candidate.homeTeam.providerId, candidate.awayTeam.providerId].includes("1");
const feed = { fixture, lineups: [{ teamId: "1", playerId: "42" }] };
const available = (value = feed) => ({ status: "available", snapshot: { feed: value, capturedAt: "2026-10-24T00:00:00Z" } });

test("requested formation requires exact fixture, team and provider, not a matching name", () => {
  const item = { provider: "sportmonks", fixtureId: "123", teamId: "1", teamName: "Club One", formation: "4-3-3" };
  assert.equal(formation([item], "123", "1"), "4-3-3");
  for (const candidate of [
    { ...item, fixtureId: "999" }, { ...item, teamId: "2" }, { ...item, teamId: undefined },
    { ...item, provider: "other" }, { ...item, formation: "" }, { ...item, formation: "invalid" },
  ]) assert.equal(formation([candidate], "123", "1"), null);
  assert.equal(formation([item], "invalid", "1"), null);
  assert.equal(formation([item], "123", ""), null);
  assert.equal(formation([], "123", "1"), null);
});

test("duplicate or contradictory formations cannot select an arbitrary first row", () => {
  const item = { provider: "sportmonks", fixtureId: "123", teamId: "1", formation: "4-3-3" };
  assert.equal(formation([item, { ...item }], "123", "1"), null);
  assert.equal(formation([item, { ...item, formation: "4-4-2" }], "123", "1"), null);
  assert.equal(formation([{ ...item, fixtureId: "999", formation: "4-4-2" }, item], "123", "1"), "4-3-3");
});

test("query distinguishes omission from malformed, empty and repeated explicit fixture requests", () => {
  assert.equal(parse(undefined).state, "absent");
  for (const value of ["", " ", "0", "0123", "abc", "12a", "-12", "1.2", "1e2", " 123", "123 ", "1".repeat(21), ["123"], ["123", "456"], null, 123]) {
    assert.equal(parse(value).state, "invalid", JSON.stringify(value));
  }
  assert.equal(parse("123").state, "requested");
  assert.equal(parse("123").fixtureId, "123");
});

test("historical target is read by exact ID without a bounded recent-fixture enumeration", async () => {
  const calls: string[] = [];
  const result = await read("123", belongsToClub, {
    readFeed: async (id: string) => { calls.push(`feed:${id}`); return available(); },
    readFixture: async (id: string) => { calls.push(`fixture:${id}`); return fixture; },
  });
  assert.deepEqual(calls, ["feed:123", "fixture:123"]);
  assert.equal(result.persistedFeeds.length, 1);
  assert.equal(result.persistedFeeds[0], feed);
  assert.equal(result.scheduledFixtures[0], fixture);
});

test("both club participants can read the same exact fixture while another club cannot", async () => {
  for (const clubId of ["1", "2", "3"]) {
    const result = await read("123", (candidate: typeof fixture) => [candidate.homeTeam.providerId, candidate.awayTeam.providerId].includes(clubId), {
      readFeed: async () => available(), readFixture: async () => fixture,
    });
    assert.equal(result.persistedFeeds.length, clubId === "3" ? 0 : 1);
    assert.equal(result.scheduledFixtures.length, clubId === "3" ? 0 : 1);
  }
});

test("wrong identity/provider cannot replace the explicitly requested game", async () => {
  for (const candidate of [{ ...fixture, providerId: "999" }, { ...fixture, provider: "other" }]) {
    const result = await read("123", belongsToClub, {
      readFeed: async () => available({ ...feed, fixture: candidate }), readFixture: async () => candidate,
    });
    assert.equal(result.persistedFeeds.length, 0);
    assert.equal(result.scheduledFixtures.length, 0);
  }
});

test("pending or unavailable feed preserves only the requested schedule, never another lineup", async () => {
  for (const status of ["pending", "unavailable"]) {
    const result = await read("123", belongsToClub, { readFeed: async () => ({ status }), readFixture: async () => fixture });
    assert.equal(result.persistedFeeds.length, 0);
    assert.equal(result.scheduledFixtures[0], fixture);
    const missing = await read("123", belongsToClub, { readFeed: async () => ({ status }), readFixture: async () => null });
    assert.equal(missing.persistedFeeds.length + missing.scheduledFixtures.length, 0);
  }
});

test("same fixture identity with conflicting ordered participants fails closed", async () => {
  for (const candidate of [
    { ...fixture, awayTeam: { providerId: "3" } },
    { ...fixture, homeTeam: fixture.awayTeam, awayTeam: fixture.homeTeam },
    { ...fixture, awayTeam: { providerId: "" } },
    { ...fixture, awayTeam: { providerId: " " } },
    { ...fixture, awayTeam: fixture.homeTeam },
  ]) {
    const result = await read("123", belongsToClub, { readFeed: async () => available(), readFixture: async () => candidate });
    assert.equal(result.persistedFeeds.length + result.scheduledFixtures.length, 0);
  }
});

test("newer score, match status and kickoff facts do not masquerade as identity conflicts", async () => {
  const newer = { ...fixture, homeScore: 2, awayScore: 2, status: "FT", startsAt: "2026-10-24T17:30:00Z" };
  const olderFeed = { ...feed, fixture: { ...fixture, homeScore: 1, awayScore: 2, status: "LIVE", startsAt: "2026-10-24T17:00:00Z" } };
  const result = await read("123", belongsToClub, { readFeed: async () => available(olderFeed), readFixture: async () => newer });
  assert.equal(result.persistedFeeds[0], olderFeed);
  assert.equal(result.scheduledFixtures[0], newer);
});

test("invalid requests do no reads and read exceptions do not invoke a fallback", async () => {
  let calls = 0;
  const result = await read("invalid", belongsToClub, {
    readFeed: async () => { calls++; return available(); }, readFixture: async () => { calls++; return fixture; },
  });
  assert.equal(calls, 0);
  assert.equal(result.persistedFeeds.length + result.scheduledFixtures.length, 0);
  await assert.rejects(read("123", belongsToClub, {
    readFeed: async () => { throw new Error("read unavailable"); }, readFixture: async () => null,
  }), /read unavailable/);
});

test("page rejects invalid query before loaders and retains explicit/mirror fail-closed guards", () => {
  const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const render = page.slice(page.indexOf("async function renderClubHubPage"));
  assert.ok(render.indexOf('if (fixtureQuery.state === "invalid") notFound()') < render.indexOf("loadClubMatchSnapshot("));
  assert.match(page, /if \(dataSource !== "direct"\) \{\s*if \(requestedFixtureId\) return empty/);
  assert.match(page, /if \(requestedFixtureId && !requestedFixture\) return empty/);
  assert.match(page, /const lastCompletedXi = requestedFixtureId \? null/);
  assert.match(page, /readClubHubRequestedFixture\(requestedFixtureId,[\s\S]*?readFeed: readPersistedFantasyFixtureFeedResult,[\s\S]*?readFixture: readPublicCompetitionFixtureByProviderId/);
  assert.ok(page.includes('[candidate.homeTeam?.providerId, candidate.awayTeam?.providerId].includes(club.teamId)'), "explicit participant check uses provider identity, not a name match");
  assert.match(page, /const formation = requestedFixtureId\s*\? selectClubHubRequestedFormation\(matchdayFeed\?\.formations \?\? \[\], requestedFixtureId, club\.teamId\)\s*:\s*matchdayFeed\?\.formations\.find/);
  assert.match(render, /resolveTouchlineCatalogueLocale\(lang, draftLocalesEnabled\)/);
  const live = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
  assert.match(live, /\[selected\.homeTeam, selected\.awayTeam\]\.map/);
  assert.match(live, /touchlineLiveClubLineupLinks\(selected, TOUCHLINE_ENGLAND_CLUBS, language\)/);
  const links = readFileSync(new URL("../lib/touchlineArena/live-club-lineup-links.ts", import.meta.url), "utf8");
  assert.ok(links.includes('/touchline-clubs/${club.slug}?lang=${encodeURIComponent(locale)}&fixtureId=${encodeURIComponent(fixture.providerId)}#touchline-club-lineup'));
});
