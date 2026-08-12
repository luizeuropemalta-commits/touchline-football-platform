import assert from "node:assert/strict";
import test from "node:test";

import { completeTouchlineOfficialFixtureSchedule } from "../lib/football-data/touchline-official-fixture-completion.ts";
import { selectArenaFixtureRound } from "../lib/touchlineArena/arena-fixture-round.ts";
import type { TouchlineFixture } from "../lib/football-data/types.ts";

function fixture(index: number): TouchlineFixture {
  const homeId = String(100 + index * 2);
  const awayId = String(101 + index * 2);
  return {
    id: `sportmonks:${index}`,
    providerId: String(index),
    provider: "sportmonks",
    startsAt: `2026-08-22T${String(11 + index).padStart(2, "0")}:00:00.000Z`,
    status: "Not Started",
    homeTeam: { id: `sportmonks:${homeId}`, providerId: homeId, provider: "sportmonks", name: `Home ${index}`, source: { provider: "sportmonks", providerId: homeId } },
    awayTeam: { id: `sportmonks:${awayId}`, providerId: awayId, provider: "sportmonks", name: `Away ${index}`, source: { provider: "sportmonks", providerId: awayId } },
    source: { provider: "sportmonks", providerId: String(index) },
  };
}

test("completes the owner-verified Brentford v Tottenham opening fixture without a score", () => {
  const completed = completeTouchlineOfficialFixtureSchedule(Array.from({ length: 9 }, (_, index) => fixture(index + 1)));
  const missingFixture = completed.find((entry) => entry.providerId === "2645196");

  assert.equal(completed.length, 10);
  assert.ok(missingFixture);
  assert.equal(missingFixture.homeTeam?.providerId, "236");
  assert.equal(missingFixture.awayTeam?.providerId, "6");
  assert.equal(missingFixture.homeScore, undefined);
  assert.equal(missingFixture.awayScore, undefined);
  assert.equal(missingFixture.startsAt, "2026-08-22T16:30:00.000Z");
  assert.equal(selectArenaFixtureRound(completed, Date.parse("2026-08-21T10:00:00.000Z")).length, 10);
});

test("never duplicates the sourced official fixture, even when later rounds contain either club", () => {
  const sourced = fixture(1);
  sourced.providerId = "2645196";
  sourced.homeTeam!.providerId = "236";
  sourced.awayTeam!.providerId = "6";

  assert.deepEqual(completeTouchlineOfficialFixtureSchedule([sourced]), [sourced]);
  assert.equal(completeTouchlineOfficialFixtureSchedule([{
    ...fixture(2),
    homeTeam: { ...fixture(2).homeTeam!, providerId: "236" },
  }]).length, 2);
});
