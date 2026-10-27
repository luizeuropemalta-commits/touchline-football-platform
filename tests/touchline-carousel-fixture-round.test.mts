import assert from "node:assert/strict";
import test from "node:test";
import type { TouchlinePublicFixture } from "../lib/football-data/public-fixture.ts";
import { selectCarouselFixtureRound } from "../lib/touchlineArena/carousel-fixture-round.ts";

const scope = { competitionId: "8" as const, seasonId: "2026" };
const now = Date.parse("2026-10-25T12:00:00Z");
const past = "2026-10-24T12:00:00Z", future = "2026-10-30T12:00:00Z";
function round(number: number, status = "Not Started", startsAt = future): TouchlinePublicFixture[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `${number}-${index}`, providerId: `${number}-${index}`, ...scope,
    roundId: `round-${number}`, roundName: String(number), startsAt, status,
    homeTeam: { id: `team-${index * 2}`, providerId: `team-${index * 2}`, name: `Home ${index}` },
    awayTeam: { id: `team-${index * 2 + 1}`, providerId: `team-${index * 2 + 1}`, name: `Away ${index}` },
  }));
}
const ids = (rows: TouchlinePublicFixture[]) => rows.map(row => row.providerId).sort();
function expectRound(input: TouchlinePublicFixture[], expected: TouchlinePublicFixture[], focus: string | null = null) {
  const original = structuredClone(input);
  const result = selectCarouselFixtureRound(input, now, scope, focus);
  assert.deepEqual(ids(result), ids(expected));
  assert.ok(result.length <= 10);
  assert.deepEqual(input, original, "selection does not mutate source facts/order");
  return result;
}

test("nine finished plus one pending stays intact until the final result, then advances", () => {
  const current = round(9, "FT", past), next = round(10);
  current[9].status = "Not Started";
  current[9].startsAt = future;
  expectRound([...round(8, "FT", past), ...current, ...next], current);
  current[9].status = "After Penalties";
  expectRound([...current, ...next], next);
});

test("a partial next round does not replace the last complete finished round or empty it", () => {
  const current = round(9, "FT", past), next = round(10).slice(0, 9);
  expectRound([...current, ...next], current);
  expectRound(current, current);
});

test("before the season, the first available canonical round is selected", () => {
  const first = round(1), next = round(2);
  expectRound([...next, ...first], first);
  expectRound([...next, ...first.slice(0, 4)], first.slice(0, 4));
});

test("metadata-less matches are excluded rather than grouped by date", () => {
  const missing = round(9).map(row => ({ ...row, roundId: undefined, roundName: undefined }));
  expectRound(missing, []);
  const named = round(9, "Not Started", past).map(row => ({ ...row, roundId: undefined, roundName: "Regular week" }));
  expectRound([...missing, ...named], named);
  const idOnly = round(10).map(row => ({ ...row, roundName: undefined }));
  expectRound(idOnly, idOnly);
});

test("explicit season and competition scope is mandatory, including focused retention", () => {
  const current = round(9, "LIVE", past);
  const previousSeason = round(8, "LIVE", past).map(row => ({ ...row, seasonId: "2025" }));
  const otherCompetition = round(7, "LIVE", past).map(row => ({ ...row, competitionId: "9" }));
  expectRound([...previousSeason, ...otherCompetition, ...current], current, previousSeason[0].providerId);
  assert.deepEqual(selectCarouselFixtureRound(current, now, null), []);
  assert.deepEqual(selectCarouselFixtureRound(current, now, { ...scope, seasonId: " " }), []);
  assert.deepEqual(selectCarouselFixtureRound(current, now, { ...scope, seasonId: " 2026" }), []);
  assert.deepEqual(selectCarouselFixtureRound(current, Number.NaN, scope), []);
});

test("duplicate provider fixtures do not manufacture completeness and newest receipt wins", () => {
  const current = round(9, "FT", past), next = round(10);
  expectRound([...current.slice(0, 9), ...Array(8).fill(current[0]), ...next], current.slice(0, 9));
  const old = { ...current[9], status: "LIVE", verifiedAt: "2026-10-24T12:00:00Z" };
  const updated = { ...current[9], verifiedAt: "2026-10-25T11:00:00Z" };
  expectRound([...current.slice(0, 9), updated, old, ...next], next);
  expectRound([...current.slice(0, 9), old, updated, ...next], next);
});

test("valid opposing club identities and twenty distinct clubs are required for advancement", () => {
  for (const damaged of [
    { homeTeam: undefined },
    { awayTeam: { id: "x", providerId: "", name: "Unknown" } },
    { awayTeam: { id: "team-18", providerId: "team-18", name: "Same as home" } },
  ]) {
    const current = round(9, "FT", past), next = round(10);
    current[9] = { ...current[9], ...damaged };
    expectRound([...current, ...next], current.slice(0, 9));
  }
  const repeatedClub = round(9, "FT", past), next = round(10);
  repeatedClub[9].awayTeam = repeatedClub[0].awayTeam;
  expectRound([...repeatedClub, ...next], repeatedClub);
});

test("postponed or abandoned fixture is not a final result but does not trap a later begun round", () => {
  for (const status of ["Postponed", "Abandoned", "Cancelled"]) {
    const previous = round(9, "FT", past), next = round(10);
    previous[9].status = status;
    expectRound([...previous, ...next], previous);
    next[0].startsAt = "2026-10-25T11:00:00Z";
    expectRound([...previous, ...next], next);
  }
});

test("a valid live round wins, and numeric canonical order handles a delayed older round", () => {
  const old = round(9, "FT", "2026-10-25T11:00:00Z"), current = round(10, "FT", past);
  old[9].status = "Postponed"; current[9].status = "Not Started";
  expectRound([...old, ...current], current);
  old[9].status = "LIVE";
  expectRound([...old, ...current], old);
  current[9].status = "LIVE";
  expectRound([...current, ...old], current);
  current[9].startsAt = future;
  expectRound([...current, ...old], old, null);
});

test("focus retains the entire original round until blur rather than appending one old fixture", () => {
  const previous = round(9, "FT", past), next = round(10);
  expectRound([...previous, ...next], previous, previous[4].providerId);
  expectRound([...previous, ...next], next);
  expectRound([...previous, ...next], next, "not-found");
});

test("unambiguous canonical name joins a missing ID, while ambiguous aliases do not merge rounds", () => {
  const current = round(9, "FT", past), next = round(10);
  current[9].roundId = undefined;
  expectRound([...current, ...next], next);
  const ambiguous = { ...current[9], providerId: "conflict", roundId: "different-round" };
  const selected = selectCarouselFixtureRound([...current, ambiguous], now, scope, current[0].providerId);
  assert.equal(selected.length, 9);
  assert.ok(selected.every(row => row.roundId === "round-9"));
});

test("non-numeric groups use kickoff ordering only and overfull groups never exceed ten", () => {
  const first = round(1, "Not Started", past).map(row => ({ ...row, roundName: "Opening" }));
  const next = round(2).map(row => ({ ...row, roundName: "Following" }));
  expectRound([...next, ...first], first);
  const overflow = { ...first[0], id: "extra", providerId: "extra" };
  const result = selectCarouselFixtureRound([...first, overflow], now, scope, "extra");
  assert.equal(result.length, 10); assert.ok(result.some(row => row.providerId === "extra"));
});


test("an incomplete immediate next round cannot be skipped for a later complete round", () => {
  const previous = round(8, "FT", past), immediate = round(9).slice(0, 9), later = round(10);
  expectRound([...later, ...immediate, ...previous], previous);
});
