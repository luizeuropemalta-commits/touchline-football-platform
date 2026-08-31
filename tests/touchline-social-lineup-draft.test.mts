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
      status: "Full Time",
      homeScore: 1,
      awayScore: 1,
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

  const malformedBaseline = detail();
  const malformed = {
    ...malformedBaseline,
    lineups: malformedBaseline.lineups.map((member, index) => index === 0
      ? { ...member, formationPosition: "1junk" }
      : member),
  };
  assert.deepEqual(validateTouchlineSocialLineupContract(malformed, "52"), {
    ok: false,
    reason: "starting-xi-invalid-formation-position",
  });
});

test("social draft uses canonical upright cards and regulation vertical pitch", async () => {
  const [component, styles, pitch, pitchStyles, server] = await Promise.all([
    readFile(new URL("../components/touchline/social/TouchlineSocialLineupDraft.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/social/TouchlineSocialLineupDraft.module.css", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/pitch/TouchlinePitchSurface.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/pitch/TouchlinePitchSurface.module.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/touchlineArena/social-lineup-draft-server.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /TouchlineEliteExactCard/);
  assert.match(component, /orientation="vertical"/);
  assert.match(component, /data-player-card-axis="0deg"/);
  assert.doesNotMatch(component, /TouchlineGoalFacingPitchCard/);
  assert.match(styles, /rotate:\s*0deg/);
  assert.match(styles, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.benchPlayer:nth-child\(9\)[\s\S]*?grid-column:\s*1\s*\/\s*-1/);
  assert.match(component, /const CARD_WIDTH = 98/);
  assert.match(component, /const BENCH_CARD_WIDTH = 76/);
  assert.match(pitch, /data-touchline-pitch-orientation/);
  assert.match(pitch, /centreCircle/);
  assert.match(pitch, /centreSpot/);
  assert.match(pitch, /penaltyArcStart/);
  assert.match(pitch, /cornerStartTop/);
  assert.match(pitchStyles, /aspect-ratio:\s*105\s*\/\s*68/);
  assert.match(pitchStyles, /\.surfaceVertical\s*\{[\s\S]*?aspect-ratio:\s*68\s*\/\s*105/);
  assert.match(pitchStyles, /\.surfaceVertical \.centreCircle\s*\{\s*width:\s*24\.221%/);
  assert.match(pitchStyles, /\.surfaceVertical \.box\s*\{[^}]*width:\s*53\.365%;[^}]*height:\s*14\.143%/);
  assert.match(pitchStyles, /\.surfaceVertical \.sixYardBox\s*\{[^}]*width:\s*24\.247%;[^}]*height:\s*4\.714%/);
  assert.match(pitchStyles, /official-live-pitch-960\.webp/);
  assert.doesNotMatch(pitchStyles, /official-live-pitch-960\.webp"\)\s*center\s*\/\s*cover/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0,\s*832px\)\s*206px/);
  assert.match(styles, /\.pitch\s*\{[\s\S]*?aspect-ratio:\s*68\s*\/\s*105/);
  assert.match(component, /TouchlineCoachCard/);
  assert.match(component, /data-coach-id=/);
  assert.doesNotMatch(component, /data-coach-provider-id=/);
  assert.match(component, /data-coach-tier=/);
  assert.match(component, /FULL TIME/);
  assert.match(component, /draft\.score\.home/);
  assert.match(server, /touchlineLiveCoachForTeam/);
  assert.match(server, /touchlineFixtureState/);
  assert.match(server, /loadTouchLineCoachRanking/);
  assert.match(server, /createTouchlineArenaCoachSlot/);
  assert.match(server, /loadTouchlinePublishedCardPresentations/);
  assert.match(server, /benchIds\.some\(\(id\) => starterIds\.has\(id\)\)/);
  assert.match(server, /scheduleFixture\?\.competitionId !== PREMIER_LEAGUE_COMPETITION_ID/);
  assert.match(server, /\.eq\("is_current", true\)/);
  assert.match(server, /current-season-mismatch/);
  assert.match(server, /resolveTouchlineFixtureVenue/);
  assert.match(server, /buildTouchlineOfficialLineupCaption/);
  assert.match(server, /sourceChecksum/);
  assert.match(component, /data-lineup-first-observed-at/);
  assert.match(component, /assertTouchlineOfficialLineupPresentation\(draft\)/);
  assert.match(component, /data-fixture-kind=\{draft\.sourceProvenance\}/);
  assert.match(component, /data-source-checksum/);
  assert.match(component, /data-template-version="touchline-lineup-feed-v1"/);
});
