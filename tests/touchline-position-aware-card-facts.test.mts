import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  projectTouchlineCardStatsByPosition,
  touchlineCardStatAppliesToPosition,
  touchlinePlayerPositionKind,
} from "../lib/touchlineArena/position-aware-card-stats.ts";
import { buildTouchlineVerifiedMatchFactFields } from "../lib/touchlineArena/card-zoom-details.ts";

const verifiedFacts = {
  goals: 0,
  assists: 1,
  cleanSheets: 0,
  saves: 4,
  goalsConceded: 2,
  yellowCards: 0,
  redCards: 0,
  shotsOnTarget: 2,
  shotsOffTarget: 1,
  defensiveActionsTotal: 9,
  defense: 2,
  penaltySaves: 1,
  penaltiesMissed: 0,
  ownGoals: 0,
  rating: 7.8,
} as const;

test("outfield projection excludes every goalkeeper-only fact and preserves confirmed zero", () => {
  assert.equal(touchlinePlayerPositionKind("Attacking Midfielder / AM"), "outfield");
  assert.deepEqual(projectTouchlineCardStatsByPosition({
    position: "Attacking Midfielder / AM",
    statistics: verifiedFacts,
  }), {
    goals: 0,
    assists: 1,
    defense: 2,
    cleanSheets: 0,
    yellowCards: 0,
    redCards: 0,
    shotsOnTarget: 2,
    shotsOffTarget: 1,
    penaltiesMissed: 0,
    ownGoals: 0,
    rating: 7.8,
  });
});

test("canonical compact position abbreviations stay position-aware", () => {
  for (const position of ["MID", "DEF", "FWD", "MF", "DF", "FW"]) {
    assert.equal(touchlinePlayerPositionKind(position), "outfield", position);
    assert.equal(touchlineCardStatAppliesToPosition("defense", position), true, position);
  }
});

test("Eberechi Eze golden regression keeps rating 6.62 and removes the persisted penalty-saves zero", () => {
  const projected = projectTouchlineCardStatsByPosition({
    position: "Attacking Midfield",
    statistics: {
      goals: 0,
      assists: 0,
      penaltySaves: 0,
      shotsOffTarget: 1,
      rating: 6.62,
    },
  });
  assert.deepEqual(projected, {
    goals: 0,
    assists: 0,
    shotsOffTarget: 1,
    rating: 6.62,
  });
  const labels = buildTouchlineVerifiedMatchFactFields({
    position: "Attacking Midfield",
    statistics: projected,
  }, "en-GB");
  assert.equal(labels.find((field) => field.label === "Rating")?.value, "6.62");
  assert.equal(labels.some((field) => field.label === "Penalty saves"), false);
});

test("goalkeeper projection exposes goalkeeper facts and excludes DEF/outfield-only facts", () => {
  assert.equal(touchlinePlayerPositionKind("Goalkeeper / GK"), "goalkeeper");
  assert.deepEqual(projectTouchlineCardStatsByPosition({
    position: "Goalkeeper / GK",
    statistics: verifiedFacts,
  }), {
    goals: 0,
    assists: 1,
    cleanSheets: 0,
    saves: 4,
    penaltySaves: 1,
    goalsConceded: 2,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    rating: 7.8,
  });
  assert.equal(touchlineCardStatAppliesToPosition("defense", "Goalkeeper"), false);
});

test("unknown positions fail closed for both goalkeeper-only and outfield-only facts", () => {
  assert.equal(touchlinePlayerPositionKind("Player"), "unknown");
  assert.deepEqual(projectTouchlineCardStatsByPosition({
    position: "Player",
    statistics: verifiedFacts,
  }), {
    goals: 0,
    assists: 1,
    cleanSheets: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    rating: 7.8,
  });
});

test("zoom facts are position-aware and render unavailable rating as a dash", () => {
  const outfield = buildTouchlineVerifiedMatchFactFields({
    position: "Midfielder",
    statistics: { ...verifiedFacts, rating: null },
  }, "en-GB");
  assert.deepEqual(outfield.map((field) => field.label), [
    "Goals",
    "Assists",
    "DEF score",
    "Clean sheets",
    "Yellow cards",
    "Red cards",
    "Shots on target",
    "Shots off target",
    "Penalties missed",
    "Own goals",
    "Rating",
  ]);
  assert.equal(outfield.find((field) => field.label === "Rating")?.value, "—");
  assert.equal(outfield.some((field) => field.label === "Saves"), false);
  assert.equal(outfield.some((field) => field.label === "Penalty saves"), false);
  assert.equal(outfield.some((field) => field.label === "Goals conceded"), false);

  const goalkeeper = buildTouchlineVerifiedMatchFactFields({
    position: "GK",
    statistics: verifiedFacts,
  }, "en-GB");
  assert.deepEqual(goalkeeper.map((field) => field.label), [
    "Goals",
    "Assists",
    "Clean sheets",
    "Saves",
    "Penalty saves",
    "Goals conceded",
    "Yellow cards",
    "Red cards",
    "Own goals",
    "Rating",
  ]);
});

test("all product card surfaces consume the shared position-aware fact builder", async () => {
  const paths = [
    "app/arena/ArenaClient.tsx",
    "app/touchline-player-card-rankings/page.tsx",
    "app/touchline-players/[player]/page.tsx",
    "components/touchline/club-owner/ClubOwnerProfileRenderer.tsx",
    "components/touchline/market/TouchlineSquadBuilderStage.tsx",
    "components/touchline/ClubHubOfficialLineup.tsx",
    "components/touchline/ClubHubSquadGrid.tsx",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /buildTouchlineVerifiedMatchFactFields\(\{[\s\S]*?position:/, path);
  }
  const [authoritative, catalogue, distribution, card] = await Promise.all([
    readFile(new URL("../lib/touchlineArena/authoritative-roster-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/touchlineArena/ranked-card-catalog-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/touchlineArena/matchday-player-points.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(authoritative, /projectTouchlineCardStatsByPosition/);
  assert.match(authoritative, /rating/);
  assert.match(catalogue, /projectTouchlineCardStatsByPosition/);
  assert.match(distribution, /projectTouchlineCardStatsByPosition/);
  assert.match(card, /touchlineCardStatAppliesToPosition/);
});
