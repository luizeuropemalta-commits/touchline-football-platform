import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TouchlineFantasyFixtureFeed } from "../lib/football-data/types.ts";
import { claimTouchlineFixtureRecovery, deferTouchlineFixtureRecovery, finishTouchlineFixtureRecovery, persistTouchlineRecoveryFeed } from "../lib/football-data/fixture-backlog-recovery.ts";

const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const { PGlite } = runtime ? await import(runtime) : { PGlite: null };
const original = readFileSync(new URL("../supabase/migrations/20260923185720_touchline_fixture_backlog_recovery.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261002160805_touchline_fixture_recovery_deferral.sql", import.meta.url), "utf8");
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type DB = { exec(sql: string): Promise<unknown>; query(sql: string, args?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; close(): Promise<void> };
type Claim = { fixtureId: string; providerFixtureId: string; attemptCount: number; reservationId: string };
async function database(): Promise<DB> {
  const db: DB = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table football_competitions(id uuid primary key,provider text,provider_competition_id text);
    create table football_seasons(id uuid primary key,competition_id uuid,provider text,is_current boolean,provider_season_id text);
    create table football_clubs(id uuid primary key,provider text,provider_team_id text);
    create table football_data_sync_runs(id uuid primary key,provider text,sync_type text,status text,started_at timestamptz);
    create table football_fixtures(id uuid primary key,provider text,provider_fixture_id text,season_id uuid,competition_id uuid,starts_at timestamptz,status text,home_score integer,away_score integer,source_updated_at timestamptz,home_club_id uuid,away_club_id uuid);
    create table football_fantasy_fixture_feeds(provider text,provider_fixture_id text,fixture_payload jsonb,lineups_payload jsonb,events_payload jsonb,last_synced_at timestamptz,formations_payload jsonb,sidelined_payload jsonb,unique(provider,provider_fixture_id));
    insert into football_competitions values('${id(1)}','sportmonks','8');
    insert into football_seasons values('${id(2)}','${id(1)}','sportmonks',true,'25600');
    insert into football_clubs values('${id(11)}','sportmonks','11'),('${id(12)}','sportmonks','12');
    insert into football_data_sync_runs values('${id(3)}','sportmonks','live_scores','running',clock_timestamp()),('${id(4)}','sportmonks','live_scores','running',clock_timestamp());
    insert into football_fixtures(id,provider,provider_fixture_id,season_id,competition_id,starts_at,status,home_club_id,away_club_id)
      select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'sportmonks',n::text,'${id(2)}','${id(1)}','2026-09-18','NS','${id(11)}','${id(12)}' from generate_series(380,382) n;
    grant select,insert,update on all tables in schema public to service_role;`);
  await db.exec(original);
  await db.exec(migration);
  await db.exec("set role service_role");
  return db;
}
const claim = async (db: DB, run = id(3), now = "2026-10-02T10:00Z") => (await db.query(
  "select touchline_claim_fixture_recovery($1,$2,$3) v", [id(2),run,now])).rows[0].v as Claim | null;
const defer = async (db: DB, c: Claim, run = id(3), expected = c.attemptCount) => (await db.query(
  "select touchline_defer_fixture_recovery($1,$2,$3,$4) v", [c.fixtureId,run,c.reservationId,expected])).rows[0].v;
const row = async (db: DB, fixture = id(380)) => (await db.query("select * from touchline_fixture_recovery where fixture_id=$1", [fixture])).rows[0];
const finish = (db: DB, c: Claim, reservation: string | null = c.reservationId, run = id(3)) => db.query(
  "select touchline_finish_fixture_recovery($1,$2,'2026-10-02T10:00Z','pending','provider_error','2026-10-02T11:00Z',$3)", [c.fixtureId,run,reservation]);
const feed = { fixture: {provider:"sportmonks",providerId:"380",competitionId:"8",seasonId:"25600",homeTeam:{providerId:"11"},awayTeam:{providerId:"12"},status:"Full Time",homeScore:2,awayScore:1},lineups:[],events:[],formations:[],sidelined:[] };
const persist = (db: DB, c: Claim, reservation: string | null = c.reservationId, payload = feed, run = id(3)) => db.query(
  "select touchline_persist_recovery_feed($1,$2,$3,'[]',$4) v", [c.fixtureId,run,JSON.stringify(payload),reservation]);

test("recovery composition: real adapters execute named SQL parameters and fence stale writes", {skip:!runtime}, async () => {
  const db = await database();
  try {
    // Only the transport is replaced; named arguments are resolved by PostgreSQL.
    const admin = {rpc:async(name:string,args:Record<string,unknown>)=>{
      assert.match(name,/^touchline_(claim_fixture_recovery|defer_fixture_recovery|finish_fixture_recovery|persist_recovery_feed)$/);
      const entries = Object.entries(args);
      for (const [key] of entries) assert.match(key,/^p_[a-z_]+$/);
      try {
        const values = entries.map(([key,value])=>key==="p_feed"||key==="p_shirt_facts"?JSON.stringify(value):value);
        const result = await db.query(`select public.${name}(${entries.map(([key],i)=>`${key} => $${i+1}`).join(",")}) v`,values);
        return {data:result.rows[0].v,error:null};
      } catch (error) { return {data:null,error}; }
    }} as unknown as SupabaseClient;
    const scope = {seasonId:id(2),providerSeasonId:"25600",competitionId:id(1)};
    const now = Date.parse("2026-10-02T10:00Z");
    const first = (await claimTouchlineFixtureRecovery(admin,scope,id(3),now,["381","382"]))!;
    await deferTouchlineFixtureRecovery(admin,first,id(3));
    assert.equal((await row(db)).attempt_count,0);
    await assert.rejects(()=>finishTouchlineFixtureRecovery(admin,first,id(3),now,"pending","provider_error"),/recovery-finish-failed/);
    const next = (await claimTouchlineFixtureRecovery(admin,scope,id(4),now+3600000,["381","382"]))!;
    assert.notEqual(next.reservationId,first.reservationId);
    assert.equal((await persistTouchlineRecoveryFeed(admin,first,id(3),feed as unknown as TouchlineFantasyFixtureFeed)).persisted,false);
    assert.equal((await persistTouchlineRecoveryFeed(admin,next,id(4),feed as unknown as TouchlineFantasyFixtureFeed)).persisted,true);
    assert.equal((await row(db)).reservation_resolution,"consumed");
    await assert.rejects(()=>deferTouchlineFixtureRecovery(admin,next,id(4)),/recovery-deferral-unconfirmed/);
    await finishTouchlineFixtureRecovery(admin,next,id(4),now,"pending","provider_error");
    assert.equal((await row(db)).attempt_count,1);
  } finally {await db.close();}
});

test("recovery deferral: first 1→0 is idempotent, preserves scheduling/history and two claims per run", {skip:!runtime}, async () => {
  const db = await database();
  try {
    const first = (await claim(db))!;
    assert.match(first.reservationId, /^[0-9a-f-]{36}$/);
    assert.equal(first.attemptCount,1);
    await db.exec("update touchline_fixture_recovery set last_success_at='2026-09-01'");
    const before = await row(db);
    assert.equal(await defer(db,first),true);
    const released = await row(db);
    assert.equal(released.attempt_count,0); assert.equal(released.state,"pending"); assert.equal(released.reservation_resolution,"deferred");
    for (const key of ["next_attempt_at","last_attempt_at","last_success_at","claimed_run_id","reservation_id"]) assert.deepEqual(released[key],before[key],key);
    assert.equal(await defer(db,first),true); assert.deepEqual(await row(db),released);
    const second = (await claim(db))!;
    assert.equal(await defer(db,second),true);
    assert.equal(await claim(db,id(3),"2026-10-02T12:00Z"),null);
    assert.equal((await db.query("select count(*)::int n from touchline_fixture_recovery where claimed_run_id=$1",[id(3)])).rows[0].n,2);
  } finally { await db.close(); }
});

test("recovery deferral: eighth reservation 7→8→7, while an actual eighth finish reaches review", {skip:!runtime}, async () => {
  const db = await database();
  try {
    await db.query("insert into touchline_fixture_recovery(fixture_id,last_attempt_at,next_attempt_at,attempt_count,state) values($1,'2026-09-01','2026-09-01',7,'pending')",[id(380)]);
    // Existing unclaimed fixtures sort first; exclude them to target the historical row.
    const c = (await db.query("select touchline_claim_fixture_recovery($1,$2,'2026-10-02T10:00Z',array['381','382']) v",[id(2),id(3)])).rows[0].v as Claim;
    assert.equal(c.attemptCount,8); assert.equal(await defer(db,c),true);
    assert.equal((await row(db)).attempt_count,7); assert.equal((await row(db)).state,"pending");
    assert.equal((await db.query("select touchline_claim_fixture_recovery($1,$2,'2026-10-02T11:00Z',array['381','382']) v",[id(2),id(3)])).rows[0].v,null,"same run cannot reclaim its refunded row");
    const next = (await db.query("select touchline_claim_fixture_recovery($1,$2,'2026-10-02T11:00Z',array['381','382']) v",[id(2),id(4)])).rows[0].v as Claim;
    assert.notEqual(next.reservationId,c.reservationId); assert.equal(next.attemptCount,8);
    await assert.rejects(()=>defer(db,c),/RECOVERY_CLAIM_LOST/);
    await finish(db,next,next.reservationId,id(4));
    assert.equal((await row(db)).attempt_count,8); assert.equal((await row(db)).state,"needs_review");
    assert.equal((await row(db)).reservation_resolution,"consumed");
    await assert.rejects(()=>defer(db,next,id(4)),/RECOVERY_CLAIM_LOST/);
  } finally { await db.close(); }
});

test("recovery deferral: exact run/count/token fences, legacy rows, expired lease, and atomic rollback", {skip:!runtime}, async () => {
  const db = await database();
  try {
    const c = (await claim(db))!;
    const before = await row(db);
    for (const [candidate,run,count] of [[c,id(4),1],[c,id(3),0],[c,id(3),2],[{...c,reservationId:id(90)},id(3),1],[{...c,reservationId:null},id(3),1]] as [Claim,string,number][]) {
      await assert.rejects(()=>defer(db,candidate,run,count),/RECOVERY_CLAIM_LOST/);
      assert.deepEqual(await row(db),before);
    }
    await db.exec("begin"); await defer(db,c); await db.exec("rollback"); assert.deepEqual(await row(db),before);
    await assert.rejects(()=>db.exec(`do $$ begin
      perform public.touchline_defer_fixture_recovery('${c.fixtureId}','${id(3)}','${c.reservationId}',${c.attemptCount});
      raise exception 'simulated_failure'; end $$;`),/simulated_failure/);
    assert.deepEqual(await row(db),before,"statement failure rolls back the refund");
    await db.exec("update football_data_sync_runs set started_at=clock_timestamp()-interval '11 minutes'");
    await assert.rejects(()=>defer(db,c),/RECOVERY_LEASE_REQUIRED/); assert.deepEqual(await row(db),before);
    await db.exec("update football_data_sync_runs set started_at=clock_timestamp()");
    await db.exec("update touchline_fixture_recovery set reservation_id=null,reservation_resolution=null");
    await assert.rejects(()=>defer(db,c),/RECOVERY_CLAIM_LOST/);
    // The default-null compatibility path remains valid for pre-migration claims.
    await db.query("select touchline_persist_recovery_feed($1,$2,$3,'[]')",[c.fixtureId,id(3),JSON.stringify(feed)]);
    await db.query("select touchline_finish_fixture_recovery($1,$2,'2026-10-02T10:00Z','pending','provider_error','2026-10-02T11:00Z')",[c.fixtureId,id(3)]);
    assert.equal((await row(db)).attempt_count,1);
  } finally { await db.close(); }
});

test("recovery deferral: deferred/superseded/legacy completion cannot write and consumed feeds cannot refund", {skip:!runtime}, async () => {
  const db = await database();
  try {
    const c = (await claim(db))!;
    await assert.rejects(()=>finish(db,c,null),/RECOVERY_CLAIM_LOST/);
    await assert.rejects(()=>persist(db,c,null),/RECOVERY_CLAIM_LOST/);
    await assert.rejects(()=>persist(db,c,id(99)),/RECOVERY_CLAIM_LOST/);
    await defer(db,c);
    const before = await row(db);
    await assert.rejects(()=>finish(db,c),/RECOVERY_CLAIM_LOST/);
    await assert.rejects(()=>persist(db,c),/RECOVERY_CLAIM_LOST/);
    assert.deepEqual(await row(db),before);
    assert.equal((await db.query("select count(*)::int n from football_fantasy_fixture_feeds")).rows[0].n,0);
    const next = (await db.query("select touchline_claim_fixture_recovery($1,$2,'2026-10-02T11:00Z',array['381','382']) v",[id(2),id(4)])).rows[0].v as Claim;
    await assert.rejects(()=>persist(db,c),/RECOVERY_CLAIM_LOST/);
    await assert.rejects(()=>persist(db,next,next.reservationId,{...feed,fixture:{...feed.fixture,seasonId:"old"}},id(4)),/RECOVERY_FEED_IDENTITY/);
    assert.equal((await row(db)).reservation_resolution,"reserved");
    const beforeFailedWrite = await row(db);
    await assert.rejects(()=>db.query("select touchline_persist_recovery_feed($1,$2,$3,'[]',$4)",[
      next.fixtureId,id(4),JSON.stringify({...feed,fixture:{...feed.fixture,homeScore:"invalid"}}),next.reservationId]),/invalid input syntax/);
    assert.deepEqual(await row(db),beforeFailedWrite,"late feed failure rolls back consumed marker");
    assert.equal((await db.query("select count(*)::int n from football_fantasy_fixture_feeds")).rows[0].n,0);
    assert.equal((await db.query("select status from football_fixtures where id=$1",[next.fixtureId])).rows[0].status,"NS");
    await persist(db,next,next.reservationId,feed,id(4));
    assert.equal((await row(db)).reservation_resolution,"consumed");
    await assert.rejects(()=>defer(db,next,id(4)),/RECOVERY_CLAIM_LOST/);
    await persist(db,next,next.reservationId,feed,id(4)); // Idempotent feed replacement by the same consumed reservation.
    await finish(db,next,next.reservationId,id(4)); // Consumed successful feed can still complete normal recovery.
  } finally { await db.close(); }
});

test("recovery deferral: service-only ACL, forced RLS, no overload and zero invariant", {skip:!runtime}, async () => {
  const db = await database();
  try {
    for (const signature of ["touchline_claim_fixture_recovery(uuid,uuid,timestamptz,text[])","touchline_defer_fixture_recovery(uuid,uuid,uuid,integer)","touchline_finish_fixture_recovery(uuid,uuid,timestamptz,text,text,timestamptz,uuid)","touchline_persist_recovery_feed(uuid,uuid,jsonb,jsonb,uuid)"]) {
      const acl = (await db.query("select has_function_privilege('anon',$1,'execute') anon,has_function_privilege('authenticated',$1,'execute') authenticated,has_function_privilege('service_role',$1,'execute') service",[signature])).rows[0];
      assert.deepEqual(acl,{anon:false,authenticated:false,service:true});
    }
    assert.deepEqual((await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='touchline_fixture_recovery'::regclass")).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
    assert.equal((await db.query("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname='touchline_finish_fixture_recovery'")).rows[0].n,1);
    const c = (await claim(db))!;
    await assert.rejects(()=>db.query("insert into touchline_fixture_recovery(fixture_id,last_attempt_at,next_attempt_at,attempt_count,state) values($1,clock_timestamp(),clock_timestamp(),0,'pending')",[id(381)]),/check constraint/);
    await assert.rejects(()=>db.exec("update touchline_fixture_recovery set attempt_count=0"),/check constraint/);
    await defer(db,c);
    await assert.rejects(()=>db.exec("update touchline_fixture_recovery set state='recovered'"),/check constraint/);
    await assert.rejects(()=>db.exec("update touchline_fixture_recovery set attempt_count=-1"),/check constraint/);
  } finally { await db.close(); }
});

test("recovery completion: complete sheets reconcile before recovered, consumed reservations never refund or accept stale writes", {skip:!runtime}, async () => {
  const db = await database();
  try {
    // Exercise the real recovery SQL. This SQL witness replaces only the Card
    // Engine internals and records the exact shirt boundary, as in the predecessor.
    await db.exec(`reset role;
      create table recovery_shirt_calls(fixture text, persisted_at timestamptz, facts jsonb);
      create function public.touchline_card_engine_reconcile_official_lineup_shirts(text,timestamptz,jsonb)
      returns void language sql security invoker set search_path='' as
        'insert into public.recovery_shirt_calls values($1,$2,$3)';
      revoke all on function public.touchline_card_engine_reconcile_official_lineup_shirts(text,timestamptz,jsonb) from public,anon,authenticated;
      grant execute on function public.touchline_card_engine_reconcile_official_lineup_shirts(text,timestamptz,jsonb) to service_role;
      grant select,insert on recovery_shirt_calls to service_role;
      set role service_role;`);
    const admin = {rpc:async(name:string,args:Record<string,unknown>)=>{
      assert.match(name,/^touchline_(claim_fixture_recovery|defer_fixture_recovery|finish_fixture_recovery|persist_recovery_feed)$/);
      const entries = Object.entries(args);
      for (const [key] of entries) assert.match(key,/^p_[a-z_]+$/);
      try {
        const values = entries.map(([key,value])=>key==="p_feed"||key==="p_shirt_facts"?JSON.stringify(value):value);
        const result = await db.query(`select public.${name}(${entries.map(([key],i)=>`${key} => $${i+1}`).join(",")}) v`,values);
        return {data:result.rows[0].v,error:null};
      } catch (error) { return {data:null,error}; }
    }} as unknown as SupabaseClient;
    const scope = {seasonId:id(2),providerSeasonId:"25600",competitionId:id(1)};
    const now = Date.parse("2026-10-02T10:00Z");
    const stale = (await claimTouchlineFixtureRecovery(admin,scope,id(3),now,["381","382"]))!;
    await deferTouchlineFixtureRecovery(admin,stale,id(3));
    const current = (await claimTouchlineFixtureRecovery(admin,scope,id(4),now+3600000,["381","382"]))!;
    assert.notEqual(current.reservationId,stale.reservationId);
    assert.equal(current.attemptCount,1);
    await assert.rejects(()=>finishTouchlineFixtureRecovery(admin,current,id(4),now+3600000,"recovered","complete"),/recovery-finish-failed/);
    assert.equal((await row(db)).last_success_at,null);

    const lineups = ["11","12"].flatMap((teamId,team)=>Array.from({length:20},(_,index)=>({
      teamId,playerId:String(1000+team*100+index),jerseyNumber:index+1,
      isStarter:index<11,isSubstitute:index>=11,formationPosition:String(index+1),
    })));
    const complete = {...feed,lineups} as unknown as TouchlineFantasyFixtureFeed;
    const result = await persistTouchlineRecoveryFeed(admin,current,id(4),complete);
    assert.deepEqual(result,{persisted:true,reconciliationReady:true,reason:undefined});
    const shirts = (await db.query("select fixture,facts,persisted_at=(select last_synced_at from football_fantasy_fixture_feeds where provider_fixture_id='380') as same_version from recovery_shirt_calls")).rows;
    assert.equal(shirts.length,1);
    assert.equal(shirts[0].fixture,"380");
    assert.equal(shirts[0].same_version,true);
    assert.deepEqual(shirts[0].facts,lineups.map(member=>({
      playerId:member.playerId,teamId:member.teamId,jerseyNumber:member.jerseyNumber,
      role:member.isStarter?"STARTER":"SUBSTITUTE",formationPosition:member.isStarter?Number(member.formationPosition):null,
    })));
    const ready = await row(db);
    assert.equal(ready.ingestion_ready,true);
    assert.equal(ready.reservation_resolution,"consumed");
    await assert.rejects(()=>deferTouchlineFixtureRecovery(admin,current,id(4)),/recovery-deferral-unconfirmed/);
    await finishTouchlineFixtureRecovery(admin,current,id(4),now+3600000,"recovered","complete");
    const recovered = await row(db);
    assert.equal(recovered.state,"recovered");
    assert.equal(recovered.attempt_count,1);
    assert.equal(recovered.last_error_code,"complete");
    assert.equal(new Date(String(recovered.last_success_at)).toISOString(),new Date(now+3600000).toISOString());
    const snapshot = async () => (await db.query(`select
      (select to_jsonb(q) from touchline_fixture_recovery q where fixture_id='${id(380)}') as recovery,
      (select to_jsonb(f) from football_fixtures f where id='${id(380)}') as fixture,
      (select to_jsonb(f) from football_fantasy_fixture_feeds f where provider_fixture_id='380') as feed,
      (select jsonb_agg(to_jsonb(s)) from recovery_shirt_calls s) as shirts`)).rows;
    const before = await snapshot();
    for (const [reservation,run] of [[stale,id(3)],[current,id(4)]] as const) {
      await assert.rejects(()=>deferTouchlineFixtureRecovery(admin,reservation,run),/recovery-deferral-unconfirmed/);
      await assert.rejects(()=>finishTouchlineFixtureRecovery(admin,reservation,run,now+3600000,"pending","provider_error"),/recovery-finish-failed/);
      assert.equal((await persistTouchlineRecoveryFeed(admin,reservation,run,complete)).persisted,false);
      assert.deepEqual(await snapshot(),before,"rejected writes preserve recovery, feed, score and shirt evidence");
    }
    assert.equal(await claimTouchlineFixtureRecovery(admin,scope,id(3),now+7200000,["381","382"]),null);
  } finally { await db.close(); }
});
