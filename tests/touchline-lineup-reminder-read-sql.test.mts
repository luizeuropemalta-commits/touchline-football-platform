import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readLineupReminderSource } from "../lib/touchlineFantasy/lineup-reminder-source.ts";
const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const root = new URL("../",import.meta.url);
test("one-snapshot reminder RPC is scoped, readonly and publication fail-closed", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);create table public.users(id uuid primary key);
      create table public.football_rounds(id uuid primary key,competition_id uuid,season_id uuid,name text);
      create table public.football_fixtures(id uuid primary key,round_id uuid,starts_at timestamptz,status text,finalized_at timestamptz,
        competition_id uuid default '${uuid(10)}',season_id uuid default '${uuid(11)}');
      create table public.touchline_fantasy_configs(competition_id uuid,season_id uuid,status text);
      create table public.touchline_fantasy_gameweeks(id uuid primary key default gen_random_uuid(),competition_id uuid,season_id uuid,round_id uuid unique,gameweek_number integer,state text,market_opens_at timestamptz,locks_at timestamptz,first_fixture_at timestamptz,last_fixture_at timestamptz);
      create table public.touchline_fantasy_user_gameweeks(id uuid primary key,user_id uuid,gameweek_id uuid,state text,formation_code text,selected_coach_id text);
      create table public.touchline_fantasy_user_gameweek_selections(user_gameweek_id uuid,player_id uuid,slot_id text,slot_index integer);
      create table public.touchline_formation_geometry_versions(id uuid primary key,formation_code text,status text,geometry jsonb,validation_report jsonb);
      create function public.touchline_fantasy_fixture_is_live(text) returns boolean language sql immutable as $$select $1='LIVE'$$;
      create function public.touchline_fantasy_fixture_is_final(text) returns boolean language sql immutable as $$select $1='FT'$$;
      grant usage on schema public to anon,authenticated,service_role;`);
    const registry = await readFile(new URL("supabase/qa/028_touchline_qa_formation_geometry_registry.sql",root),"utf8");
    const begin = registry.indexOf("create or replace function public.touchline_formation_geometry_payload_is_valid(");
    const end = registry.indexOf("$$;",begin);assert.ok(begin>=0&&end>begin);await db.exec(registry.slice(begin,end+3));
    for (const file of ["20261002031429_touchline_fantasy_shared_market_window_projection.sql","20261002032250_touchline_fantasy_lineup_reminder_read.sql"]) await db.exec(await readFile(new URL(`supabase/migrations/${file}`,root),"utf8"));
    await db.exec(`insert into auth.users values('${uuid(1)}'),('${uuid(2)}');insert into public.users select id from auth.users;
      insert into touchline_fantasy_configs values('${uuid(10)}','${uuid(11)}','active');
      insert into football_rounds values('${uuid(12)}','${uuid(10)}','${uuid(11)}','Round 1');
      insert into football_fixtures values('${uuid(13)}','${uuid(12)}',clock_timestamp()+interval '1 day','NS',null);
      insert into touchline_fantasy_gameweeks values('${uuid(14)}','${uuid(10)}','${uuid(11)}','${uuid(12)}',1,'MARKET_OPEN',clock_timestamp()-interval '6 days',clock_timestamp()+interval '1 day',clock_timestamp()+interval '1 day',clock_timestamp()+interval '1 day');`);
    const geometry = { schemaVersion:1,formationCode:"4-3-3",slots:Array.from({length:11},(_,i)=>({id:`S${i}`,x:50,y:50,role:i===0?"goalkeeper":i<5?"defender":i<8?"midfielder":"forward",priority:i+1,allowedPositions:["ST"]})) };
    const report = {publishable:true,formationCode:"4-3-3",slotCount:11};
    await db.query("insert into touchline_formation_geometry_versions values($1,'4-3-3','published',$2,$3)",[uuid(15),JSON.stringify(geometry),JSON.stringify(report)]);
    const tables = ["auth.users","public.users","football_rounds","football_fixtures","touchline_fantasy_configs","touchline_fantasy_gameweeks","touchline_fantasy_user_gameweeks","touchline_fantasy_user_gameweek_selections","touchline_formation_geometry_versions"];
    const hash = async () => {const out=[];for(const table of tables)out.push((await db.query(`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) h from ${table} t`)).rows[0].h);return out;};
    const read = async (user=uuid(1),week=uuid(14)) => {
      const before=await hash();const value=(await db.query("select public.touchline_fantasy_read_lineup_reminder($1,$2) value",[user,week])).rows[0].value;
      assert.deepEqual(await hash(),before,"No relevant row may change during RPC");return value;
    };
    const decision = async () => readLineupReminderSource({ rpc: async (name,args) => {
      assert.equal(name,"touchline_fantasy_read_lineup_reminder");
      return {data:await read(args.p_user_id,args.p_gameweek_id),error:null};
    } }, {userId:uuid(1),gameweekId:uuid(14),competitionId:uuid(10),seasonId:uuid(11),maximumAgeMs:10_000});
    const value=await read();assert.equal(value.schemaVersion,1);assert.equal(value.userId,uuid(1));assert.equal(value.read.status,"complete");assert.equal(value.read.userGameweek,null);assert.deepEqual(value.read.selections,[]);assert.equal(value.read.checkedAtMs,value.checkedAtMs);
    assert.equal((await decision()).status,"INCOMPLETE","actual SQL DTO flows through the production adapter and classifier");
    for(const column of ["competition_id","season_id"]) {
      await db.exec(`update football_fixtures set ${column}='${uuid(999)}'`);
      assert.deepEqual(await decision(),{status:"UNAVAILABLE",source:null},"cross-scope fixture cannot establish a reminder window");
      await db.exec(`update football_fixtures set ${column}='${column==="competition_id"?uuid(10):uuid(11)}'`);
    }
    await db.exec(`insert into football_rounds values('${uuid(30)}','${uuid(10)}','${uuid(11)}','Round 0');
      insert into football_fixtures values('${uuid(31)}','${uuid(30)}',clock_timestamp()-interval '7 days','FT',clock_timestamp()-interval '6 days','${uuid(10)}','${uuid(999)}')`);
    assert.deepEqual(await decision(),{status:"UNAVAILABLE",source:null},"a mismatched predecessor cannot establish the next round window");
    await db.exec(`delete from football_fixtures where id='${uuid(31)}';delete from football_rounds where id='${uuid(30)}'`);
    assert.equal((await read(uuid(999))).read.status,"unavailable");assert.equal((await read(uuid(1),uuid(999))).read.status,"unavailable");
    await db.exec(`insert into touchline_fantasy_user_gameweeks values('${uuid(20)}','${uuid(1)}','${uuid(14)}','DRAFT','4-3-3','307');`);
    await db.exec(`insert into touchline_fantasy_user_gameweeks values('${uuid(21)}','${uuid(1)}','${uuid(14)}','DRAFT','4-3-3','307');`);
    assert.deepEqual(await decision(),{status:"UNAVAILABLE",source:null},"ambiguous roster is not selected arbitrarily");
    await db.exec(`delete from touchline_fantasy_user_gameweeks where id='${uuid(21)}'`);
    for(let i=0;i<11;i++) {
      await db.query("insert into touchline_fantasy_user_gameweek_selections values($1,$2,$3,$4)",[uuid(20),uuid(100+i),`S${i}`,i+1]);
      if(i===9||i===10){assert.equal((await read()).read.selections.length,i+1);assert.equal((await decision()).status,i===9?"INCOMPLETE":"COMPLETE_UNCONFIRMED");}
    }
    assert.equal((await read(uuid(2))).read.userGameweek,null,"other user must not inherit first user's team");
    assert.deepEqual((await read(uuid(2))).read.selections,[]);
    await db.exec(`update touchline_fantasy_user_gameweeks set state='CONFIRMED'`);assert.equal((await read()).read.userGameweek.state,"CONFIRMED");
    assert.equal((await decision()).status,"CONFIRMED");
    await db.exec("update football_fixtures set status='LIVE'");assert.equal((await read()).read.marketEditable,false,"stale persisted MARKET_OPEN cannot override LIVE");
    assert.equal((await decision()).status,"CLOSED");
    await db.exec("update football_fixtures set status='NS';update touchline_fantasy_gameweeks set state='SETTLED'");assert.equal((await read()).read.marketEditable,false);
    await db.exec("update touchline_fantasy_gameweeks set state='MARKET_OPEN';delete from football_fixtures");assert.equal((await read()).read.status,"unavailable");
    assert.deepEqual(await decision(),{status:"UNAVAILABLE",source:null});
    await db.exec(`insert into football_fixtures values('${uuid(13)}','${uuid(12)}',clock_timestamp()+interval '1 day','NS',null)`);
    await db.exec("update touchline_formation_geometry_versions set status='superseded'");assert.equal((await read()).read.status,"unavailable");
    await db.exec("update touchline_formation_geometry_versions set status='published',geometry='{}'");assert.equal((await read()).read.status,"unavailable");
    await db.query("update touchline_formation_geometry_versions set geometry=$1",[JSON.stringify(geometry)]);
    await db.exec(`insert into touchline_formation_geometry_versions select '${uuid(16)}',formation_code,status,geometry,validation_report from touchline_formation_geometry_versions`);assert.equal((await read()).read.status,"unavailable","ambiguous publication rejected");
    await db.exec(`delete from touchline_formation_geometry_versions where id='${uuid(16)}'`);
    for(const role of ["anon","authenticated"]){await db.exec(`set role ${role}`);await assert.rejects(db.query("select public.touchline_fantasy_read_lineup_reminder($1,$2)",[uuid(1),uuid(14)]),/permission denied/);await db.exec("reset role");}
    await db.exec("set role service_role");const service=(await db.query("select public.touchline_fantasy_read_lineup_reminder($1,$2) value",[uuid(1),uuid(14)])).rows[0].value;assert.equal(service.read.status,"complete");await db.exec("reset role");
  } finally {await db.close();}
});
