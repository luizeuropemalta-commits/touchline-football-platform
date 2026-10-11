import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Tests the receipt mechanism against synthetic, in-memory catalog objects.
// Only this in-memory copy replaces QA hashes and removes the DRAFT exception.
// This is not a rehearsal of the production function bodies or recovery script.
test("QA batch preimage fails closed, captures metadata and rejects drift", async () => {
  const source = await readFile(new URL("../supabase/qa/060_touchline_qa_20261011_batch_preimage_DRAFT.sql", import.meta.url), "utf8");
  const guard = "do $not_approved$ begin raise exception 'TL_QA_PREIMAGE_DRAFT_NOT_APPROVED'; end $not_approved$;";
  const expectedMatch = source.match(/v_expected constant jsonb := '([\s\S]*?)'::jsonb;/);
  assert.ok(expectedMatch);
  const expected = JSON.parse(expectedMatch[1]) as Record<string, string>;
  assert.ok(Object.hasOwn(expected, "public.touchline_fantasy_user_gameweek_snapshot_is_immutable()"));
  const tables = [
    "touchline_arena_quick_substitution_sessions", "touchline_arena_quick_substitution_events",
    "touchline_live_presentation_snapshots", "touchline_live_presentation_active_snapshots",
    "touchline_fantasy_entitlements", "touchline_fantasy_user_gameweeks", "touchline_fantasy_gameweeks",
    "touchline_fantasy_audit_events",
  ];
  const db = new PGlite();
  const rejected = async (sql: string, message: RegExp) => {
    await assert.rejects(db.exec(sql), message);
    await db.exec("rollback");
  };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key);
      create function public.touchline_assert_qa_fixture_target(ref text) returns void language plpgsql as $$
      begin if ref <> 'xgxbwqxjssxxuihuwmgy' then raise exception 'WRONG_QA_TARGET'; end if; end $$;
    `);
    for (const name of tables) await db.exec(`create table public.${name}(id integer primary key, state text)`);
    await db.exec("alter table public.touchline_fantasy_audit_events add column event_type text constraint audit_event_type_check check(event_type in ('XI_CONFIRMED','XI_LOCKED'))");
    const localExpected: Record<string, string> = {};
    for (const signature of Object.keys(expected)) {
      // Signatures come exclusively from the checked-in static SQL allowlist.
      assert.match(signature, /^public\.[a-z_]+\([a-z,\[\]]*\)$/);
      await db.exec(`create function ${signature} returns void language plpgsql as $$begin null; end$$`);
      const result = await db.query<{ hash: string }>("select md5(pg_get_functiondef(to_regprocedure($1))) as hash", [signature]);
      localExpected[signature] = result.rows[0].hash;
    }
    await rejected(source, /TL_QA_PREIMAGE_DRAFT_NOT_APPROVED/);
    const absent = await db.query<{ name: string | null }>("select to_regclass('public.touchline_qa_20261011_batch_preimage_receipts')::text as name");
    assert.equal(absent.rows[0].name, null);
    assert.equal(source.split(guard).length, 2);
    const runnable = source.replace(guard, "-- Local harness only: draft guard bypassed.")
      .replace(expectedMatch[0], `v_expected constant jsonb := '${JSON.stringify(localExpected)}'::jsonb;`);
    await rejected(runnable, /TL_QA_PREIMAGE_RELEASE_IDENTITY_REQUIRED/);
    await db.query("select set_config('touchline.release_sha',$1,false), set_config('touchline.manifest_sha256',$2,false)", ["a".repeat(40), "b".repeat(64)]);
    await db.exec(runnable);
    await db.exec(runnable);
    const receipts = await db.query<{ snapshot: { functions: Record<string, unknown>; tables: Record<string, unknown> }; valid: boolean }>(
      "select snapshot, snapshot_md5 = md5(snapshot::text) as valid from public.touchline_qa_20261011_batch_preimage_receipts");
    assert.equal(receipts.rows.length, 1);
    assert.equal(receipts.rows[0].valid, true);
    assert.equal(Object.keys(receipts.rows[0].snapshot.functions).length, Object.keys(expected).length);
    assert.equal(Object.keys(receipts.rows[0].snapshot.tables).length, 8);
    assert.match(JSON.stringify(receipts.rows[0].snapshot.tables), /audit_event_type_check/);
    const access = await db.query<{ anonymous: boolean; customer: boolean; service: boolean }>(
      "select has_table_privilege('anon','public.touchline_qa_20261011_batch_preimage_receipts','SELECT') as anonymous, has_table_privilege('authenticated','public.touchline_qa_20261011_batch_preimage_receipts','SELECT') as customer, has_table_privilege('service_role','public.touchline_qa_20261011_batch_preimage_receipts','SELECT') as service");
    assert.deepEqual(access.rows[0], { anonymous: false, customer: false, service: true });
    await db.query("select set_config('touchline.release_sha',$1,false)", ["c".repeat(40)]);
    await rejected(runnable, /TL_QA_PREIMAGE_REPLAY_MISMATCH/);
    await db.query("select set_config('touchline.release_sha',$1,false)", ["a".repeat(40)]);
    await db.exec("alter table public.touchline_qa_20261011_batch_preimage_receipts drop constraint touchline_qa_20261011_batch_preimage_receipts_pkey");
    await rejected(runnable, /TL_QA_PREIMAGE_RECEIPT_CONSTRAINT_MISMATCH/);
    await db.exec("alter table public.touchline_qa_20261011_batch_preimage_receipts add primary key(receipt_key)");
    await db.exec("alter table public.touchline_qa_20261011_batch_preimage_receipts alter column snapshot drop not null");
    await rejected(runnable, /TL_QA_PREIMAGE_RECEIPT_CONSTRAINT_MISMATCH/);
    await db.exec("alter table public.touchline_qa_20261011_batch_preimage_receipts alter column snapshot set not null");
    await db.exec("alter table public.touchline_qa_20261011_batch_preimage_receipts drop constraint touchline_qa_20261011_batch_preimage_receipts_state_check");
    await rejected(runnable, /TL_QA_PREIMAGE_RECEIPT_CONSTRAINT_MISMATCH/);
    await db.exec("alter table public.touchline_qa_20261011_batch_preimage_receipts add check(state='PREIMAGE_CAPTURED')");
    await db.exec("create function public.suppress_receipt() returns trigger language plpgsql as $$begin return null; end$$; create trigger suppress_receipt before insert on public.touchline_qa_20261011_batch_preimage_receipts for each row execute function public.suppress_receipt()");
    await rejected(runnable, /TL_QA_PREIMAGE_RECEIPT_HOOK_MISMATCH/);
    await db.exec("drop trigger suppress_receipt on public.touchline_qa_20261011_batch_preimage_receipts");
    await db.exec("create rule suppress_receipt as on insert to public.touchline_qa_20261011_batch_preimage_receipts do instead nothing");
    await rejected(runnable, /TL_QA_PREIMAGE_RECEIPT_HOOK_MISMATCH/);
    await db.exec("drop rule suppress_receipt on public.touchline_qa_20261011_batch_preimage_receipts");
    await db.exec("alter table public.touchline_qa_20261011_batch_preimage_receipts alter column captured_at set default now()");
    await rejected(runnable, /TL_QA_PREIMAGE_RECEIPT_HOOK_MISMATCH/);
    await db.exec("alter table public.touchline_qa_20261011_batch_preimage_receipts alter column captured_at set default clock_timestamp()");
    await rejected(runnable.replace("xgxbwqxjssxxuihuwmgy", "wrong-project"), /WRONG_QA_TARGET/);
    await db.exec("insert into supabase_migrations.schema_migrations values ('20261011005000')");
    await rejected(runnable, /TL_QA_PREIMAGE_BATCH_ALREADY_STARTED/);
    await db.exec("delete from supabase_migrations.schema_migrations");
    await db.exec("insert into public.touchline_arena_quick_substitution_sessions values (1,'OPEN')");
    await rejected(runnable, /TL_QA_PREIMAGE_QUICK_SUB_NOT_EMPTY/);
    await db.exec("delete from public.touchline_arena_quick_substitution_sessions");
    await db.exec("alter table public.touchline_fantasy_gameweeks add column unexpected text");
    await rejected(runnable, /TL_QA_PREIMAGE_REPLAY_MISMATCH/);
    await db.exec("alter table public.touchline_fantasy_gameweeks drop column unexpected");
    await db.exec("alter table public.touchline_qa_20261011_batch_preimage_receipts add column unexpected text");
    await rejected(runnable, /TL_QA_PREIMAGE_RECEIPT_SCHEMA_MISMATCH/);
    await db.exec("alter table public.touchline_qa_20261011_batch_preimage_receipts drop column unexpected");
    await db.exec("create or replace function public.touchline_fantasy_user_gameweek_snapshot_is_immutable() returns void language plpgsql as $$begin perform 1; end$$");
    await rejected(runnable, /TL_QA_PREIMAGE_FUNCTION_DRIFT/);
  } finally {
    await db.close();
  }
});
