import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("forward repair closes at kickoff, reopens at final whistle and preserves synchronizer and ACL", async () => {
 const db = new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create table football_rounds(id uuid,competition_id uuid,season_id uuid,name text);
 create table football_fixtures(id uuid,round_id uuid,starts_at timestamptz,status text,finalized_at timestamptz);
 create table touchline_fantasy_configs(competition_id uuid,season_id uuid,status text);
 create function touchline_fantasy_fixture_is_live(text) returns boolean language sql immutable as $$select $1='LIVE'$$;
 create function touchline_fantasy_fixture_is_final(text) returns boolean language sql immutable as $$select $1='FT'$$;`);
 const historical = await readFile(new URL("../supabase/migrations/20261002031429_touchline_fantasy_shared_market_window_projection.sql", import.meta.url), "utf8");
 await db.exec(historical);
 const definition = async (name: string) => (await db.query<{body:string}>("select pg_get_functiondef($1::regprocedure) body", [name])).rows[0].body;
 const sync = await definition("touchline_fantasy_sync_gameweeks()");
 const projection = await definition("touchline_fantasy_market_window_projection(timestamptz)");
 await db.exec(projection.replace("first_fixture_at as locks_at", "first_fixture_at-interval '5 minutes' as locks_at")
 .replaceAll("previous_round_completed_at<locks_at", "previous_round_completed_at+interval '5 minutes'<locks_at")
 .replace("then previous_round_completed_at\n", "then previous_round_completed_at+interval '5 minutes'\n"));
 const c="00000000-0000-4000-8000-000000000001", s="00000000-0000-4000-8000-000000000002";
 const r1="00000000-0000-4000-8000-000000000003",r2="00000000-0000-4000-8000-000000000004";
 await db.query("insert into touchline_fantasy_configs values($1,$2,'active')",[c,s]);
 await db.query("insert into football_rounds values($1,$3,$4,'Round 1'),($2,$3,$4,'Round 2')",[r1,r2,c,s]);
 await db.query("insert into football_fixtures values(gen_random_uuid(),$1,'2030-01-01T12:00Z','FT','2030-01-01T14:00Z'),(gen_random_uuid(),$2,'2030-01-08T12:00Z','NS',null)",[r1,r2]);
 const state = async (at:string) => (await db.query<{state:string}>("select state from touchline_fantasy_market_window_projection($1::timestamptz) where round_id=$2",[at,r2])).rows[0].state;
 assert.notEqual(await state("2030-01-01T14:00Z"),"MARKET_OPEN","legacy reopening reproduces discrepancy");
 assert.equal(await state("2030-01-08T11:59Z"),"LOCKED","legacy early lock reproduces discrepancy");
 // Replay the exact published repair body, not a private local artifact that
 // cannot be present in a clean Git/CI checkout. Remote preimage/QA guards are
 // intentionally outside this isolated projection/ACL regression fixture.
 const migration = await readFile(new URL("../supabase/migrations/20261101052804_touchline_fantasy_market_timing_forward_qa.sql", import.meta.url),"utf8");
 const target = migration.match(/\$tl_exact_projection_target\$([\s\S]+?)\$tl_exact_projection_target\$/);
 assert.ok(target, "forward migration must contain the exact projection target");
 const repair = target[1];
 await db.exec(repair);
 assert.equal(await state("2030-01-01T14:00Z"),"MARKET_OPEN");
 assert.equal(await state("2030-01-08T11:59:59.999Z"),"MARKET_OPEN");
 assert.equal(await state("2030-01-08T12:00Z"),"LOCKED");
 assert.equal(await definition("touchline_fantasy_sync_gameweeks()"),sync);
 await db.exec(repair);
 assert.equal(await state("2030-01-08T12:00Z"),"LOCKED");
 for (const role of ["anon","authenticated","service_role"]) {
 await db.exec(`set role ${role}`);
 await assert.rejects(db.query("select * from public.touchline_fantasy_market_window_projection(now())"),/permission denied/);
 await db.exec("reset role");
 }
 } finally { await db.close(); }
});
