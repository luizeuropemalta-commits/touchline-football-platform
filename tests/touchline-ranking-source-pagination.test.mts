import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { isTouchLineSettledFixtureStatus } from "../lib/football-data/fixture-settlement.ts";
import { buildSportmonksRankingDraft, auditTouchlineRankingDraft } from "../lib/touchlineArena/card-ranking-pipeline.ts";
import { buildTouchlineRankingPersistenceRecord } from "../lib/touchlineArena/card-ranking-persistence.ts";
import { TOUCHLINE_ENGLAND_LEAGUE_KEY } from "../lib/touchlineArena/card-ranking-live.ts";
import { isTouchLinePlayerRankingAggregateComplete, isTouchLinePlayerRankingSettlementComplete } from "../lib/touchlineArena/player-ranking-eligibility.ts";
import { TOUCHLINE_SELECTION_VERSION, buildTouchlineSelection } from "../lib/touchlineArena/touchline-selection.ts";

// Execute the real rebuild with real scoring/audit/selection collaborators.
// Only database IO and editorial publication lookup are isolated in memory.
const source = stripTypeScriptTypes(readFileSync(new URL("../lib/touchlineArena/player-ranking-rebuild-server.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "")
  .replace(/^export /gm, "");
const { rebuild, rebuildV4, auditCoverage } = runInNewContext(`${source}\n({ rebuild: rebuildTouchLinePlayerRankingV3, rebuildV4: rebuildTouchLinePlayerRankingV4, auditCoverage: auditTouchlinePlayerScoreSettlementCoverage });`, {
  isTouchLineSettledFixtureStatus, buildSportmonksRankingDraft, auditTouchlineRankingDraft,
  buildTouchlineRankingPersistenceRecord, TOUCHLINE_ENGLAND_LEAGUE_KEY,
  isTouchLinePlayerRankingAggregateComplete, isTouchLinePlayerRankingSettlementComplete,
  TOUCHLINE_SELECTION_VERSION, buildTouchlineSelection,
  loadTouchlinePublishedCardPresentations: async ({ playerIds }) => new Map(playerIds.map(id => [id, {}])),
});

function database(options: { pageFailure?: boolean; missing?: boolean; duplicate?: boolean; cap?: number; rating?: number; persistFailure?: boolean; readFailure?: string } = {}) {
  const fixtureIds = Array.from({ length: 100 }, (_, n) => `fixture-${String(n).padStart(3, "0")}`);
  const positions = ["Goalkeeper", "Left Back", "Centre Back", "Centre Back", "Right Back", "Central Midfield", "Central Midfield", "Central Midfield", "Left Wing", "Centre Forward", "Right Wing"];
  const players = positions.map((position, n) => ({ id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`, provider_player_id: String(n + 1), display_name: `Test player ${n}`, detailed_position: position, current_club_id: "club" }));
  const tables = {
    football_seasons: [{ id: "season" }],
    football_fixtures: fixtureIds.map((id, n) => ({ id, provider_fixture_id: String(n + 1), round_id: "round", starts_at: "2026-09-01T12:00:00Z", status: "FINISHED", source_updated_at: "2026-09-01T14:00:00Z" })),
    football_player_season_statistics: players.map(player => ({ football_player_id: player.id, provider_player_id: player.provider_player_id, summary_payload: { totalRating: 700, minutes: 9000, appearances: 100 }, coverage_status: "complete", expected_fixture_ids: fixtureIds, aggregated_fixture_ids: fixtureIds, source_synced_at: "2026-09-01T14:00:00Z" })),
    football_players: players,
    touchline_player_fixture_score_settlements: players.flatMap((player, p) => fixtureIds.map((fixture_id, f) => ({ id: `${p}-${f}`, football_player_id: player.id, fixture_id, settlement_status: "final", ranking_coverage_status: "complete" }))),
    football_clubs: [{ id: "club", name: "Test club" }],
    football_rounds: [{ id: "round", provider_round_id: "100" }],
    touchline_card_ranking_active_snapshots: [],
    touchline_card_ranking_snapshots: [],
  };
  if (options.missing) tables.touchline_player_fixture_score_settlements.pop();
  if (options.rating !== undefined) for (const aggregate of tables.football_player_season_statistics) aggregate.summary_payload.totalRating = options.rating;
  const reads = [];
  const filters = [];
  const writes = [];
  return {
    reads, writes, filters, tables,
    admin: {
      from(table) {
        let from = 0; let to = (options.cap ?? 1000) - 1; let counted = false;
        let order = ""; let single = false;
        const query = {
          select(_columns, config) { counted = config?.count === "exact"; return query; },
          eq(key, value) { filters.push({ table, key, value }); return query; }, in() { return query; },
          order(column, config) { assert.equal(config?.ascending, true); order = column; return query; },
          range(start, end) { from = start; to = end; return query; },
          maybeSingle() { single = true; return query; },
          upsert(value) {
            writes.push({ table, value });
            if (options.persistFailure) return Promise.resolve({error:{message:"synthetic persist failure"}});
            if (!(tables[table] ?? []).some(row=>row.snapshot_id===value.snapshot_id)) tables[table].push(value);
            return Promise.resolve({ error: null });
          },
          then(resolve, reject) {
            if (table===options.readFailure) return Promise.resolve({data:null,error:{message:"synthetic read failure"}}).then(resolve,reject);
            const all = [...(tables[table] ?? [])];
            if (order) all.sort((a, b) => String(a[order]).localeCompare(String(b[order])));
            reads.push({ table, from, to, order });
            if (table === "touchline_player_fixture_score_settlements" && from > 0 && options.pageFailure) {
              return Promise.resolve({ data: null, error: { message: "test page unavailable" }, count: null }).then(resolve, reject);
            }
            const page = all.slice(from, Math.min(to + 1, from + (options.cap ?? 1000)));
            if (table === "touchline_player_fixture_score_settlements" && from > 0 && options.duplicate) page[0] = all[0];
            return Promise.resolve({ data: single ? page[0] ?? null : page, error: null, count: counted ? all.length : null }).then(resolve, reject);
          },
        };
        return query;
      },
      async rpc(name, args) { writes.push({ name, args }); return { error: null }; },
    },
  };
}

test("rebuild includes all 1,100 settlements beyond the API's first 1,000 rows", async () => {
  const db = database();
  const result = await rebuild(db.admin);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.published, true);
  assert.equal(result.playerCount, 11);
  assert.equal(result.fixtureIds.length, 100);
  const pages = db.reads.filter(read => read.table === "touchline_player_fixture_score_settlements");
  assert.ok(pages.length > 1);
  assert.ok(pages.every(page => page.order === "id"), "Every page needs deterministic unique ordering");
  assert.equal(db.writes.filter(write => write.name === "publish_touchline_card_ranking_snapshot").length, 1);
  assert.equal(db.writes[0].value.ranking_payload.players[0].totalRating, 700);
});

test("a lower configured row cap cannot silently truncate a ranking source", async () => {
  const db = database({ cap: 100 });
  const result = await rebuild(db.admin);
  // A constrained API may fail closed, but must not publish a partial ranking.
  assert.equal(result.ok, false);
  assert.equal(db.writes.length, 0);
});

test("V4 rebuild uses only V4 source queries and retains decimal ratings", async () => {
  const db = database({ rating: 8.09 });
  const result = await rebuildV4(db.admin);
  assert.equal(result.ok, true, result.error);
  assert.match(result.snapshotId, /^player-rating-v4/);
  const versions = db.filters.filter(filter => filter.key === "scoring_version");
  assert.ok(versions.length >= 2);
  assert.ok(versions.every(filter => filter.value === "player_scoring_v4"));
  const snapshot = db.writes.find(write => write.table === "touchline_card_ranking_snapshots").value;
  assert.equal(snapshot.scoring_version, "player_scoring_v4");
  assert.equal(snapshot.ranking_payload.players[0].totalRating, 8.09);
  assert.equal(snapshot.total_score_points, 0, "legacy compatibility counter is not a second scoring authority");
});

for (const options of [{ pageFailure: true }, { duplicate: true }, { missing: true }]) {
  test(`incomplete settlement reads never publish: ${JSON.stringify(options)}`, async () => {
    const db = database(options);
    const result = await rebuild(db.admin);
    assert.equal(result.ok, false);
    assert.equal(result.published, false);
    assert.equal(db.writes.length, 0);
  });
}

test("post-write coverage audit reads every page and reports only genuinely missing fixtures", async () => {
  const db = database();
  const expectedIds = Array.from({ length: 100 }, (_, n) => `fixture-${String(n).padStart(3, "0")}`);
  const result = await auditCoverage(db.admin, "season", [...expectedIds, "missing-fixture"]);
  assert.equal(result.error, null);
  assert.equal(JSON.stringify(result.missingFixtureIds), JSON.stringify(["missing-fixture"]));
  assert.ok(db.reads.length > 1);
  assert.equal(db.writes.length, 0);
});

test("post-write coverage audit cannot pass after a partial read", async () => {
  const db = database({ pageFailure: true });
  const result = await auditCoverage(db.admin, "season", ["fixture-099"]);
  assert.equal(result.error, "ranking-settlement-read-unavailable");
  assert.equal(db.writes.length, 0);
});

test("staging persists an audited V4 candidate, repeats safely and never publishes", async()=>{
  const db=database();
  db.tables.touchline_card_ranking_active_snapshots.push({snapshot_id:"old-v3"});
  for(let i=0;i<2;i++) {
    const result=await rebuildV4(db.admin,{publicationMode:"stage"});
    assert.equal(result.ok,true,result.error);
    assert.equal(result.publicationState,"staged");
    assert.equal(result.published,false);
  }
  assert.equal(db.tables.touchline_card_ranking_snapshots.length,1);
  assert.equal(db.tables.touchline_card_ranking_snapshots[0].status,"audited");
  assert.equal(db.tables.touchline_card_ranking_active_snapshots[0].snapshot_id,"old-v3");
  assert.equal(db.writes.filter(w=>w.name).length,0);
});
test("staging recognizes already-active without rewriting immutable record",async()=>{
  const db=database(); await rebuildV4(db.admin,{publicationMode:"stage"});
  const row=db.tables.touchline_card_ranking_snapshots[0]; row.status="published"; row.published_at=new Date().toISOString();
  db.tables.touchline_card_ranking_active_snapshots.push({snapshot_id:row.snapshot_id});
  const before=JSON.stringify(row),writes=db.writes.length;
  const result=await rebuildV4(db.admin,{publicationMode:"stage"});
  assert.equal(result.ok,true,result.error);assert.equal(result.publicationState,"already-active");
  assert.equal(db.writes.length,writes);assert.equal(JSON.stringify(row),before);
});
test("staging fails closed on ignored conflicting candidate",async()=>{
  const db=database();await rebuildV4(db.admin,{publicationMode:"stage"});
  db.tables.touchline_card_ranking_snapshots[0].checksum="tampered";
  const result=await rebuildV4(db.admin,{publicationMode:"stage"});
  assert.equal(result.ok,false);assert.equal(result.error,"ranking-stage-readback-mismatch");
  assert.equal(db.writes.filter(w=>w.name).length,0);
});
for(const options of [{persistFailure:true},{missing:true},{readFailure:"touchline_card_ranking_active_snapshots"},{readFailure:"touchline_card_ranking_snapshots"}]) test(`staging preserves failure ${JSON.stringify(options)}`,async()=>{
  const db=database(options);const result=await rebuildV4(db.admin,{publicationMode:"stage"});
  assert.equal(result.ok,false);assert.equal(db.writes.filter(w=>w.name).length,0);
});
