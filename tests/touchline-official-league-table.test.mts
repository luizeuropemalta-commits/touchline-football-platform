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
  assert.deepEqual(result.rows.map((row) => row.team.name), teams().map((team) => team.name).sort());
  assert.ok(result.rows.every((row, index) => (
    row.sportsRank === 1
    && row.isTied === true
    && row.displayPosition === index + 1
  )));
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

test("the one official table applies a verified live score provisionally", () => {
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

  assert.equal(result.state, "ready");
  assert.equal(result.coverage.completedFixtures, 0);
  assert.equal(result.coverage.liveFixtures, 1);
  assert.equal(result.rows.length, 20);
  assert.deepEqual(result.rows.find((row) => row.team.providerTeamId === "3"), {
    sportsRank: 1,
    isTied: false,
    displayPosition: 1,
    team: { providerTeamId: "3", name: "Club 3", shortCode: "C3", slug: "club-3", logoUrl: null },
    played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 1, goalsAgainst: 0, goalDifference: 1, points: 3, form: ["W"],
    liveFixture: { providerFixtureId: "live", scoreFor: 1, scoreAgainst: 0, stale: true },
  });
  assert.deepEqual(result.rows.find((row) => row.team.providerTeamId === "3")?.liveFixture, {
    providerFixtureId: "live",
    scoreFor: 1,
    scoreAgainst: 0,
    stale: true,
  });
  assert.deepEqual(result.rows.find((row) => row.team.providerTeamId === "4")?.liveFixture, {
    providerFixtureId: "live",
    scoreFor: 0,
    scoreAgainst: 1,
    stale: true,
  });
});

test("live score changes, multiple fixtures and full time share one idempotent standings projection", () => {
  const base = [
    fixture({ providerFixtureId: "city-final", homeClubId: "club-1", awayClubId: "club-4", homeScore: 1, awayScore: 0 }),
    fixture({ providerFixtureId: "hull-final", homeClubId: "club-2", awayClubId: "club-4", homeScore: 1, awayScore: 0 }),
    fixture({ providerFixtureId: "sunderland-final", homeClubId: "club-3", awayClubId: "club-4", homeScore: 1, awayScore: 0 }),
  ];
  const stateA = resolveTouchlineOfficialLeagueTable({
    season, teams: teams(4), expectedClubCount: 4,
    fixtures: [
      ...base,
      fixture({ providerFixtureId: "city-hull", status: "LIVE", homeClubId: "club-1", awayClubId: "club-2", homeScore: 0, awayScore: 0 }),
      fixture({ providerFixtureId: "sunderland-live", status: "LIVE", homeClubId: "club-3", awayClubId: "club-4", homeScore: 0, awayScore: 0 }),
    ],
  });
  assert.equal(stateA.coverage.liveFixtures, 2);
  assert.equal(stateA.rows.find((row) => row.team.providerTeamId === "1")?.points, 4);
  assert.equal(stateA.rows.find((row) => row.team.providerTeamId === "2")?.points, 4);
  assert.equal(stateA.rows.find((row) => row.team.providerTeamId === "3")?.points, 4);
  assert.deepEqual(stateA.rows.slice(0, 3).map((row) => [row.sportsRank, row.isTied, row.displayPosition]), [
    [1, true, 1], [1, true, 2], [1, true, 3],
  ]);

  const stateB = resolveTouchlineOfficialLeagueTable({
    season, teams: teams(4), expectedClubCount: 4,
    fixtures: [
      ...base,
      fixture({ providerFixtureId: "city-hull", status: "LIVE", homeClubId: "club-1", awayClubId: "club-2", homeScore: 2, awayScore: 0 }),
      fixture({ providerFixtureId: "sunderland-live", status: "LIVE", homeClubId: "club-3", awayClubId: "club-4", homeScore: 0, awayScore: 0 }),
    ],
  });
  assert.equal(stateB.state, "ready");
  assert.deepEqual(stateB.rows.slice(0, 3).map((row) => [row.team.providerTeamId, row.sportsRank, row.points, row.goalDifference]), [
    ["1", 1, 6, 3], ["3", 2, 4, 1], ["2", 3, 3, -1],
  ]);

  const stateC = resolveTouchlineOfficialLeagueTable({
    season, teams: teams(4), expectedClubCount: 4,
    fixtures: [
      ...base,
      fixture({ providerFixtureId: "city-hull", status: "LIVE", homeClubId: "club-1", awayClubId: "club-2", homeScore: 0, awayScore: 1 }),
      fixture({ providerFixtureId: "sunderland-live", status: "LIVE", homeClubId: "club-3", awayClubId: "club-4", homeScore: 0, awayScore: 0 }),
    ],
  });
  assert.deepEqual(stateC.rows.slice(0, 3).map((row) => [row.team.providerTeamId, row.points]), [["2", 6], ["3", 4], ["1", 3]]);

  const finalState = resolveTouchlineOfficialLeagueTable({
    season, teams: teams(4), expectedClubCount: 4,
    fixtures: [
      ...base,
      fixture({ providerFixtureId: "city-hull", status: "Finished", homeClubId: "club-1", awayClubId: "club-2", homeScore: 0, awayScore: 1 }),
      fixture({ providerFixtureId: "sunderland-live", status: "Finished", homeClubId: "club-3", awayClubId: "club-4", homeScore: 0, awayScore: 0 }),
    ],
  });
  assert.equal(finalState.coverage.liveFixtures, 0);
  assert.equal(finalState.coverage.completedFixtures, 5);
  assert.deepEqual(finalState.rows.map((row) => [row.team.providerTeamId, row.points]), stateC.rows.map((row) => [row.team.providerTeamId, row.points]));

  const equaliserState = resolveTouchlineOfficialLeagueTable({
    season, teams: teams(4), expectedClubCount: 4,
    fixtures: [
      ...base,
      fixture({ providerFixtureId: "city-hull", status: "LIVE", homeClubId: "club-1", awayClubId: "club-2", homeScore: 1, awayScore: 1 }),
      fixture({ providerFixtureId: "sunderland-live", status: "LIVE", homeClubId: "club-3", awayClubId: "club-4", homeScore: 1, awayScore: 1 }),
    ],
  });
  assert.deepEqual(equaliserState.rows.slice(0, 3).map((row) => [row.team.providerTeamId, row.sportsRank, row.isTied, row.displayPosition]), [
    ["1", 1, true, 1], ["2", 1, true, 2], ["3", 1, true, 3],
  ]);
  assert.deepEqual(
    resolveTouchlineOfficialLeagueTable({
      season, teams: teams(4), expectedClubCount: 4,
      fixtures: [
        ...base,
        fixture({ providerFixtureId: "city-hull", status: "LIVE", homeClubId: "club-1", awayClubId: "club-2", homeScore: 1, awayScore: 1 }),
        fixture({ providerFixtureId: "sunderland-live", status: "LIVE", homeClubId: "club-3", awayClubId: "club-4", homeScore: 1, awayScore: 1 }),
      ],
    }).rows,
    equaliserState.rows,
  );
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
  assert.ok(result.rows.every((row) => row.sportsRank === null && row.isTied === false && row.displayPosition === null));
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
  assert.deepEqual(result.rows.map((row) => [row.sportsRank, row.isTied, row.displayPosition]), [[1, false, 1], [2, false, 2]]);
  assert.equal(result.asOf, "2026-08-21T21:00:00.000Z");
});

test("an exact in-season sporting tie is official while club name affects display order only", () => {
  const result = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(2),
    expectedClubCount: 2,
    fixtures: [fixture({ providerFixtureId: "draw-final", homeScore: 1, awayScore: 1 })],
  });

  assert.equal(result.state, "ready");
  assert.equal(result.reason, null);
  assert.deepEqual(result.rows.map((row) => [row.sportsRank, row.isTied, row.displayPosition]), [[1, true, 1], [1, true, 2]]);

  const source = readFileSync(new URL("../lib/football-data/official-standings.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localeCompare/);
});

test("verified criteria publish shared competition ranks across the 20-club table", () => {
  const result = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(),
    fixtures: [
      fixture({ providerFixtureId: "leader-a", homeClubId: "club-1", awayClubId: "club-20", homeScore: 3, awayScore: 0 }),
      fixture({ providerFixtureId: "leader-b", homeClubId: "club-2", awayClubId: "club-19", homeScore: 3, awayScore: 0 }),
      fixture({ providerFixtureId: "next", homeClubId: "club-3", awayClubId: "club-18", homeScore: 2, awayScore: 0 }),
    ],
  });

  assert.equal(result.state, "ready");
  assert.equal(result.reason, null);
  assert.deepEqual(result.rows.slice(0, 3).map((row) => [row.team.providerTeamId, row.sportsRank, row.isTied, row.displayPosition, row.points, row.goalDifference]), [
    ["1", 1, true, 1, 3, 3],
    ["2", 1, true, 2, 3, 3],
    ["3", 3, false, 3, 3, 2],
  ]);
  assert.ok(result.rows.every((row) => row.sportsRank !== null));
  assert.deepEqual(result.rows.map((row) => row.displayPosition), Array.from({ length: 20 }, (_, index) => index + 1));
});

test("four exactly tied clubs share rank while alphabetical display order does not become a sporting tiebreak", () => {
  const tiedTeams = teams(5).map((team, index) => ({
    ...team,
    name: ["Zulu", "Alpha", "Mike", "Bravo", "Opponent"][index],
  }));
  const result = resolveTouchlineOfficialLeagueTable({
    season,
    teams: tiedTeams,
    expectedClubCount: 5,
    fixtures: [1, 2, 3, 4].map((clubIndex) => fixture({
      providerFixtureId: `winner-${clubIndex}`,
      homeClubId: `club-${clubIndex}`,
      awayClubId: "club-5",
      homeScore: 1,
      awayScore: 0,
    })),
  });

  assert.deepEqual(result.rows.slice(0, 4).map((row) => [row.team.name, row.sportsRank, row.isTied, row.displayPosition]), [
    ["Alpha", 1, true, 1],
    ["Bravo", 1, true, 2],
    ["Mike", 1, true, 3],
    ["Zulu", 1, true, 4],
  ]);
  assert.deepEqual([result.rows[4]?.sportsRank, result.rows[4]?.isTied, result.rows[4]?.displayPosition], [5, false, 5]);
});

test("exact sporting ties receive continuous presentation-only display positions", () => {
  const tiedTeams = teams(5).map((team, index) => ({
    ...team,
    name: ["Zulu", "Alpha", "Mike", "Bravo", "Opponent"][index],
  }));
  const result = resolveTouchlineOfficialLeagueTable({
    season,
    teams: tiedTeams,
    expectedClubCount: 5,
    fixtures: [1, 2, 3, 4].map((clubIndex) => fixture({
      providerFixtureId: `winner-display-${clubIndex}`,
      homeClubId: `club-${clubIndex}`,
      awayClubId: "club-5",
      homeScore: 1,
      awayScore: 0,
    })),
  });

  assert.deepEqual(
    result.rows.map((row) => [row.team.name, row.sportsRank, row.isTied, row.displayPosition]),
    [
      ["Alpha", 1, true, 1],
      ["Bravo", 1, true, 2],
      ["Mike", 1, true, 3],
      ["Zulu", 1, true, 4],
      ["Opponent", 5, false, 5],
    ],
  );
});

test("verified GD and then GF remove a shared-rank indicator without inventing another criterion", () => {
  const gdResult = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(4),
    expectedClubCount: 4,
    fixtures: [
      fixture({ providerFixtureId: "gd-a", homeClubId: "club-1", awayClubId: "club-3", homeScore: 3, awayScore: 0 }),
      fixture({ providerFixtureId: "gd-b", homeClubId: "club-2", awayClubId: "club-4", homeScore: 2, awayScore: 0 }),
    ],
  });
  assert.deepEqual(gdResult.rows.slice(0, 2).map((row) => [row.team.providerTeamId, row.sportsRank, row.isTied]), [
    ["1", 1, false], ["2", 2, false],
  ]);

  const gfResult = resolveTouchlineOfficialLeagueTable({
    season,
    teams: teams(4),
    expectedClubCount: 4,
    fixtures: [
      fixture({ providerFixtureId: "gf-a", homeClubId: "club-1", awayClubId: "club-3", homeScore: 3, awayScore: 1 }),
      fixture({ providerFixtureId: "gf-b", homeClubId: "club-2", awayClubId: "club-4", homeScore: 2, awayScore: 0 }),
    ],
  });
  assert.deepEqual(gfResult.rows.slice(0, 2).map((row) => [row.team.providerTeamId, row.sportsRank, row.isTied]), [
    ["1", 1, false], ["2", 2, false],
  ]);
});

test("home or away status and card concepts never become standings tie-breakers", () => {
  const namedTeams = teams(4).map((team, index) => ({
    ...team,
    name: ["Zulu", "Alpha", "Opponent A", "Opponent B"][index],
  }));
  const result = resolveTouchlineOfficialLeagueTable({
    season,
    teams: namedTeams,
    expectedClubCount: 4,
    fixtures: [
      fixture({ providerFixtureId: "home-win", homeClubId: "club-1", awayClubId: "club-3", homeScore: 1, awayScore: 0 }),
      fixture({ providerFixtureId: "away-win", homeClubId: "club-4", awayClubId: "club-2", homeScore: 0, awayScore: 1 }),
    ],
  });

  assert.deepEqual(result.rows.slice(0, 2).map((row) => [row.team.name, row.sportsRank, row.displayPosition]), [
    ["Alpha", 1, 1],
    ["Zulu", 1, 2],
  ]);
  const resolverSource = readFileSync(new URL("../lib/football-data/official-league-table.ts", import.meta.url), "utf8");
  const engineSource = readFileSync(new URL("../lib/football-data/official-standings.ts", import.meta.url), "utf8");
  assert.doesNotMatch(`${resolverSource}\n${engineSource}`, /yellow card|red card|fair play/i);
});

test("shared table component and pages keep data loading on the server boundary", () => {
  const component = readFileSync(new URL("../components/touchline/TouchlineOfficialLeagueTable.tsx", import.meta.url), "utf8");
  const componentStyles = readFileSync(new URL("../components/touchline/TouchlineOfficialLeagueTable.module.css", import.meta.url), "utf8");
  const serverReader = readFileSync(new URL("../lib/football-data/official-league-table-server.ts", import.meta.url), "utf8");
  const directory = readFileSync(new URL("../app/touchline-clubs/page.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");

  assert.match(component, /variant: "directory" \| "profile"/);
  assert.match(component, /currentTeamId/);
  assert.match(component, /status && !table\.rows\.length/);
  assert.match(component, /Initial table — all 20 clubs are level\./);
  assert.match(component, /Tabela inicial — os 20 clubes estão empatados\./);
  assert.match(component, /row\.displayPosition \?\? "—"/);
  assert.doesNotMatch(component, /row\.isTied/);
  assert.doesNotMatch(component, /\{row\.sportsRank\}=/);
  assert.doesNotMatch(component, /tiedRank/);
  assert.match(component, /aria-label=/);
  assert.match(componentStyles, /\.tableWrap \.rankCell \{[\s\S]*?padding: 0;/);
  assert.match(componentStyles, /\.tiedRank \{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/);
  assert.match(component, /Season status/);
  assert.match(component, /Status da temporada/);
  assert.match(component, /dictionary\.goalsFor/);
  assert.match(component, /dictionary\.goalsAgainst/);
  assert.match(component, /\{row\.goalsFor\}/);
  assert.match(component, /\{row\.goalsAgainst\}/);
  assert.match(component, /row\.team\.logoUrl[^\n]+loading="lazy"[^\n]+decoding="async"/);
  assert.match(component, /href=\{`\/touchline-clubs\/\$\{row\.team\.slug\}[^\n]+\n\s+prefetch=\{false\}/);
  assert.match(component, /alphabetical display order only/);
  assert.match(component, /data-live=/);
  assert.match(component, /data-live-stale=/);
  assert.match(component, /latest persisted live scores/);
  assert.match(component, /router\.refresh\(\)/);
  assert.match(component, /dictionary\.live/);
  assert.match(component, /table\.rows\.map/);
  assert.doesNotMatch(component, /from ["'][^"']*(?:card|market|wallet|supabase)/i);
  assert.doesNotMatch(component, /\bfetch\(/);
  assert.match(serverReader, /unstable_cache/);
  assert.match(serverReader, /touchline-official-league-table-v4/);
  assert.doesNotMatch(serverReader, /touchline-official-league-table-v[123]/);
  assert.match(serverReader, /touchline-official-league-table:\$\{TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID\}/);
  assert.match(serverReader, /\.eq\("season_id", scope\.season\.id\)/);
  assert.doesNotMatch(serverReader, /createFootballDataProvider/);
  assert.doesNotMatch(directory, /loadTouchlineOfficialLeagueTable/);
  assert.doesNotMatch(directory, /TouchlineOfficialLeagueTable/);
  assert.doesNotMatch(directory, /id="official-league-table"/);
  assert.match(directory, /href=\{`\/touchline-clubs\/\$\{club\.slug\}[^\n]+\n\s+prefetch=\{false\}/);
  assert.match(profile, /loadTouchlineOfficialLeagueTable/);
  assert.match(profile, /TouchlineOfficialLeagueTable/);
  assert.doesNotMatch(profile, /buildOfficialStandings/);
  assert.doesNotMatch(profile, /\/touchline-clubs\?\$\{localeQuery\}#official-league-table/);
});
