import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const originalPath = new URL("../supabase/migrations/20260919151427_touchline_fantasy_kickoff_final_whistle_market_window.sql", import.meta.url);
const migrationPath = new URL("../supabase/migrations/20261002031429_touchline_fantasy_shared_market_window_projection.sql", import.meta.url);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("real SQL shared projection preserves native synchronizer and is readonly/owner-only", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create table public.football_rounds(id uuid primary key,competition_id uuid,season_id uuid,name text);
      create table public.football_fixtures(id uuid primary key,round_id uuid,starts_at timestamptz,status text,finalized_at timestamptz);
      create table public.touchline_fantasy_configs(competition_id uuid,season_id uuid,status text);
      create table public.touchline_fantasy_gameweeks(id uuid primary key default gen_random_uuid(),competition_id uuid,season_id uuid,
        round_id uuid unique,gameweek_number integer,state text,market_opens_at timestamptz,locks_at timestamptz,first_fixture_at timestamptz,last_fixture_at timestamptz);
      create function public.touchline_fantasy_fixture_is_live(text) returns boolean language sql immutable as $$select $1='LIVE'$$;
      create function public.touchline_fantasy_fixture_is_final(text) returns boolean language sql immutable as $$select $1='FT'$$;
      grant usage on schema public to anon,authenticated,service_role;
      grant select on all tables in schema public to service_role;`);
    const source = await readFile(originalPath, "utf8");
    const begin = source.indexOf("create or replace function public.touchline_fantasy_sync_gameweeks()");
    const end = source.indexOf("$$;", begin);
    assert.ok(begin >= 0 && end > begin);
    const original = source.slice(begin, end + 3);
    // Retain the actual original body as an independent oracle, not duplicated rules.
    await db.exec(original.replace("public.touchline_fantasy_sync_gameweeks()", "public.original_sync_gameweeks()"));
    await db.exec(await readFile(migrationPath, "utf8"));
    for (let s = 1; s <= 8; s++) await db.query("insert into touchline_fantasy_configs values($1,$2,$3)", [id(100+s), id(200+s), s===8?"inactive":"active"]);
    const round = async (n: number, season: number, name: string) => db.query("insert into football_rounds values($1,$2,$3,$4)", [id(n), id(100+season), id(200+season), name]);
    const fixture = async (n: number, r: number, status: string, offset: string, final: string | null) => db.query(`insert into football_fixtures values($1,$2,statement_timestamp()+$3::interval,$4,case when $5::text is null then null else statement_timestamp()+$5::interval end)`, [id(1000+n),id(r),offset,status,final]);
    await round(1,1,"Round 1");await round(2,1,"Round 2");
    await fixture(1,1,"FT","-7 days","-1 hour");await fixture(2,2,"NS","1 day",null);
    await round(3,2,"Round 1");await fixture(3,3,"LIVE","1 day",null);
    await round(4,3,"Round 1");await fixture(4,4,"FT","1 day",null);
    await round(5,4,"Round 2");await fixture(5,5,"NS","1 day",null);
    await round(6,5,"unknown");await round(7,5,"Round 1");await fixture(7,7,"NS","1 day",null);
    await round(8,6,"Round 1");await fixture(8,8,"NS","-1 hour",null);
    await round(9,7,"unnumbered");await fixture(9,9,"NS","1 day",null);
    await round(10,8,"Round 1");await fixture(10,10,"NS","1 day",null);
    const rows = async () => (await db.query("select competition_id,season_id,round_id,gameweek_number,state,market_opens_at::text,locks_at::text,first_fixture_at::text,last_fixture_at::text from touchline_fantasy_gameweeks order by round_id")).rows;
    const compare = async () => {
      const before = await rows();
      await db.exec("select * from touchline_fantasy_market_window_projection(clock_timestamp())");
      assert.deepEqual(await rows(), before, "projection must not write");
      await db.exec("begin; savepoint oracle_beforeimage");
      const oldCount = (await db.query("select original_sync_gameweeks() n")).rows[0].n;
      const expected = await rows();
      await db.exec("rollback to savepoint oracle_beforeimage");
      assert.deepEqual(await rows(), before, "candidate starts from the same unmodified rows as the oracle");
      const newCount = (await db.query("select touchline_fantasy_sync_gameweeks() n")).rows[0].n;
      assert.equal(newCount, oldCount);assert.deepEqual(await rows(), expected);
      await db.exec("commit");
    };
    await compare();
    const states = new Map((await rows()).map((r: {round_id: string; state: string}) => [r.round_id,r.state]));
    for (const [n,state] of [[1,"FINAL"],[2,"MARKET_OPEN"],[3,"LIVE"],[4,"LOCKED"],[5,"UPCOMING"],[7,"UPCOMING"],[8,"LOCKED"],[9,"MARKET_OPEN"]] as const) assert.equal(states.get(id(n)),state);
    assert.equal(states.has(id(10)),false,"inactive configuration omitted");
    await db.exec(`update touchline_fantasy_gameweeks set state='SETTLED' where round_id='${id(2)}';delete from football_fixtures where round_id='${id(2)}'`);
    await compare();assert.equal((await db.query("select state from touchline_fantasy_gameweeks where round_id=$1",[id(2)])).rows[0].state,"SETTLED");
    await db.exec(`delete from football_fixtures where round_id='${id(9)}'`);await compare();
    assert.equal((await db.query("select state from touchline_fantasy_gameweeks where round_id=$1",[id(9)])).rows[0].state,"LOCKED");
    await fixture(9,9,"NS","1 day",null);await compare();
    assert.equal((await db.query("select state from touchline_fantasy_gameweeks where round_id=$1",[id(9)])).rows[0].state,"MARKET_OPEN");
    for (const role of ["anon","authenticated","service_role"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from public.touchline_fantasy_market_window_projection(clock_timestamp())"),/permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");await db.query("select public.touchline_fantasy_sync_gameweeks()");await db.exec("reset role");
    const security = (await db.query("select prosecdef,provolatile,proconfig from pg_proc where oid='public.touchline_fantasy_market_window_projection(timestamptz)'::regprocedure")).rows[0];
    assert.equal(security.prosecdef,false);assert.equal(security.provolatile,"s");
    assert.ok(security.proconfig.some((s: string) => s.startsWith("search_path=")));
    // Owner-only parameter permits deterministic equality; service cannot forge it.
    await db.exec(`begin;update football_fixtures set starts_at='2030-01-01T00:00:00Z' where round_id='${id(9)}';`);
    const equality = (await db.query("select state from touchline_fantasy_market_window_projection('2030-01-01T00:00:00Z') where round_id=$1",[id(9)])).rows[0];
    assert.equal(equality.state,"LOCKED");await db.exec("rollback");
    // A single outer statement started before kickoff must still close when sync
    // executes later. No assertion about the separate save-lineup advisory order.
    const delayedSync = `do $$begin
      update football_fixtures set starts_at=clock_timestamp()+interval '30 milliseconds' where round_id='${id(9)}';
      perform pg_sleep(0.08);
      perform public.touchline_fantasy_sync_gameweeks();
      if (select state from touchline_fantasy_gameweeks where round_id='${id(9)}')<>'LOCKED' then
        raise exception 'STALE_OUTER_STATEMENT_CLOCK';
      end if;
    end$$;`;
    await db.exec(delayedSync);
    // Prove this regression detects the discarded stale-clock design, rather
    // than merely succeeding with any synchronizer implementation.
    const definition = (await db.query("select pg_get_functiondef('public.touchline_fantasy_sync_gameweeks()'::regprocedure) as sql")).rows[0].sql as string;
    assert.ok(definition.includes("select clock_timestamp() as as_of"));
    await db.exec(definition.replace("select clock_timestamp() as as_of", "select statement_timestamp() as as_of"));
    await assert.rejects(db.exec(delayedSync), /STALE_OUTER_STATEMENT_CLOCK/);
  } finally { await db.close(); }
});
