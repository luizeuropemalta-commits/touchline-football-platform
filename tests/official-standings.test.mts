import assert from "node:assert/strict";
import test from "node:test";

import { buildOfficialStandings } from "../lib/football-data/official-standings.ts";

const teams = [
  { providerTeamId: "1", name: "Alpha", value: "alpha" },
  { providerTeamId: "2", name: "Bravo", value: "bravo" },
  { providerTeamId: "3", name: "Charlie", value: "charlie" },
] as const;

function fixture(input: { status: string; home: string; away: string; homeScore?: number; awayScore?: number; startsAt?: string }) {
  return {
    id: `sportmonks:${input.home}-${input.away}-${input.status}`,
    providerId: `${input.home}-${input.away}-${input.status}`,
    provider: "sportmonks" as const,
    status: input.status,
    startsAt: input.startsAt,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    homeTeam: { providerId: input.home },
    awayTeam: { providerId: input.away },
    source: { provider: "sportmonks" as const, providerId: "fixture" },
  };
}

test("official standings derives every displayed statistic from completed normalized fixtures", () => {
  const result = buildOfficialStandings({ teams, fixtures: [
    fixture({ status: "Finished", home: "1", away: "2", homeScore: 3, awayScore: 1 }),
    fixture({ status: "FT", home: "3", away: "1", homeScore: 0, awayScore: 0 }),
  ] });
  assert.equal(result.completedFixtures, 2);
  assert.deepEqual(result.rows.map((row) => ({
    team: row.team, played: row.played, won: row.won, drawn: row.drawn,
    lost: row.lost, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference, points: row.points, form: row.form,
  })), [
    { team: "alpha", played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 3, goalsAgainst: 1, goalDifference: 2, points: 4, form: ["W", "D"] },
    { team: "charlie", played: 1, won: 0, drawn: 1, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 1, form: ["D"] },
    { team: "bravo", played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 1, goalsAgainst: 3, goalDifference: -2, points: 0, form: ["L"] },
  ]);
});

test("scheduled, live, cancelled and incomplete fixtures never create a public result", () => {
  const result = buildOfficialStandings({ teams, fixtures: [
    fixture({ status: "Not Started", home: "1", away: "2", homeScore: 9, awayScore: 0 }),
    fixture({ status: "Live", home: "1", away: "2", homeScore: 1, awayScore: 0 }),
    fixture({ status: "Cancelled", home: "1", away: "2", homeScore: 3, awayScore: 0 }),
    fixture({ status: "Finished", home: "1", away: "2", homeScore: 1 }),
  ] });
  assert.equal(result.completedFixtures, 0);
  assert.ok(result.rows.every((row) => row.played === 0 && row.points === 0 && row.form.length === 0));
});
