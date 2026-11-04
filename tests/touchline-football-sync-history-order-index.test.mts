import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const root = path.resolve(import.meta.dirname, "..");
const migrationName = "20261103203542_football_sync_history_order_index.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const indexName = "football_data_sync_runs_started_at_idx";
const readMigration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
function statement(source: string, prefix: string) {
  const start = source.indexOf(prefix);
  assert.ok(start >= 0, `real SQL statement missing: ${prefix}`);
  const end = source.indexOf(";", start);
  assert.ok(end > start);
  return source.slice(start, end + 1);
}

// Same projection/order/limit as the admin history read; unique synthetic dates
// make the latest-eight expectation deterministic without adding a tie-breaker.
const latestEight = `select id, provider, sync_type, status, records_updated, records_skipped,
  started_at, completed_at, error_message,
  source_payload->'playerLineupIdentityIssues' as lineup_identity_issues,
  source_payload->'coachRankingDiagnostic' as coach_ranking_diagnostic
  from public.football_data_sync_runs order by started_at desc limit 8`;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const settings = (db: PGlite) => db.query(`select current_setting('lock_timeout') as lock_timeout,
  current_setting('statement_timeout') as statement_timeout`);

async function snapshot(db: PGlite) {
  const data = (await db.query("select to_jsonb(r) as row from public.football_data_sync_runs r order by id")).rows;
  const relation = (await db.query(`select relrowsecurity, relforcerowsecurity, relacl::text,
    obj_description(oid) as comment from pg_class where oid='public.football_data_sync_runs'::regclass`)).rows;
  const policies = (await db.query("select * from pg_policies where schemaname='public' and tablename='football_data_sync_runs' order by policyname")).rows;
  const constraints = (await db.query(`select conname, convalidated, pg_get_constraintdef(oid) as definition
    from pg_constraint where conrelid='public.football_data_sync_runs'::regclass order by conname`)).rows;
  const indexes = (await db.query<{ name: string; oid: number; definition: string; indisvalid: boolean; indisready: boolean }>(`select c.relname as name, c.oid,
    pg_get_indexdef(i.indexrelid) as definition, i.indisvalid, i.indisready
    from pg_index i join pg_class c on c.oid=i.indexrelid
    where i.indrelid='public.football_data_sync_runs'::regclass order by c.relname`)).rows;
  return { data, relation, policies, constraints, indexes };
}

async function assertBoundaries(db: PGlite) {
  for (const role of ["anon", "authenticated"]) {
    const result = await db.query<{ allowed: boolean }>(`select has_table_privilege($1,
      'public.football_data_sync_runs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as allowed`, [role]);
    assert.equal(result.rows[0].allowed, false);
    await assert.rejects(db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.query(latestEight);
    }), { code: "42501" });
  }
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    const result = await db.query<{ allowed: boolean }>(`select has_table_privilege('service_role',
      'public.football_data_sync_runs',$1) as allowed`, [privilege]);
    assert.equal(result.rows[0].allowed, true);
  }
  const serviceRows = await db.transaction(async tx => {
    await tx.exec("set local role service_role");
    return (await tx.query<{ id: string }>(latestEight)).rows;
  });
  assert.deepEqual(serviceRows.map(row => row.id), [12, 11, 10, 9, 8, 7, 6, 5].map(id));
  // Existing partial unique index remains an enforced live-writer boundary.
  await assert.rejects(db.exec(`insert into public.football_data_sync_runs(provider,sync_type,status)
    values ('sportmonks','live_scores','running')`), { code: "23505" });
}

test("real sync-history index migration commits atomically and preserves the server-only history contract", { timeout: 30_000 }, async t => {
  assert.notEqual(process.env.TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE, "1");
  requireBrowserCapacity(root, { darwinFreePercent: true,
    allowModerateDarwinPressure: !process.env.CI && process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" });
  const db = new PGlite(); // In memory only. No hosted database, credentials or network.
  try {
    const foundation = readMigration("013_football_data_foundation.sql");
    const evolution = readMigration("048_touchline_player_season_statistics_read_model.sql");
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.football_competitions(id uuid primary key);
      create table public.football_clubs(id uuid primary key);
      create table public.football_provider_mappings(id uuid primary key);`);
    await db.exec(statement(foundation, "create table if not exists public.football_data_sync_runs ("));
    await db.exec(statement(foundation, "create index if not exists football_data_sync_runs_provider_idx"));
    await db.exec(statement(evolution, "alter table public.football_data_sync_runs\n  drop constraint"));
    await db.exec(statement(evolution, "alter table public.football_data_sync_runs\n  add constraint"));
    await db.exec(readMigration("058_football_provider_metadata_server_boundary.sql"));
    // Third existing index: exact catalog definition independently recorded in
    // QA on 2026-11-03. Its original DDL is absent from this repository history.
    await db.exec(`CREATE UNIQUE INDEX football_data_sync_runs_one_live_writer_idx
      ON public.football_data_sync_runs USING btree (provider, sync_type)
      WHERE ((provider = 'sportmonks'::text) AND (sync_type = 'live_scores'::text) AND (status = 'running'::text));`);
    await db.exec(`insert into public.football_data_sync_runs
      (id,provider,sync_type,status,started_at,records_updated,records_skipped,source_payload)
      select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        case when n=1 or n%2=0 then 'sportmonks' else 'synthetic-provider' end,
        case when n=1 or n%3=0 then 'live_scores' else 'player' end,
        case when n=1 then 'running' else 'success' end,
        '2026-11-03T00:00:00Z'::timestamptz+n*interval '1 minute',n,12-n,
        jsonb_build_object('playerLineupIdentityIssues',jsonb_build_array(n),'coachRankingDiagnostic',jsonb_build_object('sample',n))
      from generate_series(1,12) as n order by n%5, n;`);
    const before = await snapshot(db);
    assert.equal(before.data.length, 12);
    assert.equal(before.indexes.length, 3);
    assert.ok(before.indexes.every(index => index.indisvalid && index.indisready));
    assert.equal(before.relation[0].relrowsecurity, true);
    assert.deepEqual(before.policies, []);
    await assertBoundaries(db);
    const oldSettings = (await settings(db)).rows;
    const oldLatest = (await db.query(latestEight)).rows;

    await t.test("an error after CREATE rolls back the new index and transaction-local settings", async () => {
      await assert.rejects(db.transaction(async tx => {
        await tx.exec(migration);
        assert.equal((await tx.query<{ present: boolean }>(`select to_regclass('public.${indexName}') is not null as present`)).rows[0].present, true);
        await tx.query("select 1 / 0");
      }), { code: "22012" });
      assert.deepEqual(await snapshot(db), before);
      assert.deepEqual((await settings(db)).rows, oldSettings);
    });

    await t.test("an exact-name collision errors instead of silently accepting a different index", async () => {
      await db.exec(`create index ${indexName} on public.football_data_sync_runs(status)`);
      const collision = await snapshot(db);
      await assert.rejects(db.transaction(tx => tx.exec(migration)), { code: "42P07" });
      assert.deepEqual(await snapshot(db), collision);
      assert.deepEqual((await settings(db)).rows, oldSettings);
      await db.exec(`drop index public.${indexName}`); // Dispose of this synthetic collision only.
      assert.deepEqual(await snapshot(db), before);
    });

    await t.test("commit adds one valid plain descending B-tree while preserving data, ACLs and the prior three indexes", async () => {
      await db.transaction(async tx => {
        await tx.exec(migration);
        const local = (await tx.query(`select current_setting('lock_timeout') as lock_timeout,
          current_setting('statement_timeout') as statement_timeout`)).rows;
        assert.deepEqual(local, [{ lock_timeout: "250ms", statement_timeout: "2s" }]);
      });
      assert.deepEqual((await settings(db)).rows, oldSettings);
      const after = await snapshot(db);
      assert.equal(after.indexes.length, 4);
      assert.deepEqual({ ...after, indexes: after.indexes.filter(index => index.name !== indexName) }, before);
      const added = after.indexes.find(index => index.name === indexName);
      assert.ok(added?.indisvalid && added.indisready);
      assert.equal(added.definition, `CREATE INDEX ${indexName} ON public.football_data_sync_runs USING btree (started_at DESC)`);
      const properties = (await db.query(`select i.indisunique, i.indnkeyatts, i.indnatts,
        i.indexprs is null as no_expression, i.indpred is null as no_predicate
        from pg_index i where i.indexrelid=$1::regclass`, [`public.${indexName}`])).rows;
      assert.deepEqual(properties, [{ indisunique: false, indnkeyatts: 1, indnatts: 1, no_expression: true, no_predicate: true }]);
      assert.deepEqual((await db.query(latestEight)).rows, oldLatest);
      await assertBoundaries(db);
      t.diagnostic(JSON.stringify({ migration: migrationName, sha256: createHash("sha256").update(migration).digest("hex"),
        rows: after.data.length, previousIndexes: before.indexes.map(index => index.name), newIndex: added,
        latestEight: oldLatest.length, preserved: ["data", "RLS", "ACLs", "policies", "constraints", "existing index definitions and OIDs", "live-writer uniqueness"] }));
    });
    t.diagnostic("Local PGlite proves transactional DDL and catalog/data invariants only; no native multi-connection contention, hard wall-time cap, remote planner, cron or page-latency proof.");
  } finally { await db.close(); }
});
