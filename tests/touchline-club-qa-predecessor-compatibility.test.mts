import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clubRoundDatabase } from './helpers/club-round-database.mts';

const snapshot = JSON.parse(readFileSync(new URL('../docs/touchline/release-audit/2026-10-17-CLUB-COLLECTION-QA-PREDECESSORS.json', import.meta.url), 'utf8')) as {
  functions: { signature: string; definition: string }[];
};
const clockSnapshot = JSON.parse(readFileSync(new URL('../docs/touchline/release-audit/2026-10-17-CLUB-COLLECTION-QA-CLOCK-PREDECESSORS.json', import.meta.url), 'utf8')) as typeof snapshot;
const recovery = readFileSync(new URL('../docs/touchline/release-audit/2026-10-17-CLUB-COLLECTION-QA-EMPTY-RECOVERY.sql', import.meta.url), 'utf8');

test('collection installs against captured QA predecessor functions when the missing clock prerequisite is supplied locally', async () => {
  const db = await clubRoundDatabase({ beforeCollection: async (db) => {
    assert.equal(snapshot.functions.length, 5);
    for (const fn of snapshot.functions) await db.exec(fn.definition);
  } });
  try {
    const { rows } = await db.query<{ definition: string }>("select pg_get_functiondef('touchline_club_project_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure) definition");
    assert.match(rows[0].definition, /CLUB_TEAM_LIMIT/);
    assert.doesNotMatch(rows[0].definition, /there is no per-club cap/);
    const legacy = await db.query<{ definition: string }>("select pg_get_functiondef('touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure) definition");
    assert.match(legacy.rows[0].definition, /CLUB_COLLECTION_ROUTE_REQUIRED/);
    assert.match(legacy.rows[0].definition, /there is no per-club cap/, 'unconverted legacy behavior is preserved');
  } finally { await db.close(); }
});

test('empty recovery restores captured function bodies and ACLs without dropping collection tables', async () => {
  const db = await clubRoundDatabase({ beforeCollection: async (db) => {
    for (const fn of snapshot.functions) await db.exec(fn.definition);
  } });
  try {
    await db.exec("create function touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$ begin if $1 <> 'xgxbwqxjssxxuihuwmgy' then raise exception 'wrong QA'; end if; end; $$");
    await db.exec(recovery);
    for (const fn of [...snapshot.functions, ...clockSnapshot.functions.filter(fn => fn.signature === 'touchline_fantasy_sync_gameweeks()')]) {
      const { rows } = await db.query<{ definition: string; public_allowed: boolean; service_allowed: boolean }>("select pg_get_functiondef($1::regprocedure) definition, has_function_privilege('anon',$1,'execute') public_allowed, has_function_privilege('service_role',$1,'execute') service_allowed", [fn.signature]);
      assert.equal(rows[0].definition, fn.definition);
      assert.equal(rows[0].public_allowed, false);
      assert.equal(rows[0].service_allowed, true);
    }
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from touchline_club_collections')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('collection rejects an unknown legacy quota implementation instead of silently removing it', async () => {
  await assert.rejects(() => clubRoundDatabase({ beforeCollection: async (db) => {
    const fn = snapshot.functions.find(fn => fn.signature.startsWith('touchline_fantasy_save_lineup('));
    assert.ok(fn);
    await db.exec(fn.definition.replace('null; -- Club selection is customer-owned; there is no per-club cap.', 'null; -- Unknown predecessor.'));
  } }), /CLUB_PROJECTION_SOURCE_MISMATCH_QUOTA/);
});

test('recovery refuses to reopen legacy wallets after a collection exists', async () => {
  const db = await clubRoundDatabase();
  try {
    await db.exec("create function touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$ begin if $1 <> 'xgxbwqxjssxxuihuwmgy' then raise exception 'wrong QA'; end if; end; $$");
    const user = '20000000-0000-4000-8000-000000000001';
    const season = '20000000-0000-4000-8000-000000000002';
    await db.query('insert into users values($1)', [user]);
    await db.query('insert into football_seasons values($1)', [season]);
    const state = { seasonId: season, revision: 0, plan: 'standard', coach: { id: '307', tier: 'ruby-red', valueEur: 5_000_000 }, balanceEur: 495_000_000, players: [], receipts: [] };
    await db.query('insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,0,$3::jsonb)', [user,season,JSON.stringify(state)]);
    await assert.rejects(() => db.exec(recovery), /CLUB_RECOVERY_REQUIRES_EMPTY_COLLECTION/);
    await db.exec('rollback');
    assert.deepEqual((await db.query<{ state: unknown }>('select state from touchline_club_collections')).rows[0].state, state);
    assert.match((await db.query<{ definition: string }>("select pg_get_functiondef('checkout_touchline_market_cart(uuid,uuid[],text)'::regprocedure) definition")).rows[0].definition, /CLUB_COLLECTION_ROUTE_REQUIRED/);
  } finally { await db.close(); }
});
