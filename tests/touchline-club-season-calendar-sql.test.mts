import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
import { clubSeasonCalendarMigration as migration, installTestClubSeasonCalendar } from "./helpers/club-season-calendar.mts";
import { acquireClubPlayer, type ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";
import { allocateClubPlayers } from "../lib/touchlineFantasy/club-allocation.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as registry } from "../lib/touchlineArena/formation-geometry.ts";

const id=(n:number)=>`72000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const sql=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),"utf8");
const qaSql=readFileSync(new URL("../supabase/qa/club_market_test_opening.sql",import.meta.url),"utf8");
const normalBody="select exists(select 1 from public.touchline_fantasy_market_window_projection(clock_timestamp()) p where p.season_id=p_season_id and p.state='MARKET_OPEN');";

test("calendar migration preserves normal/QA predecessors, privileges and strict UTC season boundaries",async t=>{
  for(const qa of [false,true]) await t.test(qa?"installed QA override":"normal database",async()=>{
    const db=new PGlite();
    try {
      await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
        create table football_seasons(id uuid primary key,competition_id uuid,starts_at date,ends_at date);
        create table touchline_fantasy_configs(season_id uuid,competition_id uuid,competition_key text,status text);
        create table test_rounds(season_id uuid,state text);
        create function touchline_fantasy_market_window_projection(timestamptz) returns table(season_id uuid,state text)
          language sql as $$select season_id,state from public.test_rounds;$$;
        create function touchline_club_market_is_open(p_season_id uuid) returns boolean
          language sql volatile security definer set search_path='' as $$${normalBody}$$;
        revoke all on function touchline_club_market_is_open(uuid) from public,anon,authenticated;
        grant execute on function touchline_club_market_is_open(uuid) to service_role;
        insert into football_seasons values('${id(3)}','${id(2)}',current_date-1,current_date+1),('${id(4)}','${id(2)}',current_date-1,current_date+1);
        insert into touchline_fantasy_configs values('${id(3)}','${id(2)}','england','active');
        insert into test_rounds values('${id(3)}','${qa?"LOCKED":"MARKET_OPEN"}'),('${id(4)}','MARKET_OPEN');`);
      if(qa) await db.exec(`create table touchline_qa_club_market_control(season_id uuid,enabled boolean,reason text);
        insert into touchline_qa_club_market_control values('${id(3)}',true,'authorized fixture');
        create function touchline_qa_club_market_is_open(p_season_id uuid) returns boolean language sql stable security definer set search_path='' as $$
          select exists(select 1 from public.touchline_qa_club_market_control where season_id=p_season_id and enabled);$$;
        revoke all on function touchline_qa_club_market_is_open(uuid) from public,anon,authenticated;
        grant execute on function touchline_qa_club_market_is_open(uuid) to service_role;
        create or replace function touchline_club_market_is_open(p_season_id uuid) returns boolean language sql volatile security definer set search_path='' as $$
          select public.touchline_qa_club_market_is_open(p_season_id) or exists(select 1 from public.touchline_fantasy_market_window_projection(clock_timestamp()) p where p.season_id=p_season_id and p.state='MARKET_OPEN');$$;`);
      const properties=async()=>(await db.query("select proowner,proacl,proconfig,prosecdef,provolatile from pg_proc where oid='touchline_club_market_is_open(uuid)'::regprocedure")).rows[0];
      const original=(await db.query<{definition:string}>("select pg_get_functiondef('touchline_club_market_is_open(uuid)'::regprocedure) definition")).rows[0].definition;
      const before=await properties();
      const qaBefore=qa?(await db.query("select proowner,proacl,proconfig,prosecdef,provolatile from pg_proc where oid='touchline_qa_club_market_is_open(uuid)'::regprocedure")).rows[0]:null;
      await db.exec("create or replace function touchline_club_market_is_open(p_season_id uuid) returns boolean language sql volatile security definer set search_path='' as $$select true;$$");
      await assert.rejects(db.exec(migration),/CLUB_SEASON_GUARD_UNKNOWN_PREDECESSOR/);
      await db.exec("rollback");
      assert.equal((await db.query<{fn:string|null}>("select to_regprocedure('touchline_club_season_is_open(uuid,timestamptz)')::text fn")).rows[0].fn,null,"failed migration leaves no helper behind");
      await db.exec(original);
      if(qa){
        const qaOriginal=(await db.query<{definition:string}>("select pg_get_functiondef('touchline_qa_club_market_is_open(uuid)'::regprocedure) definition")).rows[0].definition;
        await db.exec("create or replace function touchline_qa_club_market_is_open(p_season_id uuid) returns boolean language sql stable security definer set search_path='' as $$select true;$$");
        await assert.rejects(db.exec(migration),/CLUB_SEASON_GUARD_UNKNOWN_QA_PREDECESSOR/);
        await db.exec("rollback");
        assert.equal((await db.query<{fn:string|null}>("select to_regprocedure('touchline_club_season_is_open(uuid,timestamptz)')::text fn")).rows[0].fn,null);
        assert.equal((await db.query<{definition:string}>("select pg_get_functiondef('touchline_club_market_is_open(uuid)'::regprocedure) definition")).rows[0].definition,original,"unknown QA body also rolls back the central change");
        await db.exec(qaOriginal);
      }
      await db.exec(migration);
      assert.deepEqual(await properties(),before,"owner, ACL, security and search_path preserved");
      if(qa) assert.deepEqual((await db.query("select proowner,proacl,proconfig,prosecdef,provolatile from pg_proc where oid='touchline_qa_club_market_is_open(uuid)'::regprocedure")).rows[0],qaBefore);
      if(qa) assert.deepEqual((await db.query("select enabled,reason from touchline_qa_club_market_control")).rows,[{enabled:true,reason:"authorized fixture"}]);
      else assert.equal((await db.query<{relation:string|null}>("select to_regclass('touchline_qa_club_market_control')::text relation")).rows[0].relation,null,"normal database never receives QA controls");
      const opened=async(s=id(3))=>(await db.query<{open:boolean}>("select touchline_club_market_is_open($1) open",[s])).rows[0].open;
      assert.equal(await opened(),true);
      assert.equal(await opened(id(4)),false,"another open season cannot satisfy the requested active season");
      if(!qa){await db.exec(`update test_rounds set state='LOCKED' where season_id='${id(3)}'`);assert.equal(await opened(),false,"other season's open round never opens this one");await db.exec("update test_rounds set state='MARKET_OPEN'");}
      for(const dates of ["starts_at=null", "ends_at=null", "starts_at=current_date+5,ends_at=current_date+10", "starts_at=current_date-10,ends_at=current_date-1", "starts_at=current_date+1,ends_at=current_date-1"]){
        await db.exec(`update football_seasons set ${dates} where id='${id(3)}'`);
        assert.equal(await opened(),false,dates);
        if(qa) assert.equal((await db.query<{open:boolean}>("select touchline_qa_club_market_is_open($1) open",[id(3)])).rows[0].open,false,`QA read snapshot: ${dates}`);
      }
      await db.exec(`update football_seasons set starts_at='2028-02-01',ends_at='2028-02-29' where id='${id(3)}'`);
      const at=async(instant:string|null)=>(await db.query<{open:boolean}>("select touchline_club_season_is_open($1,$2::timestamptz) open",[id(3),instant])).rows[0].open;
      for(const timezone of ["UTC","Europe/Malta","America/Sao_Paulo"]){
        await db.query("select set_config('TimeZone',$1,false)",[timezone]);
        for(const [instant,expected] of [["2028-01-31T23:59:59.999999Z",false],["2028-02-01T00:00:00Z",true],["2028-02-29T23:59:59.999999Z",true],["2028-03-01T00:00:00Z",false],["2028-02-29T22:30:00-02:00",false],[null,false],["infinity",false]] as const) assert.equal(await at(instant),expected,`${timezone}: ${instant}`);
      }
      await db.exec(`update football_seasons set ends_at='2028-03-26' where id='${id(3)}'`);
      assert.equal(await at("2028-03-26T23:59:59.999Z"),true,"DST change does not shorten the UTC contract date");
      assert.equal(await at("2028-03-27T00:00:00Z"),false);
      await db.exec(`update football_seasons set competition_id='${id(9)}' where id='${id(3)}'`);
      assert.equal(await at("2028-02-15T12:00:00Z"),false,"season and configured competition must match");
      for(const role of ["anon","authenticated"]){
        assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege($1,'touchline_club_season_is_open(uuid,timestamptz)','EXECUTE') allowed",[role])).rows[0].allowed,false);
        assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege($1,'touchline_club_market_is_open(uuid)','EXECUTE') allowed",[role])).rows[0].allowed,false);
      }
    } finally {await db.close();}
  });
});

test("five actual collection operations reject new writes after season end while all committed replays survive",async()=>{
  const db=await clubRoundDatabase();
  try {
    await db.exec(sql("20261018051627_club_collection_atomic_release"));
    await db.exec(sql("20261025193152_club_collection_atomic_coach_lifecycle"));
    await db.exec(`insert into users values('${id(1)}'),('${id(8)}'),('${id(9)}');insert into football_competitions values('${id(2)}');insert into football_seasons values('${id(3)}');
      insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);
      insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(1)}','active','qa_grant','standard'),('${id(8)}','active','qa_grant','standard'),('${id(9)}','active','qa_grant','standard');
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status) values('${id(6)}','${id(4)}','${id(2)}','${id(3)}',clock_timestamp()+interval '2 hours','NS');
      select touchline_fantasy_sync_gameweeks();
      insert into football_clubs(id) values('${id(20)}');
      insert into football_players(id,current_club_id) values('${id(7)}','${id(20)}');
      insert into football_player_market_values values('${id(7)}','${id(7)}',10000000,'verified','verified');
      insert into touchline_card_publications(id,player_id,market_value_id,publication_status) values('${id(7)}','${id(7)}','${id(7)}','published');`);
    await installTestClubSeasonCalendar(db,id(3),id(2));
    const coach={id:"307",tier:"ruby-red",valueEur:5_000_000};
    const initialize=async(owner=id(1))=>(await db.query<{state:ClubAcquisitionState}>("select touchline_club_initialize_collection($1,$2,'standard',$3::jsonb) state",[owner,id(3),JSON.stringify(coach)])).rows[0].state;
    const initial=await initialize();const untouched=await initialize(id(8));
    const acquisition={playerId:id(7),area:"outside" as const,slot:0,expectedRevision:0,idempotencyKey:"calendar_acquire"};
    const acquired=acquireClubPlayer(initial,acquisition,{marketOpen:true,allowedClubIds:null,offer:{playerId:id(7),clubId:id(20),position:"GK",primaryDetail:"Goalkeeper",valueEur:10_000_000,published:true}}).state;
    const acquire=async(command:object=acquisition,next=acquired,revision=0)=>(await db.query<{state:ClubAcquisitionState}>("select touchline_club_commit_acquisition($1,$2,$3,$4::jsonb,$5::jsonb) state",[id(1),id(3),revision,JSON.stringify(next),JSON.stringify(command)])).rows[0].state;
    assert.deepEqual(await acquire(),acquired);
    const geometry=registry["4-3-3"];
    await db.query("insert into touchline_formation_geometry_versions values('4-3-3',1,'published',$1::jsonb)",[JSON.stringify(geometry)]);
    const allocation={action:"formation" as const,formationCode:"4-3-3",expectedRevision:1,idempotencyKey:"calendar_formation"};
    const allocated=allocateClubPlayers(acquired,allocation,{marketOpen:true,geometry,reservedIds:[]});
    const allocate=async(command:object=allocation,next=allocated,revision=1)=>(await db.query<{state:ClubAcquisitionState}>("select touchline_club_commit_allocation($1,$2,$3,$4::jsonb,$5::jsonb) state",[id(1),id(3),revision,JSON.stringify(next),JSON.stringify(command)])).rows[0].state;
    assert.deepEqual(await allocate(),allocated);
    const release={action:"release",playerId:id(7),expectedRevision:2,idempotencyKey:"calendar_release"};
    const releasePlayer=async(command:object=release)=>(await db.query<{result:{state:ClubAcquisitionState;replayed:boolean}}>("select touchline_club_release_player($1,$2,$3::jsonb) result",[id(1),id(3),JSON.stringify(command)])).rows[0].result;
    const released=await releasePlayer();assert.equal(released.state.balanceEur,initial.balanceEur-1_000_000);
    const coachCommand={action:"release-coach",currentCoachId:"307",expectedRevision:3,idempotencyKey:"calendar_coach"};
    const releaseCoach=async(command:object=coachCommand)=>(await db.query<{result:{state:ClubAcquisitionState;replayed:boolean}}>("select touchline_club_coach_lifecycle($1,$2,$3::jsonb,null) result",[id(1),id(3),JSON.stringify(command)])).rows[0].result;
    const coachReleased=await releaseCoach();
    await db.exec(`create function touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$begin if $1<>'xgxbwqxjssxxuihuwmgy' then raise exception 'WRONG_TARGET';end if;end;$$;`);
    await db.exec(qaSql);await db.exec("update touchline_qa_club_market_control set enabled=true");
    assert.equal((await db.query<{open:boolean}>("select touchline_club_market_is_open($1) open",[id(3)])).rows[0].open,true);
    // A request prepared while open must still be rejected by the later SQL commit.
    await db.exec("update football_seasons set starts_at=current_date-10,ends_at=current_date-1");
    const snapshot=async()=>(await db.query(`select
      (select jsonb_agg(to_jsonb(c) order by user_id) from touchline_club_collections c) collections,
      (select jsonb_agg(to_jsonb(o) order by idempotency_key) from touchline_club_collection_operations o) operations,
      (select jsonb_agg(to_jsonb(r) order by idempotency_key) from touchline_club_release_receipts r) releases,
      (select jsonb_agg(to_jsonb(o) order by idempotency_key) from touchline_club_coach_operations o) coaches`)).rows[0];
    const before=await snapshot();
    await assert.rejects(initialize(id(9)),/CLUB_MARKET_CLOSED/);
    await assert.rejects(acquire({...acquisition,expectedRevision:4,idempotencyKey:"calendar_new_buy"},coachReleased.state,4),/CLUB_MARKET_CLOSED/);
    await assert.rejects(allocate({...allocation,expectedRevision:4,idempotencyKey:"calendar_new_move"},coachReleased.state,4),/CLUB_MARKET_CLOSED/);
    await assert.rejects(releasePlayer({...release,expectedRevision:4,idempotencyKey:"calendar_new_release"}),/CLUB_MARKET_CLOSED/);
    await assert.rejects(releaseCoach({...coachCommand,expectedRevision:4,idempotencyKey:"calendar_new_coach"}),/CLUB_MARKET_CLOSED/);
    assert.deepEqual(await initialize(id(8)),untouched,"existing collection recovery does not mint a second budget");
    assert.deepEqual(await acquire(),coachReleased.state);
    assert.deepEqual(await allocate(),coachReleased.state);
    assert.equal((await releasePlayer()).replayed,true);
    assert.deepEqual((await releaseCoach()).state,coachReleased.state);
    assert.deepEqual(await snapshot(),before,"failed new commands and historical replays change no contracts, balances or receipts");
    await db.exec("update touchline_fantasy_configs set status='retired'");
    assert.equal((await releasePlayer()).replayed,true,"replay remains available after config rollover");
    assert.deepEqual(await snapshot(),before);
  } finally {await db.close();}
});
