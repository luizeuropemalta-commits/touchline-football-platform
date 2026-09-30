import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { TouchlineFixture } from "../lib/football-data/types.ts";
import { selectArenaFixtureRound } from "../lib/touchlineArena/arena-fixture-round.ts";

function fixture(index: number, startsAt: string, status = "Not Started"): TouchlineFixture {
  const homeId = String(index * 2 + 1);
  const awayId = String(index * 2 + 2);
  return {
    id: `sportmonks:${index}`,
    provider: "sportmonks",
    providerId: String(index),
    startsAt,
    status,
    homeTeam: { id: `sportmonks:${homeId}`, provider: "sportmonks", providerId: homeId, name: `Home ${index}`, source: { provider: "sportmonks", providerId: homeId } },
    awayTeam: { id: `sportmonks:${awayId}`, provider: "sportmonks", providerId: awayId, name: `Away ${index}`, source: { provider: "sportmonks", providerId: awayId } },
    source: { provider: "sportmonks", providerId: String(index) },
  };
}

test("Arena carousel selects one coherent ten-match canonical round instead of mixing weeks", () => {
  const firstRound = Array.from({ length: 10 }, (_, index) => fixture(index + 1, `2026-08-${String(21 + Math.floor(index / 4)).padStart(2, "0")}T${String(12 + index).padStart(2, "0")}:00:00Z`));
  const nextRound = Array.from({ length: 10 }, (_, index) => fixture(index + 11, `2026-08-${String(28 + Math.floor(index / 4)).padStart(2, "0")}T${String(12 + index).padStart(2, "0")}:00:00Z`));
  // A second round necessarily repeats every England club; use the same IDs
  // so a selector cannot silently append a second matchweek.
  nextRound.forEach((item, index) => {
    const homeId = String(index * 2 + 1);
    const awayId = String(index * 2 + 2);
    item.homeTeam = { ...item.homeTeam!, id: `sportmonks:${homeId}`, providerId: homeId };
    item.awayTeam = { ...item.awayTeam!, id: `sportmonks:${awayId}`, providerId: awayId };
  });

  const selected = selectArenaFixtureRound([...firstRound, ...nextRound], Date.parse("2026-08-03T12:00:00Z"));
  assert.equal(selected.length, 10);
  assert.deepEqual(selected.map((item) => item.id), firstRound.map((item) => item.id));
});

test("the persisted Full Time status releases the completed round for the next ten fixtures", () => {
  const finishedRound = Array.from({ length: 10 }, (_, index) => fixture(
    index + 1,
    `2026-08-${String(21 + Math.floor(index / 2)).padStart(2, "0")}T${String(12 + (index % 2) * 3).padStart(2, "0")}:00:00Z`,
    "Full Time",
  ));
  const upcomingRound = Array.from({ length: 10 }, (_, index) => fixture(
    index + 101,
    `2026-08-29T${String(10 + index).padStart(2, "0")}:00:00Z`,
    "Not Started",
  ));

  const selected = selectArenaFixtureRound(
    [...finishedRound, ...upcomingRound],
    Date.parse("2026-08-28T10:00:00Z"),
  );

  assert.equal(selected.length, 10);
  assert.deepEqual(selected.map((item) => item.id), upcomingRound.map((item) => item.id));
});

test("a live fixture keeps its complete round visible even when it is not the first kickoff", () => {
  const fixtures = Array.from({ length: 10 }, (_, index) => fixture(index + 1, `2026-08-21T${String(12 + index).padStart(2, "0")}:00:00Z`));
  fixtures[5] = { ...fixtures[5], status: "LIVE" };

  const selected = selectArenaFixtureRound(fixtures, Date.parse("2026-08-21T18:00:00Z"));
  assert.equal(selected.length, 10);
  assert.ok(selected.some((item) => item.status === "LIVE"));
});

test("a stale live status on a future kickoff cannot hide the upcoming Arena confrontations", () => {
  const futureStatus = fixture(1, "2026-08-20T20:00:00Z", "2nd Half");
  const upcoming = fixture(2, "2026-08-20T18:00:00Z");

  const selected = selectArenaFixtureRound(
    [futureStatus, upcoming],
    Date.parse("2026-08-16T12:00:00Z"),
  );

  assert.deepEqual(selected.map((item) => item.id), [upcoming.id, futureStatus.id]);
});

test("Arena keeps an incomplete canonical round intact instead of borrowing a match from the next round", () => {
  const firstRound = Array.from({ length: 9 }, (_, index) => fixture(index + 1, `2026-08-${String(21 + Math.floor(index / 4)).padStart(2, "0")}T${String(12 + index).padStart(2, "0")}:00:00Z`));
  const nextRound = Array.from({ length: 10 }, (_, index) => fixture(index + 10, `2026-08-${String(28 + Math.floor(index / 4)).padStart(2, "0")}T${String(12 + index).padStart(2, "0")}:00:00Z`));
  // The delayed first-round fixture is not in this source window. Reusing one
  // of its clubs in the next matchweek proves that the carousel must not join
  // the two canonical rounds merely to display ten tiles.
  nextRound[0].homeTeam = { ...nextRound[0].homeTeam!, id: "sportmonks:1", providerId: "1" };
  nextRound[0].awayTeam = { ...nextRound[0].awayTeam!, id: "sportmonks:20", providerId: "20" };

  const selected = selectArenaFixtureRound([...firstRound, ...nextRound], Date.parse("2026-08-03T12:00:00Z"));
  assert.deepEqual(selected.map((item) => item.id), firstRound.map((item) => item.id));
  assert.equal(selected.length, 9);
});

test("My Club keeps production coach identity out of the demo fallback and owns persistent coach-first selection", () => {
  const coachRoute = readFileSync(new URL("../app/api/touchline-arena/coach/route.ts", import.meta.url), "utf8");
  const stateRoute = readFileSync(new URL("../app/api/touchline-arena/state/route.ts", import.meta.url), "utf8");
  assert.match(coachRoute, /touchlineLiveCoachForProviderId\(coachProviderId\)/);
  assert.match(coachRoute, /TL_COACH_CONTRACT_SCHEMA_UNAVAILABLE/);
  assert.match(coachRoute, /touchline_hire_coach_contract/);
  assert.match(coachRoute, /touchline_end_coach_contract/);
  assert.match(coachRoute, /isSameOriginMutation/);
  assert.match(coachRoute, /p_idempotency_key: idempotencyKey/);
  assert.match(stateRoute, /coach_provider_id/);
  assert.match(stateRoute, /error\?\.code === "42703"/);
});
