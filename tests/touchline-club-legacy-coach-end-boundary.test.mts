import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const original = readFileSync(new URL("../supabase/qa/013_touchline_qa_coach_contract_scoring.sql", import.meta.url), "utf8");
const start = original.indexOf("create or replace function public.touchline_end_coach_contract(");
const installedEnd = original.slice(start, original.indexOf("\n$$;", start) + 4);
const migration = readFileSync(new URL("../supabase/migrations/20261025192704_club_collection_legacy_coach_end_boundary.sql", import.meta.url), "utf8");

test("legacy coach cancellation cannot bypass collection contract/economy; legacy history remains intact", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;
      create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
      create table users(id uuid primary key);
      create table touchline_club_collections(user_id uuid,season_id uuid,state jsonb);
      create table touchline_fantasy_configs(season_id uuid,status text,competition_key text);
      create table touchline_coach_contracts(id uuid primary key,user_id uuid,status text,coach_provider_id text,
        ended_at timestamptz,end_reason text,end_idempotency_key text,updated_at timestamptz);
      create table touchline_coach_contract_events(contract_id uuid,user_id uuid,event_type text,idempotency_key text,
        reason text,points_snapshot jsonb,occurred_at timestamptz,unique(user_id,idempotency_key));
      create table touchline_user_arena_state(user_id uuid,coach_provider_id text,updated_at timestamptz);
      create function touchline_coach_points_snapshot(uuid) returns jsonb language sql as $$select '{"total":20}'::jsonb$$;
      insert into users values('${id(1)}'),('${id(2)}');
      insert into touchline_fantasy_configs values('${id(9)}','active','england');
      insert into touchline_club_collections values('${id(1)}','${id(9)}','{"balanceEur":100000000,"coach":{"id":"307"}}');
      insert into touchline_coach_contracts(id,user_id,status,coach_provider_id) values('${id(3)}','${id(1)}','active','307'),('${id(4)}','${id(2)}','active','308');
      insert into touchline_user_arena_state(user_id,coach_provider_id) values('${id(1)}','307'),('${id(2)}','308');
      set request.jwt.claim.role='service_role';`);
    await db.exec(installedEnd);
    // RED before migration: actual installed function cancels without collection economy.
    await db.exec("begin");
    const before = await db.query<{ result: { ok: boolean } }>("select touchline_end_coach_contract($1,'test release','original_probe') result", [id(1)]);
    assert.equal(before.rows[0].result.ok, true);
    await db.exec("rollback");
    await db.exec(migration);
    const release = (user: string, key: string) => db.query<{ result: { ok: boolean; idempotentReplay: boolean; points?: { total: number } } }>(
      "select touchline_end_coach_contract($1,'test release',$2) result", [user, key]);
    await assert.rejects(release(id(1), "collection_attempt"), /CLUB_COLLECTION_ROUTE_REQUIRED/);
    assert.equal((await db.query<{ status: string }>("select status from touchline_coach_contracts where user_id=$1", [id(1)])).rows[0].status, "active");
    assert.equal((await db.query<{ count: number }>("select count(*)::int count from touchline_coach_contract_events")).rows[0].count, 0);
    assert.equal((await db.query<{ state: unknown }>("select state from touchline_club_collections")).rows[0].state &&
      JSON.stringify((await db.query<{ state: unknown }>("select state from touchline_club_collections")).rows[0].state), '{"coach":{"id":"307"},"balanceEur":100000000}');
    const legacy = await release(id(2), "legacy_allowed");
    assert.equal(legacy.rows[0].result.points?.total, 20);
    assert.equal((await release(id(2), "legacy_allowed")).rows[0].result.idempotentReplay, true);
    assert.equal((await db.query<{ count: number }>("select count(*)::int count from touchline_coach_contract_events")).rows[0].count, 1);
    await db.exec("set request.jwt.claim.role='authenticated'");
    await assert.rejects(release(id(1), "unverified_attempt"), /TL_COACH_ADMIN_REQUIRED/);
    const definition = (await db.query<{ definition: string }>("select pg_get_functiondef('touchline_end_coach_contract(uuid,text,text)'::regprocedure) definition")).rows[0].definition;
    assert.ok(definition.indexOf("pg_advisory_xact_lock") < definition.indexOf("from public.touchline_club_collections"));
    const route = readFileSync(new URL("../app/api/touchline-arena/coach/route.ts", import.meta.url), "utf8").split("export async function DELETE")[1];
    assert.match(route, /CLUB_COLLECTION_ROUTE_REQUIRED[\s\S]*status: 409/);
  } finally { await db.close(); }
});
