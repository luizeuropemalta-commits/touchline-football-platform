import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// In-memory PostgreSQL, synthetic identities only; no application env/DB access.
// Canonical table definitions, constraints, ACLs and publisher come from real SQL.
// The five identity parents are reduced FK fixtures; no remote data is required.
const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const baseline = process.env.TOUCHLINE_PLAYER_V4_STORAGE_BASELINE === "1";
const migration = "20261001085331_touchline_player_score_v4_storage";
type Row = Record<string, unknown>;
type Database = {
  exec(sql: string): Promise<unknown>;
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
};
const read = (path: string) => readFile(new URL(`../supabase/${path}.sql`, import.meta.url), "utf8");
const tableNames = ["touchline_player_fixture_score_settlements", "football_player_season_statistics", "touchline_card_ranking_snapshots"];
const id = "10000000-0000-4000-8000-000000000001";

function table(source: string, name: string) {
  const start = source.indexOf(`create table if not exists public.${name} (`);
  assert.ok(start >= 0);
  const end = source.indexOf("\n);", start);
  assert.ok(end > start);
  return source.slice(start, end + 3);
}
async function security(db: Database) {
  return (await db.query(`select relname,relrowsecurity,relforcerowsecurity,relacl::text
    from pg_class where relnamespace='public'::regnamespace and relname=any($1) order by relname`, [tableNames])).rows;
}
async function historical(db: Database) {
  return Promise.all(tableNames.map(async name => (await db.query(`select to_jsonb(t) as row from public.${name} t
    where scoring_version='player_scoring_v3' order by to_jsonb(t)::text`)).rows));
}
async function insertSettlement(db: Database, version: string, rating: number | null, points: number | null,
  appearance = "started", minutes: number | null = 90, coverage = points === null ? "unavailable" : "complete") {
  return db.query(`insert into public.touchline_player_fixture_score_settlements
    (football_player_id,fixture_id,competition_id,season_id,scoring_version,appearance_status,minutes_played,
      rating,touchline_points,scoring_coverage_status,ranking_coverage_status,settlement_status)
    values ($1,$1,$1,$1,$2,$3,$4,$5,$6,$7,'complete','final')`,
  [id, version, appearance, minutes, rating, points, coverage]);
}
async function insertSeason(db: Database, version: string) {
  return db.query(`insert into public.football_player_season_statistics
    (football_player_id,competition_id,season_id,provider,provider_player_id,scoring_version,summary_payload)
    values ($1,$1,$1,'sportmonks','123',$2,'{"totalTouchlinePoints":8.09}'::jsonb)`, [id, version]);
}
async function insertSnapshot(db: Database, version: string, name: string) {
  return db.query(`insert into public.touchline_card_ranking_snapshots
    (snapshot_id,league_key,season_id,round_id,source,status,generated_at,audited_at,price_table_version,
      checksum,expected_player_count,actual_player_count,ranking_payload,selection_version,selection_payload,audit_report,scoring_version)
    values ($1,'england','synthetic-season','synthetic-round','sportmonks-audited','audited',now(),now(),'synthetic',
      $1,11,11,'{"players":[]}', 'synthetic',jsonb_build_object('sourceSnapshotId',$1::text,'complete',true,
      'players',(select jsonb_agg(i) from generate_series(1,11) i)),'{"passed":true}',$2)`, [name, version]);
}
async function database(): Promise<Database> {
  const { PGlite } = await import(modulePath!);
  const db: Database = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    for (const name of ["football_players", "football_fixtures", "football_competitions", "football_seasons", "football_clubs"]) {
      await db.exec(`create table public.${name}(id uuid primary key); insert into public.${name} values ('${id}');`);
    }
    const initial = await read("migrations/001_initial_schema");
    const touchStart = initial.indexOf("create or replace function public.touch_updated_at()");
    const touchEnd = initial.indexOf("$$;", touchStart);
    await db.exec(initial.slice(touchStart, touchEnd + 3));
    const target = await read("qa/001_touchline_qa_fixture_tracking");
    const targetStart = target.indexOf("create or replace function public.touchline_assert_qa_fixture_target(");
    const targetEnd = target.indexOf("\n$$;", targetStart);
    await db.exec(target.slice(targetStart, targetEnd + 4));
    const season = await read("migrations/048_touchline_player_season_statistics_read_model");
    await db.exec(table(season, "football_player_season_statistics"));
    // Execute original season security statements, not a permissive harness substitute.
    await db.exec(season.split("\n").filter(line => /^(alter table|revoke all privileges on table|grant select, insert, update, delete on table) public\.football_player_season_statistics\b/.test(line)).join("\n"));
    await db.exec(await read("migrations/020_touchline_card_ranking_snapshots"));
    const v2 = await read("qa/017_touchline_qa_score_points_engine_v2");
    await db.exec(v2.slice(v2.indexOf("alter table public.football_player_season_statistics"), v2.indexOf("alter table public.touchline_coach_contracts")));
    const completion = await read("qa/023_touchline_qa_ranking_completion");
    await db.exec(completion.slice(completion.indexOf("alter table public.football_player_season_statistics"), completion.indexOf("create or replace function public.publish_touchline_card_ranking_snapshot")));
    await db.exec(await read("migrations/20260823192827_touchline_player_score_engine_v3"));
    await insertSettlement(db, "player_scoring_v3", 8.09, 5);
    await insertSeason(db, "player_scoring_v3");
    await insertSnapshot(db, "player_scoring_v3", "historical-v3");
    return db;
  } catch (error) { await db.close(); throw error; }
}

test("V4 storage preserves decimal provider ratings and historical V3 boundaries", { skip: !modulePath }, async t => {
  const db = await database();
  try {
    const beforeRows = await historical(db);
    const beforeSecurity = await security(db);
    const beforePublisher = (await db.query("select pg_get_functiondef('public.publish_touchline_card_ranking_snapshot(text,text,timestamptz)'::regprocedure) as definition")).rows;
    if (!baseline) {
      await t.test("actual additive DDL rolls back before any V4 data is persisted", async () => {
        const candidate = await read(`migrations/${migration}`);
        assert.ok(candidate.includes("begin;") && candidate.trimEnd().endsWith("commit;"));
        try { await db.exec(candidate.replace(/commit;\s*$/, "rollback;")); }
        finally { await db.exec("rollback"); }
        assert.deepEqual(await historical(db), beforeRows);
        assert.deepEqual(await security(db), beforeSecurity);
        assert.equal((await db.query("select data_type from information_schema.columns where table_schema='public' and table_name='touchline_player_fixture_score_settlements' and column_name='touchline_points'")).rows[0].data_type, "integer");
      });
      await db.exec(await read(`migrations/${migration}`));
    }

    await t.test("additive DDL preserves all historical rows, RLS/ACL and publisher definition", async () => {
      assert.deepEqual(await historical(db), beforeRows);
      assert.deepEqual(await security(db), beforeSecurity);
      assert.deepEqual((await db.query("select pg_get_functiondef('public.publish_touchline_card_ranking_snapshot(text,text,timestamptz)'::regprocedure) as definition")).rows, beforePublisher);
    });

    async function isolated(name: string, action: () => Promise<void>) {
      await t.test(name, async () => {
        await db.exec("begin");
        try { await action(); } finally { await db.exec("rollback"); }
      });
    }
    await isolated("8.09 remains exactly 8.09; V3/V4 coexist at identical canonical player/fixture", async () => {
      await insertSettlement(db, "player_scoring_v4", 8.09, 8.09);
      const rows = (await db.query("select scoring_version,touchline_points::text as points from public.touchline_player_fixture_score_settlements order by scoring_version")).rows;
      assert.deepEqual(rows, [{ scoring_version: "player_scoring_v3", points: "5" }, { scoring_version: "player_scoring_v4", points: "8.09" }]);
      await assert.rejects(insertSettlement(db, "player_scoring_v4", 8.09, 8.09), (e: { code?: string }) => e.code === "23505");
    });
    await isolated("season aggregate versions coexist without identity replacement", async () => {
      await insertSeason(db, "player_scoring_v4");
      assert.equal((await db.query("select count(*)::int as count from public.football_player_season_statistics")).rows[0].count, 2);
      await assert.rejects(insertSeason(db, "player_scoring_v4"), (e: { code?: string }) => e.code === "23505");
    });
    await isolated("V4 snapshot storage is allowed, without changing or activating the publisher", async () => {
      await insertSnapshot(db, "player_scoring_v4", "candidate-v4");
      assert.equal((await db.query("select scoring_version from public.touchline_card_ranking_snapshots where snapshot_id='candidate-v4'")).rows[0].scoring_version, "player_scoring_v4");
      assert.equal((await db.query("select count(*)::int as count from public.touchline_card_ranking_active_snapshots")).rows[0].count, 0);
    });
    for (const [name, rating, points, appearance, minutes, coverage] of [
      ["mismatched raw rating", 8.09, 8, "started", 90, "complete"],
      ["rating absent but points present", null, 0, "started", 90, "complete"],
      ["eligible rating but points absent", 8.09, null, "started", 90, "unavailable"],
      ["points present but coverage unavailable", 8.09, 8.09, "started", 90, "unavailable"],
      ["points absent but coverage complete", null, null, "started", 90, "complete"],
      ["nonparticipant assigned points", 8.09, 8.09, "unused", 0, "complete"],
      ["unknown minutes assigned points", 8.09, 8.09, "started", null, "complete"],
      ["zero minutes assigned points", 8.09, 8.09, "substitute", 0, "complete"],
    ] as const) await isolated(`rejects V4 ${name}`, async () => {
      await assert.rejects(insertSettlement(db, "player_scoring_v4", rating, points, appearance, minutes, coverage), (e: { code?: string }) => e.code === "23514");
    });
    for (const [name, rating, appearance, minutes] of [
      ["missing provider rating", null, "started", 90],
      ["unused raw provider rating", 8.09, "unused", 0],
      ["unknown minutes raw rating", 8.09, "started", null],
      ["zero minutes raw rating", 8.09, "substitute", 0],
    ] as const) await isolated(`keeps ${name} null/unavailable, never invented zero`, async () => {
      await insertSettlement(db, "player_scoring_v4", rating, null, appearance, minutes);
      const row = (await db.query("select rating::text,touchline_points,scoring_coverage_status from public.touchline_player_fixture_score_settlements where scoring_version='player_scoring_v4'")).rows[0];
      assert.equal(row.touchline_points, null);
      assert.equal(row.scoring_coverage_status, "unavailable");
      assert.equal(row.rating, rating === null ? null : "8.09");
    });
    await isolated("a genuine zero rating remains complete zero, distinct from unavailable", async () => {
      await insertSettlement(db, "player_scoring_v4", 0, 0);
      assert.equal((await db.query("select touchline_points::text as points from public.touchline_player_fixture_score_settlements where scoring_version='player_scoring_v4'")).rows[0].points, "0");
    });
    await isolated("V3 remains integer-valued and range-limited after numeric widening", async () => {
      await db.exec("delete from public.touchline_player_fixture_score_settlements");
      await assert.rejects(insertSettlement(db, "player_scoring_v3", 8.09, 8.09), (e: { code?: string }) => e.code === "23514");
    });
  } finally { await db.close(); }
});
