import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { TouchlinePublicFantasyFixtureMatchDetail } from "../lib/football-data/public-fantasy-fixture.ts";
import { validateTouchlineSocialLineupContract } from "../lib/touchlineArena/social-lineup-contract.ts";

function detail(): TouchlinePublicFantasyFixtureMatchDetail {
  return {
    fixture: {
      id: "19722193",
      startsAt: "2026-08-29T14:00:00Z",
      homeTeam: { id: "52", name: "AFC Bournemouth" },
      awayTeam: { id: "13", name: "Everton" },
    },
    lineups: Array.from({ length: 22 }, (_, index) => {
      const home = index < 11;
      const position = (index % 11) + 1;
      return {
        id: `lineup-${index}`,
        fixtureId: "19722193",
        teamId: home ? "52" : "13",
        teamName: home ? "AFC Bournemouth" : "Everton",
        playerId: String(1000 + index),
        playerName: `Player ${index}`,
        jerseyNumber: position,
        formationPosition: String(position),
        isStarter: true,
        statistics: [],
      };
    }),
    formations: [
      { id: "f-home", fixtureId: "19722193", teamId: "52", formation: "4-2-3-1" },
      { id: "f-away", fixtureId: "19722193", teamId: "13", formation: "4-2-3-1" },
    ],
    sidelined: [],
    events: [],
    playerStatistics: [],
    capturedAt: "2026-08-29T13:32:00Z",
    lineupAvailableAt: "2026-08-29T13:30:00Z",
  };
}

test("social line-up contract accepts one exact official XI", () => {
  const result = validateTouchlineSocialLineupContract(detail(), "52");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.side, "home");
  assert.equal(result.value.formation, "4-2-3-1");
  assert.equal(result.value.starterPlayerIds.length, 11);
});

test("social line-up contract fails closed before LINEUP_AVAILABLE", () => {
  const candidate = { ...detail(), lineupAvailableAt: null };
  assert.deepEqual(validateTouchlineSocialLineupContract(candidate, "52"), {
    ok: false,
    reason: "lineup-not-confirmed",
  });
});

test("social line-up contract rejects partial and duplicate official data", () => {
  const baseline = detail();
  const partial = { ...baseline, lineups: baseline.lineups.slice(1) };
  assert.equal(validateTouchlineSocialLineupContract(partial, "52").ok, false);

  const duplicateBaseline = detail();
  const duplicate = {
    ...duplicateBaseline,
    lineups: duplicateBaseline.lineups.map((member, index) => (
      index === 1 ? { ...member, playerId: duplicateBaseline.lineups[0]!.playerId } : member
    )),
  };
  assert.deepEqual(validateTouchlineSocialLineupContract(duplicate, "52"), {
    ok: false,
    reason: "starting-xi-duplicate-player",
  });
});

test("social line-up contract rejects invented shirts or geometry", () => {
  const shirtBaseline = detail();
  const shirt = {
    ...shirtBaseline,
    lineups: shirtBaseline.lineups.map((member, index) => index === 0 ? { ...member, jerseyNumber: 0 } : member),
  };
  assert.deepEqual(validateTouchlineSocialLineupContract(shirt, "52"), {
    ok: false,
    reason: "starting-xi-invalid-shirt-number",
  });

  const geometryBaseline = detail();
  const geometry = {
    ...geometryBaseline,
    lineups: geometryBaseline.lineups.map((member, index) => index === 1 ? { ...member, formationPosition: "1" } : member),
  };
  assert.deepEqual(validateTouchlineSocialLineupContract(geometry, "52"), {
    ok: false,
    reason: "starting-xi-duplicate-formation-position",
  });
});

test("social draft uses canonical upright cards and vertical canonical pitch", async () => {
  const [component, styles, pitch, server] = await Promise.all([
    readFile(new URL("../components/touchline/social/TouchlineSocialLineupDraft.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/social/TouchlineSocialLineupDraft.module.css", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/pitch/TouchlinePitchSurface.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/touchlineArena/social-lineup-draft-server.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /TouchlineEliteExactCard/);
  assert.match(component, /orientation="vertical"/);
  assert.match(component, /data-player-card-axis="0deg"/);
  assert.doesNotMatch(component, /TouchlineGoalFacingPitchCard/);
  assert.match(styles, /rotate:\s*0deg/);
  assert.match(pitch, /data-touchline-pitch-orientation/);
  assert.match(component, /TouchlineCoachCard/);
  assert.match(component, /data-coach-provider-id=/);
  assert.match(component, /data-coach-tier=/);
  assert.match(server, /touchlineLiveCoachForTeam/);
  assert.match(server, /loadTouchLineCoachRanking/);
  assert.match(server, /createTouchlineArenaCoachSlot/);
});
