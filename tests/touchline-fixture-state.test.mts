import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isTouchLineSettledFixtureStatus } from "../lib/football-data/fixture-settlement.ts";
import { touchlineFixtureState, type TouchlineMatchState } from "../lib/touchlineArena/fixture-state.ts";
import { touchlineFixtureState as matchCentreFixtureState } from "../lib/touchlineArena/match-centre.ts";

const now = Date.parse("2026-10-25T12:00:00Z");
const past = "2026-10-25T11:00:00Z";
const future = "2026-10-25T13:00:00Z";

test("pure fixture classifier preserves provider status precedence and clock boundaries", () => {
  const statuses: Array<[string, TouchlineMatchState]> = [
    ["LIVE", "live"], ["In-Play", "live"], ["In Progress", "live"],
    ["1st Half", "live"], ["2nd Half", "live"], ["Half Time", "live"],
    ["Extra Time", "live"], ["Penalties", "live"],
    ["After Extra Time", "finished"], ["After Penalties", "finished"],
    ["Penalties Finished", "finished"], ["FT-Penalties", "finished"],
    ["FT", "finished"], ["FT_PEN", "finished"], ["Full-Time", "finished"],
    ["Finished", "finished"], ["AET", "finished"], ["Cancelled", "finished"],
    ["Canceled", "finished"], ["Abandoned", "finished"], ["Awarded", "finished"],
    ["Walkover", "finished"], ["Not Started", "upcoming"], ["Postponed", "upcoming"],
    ["", "upcoming"],
  ];
  for (const [status, expected] of statuses) {
    assert.equal(touchlineFixtureState({ status: ` ${status} `, startsAt: past }, now), expected, status);
    assert.equal(touchlineFixtureState({ status, startsAt: future }, now), expected === "live" ? "upcoming" : expected, `${status} future`);
  }
  assert.equal(touchlineFixtureState({ status: "LIVE", startsAt: new Date(now).toISOString() }, now), "live");
  assert.equal(touchlineFixtureState({ status: "LIVE", startsAt: new Date(now + 1).toISOString() }, now), "upcoming");
  assert.equal(touchlineFixtureState({}, now), "unknown");
  assert.equal(touchlineFixtureState({ startsAt: "invalid", status: "Not Started" }, now), "unknown");
  assert.equal(touchlineFixtureState({ startsAt: "invalid", status: "LIVE" }, now), "live");
  assert.equal(touchlineFixtureState({ status: "FT" }, now), "finished");
  assert.equal(touchlineFixtureState({ startsAt: future, status: "LIVE" }, Number.NaN), "live");
});

test("match centre retains the exact public classifier and its default clock", () => {
  assert.equal(matchCentreFixtureState, touchlineFixtureState);
  const clock = Date.now();
  assert.equal(touchlineFixtureState({ status: "LIVE", startsAt: new Date(clock + 86_400_000).toISOString() }), "upcoming");
  assert.equal(touchlineFixtureState({ status: "LIVE", startsAt: new Date(clock - 86_400_000).toISOString() }), "live");
});

test("presentation signal imports the pure classifier without a locale dependency", () => {
  const classifier = readFileSync(new URL("../lib/touchlineArena/fixture-state.ts", import.meta.url), "utf8");
  assert.deepEqual(classifier.match(/^import.*$/gm), [
    'import type { TouchlineFixture } from "../football-data/types.ts";',
    'import { isTouchLineSettledFixtureStatus } from "../football-data/fixture-settlement.ts";',
  ]);
  const settlement = readFileSync(new URL("../lib/football-data/fixture-settlement.ts", import.meta.url), "utf8");
  assert.doesNotMatch(settlement, /^import\b/m, "canonical settlement helper has no runtime dependency graph");
  const server = readFileSync(new URL("../lib/touchlineArena/live-presentation-state-server.ts", import.meta.url), "utf8");
  assert.match(server, /import \{ touchlineFixtureState \} from "\.\/fixture-state";/);
  assert.doesNotMatch(server, /from ["'][^"']*(?:match-centre|i18n|catalogue-locale)["']/);
});


test("settled extra-time and penalty results agree with scoring across kickoff metadata", () => {
  for (const status of ["After Extra Time", "After Penalties", "Penalties Finished", "AET",
    "FT", "FT_PEN", "FT-Penalties", "FT after extra time", "Full Time", "Full-Time", "Finished"]) {
    for (const startsAt of [past, future, new Date(now).toISOString(), "invalid", undefined]) {
      const fixture = { status: `  ${status.toUpperCase()}  `, startsAt };
      assert.equal(isTouchLineSettledFixtureStatus(fixture.status), true, status);
      assert.equal(touchlineFixtureState(fixture, now), "finished", `${status}: ${startsAt}`);
      assert.equal(matchCentreFixtureState(fixture, now), "finished", "public re-export keeps the corrected result");
    }
  }
});

test("ongoing extra-time and penalties stay live while terminal navigation does not settle scoring", () => {
  for (const status of ["Extra Time", "Penalties", "Penalty Shootout", "In Play"]) {
    assert.equal(isTouchLineSettledFixtureStatus(status), false, status);
    assert.equal(touchlineFixtureState({ status, startsAt: past }, now), "live", status);
    assert.equal(touchlineFixtureState({ status, startsAt: future }, now), "upcoming", `${status}: future`);
    assert.equal(touchlineFixtureState({ status }, now), "live", `${status}: missing kickoff`);
  }
  for (const status of ["Cancelled", "Canceled", "Abandoned", "Awarded", "Walkover"]) {
    assert.equal(touchlineFixtureState({ status, startsAt: past }, now), "finished", status);
    assert.equal(isTouchLineSettledFixtureStatus(status), false, "navigation terminal does not grant settlement");
  }
  assert.equal(touchlineFixtureState({ status: "Postponed", startsAt: past }, now), "upcoming");
  assert.equal(isTouchLineSettledFixtureStatus("Postponed"), false);
});
