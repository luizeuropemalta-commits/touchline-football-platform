import type { TouchlineFixture } from "./types";

export type OfficialStandingsTeam<T> = Readonly<{
  providerTeamId: string;
  name: string;
  value: T;
}>;

export type OfficialStandingsRow<T> = Readonly<{
  team: T;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: readonly ("W" | "D" | "L")[];
}>;

export type OfficialStandings<T> = Readonly<{
  rows: readonly OfficialStandingsRow<T>[];
  completedFixtures: number;
  duplicateFixtures: number;
  /**
   * Fixture results alone cannot decide every competition tie-break. A caller
   * must not promote a stable sort fallback (such as a club name) to an
   * official position.
   */
  hasUnresolvedTieBreaks: boolean;
}>;

const FINAL_STATUS = /^(?:ft|finished|full[ -]?time|after extra time|aet|after penalties)$/i;

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function playedResult(goalsFor: number, goalsAgainst: number): "W" | "D" | "L" {
  return goalsFor === goalsAgainst ? "D" : goalsFor > goalsAgainst ? "W" : "L";
}

/**
 * Derives the real-football table solely from completed, normalized fixtures.
 * It deliberately ignores live, scheduled, cancelled and scoreless rows: a
 * public club table must never manufacture a result or a league position.
 */
export function buildOfficialStandings<T>(input: {
  teams: readonly OfficialStandingsTeam<T>[];
  fixtures: readonly TouchlineFixture[];
}): OfficialStandings<T> {
  const teamsByProviderId = new Map(input.teams.map((team) => [team.providerTeamId, team]));
  const rows = new Map(input.teams.map((team) => [team.providerTeamId, {
    team: team.value,
    name: team.name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    form: [] as Array<"W" | "D" | "L">,
  }]));
  let completedFixtures = 0;
  let duplicateFixtures = 0;
  const completedFixtureIds = new Set<string>();

  for (const fixture of input.fixtures) {
    if (!FINAL_STATUS.test(fixture.status?.trim() ?? "")
      || !isScore(fixture.homeScore) || !isScore(fixture.awayScore)) continue;
    const providerFixtureId = fixture.providerId.trim();
    if (!providerFixtureId) continue;
    if (completedFixtureIds.has(providerFixtureId)) {
      duplicateFixtures += 1;
      continue;
    }
    const homeId = fixture.homeTeam?.providerId;
    const awayId = fixture.awayTeam?.providerId;
    if (!homeId || !awayId || homeId === awayId || !teamsByProviderId.has(homeId) || !teamsByProviderId.has(awayId)) continue;
    const home = rows.get(homeId);
    const away = rows.get(awayId);
    if (!home || !away) continue;
    const homeResult = playedResult(fixture.homeScore, fixture.awayScore);
    const awayResult = playedResult(fixture.awayScore, fixture.homeScore);
    for (const [row, goalsFor, goalsAgainst, result] of [
      [home, fixture.homeScore, fixture.awayScore, homeResult],
      [away, fixture.awayScore, fixture.homeScore, awayResult],
    ] as const) {
      row.played += 1;
      row.goalsFor += goalsFor;
      row.goalsAgainst += goalsAgainst;
      row.form.push(result);
      if (result === "W") { row.won += 1; row.points += 3; }
      else if (result === "D") { row.drawn += 1; row.points += 1; }
      else row.lost += 1;
    }
    completedFixtureIds.add(providerFixtureId);
    completedFixtures += 1;
  }

  const rankedRows = [...rows.values()]
    .sort((left, right) => right.points - left.points
      || (right.goalsFor - right.goalsAgainst) - (left.goalsFor - left.goalsAgainst)
      || right.goalsFor - left.goalsFor);
  const hasUnresolvedTieBreaks = rankedRows.some((row, index) => {
    const previous = rankedRows[index - 1];
    return Boolean(previous
      && row.points === previous.points
      && row.goalsFor - row.goalsAgainst === previous.goalsFor - previous.goalsAgainst
      && row.goalsFor === previous.goalsFor);
  });

  return {
    completedFixtures,
    duplicateFixtures,
    hasUnresolvedTieBreaks,
    rows: rankedRows
      .map((row) => ({
        team: row.team,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalsFor - row.goalsAgainst,
        points: row.points,
        form: row.form.slice(-5),
      })),
  };
}
