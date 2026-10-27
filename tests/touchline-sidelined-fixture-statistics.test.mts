import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { isTouchLineSettledFixtureStatus } from "../lib/football-data/fixture-settlement.ts";
import { buildTouchLinePlayerSeasonAggregate } from "../lib/football-data/player-season-statistics-sync.ts";
import { touchLinePlayerFixtureEventStatistics } from "../lib/football-data/player-fixture-scoring.ts";
import { touchLinePlayerFixtureScoreV4 } from "../lib/football-data/player-score-engine-v4.ts";
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

async function execute(input: { feeds?: Row[]; fixtures?: Row[]; players?: Row[]; clubs?: Row[]; settlements?: Row[]; failAbsenceRead?: boolean } = {}, expectedOk = true) {
  const writes: Record<string, Row[]> = {};
  const tables: Record<string, Row[]> = {
    football_fixtures: input.fixtures ?? [fixture, { ...fixture, id: "fixture-b", provider_fixture_id: "101" }],
    football_fantasy_fixture_feeds: input.feeds ?? [feed],
    // The official team sheet must have canonical identities too. These
    // tests isolate the sidelined player, not incomplete lineup coverage.
    football_players: [
      ...lineups.map((member) => ({ id: `lineup-${member.playerId}`, provider: "sportmonks", provider_player_id: member.playerId, position: "Midfielder" })),
      ...(input.players ?? [{ id: "player-a", provider: "sportmonks", provider_player_id: "17544737", position: "Defender" }]),
    ],
    football_clubs: input.clubs
      ? [...input.clubs, ...(input.clubs.some((club) => club.provider_team_id === "20") ? [] : [{ id: "club-b", provider: "sportmonks", provider_team_id: "20" }])]
      : [{ id: "club-a", provider: "sportmonks", provider_team_id: "19" }, { id: "club-b", provider: "sportmonks", provider_team_id: "20" }],
    football_player_season_memberships: [],
    touchline_player_fixture_score_settlements: input.settlements ?? [],
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
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows.slice(lo,hi), count:rows.length,error: input.failAbsenceRead && table === "touchline_player_fixture_score_settlements" ? { message: "unavailable" } : null }).then(resolve); },
    };
    return query;
  } };
  const sync = runInNewContext(`${code}\nsyncTouchLinePlayerSeasonStatistics;`, {
    isTouchLineSettledFixtureStatus, buildTouchLinePlayerSeasonAggregate, touchLinePlayerFixtureEventStatistics,
    touchLinePlayerFixtureScoreV4, classifyTouchLinePlayerRankingCoverage, groupTouchLinePlayerSeasonMemberships,
    upsertTouchLineRowsResiliently,
    inspectTouchlineOfficialTeamSheet,
    auditTouchlinePlayerScoreSettlementCoverage: async () => ({ missingFixtureIds: [], error: null }),
    rebuildTouchLinePlayerRankingV4: async () => ({ ok: true, snapshotId: null, playerCount: 0, published: false }),
  });
  const result = await sync(admin);
  assert.equal(result.ok, expectedOk, `Unexpected global sync outcome: ${result.errors.join(", ")}`);
  assert.equal(result.scoringVersion, "player_scoring_v4");
  assert.equal(result.fixtureRowsWritten, 0);
  assert.equal(result.v3FixtureRowsWritten, 0);
  assert.equal(writes.football_player_fixture_statistics, undefined);
  for (const table of ["football_player_season_statistics", "touchline_player_fixture_score_settlements"]) {
    for (const row of writes[table] ?? []) assert.equal(row.scoring_version, "player_scoring_v4");
  }
  // Preserve assertions about the sideline target independently of the
  // now-complete supporting XI/bench records.
  return Object.fromEntries(Object.entries(writes).flatMap(([table, rows]) => {
    const targetRows = rows.filter((row) => !String(row.football_player_id ?? "").startsWith("lineup-"));
    return targetRows.length ? [[table, targetRows]] : [];
  }));
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

test("a valid lineup claim wins over a contradictory sideline without aborting the rebuild", async () => {
  const writes = await execute({ feeds: [{ ...feed, lineups_payload: lineups.map((member, index) => (
    index === 0 ? { ...member, playerId: "17544737" } : member
  )) }] });
  const rows = (writes.touchline_player_fixture_score_settlements ?? []).filter((row) => row.fixture_id === "fixture-a");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].appearance_status, "started");
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
  ]) assert.equal((await execute(input, !("clubs" in input))).touchline_player_fixture_score_settlements, undefined);
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

const priorAbsence = {
  id: "old-absence", football_player_id: "player-a", fixture_id: fixture.id,
  competition_id: fixture.competition_id, season_id: fixture.season_id, club_id: "club-a",
  scoring_version: "player_scoring_v4", appearance_status: "absent", settlement_status: "final",
  minutes_played: null, rating: null, touchline_points: null, source_synced_at: "2026-08-16T12:00:00Z",
  football_players: { id: "player-a", provider: "sportmonks", provider_player_id: "17544737" },
  football_clubs: { id: "club-a", provider: "sportmonks", provider_team_id: "19" },
};
const finalFixture = { ...fixture,
  football_seasons: { provider: "sportmonks", provider_season_id: "28083" },
  football_competitions: { provider: "sportmonks", provider_competition_id: "8" },
};
const correctedFeed = { ...feed, sidelined_payload: [],
  fixture_payload: { ...payload, seasonId: "28083", competitionId: "8" },
};
const revalidation = { fixtures: [finalFixture], feeds: [correctedFeed], settlements: [priorAbsence] };

test("existing final V4 absence survives disappearing sideline without inventing participation or season membership", async () => {
  const writes = await execute(revalidation);
  const rows = writes.touchline_player_fixture_score_settlements ?? [];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fixture_id, fixture.id);
  assert.equal(rows[0].club_id, priorAbsence.club_id);
  assert.equal(rows[0].appearance_status, "absent");
  assert.equal(rows[0].source_synced_at, correctedFeed.last_synced_at);
  for (const key of ["rating", "minutes_played", "touchline_points"]) assert.equal(rows[0][key], null);
  assert.equal(rows[0].ranking_coverage_status, "complete_for_scoring");
  assert.equal(writes.football_player_season_memberships, undefined);
  assert.equal(writes.football_player_season_statistics?.[0].expected_fixture_count, 1);
  assert.equal((writes.football_player_season_statistics?.[0].summary_payload as Row).totalRating, null);
  const repeated = await execute({ ...revalidation, settlements: [{ ...priorAbsence, ...rows[0] }] });
  assert.deepEqual(JSON.parse(JSON.stringify(repeated)), JSON.parse(JSON.stringify(writes)));
});

test("revalidated absence is limited to its existing fixture, never another season, provider, competition or fixture", async () => {
  const writes = await execute({ ...revalidation, fixtures: [finalFixture,
    { ...finalFixture, id: "other-fixture", provider_fixture_id: "101" },
    { ...finalFixture, id: "other-season", provider_fixture_id: "102", season_id: "other" },
    { ...finalFixture, id: "other-competition", provider_fixture_id: "103", competition_id: "other" },
    { ...finalFixture, id: "other-provider", provider: "other" },
  ] });
  assert.equal(writes.touchline_player_fixture_score_settlements?.length, 1);
  assert.equal(writes.touchline_player_fixture_score_settlements?.[0].fixture_id, fixture.id);
  assert.equal(writes.football_player_season_statistics?.[0].expected_fixture_count, 1);
  assert.equal((await execute({ ...revalidation, settlements: [] })).touchline_player_fixture_score_settlements, undefined);
});

for (const [label, bad] of Object.entries({
  version: { scoring_version: "player_scoring_v3" }, provisional: { settlement_status: "provisional" },
  appearance: { appearance_status: "unused" }, rating: { rating: 7.19 }, minutes: { minutes_played: 0 }, points: { touchline_points: 0 },
  fixture: { fixture_id: "unknown" }, season: { season_id: "other" }, competition: { competition_id: "other" }, club: { club_id: "other" },
  observation: { source_synced_at: null }, future: { source_synced_at: "2027-01-01T00:00:00Z" },
  playerIdentity: { football_players: { ...priorAbsence.football_players, id: "other" } },
  playerProvider: { football_players: { ...priorAbsence.football_players, provider: "other" } },
  clubIdentity: { football_clubs: { ...priorAbsence.football_clubs, id: "other" } },
  clubProvider: { football_clubs: { ...priorAbsence.football_clubs, provider: "other" } },
  clubProviderId: { football_clubs: { ...priorAbsence.football_clubs, provider_team_id: "20" } },
})) test(`prior V4 absence rejects unproven ${label}`, async () => {
  assert.equal((await execute({ ...revalidation, settlements: [{ ...priorAbsence, ...bad }] })).touchline_player_fixture_score_settlements, undefined);
});

for (const [label, bad] of Object.entries({
  live: { fixture_payload: { ...correctedFeed.fixture_payload, status: "Live" } },
  missingPayload: { fixture_payload: null },
  provider: { fixture_payload: { ...correctedFeed.fixture_payload, provider: "other" } },
  fixture: { fixture_payload: { ...correctedFeed.fixture_payload, providerId: "999" } },
  season: { fixture_payload: { ...correctedFeed.fixture_payload, seasonId: "999" } },
  competition: { fixture_payload: { ...correctedFeed.fixture_payload, competitionId: "999" } },
  clubs: { fixture_payload: { ...correctedFeed.fixture_payload, homeTeam: payload.awayTeam, awayTeam: payload.homeTeam } },
  partialSheet: { lineups_payload: lineups.slice(0,39) },
  extraMember: { lineups_payload: [...lineups, lineups[0]] },
  duplicateMember: { lineups_payload: lineups.map((member,i)=>i===20?{...member,playerId:lineups[0].playerId}:member) },
  missingEvents: { events_payload: null },
  oldSource: { last_synced_at: "2026-08-01T00:00:00Z" }, missingSource: { last_synced_at: null },
  eventPlayer: { events_payload: [{ provider:"sportmonks",fixtureId:"100",playerId:"17544737",type:"Goal" }] },
  eventRelated: { events_payload: [{ provider:"sportmonks",fixtureId:"100",relatedPlayerId:"17544737",type:"Substitution" }] },
  numericEventIdentity: { events_payload: [{ provider:"sportmonks",fixtureId:"100",playerId:17544737,type:"Goal" }] },
  eventProvider: { events_payload: [{ provider:"other",fixtureId:"100",playerId:"1000" }] },
  eventFixture: { events_payload: [{ provider:"sportmonks",fixtureId:"999",playerId:"1000" }] },
  sidelineConflict: { sidelined_payload: [{...sidelined,teamId:"20"}] },
})) test(`new final proof rejects ${label} for a disappeared sideline`, async () => {
  const writes = await execute({ ...revalidation, feeds: [{ ...correctedFeed, ...bad }] });
  // A current valid sideline can independently establish another scoped row;
  // it must never refresh the conflicting old club's absence.
  const target = (writes.touchline_player_fixture_score_settlements ?? []).find(row=>row.club_id==="club-a");
  assert.equal(target, undefined);
});

test("a newly present lineup participant replaces the old absence through the normal V4 path", async () => {
  const writes = await execute({ ...revalidation, feeds: [{ ...correctedFeed, lineups_payload: lineups.map((row,i)=>i===0
    ? {...row,playerId:"17544737",statistics:[{code:"minutes-played",value:90},{code:"rating",value:6.37}]}:row) }] });
  const row = writes.touchline_player_fixture_score_settlements?.[0];
  assert.equal(row?.appearance_status,"started");assert.equal(row?.rating,6.37);assert.equal(row?.touchline_points,6.37);
});

test("missing or ambiguous old-absence identities and reads never fabricate freshness", async () => {
  for (const input of [
    { players: [] }, { players: [{id:"other",provider:"sportmonks",provider_player_id:"17544737"}] },
    { players: [priorAbsence.football_players,{...priorAbsence.football_players,id:"ambiguous"}] },
    { fixtures: [finalFixture,{...finalFixture,id:"duplicate-fixture"}] },
    { fixtures: [{...finalFixture,status:"Live"}] },
    { fixtures: [{...finalFixture,football_seasons:null}] },
    { fixtures: [{...finalFixture,football_competitions:null}] },
    { clubs: [{id:"club-a",provider:"sportmonks",provider_team_id:"19"},{id:"wrong-opponent",provider:"sportmonks",provider_team_id:"20"}] },
    { feeds: [correctedFeed,{...correctedFeed}] },
    { settlements: [priorAbsence,{...priorAbsence,id:"duplicate-absence"}] },
  ]) assert.equal((await execute({...revalidation,...input})).touchline_player_fixture_score_settlements,undefined);
  const failed=await execute({...revalidation,failAbsenceRead:true},false);
  assert.equal(Object.keys(failed).length,0);
});
