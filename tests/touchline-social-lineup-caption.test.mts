import assert from "node:assert/strict";
import test from "node:test";

import { buildTouchlineOfficialLineupCaption } from "../lib/touchlineArena/social-lineup-caption.ts";

const fixture = {
  fixtureId: "19722188",
  teamId: "20",
  teamName: "Leeds United",
  opponentName: "Brentford",
  side: "HOME" as const,
  venueName: "Elland Road",
  formation: "4-3-3",
  gameweekNumber: 2,
  kickOffLabel: "Sunday 30 August · 15:00",
  lineupConfirmed: true as const,
};

test("official lineup copy is British, fixture-specific and contains the testing disclosure", () => {
  const result = buildTouchlineOfficialLineupCaption(fixture);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.caption, /^TouchLine Official Line-up/m);
  assert.match(result.caption, /Leeds United v Brentford/);
  assert.match(result.caption, /Gameweek 2 · Sunday 30 August · 15:00/);
  assert.match(result.caption, /line up in a 4-3-3, at home at Elland Road/);
  assert.match(result.caption, /TouchLine Verified Match Data/);
  assert.match(result.caption, /COMING SOON • CURRENTLY IN TESTING/);
  assert.doesNotMatch(result.caption, /sportmonks|\bapi\b|\bprovider\b/i);
});

test("away copy is explicit and does not claim a home venue", () => {
  const result = buildTouchlineOfficialLineupCaption({
    ...fixture,
    teamId: "94",
    teamName: "Brentford",
    opponentName: "Leeds United",
    side: "AWAY",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.caption, /Leeds United v Brentford/);
  assert.doesNotMatch(result.caption, /Brentford v Leeds United/);
  assert.match(result.caption, /Brentford line up in a 4-3-3, away at Elland Road/);
  assert.doesNotMatch(result.caption, /at home/);
});

test("incomplete or ambiguous fixture context fails closed", () => {
  assert.deepEqual(buildTouchlineOfficialLineupCaption({ ...fixture, fixtureId: "0" }), {
    ok: false,
    reason: "FIXTURE_IDENTITY_INVALID",
  });
  assert.deepEqual(buildTouchlineOfficialLineupCaption({ ...fixture, opponentName: "Leeds United" }), {
    ok: false,
    reason: "FIXTURE_COPY_INCOMPLETE",
  });
  assert.deepEqual(buildTouchlineOfficialLineupCaption({ ...fixture, formation: "unknown" }), {
    ok: false,
    reason: "MATCH_CONTEXT_INVALID",
  });
});
