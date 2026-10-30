import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { installTestClubSeasonCalendar } from "./helpers/club-season-calendar.mts";

const sql = readFileSync(new URL("../supabase/qa/club_market_test_opening.sql", import.meta.url), "utf8");
const season = "00000000-0000-4000-8000-000000000001";
test("QA opening installs closed, opens only its season, preserves rounds and restores normal clock", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create function touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$begin
        if $1 <> 'xgxbwqxjssxxuihuwmgy' then raise exception 'WRONG_TARGET'; end if; end;$$;
      create table football_seasons(id uuid primary key);
      create table touchline_fantasy_configs(season_id uuid, competition_key text, status text, competition_id uuid);
      create table touchline_fantasy_gameweeks(id uuid, season_id uuid, round_id uuid, gameweek_number int, state text);
      insert into football_seasons values('${season}');
      insert into touchline_fantasy_configs values('${season}','england','active','${season}');
      insert into touchline_fantasy_gameweeks values('${season}','${season}','${season}',8,'LOCKED');
      create function touchline_fantasy_market_window_projection(timestamptz)
      returns table(season_id uuid,round_id uuid,state text) language sql as $$
        select season_id,round_id,state from public.touchline_fantasy_gameweeks;$$;
      create function touchline_club_market_is_open(p_season_id uuid)
      returns boolean language sql volatile security definer set search_path='' as $$
        select exists(select 1 from public.touchline_fantasy_market_window_projection(clock_timestamp()) p
          where p.season_id=p_season_id and p.state='MARKET_OPEN');$$;`);
    await installTestClubSeasonCalendar(db,season,season);
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
    await db.exec("update touchline_qa_club_market_control set enabled=true");
    for (const dates of ["starts_at=null", "ends_at=null", "starts_at=current_date+5,ends_at=current_date+10", "starts_at=current_date-10,ends_at=current_date-1"]) {
      await db.exec(`update football_seasons set ${dates}`);
      assert.equal(await opened(),false,`QA and open round cannot override ${dates}`);
      assert.equal((await db.query<{open:boolean}>("select touchline_qa_club_market_is_open($1) open",[season])).rows[0].open,false,"QA snapshot agrees with the committing guard");
    }
  } finally { await db.close(); }
});

test("market override reads the RPC only in the exact QA Preview runtime", async () => {
  const source = readFileSync(new URL("../lib/touchlineFantasy/qa-club-market.ts", import.meta.url),"utf8");
  const executable = stripTypeScriptTypes(source)
    .replace(/^import[^;]*;\s*$/gm, "")
    .replace(/^export /gm, "");
  const qa = {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "qa",
    TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
    NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
    SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
  };
  let calls = 0;
  const admin = { rpc: async () => { calls++; return { data: true, error: null }; } };
  const read = (env: Record<string, string>) => runInNewContext(
    `${executable}\nreadQaClubMarketOpening(admin, "season")`,
    { process: { env }, admin },
  ) as Promise<boolean>;
  assert.equal(await read(qa), true);
  assert.equal(calls, 1);
  for (const env of [
    { ...qa, VERCEL_ENV: "production" },
    { ...qa, VERCEL_GIT_COMMIT_REF: "main" },
    { ...qa, TOUCHLINE_DEPLOYMENT_MODE: "production" },
    { ...qa, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" },
    { ...qa, SUPABASE_URL: "https://other.supabase.co" },
    { ...qa, SUPABASE_URL: "" },
  ]) assert.equal(await read(env), false);
  assert.equal(calls, 1, "non-QA runtimes must not query the override");
});

test("an open QA collection does not advertise XI confirmation when the round is locked", () => {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  assert.match(source, /const roundEditable = snapshot\?\.entitlementActive === true && activeGameweek\?\.state === "MARKET_OPEN" && !deadlineReached;/);
  assert.match(source, /lineupConfirmed \? \(workflowCopy\.xiConfirmed\) : !editable \? marketAccessLabel : !roundEditable \? marketAccessCopy\.closed : validation\?\.valid \? \(workflowCopy\.readyConfirm\)/);
  assert.match(source, /disabled=\{!roundEditable \|\| saving \|\| !selectedCoachId \|\| !validation\?\.valid \|\| lineupConfirmed\}/);
});
