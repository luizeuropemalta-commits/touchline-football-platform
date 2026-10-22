import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/qa/club_market_test_opening.sql", import.meta.url), "utf8");
const season = "00000000-0000-4000-8000-000000000001";
test("QA opening installs closed, opens only its season, preserves rounds and restores normal clock", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create function touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$begin
        if $1 <> 'xgxbwqxjssxxuihuwmgy' then raise exception 'WRONG_TARGET'; end if; end;$$;
      create table touchline_fantasy_configs(season_id uuid, competition_key text, status text);
      create table touchline_fantasy_gameweeks(id uuid, season_id uuid, round_id uuid, gameweek_number int, state text);
      insert into touchline_fantasy_configs values('${season}','england','active');
      insert into touchline_fantasy_gameweeks values('${season}','${season}','${season}',8,'LOCKED');
      create function touchline_fantasy_market_window_projection(timestamptz)
      returns table(season_id uuid,round_id uuid,state text) language sql as $$
        select season_id,round_id,state from public.touchline_fantasy_gameweeks;$$;`);
    await db.exec(sql);
    const opened = async () => (await db.query<{open:boolean}>("select touchline_club_market_is_open($1) as open",[season])).rows[0].open;
    assert.equal(await opened(), false);
    const permissions = await db.query<{read:boolean; write:boolean; rpc:boolean}>(`select
      has_table_privilege('authenticated','touchline_qa_club_market_control','select') as read,
      has_table_privilege('service_role','touchline_qa_club_market_control','update') as write,
      has_function_privilege('anon','touchline_qa_club_market_is_open(uuid)','execute') as rpc`);
    assert.deepEqual(permissions.rows[0],{read:false,write:false,rpc:false});
    await db.exec("update touchline_qa_club_market_control set enabled=true");
    assert.equal(await opened(),true);
    assert.equal((await db.query<{open:boolean}>("select touchline_club_market_is_open('00000000-0000-4000-8000-000000000002') as open")).rows[0].open,false);
    await db.query("select touchline_club_lock_open_round($1)",[season]);
    assert.equal((await db.query<{state:string}>("select state from touchline_fantasy_gameweeks")).rows[0].state,"LOCKED");
    await db.exec("update touchline_qa_club_market_control set enabled=false");
    assert.equal(await opened(),false);
    await db.exec("update touchline_fantasy_gameweeks set state='MARKET_OPEN'");
    assert.equal(await opened(),true);
  } finally { await db.close(); }
});

test("local override fails closed outside QA and reads a server-controlled value only", () => {
  const source = readFileSync(new URL("../lib/touchlineFantasy/qa-club-market.ts", import.meta.url),"utf8");
  assert.match(source,/url !== "https:\/\/xgxbwqxjssxxuihuwmgy.supabase.co"/);
  assert.match(source,/NODE_ENV === "production"/);
  assert.match(source,/!error && data === true/);
});
