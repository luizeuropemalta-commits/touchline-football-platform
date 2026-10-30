import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { selectClubHubNextFixture } from "../lib/touchlineArena/club-hub-next-fixture.ts";

const now = Date.parse("2026-10-30T12:00:00Z");
const homeTeam = { providerId: "19", name: "Manchester City" };
const awayTeam = { providerId: "2", name: "Other club" };
const next = { id: "101", providerId: "101", status: "Not Started", startsAt: "2026-11-01T17:00:00Z", homeTeam, awayTeam };
const previous = { ...next, id: "100", providerId: "100", status: "FT", startsAt: "2026-10-24T13:30:00Z", homeScore: 2, awayScore: 1 };
const belongs = (fixture: typeof next) => [fixture.homeTeam.providerId, fixture.awayTeam.providerId].includes("19");

test("tickets select the nearest future match, without showing the previous result or another club", () => {
  const farther = { ...next, id: "102", providerId: "102", startsAt: "2026-11-08T12:00:00Z" };
  const unrelated = { ...next, id: "103", providerId: "103", startsAt: "2026-10-31T12:00:00Z", homeTeam: awayTeam };
  assert.equal(selectClubHubNextFixture([farther, previous, unrelated, next], belongs, now), next);
  assert.equal(selectClubHubNextFixture([previous], belongs, now), undefined);
});

test("ended, live, postponed, cancelled and unknown statuses cannot become a next game even with a future date", () => {
  for (const status of ["FT", "Finished", "Live", "1st Half", "Postponed", "Cancelled", "Abandoned", "Unknown", "", "5"]) {
    assert.equal(selectClubHubNextFixture([{ ...next, status }], belongs, now), undefined, status);
  }
  for (const status of ["Not Started", "not_started", "NS", "scheduled", "upcoming", "1"]) {
    assert.ok(selectClubHubNextFixture([{ ...next, status }], belongs, now), status);
  }
  for (const startsAt of ["2026-10-30T12:00:00Z", "2026-10-30T11:59:00Z", "2026-11-01T17:00:00", "2027-02-30T17:00:00Z", "2026-11-01T24:00:00Z", "invalid", ""]) {
    assert.equal(selectClubHubNextFixture([{ ...next, startsAt }], belongs, now), undefined, startsAt);
  }
});

test("a stale calendar duplicate cannot resurrect a revised result, including input order reversal", () => {
  const calendar = { ...next, source: { lastSyncedAt: "2026-10-28T12:00:00Z" } };
  const corrected = { ...next, status: "Postponed", source: { lastSyncedAt: "2026-10-30T11:00:00Z" } };
  for (const fixtures of [[corrected, calendar], [calendar, corrected]]) assert.equal(selectClubHubNextFixture(fixtures, belongs, now), undefined);
  for (const fixtures of [[next, { ...next, status: "FT" }], [{ ...next, status: "FT" }, next]]) assert.equal(selectClubHubNextFixture(fixtures, belongs, now), undefined);
  const rescheduled = { ...next, source: { lastSyncedAt: "2026-10-30T11:30:00Z" }, startsAt: "2026-11-02T17:00:00Z" };
  assert.equal(selectClubHubNextFixture([rescheduled, corrected], belongs, now), rescheduled);
});

const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "loadClubMatchSnapshot")!;
type Snapshot = { nextFixture: typeof next | null; railFixture: typeof next | null; publicFixture: typeof next | null; previewFixtureId: string | null };

function loader({ missingRequested = false, calendarFails = false } = {}) {
  const exports: { load?: (...args: unknown[]) => Promise<Snapshot> } = {};
  const reads: string[] = [];
  const feed = { fixture: previous, lineups: [], formations: [], sidelined: [] };
  runInNewContext(ts.transpileModule(declaration.getText(ast) + "\nexports.load = loadClubMatchSnapshot;", {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports, Intl, Date, fallbackClubMatch: () => ({}),
    readPublicFantasyFixtureSnapshots: async () => { reads.push("feed"); return [feed]; },
    readPublicCompetitionFixtures: async () => { reads.push("calendar"); if (calendarFails) throw new Error("unavailable"); return [previous, next]; },
    readClubHubRequestedFixture: async (id: string) => { reads.push(`requested:${id}`); return { persistedFeeds: missingRequested ? [] : [feed], scheduledFixtures: missingRequested ? [] : [previous] }; },
    readPersistedFantasyFixtureFeedResult: () => assert.fail("read is injected into the exact requested-fixture reader"),
    readPublicCompetitionFixtureByProviderId: () => assert.fail("read is injected into the exact requested-fixture reader"),
    selectClubHubNextFixture: (fixtures: typeof next[], predicate: typeof belongs) => selectClubHubNextFixture(fixtures, predicate, now),
    selectPublicClubFixture: () => next, selectPublicClubScoringFixture: () => previous,
    fixtureHasClub: belongs, feedTeamBelongsToClub: () => true,
    toPublicFantasyFixtureFeed: () => ({}), readPublicFantasyFixtureMatchDetail: async () => null,
    selectClubHubRequestedFormation: () => null, selectTouchlineLastCompletedXi: () => null,
    resolveTouchlineClubMatchPreviewTeam: (team: unknown) => team,
    toTouchlineLiveFixture: (fixture: unknown) => fixture, touchlineClubHubText: () => "Cached",
    mirrorDtoToPublicFixture: (data: unknown) => data, previewTeamFromPublicTeam: (team: unknown) => team,
  });
  return { load: exports.load!, reads };
}

test("real snapshot loader keeps the old XI/result separate from the tickets next game, using one shared calendar read", async () => {
  const h = loader();
  const snapshot = await h.load({ teamId: "19" }, "en-GB", "direct", null);
  assert.equal(snapshot.railFixture, previous);
  assert.equal(snapshot.publicFixture, next);
  assert.equal(snapshot.nextFixture, next);
  assert.deepEqual(h.reads, ["feed", "calendar"]);
});

test("an exact historical URL preserves that match while independently displaying the next scheduled game", async () => {
  const h = loader();
  const snapshot = await h.load({ teamId: "19" }, "en-GB", "direct", null, false, "100");
  assert.equal(snapshot.railFixture, previous);
  assert.equal(snapshot.publicFixture, previous);
  assert.equal(snapshot.previewFixtureId, "100");
  assert.equal(snapshot.nextFixture, next);
  assert.deepEqual(h.reads, ["requested:100", "calendar"]);
  const missing = loader({ missingRequested: true });
  const absent = await missing.load({ teamId: "19" }, "en-GB", "direct", null, false, "999");
  assert.equal(absent.publicFixture, null);
  assert.equal(absent.nextFixture, null);
  const calendarDown = await loader({ calendarFails: true }).load({ teamId: "19" }, "en-GB", "direct", null, false, "100");
  assert.equal(calendarDown.publicFixture, previous);
  assert.equal(calendarDown.railFixture, previous);
  assert.equal(calendarDown.nextFixture, null);
});

test("mirror data cannot disguise a completed match as upcoming; unavailable reads remain empty", async () => {
  const h = loader();
  const mirrored = await h.load({}, "en-GB", "qa-mirror", Promise.resolve({ state: "ready", data: previous }));
  assert.equal(mirrored.railFixture, previous);
  assert.equal(mirrored.nextFixture, null);
  const failed = await loader({ calendarFails: true }).load({}, "en-GB", "direct", null);
  assert.equal(failed.nextFixture, null);
});
