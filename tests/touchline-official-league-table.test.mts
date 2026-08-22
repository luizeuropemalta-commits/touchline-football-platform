import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveTouchlineOfficialLeagueTable,
  type TouchlineOfficialLeagueTableFixture,
  type TouchlineOfficialLeagueTableSeason,
  type TouchlineOfficialLeagueTableTeam,
} from "../lib/football-data/official-league-table.ts";

const season: TouchlineOfficialLeagueTableSeason = {
  id: "season-current",
  providerSeasonId: "28083",
  name: "2026/2027",
  sourceUpdatedAt: "2026-08-03T12:40:09.000Z",
};

function teams(count = 20): TouchlineOfficialLeagueTableTeam[] {
  return Array.from({ length: count }, (_, index) => ({
    clubId: `club-${index + 1}`,
    providerTeamId: String(index + 1),
    name: `Club ${index + 1}`,
    shortCode: `C${index + 1}`,
    slug: `club-${index + 1}`,
    logoUrl: null,
    sourceUpdatedAt: "2026-08-03T12:40:09.000Z",
  }));
}

function fixture(input: Partial<TouchlineOfficialLeagueTableFixture> = {}): TouchlineOfficialLeagueTableFixture {
  return {
    provider: "sportmonks",
    providerFixtureId: input.providerFixtureId ?? "fixture-1",
    seasonId: input.seasonId ?? season.id,
    status: input.status ?? "Finished",
    homeClubId: input.homeClubId ?? "club-1",
    awayClubId: input.awayClubId ?? "club-2",
    homeScore: input.homeScore === undefined ? 2 : input.homeScore,
    awayScore: input.awayScore === undefined ? 0 : input.awayScore,
    startsAt: input.startsAt ?? "2026-08-21T19:00:00.000Z",
    sourceUpdatedAt: input.sourceUpdatedAt ?? "2026-08-21T21:00:00.000Z",
  };
}

test("official league table scopes fixtures to its canonical current season", () => {
  const result = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(),
    fixtures: [
      fixture({ seasonId: "season-previous", providerFixtureId: "previous" }),
      fixture({ status: "Not Started", providerFixtureId: "current-scheduled" }),
    ],
  });

  assert.equal(result.state, "pending_no_final");
  assert.equal(result.coverage.fixturesInSeason, 1);
  assert.equal(result.coverage.completedFixtures, 0);
  assert.equal(result.rows.length, 20);
  assert.deepEqual(result.rows.map((row) => row.team.providerTeamId), teams().map((team) => team.providerTeamId));
  assert.ok(result.rows.every((row) => row.position === null));
  assert.ok(result.rows.every((row) => (
    row.played === 0
    && row.won === 0
    && row.drawn === 0
    && row.lost === 0
    && row.goalsFor === 0
    && row.goalsAgainst === 0
    && row.goalDifference === 0
    && row.points === 0
    && row.form.length === 0
  )));
});

test("scheduled, live, cancelled and scoreless fixtures retain the neutral initial table", () => {
  const result = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(),
    fixtures: [
      fixture({ providerFixtureId: "scheduled", status: "Not Started", homeScore: null, awayScore: null }),
      fixture({ providerFixtureId: "live", status: "LIVE", homeClubId: "club-3", awayClubId: "club-4", homeScore: 1, awayScore: 0 }),
      fixture({ providerFixtureId: "cancelled", status: "Cancelled", homeClubId: "club-5", awayClubId: "club-6", homeScore: null, awayScore: null }),
      fixture({ providerFixtureId: "scoreless", status: "Finished", homeClubId: "club-7", awayClubId: "club-8", homeScore: null, awayScore: null }),
    ],
  });

  assert.equal(result.state, "pending_no_final");
  assert.equal(result.coverage.completedFixtures, 0);
  assert.equal(result.rows.length, 20);
  assert.ok(result.rows.every((row) => row.position === null && row.points === 0 && row.goalDifference === 0));
  assert.deepEqual(result.rows.find((row) => row.team.providerTeamId === "3")?.liveFixture, {
    providerFixtureId: "live",
    scoreFor: 1,
    scoreAgainst: 0,
  });
  assert.deepEqual(result.rows.find((row) => row.team.providerTeamId === "4")?.liveFixture, {
    providerFixtureId: "live",
    scoreFor: 0,
    scoreAgainst: 1,
  });
});

test("official league table deduplicates a provider fixture before totals are calculated", () => {
  const result = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(2),
    expectedClubCount: 2,
    fixtures: [
      fixture({ providerFixtureId: "same-fixture", homeScore: 2, awayScore: 0 }),
      fixture({ providerFixtureId: "same-fixture", homeScore: 8, awayScore: 0 }),
    ],
  });

  assert.equal(result.state, "partial");
  assert.equal(result.coverage.completedFixtures, 1);
  assert.equal(result.coverage.duplicateFixtures, 1);
  assert.equal(result.rows.find((row) => row.team.providerTeamId === "1")?.points, 3);
  assert.ok(result.rows.every((row) => row.position === null));
});

test("pending no-final data is different from an unavailable canonical source", () => {
  const pending = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(),
    fixtures: [fixture({ status: "Not Started", homeScore: null, awayScore: null })],
  });
  const unavailable = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(),
    fixtures: [],
    sourceState: "unavailable",
  });

  assert.equal(pending.state, "pending_no_final");
  assert.equal(unavailable.state, "unavailable");
  assert.equal(pending.coverage.completedFixtures, 0);
  assert.equal(pending.rows.length, 20);
  assert.equal(unavailable.rows.length, 0);
});

test("club count and fixture identity mismatches fail closed", () => {
  const missingClub = resolveTouchlineOfficialLeagueTable({ season, teams: teams(19), fixtures: [] });
  const wrongClub = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(),
    fixtures: [fixture({ awayClubId: "unknown-club" })],
  });

  assert.equal(missingClub.state, "integrity_error");
  assert.equal(wrongClub.state, "integrity_error");
  assert.equal(missingClub.rows.length, 0);
  assert.equal(wrongClub.rows.length, 0);
});

test("a fully resolved small table can publish a verified position without a name fallback", () => {
  const result = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(2),
    expectedClubCount: 2,
    fixtures: [fixture({ providerFixtureId: "unique-final" })],
  });

  assert.equal(result.state, "ready");
  assert.deepEqual(result.rows.map((row) => row.position), [1, 2]);
  assert.equal(result.asOf, "2026-08-21T21:00:00.000Z");
});

test("an unresolved sporting tie stays partial instead of using a club-name tie-break", () => {
  const result = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(2),
    expectedClubCount: 2,
    fixtures: [fixture({ providerFixtureId: "draw-final", homeScore: 1, awayScore: 1 })],
  });

  assert.equal(result.state, "partial");
  assert.equal(result.reason, "official-tiebreak-pending");
  assert.ok(result.rows.every((row) => row.position === null));

  const source = readFileSync(new URL("../lib/football-data/official-standings.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localeCompare/);
});

test("shared table component and pages keep data loading on the server boundary", () => {
  const component = readFileSync(new URL("../components/touchline/TouchlineOfficialLeagueTable.tsx", import.meta.url), "utf8");
  const serverReader = readFileSync(new URL("../lib/football-data/official-league-table-server.ts", import.meta.url), "utf8");
  const directory = readFileSync(new URL("../app/touchline-clubs/page.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");

  assert.match(component, /variant: "directory" \| "profile"/);
  assert.match(component, /currentTeamId/);
  assert.match(component, /status && !table\.rows\.length/);
  assert.match(component, /Initial table — all 20 clubs are level\./);
  assert.match(component, /Tabela inicial — os 20 clubes estão empatados\./);
  assert.match(component, /row\.position \?\? "—"/);
  assert.match(component, /data-live=/);
  assert.match(component, /router\.refresh\(\)/);
  assert.match(component, /dictionary\.live/);
  assert.match(component, /table\.rows\.map/);
  assert.doesNotMatch(component, /from ["'][^"']*(?:card|market|wallet|supabase)/i);
  assert.doesNotMatch(component, /\bfetch\(/);
  assert.match(serverReader, /unstable_cache/);
  assert.match(serverReader, /touchline-official-league-table:\$\{TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID\}/);
  assert.match(serverReader, /\.eq\("season_id", scope\.season\.id\)/);
  assert.doesNotMatch(serverReader, /createFootballDataProvider/);
  assert.match(directory, /loadTouchlineOfficialLeagueTable/);
  assert.match(directory, /id="official-league-table"/);
  assert.match(profile, /loadTouchlineOfficialLeagueTable/);
  assert.match(profile, /TouchlineOfficialLeagueTable/);
  assert.doesNotMatch(profile, /buildOfficialStandings/);
  assert.match(profile, /\/touchline-clubs\?\$\{localeQuery\}#official-league-table/);
});
