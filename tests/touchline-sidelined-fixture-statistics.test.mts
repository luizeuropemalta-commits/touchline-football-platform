import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { isTouchLineSettledFixtureStatus } from "../lib/football-data/fixture-settlement.ts";
import { buildTouchLinePlayerSeasonAggregate } from "../lib/football-data/player-season-statistics-sync.ts";
import { touchLinePlayerFixturePoints } from "../lib/football-data/player-fixture-scoring.ts";
import { touchLinePlayerFixtureScoreV3 } from "../lib/football-data/player-score-engine-v3.ts";
import { classifyTouchLinePlayerRankingCoverage } from "../lib/football-data/player-ranking-coverage.ts";
import { groupTouchLinePlayerSeasonMemberships } from "../lib/football-data/player-season-membership-grouping.ts";
import { upsertTouchLineRowsResiliently } from "../lib/football-data/resilient-batch-upsert.ts";
import { inspectTouchlineOfficialTeamSheet } from "../lib/football-data/official-team-sheet-readiness.ts";

const code = stripTypeScriptTypes(readFileSync(new URL("../lib/football-data/player-season-statistics-store.ts", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?;\s*$/gm, "")
  .replace("export async function syncTouchLinePlayerSeasonStatistics", "async function syncTouchLinePlayerSeasonStatistics");
type Row = Record<string, unknown>;
const fixture = { id: "fixture-a", provider: "sportmonks", provider_fixture_id: "100", season_id: "season-a", competition_id: "league-a", home_club_id: "club-a", away_club_id: "club-b", status: "Full Time", home_score: 1, away_score: 0 };
const sidelined = { provider: "sportmonks", fixtureId: "100", playerId: "17544737", teamId: "19", reason: "Injury" };
const lineups = ["19", "20"].flatMap((teamId, teamIndex) => Array.from({ length: 20 }, (_, index) => ({
  provider: "sportmonks", fixtureId: "100", playerId: String(1000 + teamIndex * 100 + index), teamId,
  isStarter: index < 11, isSubstitute: index >= 11, formationPosition: index < 11 ? String(index + 1) : undefined,
  statistics: [],
})));
const payload = { provider: "sportmonks", providerId: "100", status: "Full Time", homeTeam: { providerId: "19" }, awayTeam: { providerId: "20" } };
const feed = { provider: "sportmonks", provider_fixture_id: "100", fixture_payload: payload, lineups_payload: lineups, events_payload: [], sidelined_payload: [sidelined], last_synced_at: "2026-09-21T10:00:00Z" };

async function execute(input: { feeds?: Row[]; fixtures?: Row[]; players?: Row[]; clubs?: Row[] } = {}) {
  const writes: Record<string, Row[]> = {};
  const tables: Record<string, Row[]> = {
    football_fixtures: input.fixtures ?? [fixture, { ...fixture, id: "fixture-b", provider_fixture_id: "101" }],
    football_fantasy_fixture_feeds: input.feeds ?? [feed],
    football_players: input.players ?? [{ id: "player-a", provider: "sportmonks", provider_player_id: "17544737", position: "Defender" }],
    football_clubs: input.clubs ?? [{ id: "club-a", provider: "sportmonks", provider_team_id: "19" }],
    football_player_season_memberships: [],
  };
  const admin = { from(table: string) {
    let rows = (tables[table] ?? []).map((row,index)=>({id:`${table}-${index}`,...row}));
    let lo=0,hi=500;
    const query = {
      select() { return query; },
      order() { return query; },
      range(from: number,to: number) {lo=from;hi=to+1;return query;},
      eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return query; },
      upsert(batch: Row[]) { writes[table] = [...(writes[table] ?? []), ...batch]; return Promise.resolve({ error: null }); },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows.slice(lo,hi), count:rows.length,error: null }).then(resolve); },
    };
    return query;
  } };
  const sync = runInNewContext(`${code}\nsyncTouchLinePlayerSeasonStatistics;`, {
    isTouchLineSettledFixtureStatus, buildTouchLinePlayerSeasonAggregate, touchLinePlayerFixturePoints,
    touchLinePlayerFixtureScoreV3, classifyTouchLinePlayerRankingCoverage, groupTouchLinePlayerSeasonMemberships,
    upsertTouchLineRowsResiliently,
    inspectTouchlineOfficialTeamSheet,
    auditTouchlinePlayerScoreSettlementCoverage: async () => ({ missingFixtureIds: [], error: null }),
    rebuildTouchLinePlayerRankingV3: async () => ({ ok: true, snapshotId: null, playerCount: 0, published: false }),
  });
  await sync(admin);
  return writes;
}

test("persisted final sideline proves absence only in its fixture without fabricating scores or global membership", async () => {
  const writes = await execute();
  const rows = writes.touchline_player_fixture_score_settlements ?? [];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fixture_id, "fixture-a");
  assert.equal(rows[0].appearance_status, "absent");
  for (const field of ["minutes_played", "rating", "touchline_points"]) assert.equal(rows[0][field], null);
  assert.equal(rows[0].ranking_coverage_status, "complete_for_scoring");
  assert.equal(writes.football_player_season_memberships, undefined);
});

test("duplicate sideline facts and repeated rebuilds produce the same single keyed settlement", async () => {
  const input = { feeds: [{ ...feed, sidelined_payload: [sidelined, sidelined] }] };
  const first = await execute(input);
  assert.equal(first.touchline_player_fixture_score_settlements?.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(await execute(input))));
});

for (const [label, bad] of Object.entries({ provider: { provider: "other" }, fixture: { fixtureId: "999" }, team: { teamId: "77" }, player: { playerId: "999" } })) {
  test(`reject sideline with mismatched ${label}`, async () => {
    const writes = await execute({ feeds: [{ ...feed, sidelined_payload: [{ ...sidelined, ...bad }] }] });
    assert.equal(writes.touchline_player_fixture_score_settlements, undefined);
  });
}

test("missing feeds, missing season and live fixtures cannot establish final sideline absence", async () => {
  for (const input of [{ feeds: [] }, { fixtures: [{ ...fixture, season_id: null }] }, { fixtures: [{ ...fixture, status: "Live" }] }]) {
    assert.equal((await execute(input)).touchline_player_fixture_score_settlements, undefined);
  }
});

test("conflicting sideline clubs do not establish an absence", async () => {
  const writes = await execute({ feeds: [{ ...feed, sidelined_payload: [sidelined, { ...sidelined, teamId: "20" }] }], clubs: [{ id: "club-a", provider: "sportmonks", provider_team_id: "19" }, { id: "club-b", provider: "sportmonks", provider_team_id: "20" }] });
  assert.equal(writes.touchline_player_fixture_score_settlements, undefined);
});

test("a lineup claim wins over a contradictory sideline; sideline never invents its missing team mapping", async () => {
  const writes = await execute({ feeds: [{ ...feed, lineups_payload: [{ playerId: "17544737", isStarter: true, statistics: [] }] }] });
  assert.equal(writes.touchline_player_fixture_score_settlements, undefined);
});

test("a known club outside the fixture and a different player provider cannot become sideline membership", async () => {
  const wrongClub = await execute({ clubs: [{ id: "club-other", provider: "sportmonks", provider_team_id: "19" }] });
  assert.equal(wrongClub.touchline_player_fixture_score_settlements, undefined);
  const wrongProvider = await execute({ players: [{ id: "player-a", provider: "other", provider_player_id: "17544737" }] });
  assert.equal(wrongProvider.touchline_player_fixture_score_settlements, undefined);
});

test("sideline identity is not extrapolated across seasons, competitions or provider namespaces", async () => {
  const writes = await execute({ fixtures: [fixture,
    { ...fixture, id: "other-season", provider_fixture_id: "101", season_id: "season-b" },
    { ...fixture, id: "other-league", provider_fixture_id: "102", competition_id: "league-b" },
    { ...fixture, id: "other-provider", provider: "other" },
  ] });
  assert.equal(writes.touchline_player_fixture_score_settlements?.length, 1);
  assert.equal(writes.touchline_player_fixture_score_settlements?.[0].fixture_id, "fixture-a");
  assert.equal(writes.football_player_season_statistics?.[0].expected_fixture_count, 1);
  assert.equal((writes.football_player_season_statistics?.[0].summary_payload as Row).totalRating, null);
});

test("ambiguous fixture, feed, player or club identities fail closed", async () => {
  for (const input of [
    { fixtures: [fixture, { ...fixture, id: "collision" }] },
    { feeds: [feed, { ...feed, sidelined_payload: [] }] },
    { players: [{ id: "p1", provider: "sportmonks", provider_player_id: "17544737" }, { id: "p2", provider: "sportmonks", provider_player_id: "17544737" }] },
    { clubs: [{ id: "club-a", provider: "sportmonks", provider_team_id: "19" }, { id: "club-b", provider: "sportmonks", provider_team_id: "19" }] },
  ]) assert.equal((await execute(input)).touchline_player_fixture_score_settlements, undefined);
});

test("stale live feed, missing or mismatched payload, invalid observation and incomplete team sheets cannot prove absence", async () => {
  for (const bad of [
    { fixture_payload: { ...payload, status: "Live" } },
    { fixture_payload: null },
    { fixture_payload: { ...payload, providerId: "999" } },
    { fixture_payload: { ...payload, provider: "other" } },
    { last_synced_at: null }, { last_synced_at: "invalid" },
    { lineups_payload: [] }, { lineups_payload: lineups.slice(0, 39) },
    { events_payload: null },
  ]) assert.equal((await execute({ feeds: [{ ...feed, ...bad }] })).touchline_player_fixture_score_settlements, undefined);
});
