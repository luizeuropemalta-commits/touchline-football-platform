import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { recoveryDelaySeconds, recoveryFixtureMatches } from "../lib/football-data/fixture-backlog-recovery.ts";
const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const migration = await readFile(new URL("../supabase/migrations/20260923185720_touchline_fixture_backlog_recovery.sql", import.meta.url), "utf8");
const foundation = await readFile(new URL("../supabase/migrations/013_football_data_foundation.sql", import.meta.url), "utf8");
const canonicalClubSchema = foundation.match(/create table if not exists public\.football_clubs \([\s\S]*?\n\);/)?.[0];
assert.ok(canonicalClubSchema, "canonical football_clubs DDL must be present");
type DB = { exec(sql: string): Promise<unknown>; query(sql: string, args?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; close(): Promise<void> };
async function database(): Promise<DB> {
  const { PGlite } = await import(modulePath!);
  const db: DB = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table football_competitions(id uuid primary key,provider text,provider_competition_id text);
    create table football_seasons(id uuid primary key,competition_id uuid,provider text,is_current boolean,provider_season_id text);
    ${canonicalClubSchema}
    create table football_data_sync_runs(id uuid primary key,provider text,sync_type text,status text,started_at timestamptz);
    create table football_fixtures(id uuid primary key,provider text,provider_fixture_id text,season_id uuid,competition_id uuid,starts_at timestamptz,status text,home_score integer,away_score integer,source_updated_at timestamptz,home_club_id uuid,away_club_id uuid);
    create table football_fantasy_fixture_feeds(provider text,provider_fixture_id text,fixture_payload jsonb,lineups_payload jsonb,events_payload jsonb,last_synced_at timestamptz,formations_payload jsonb,sidelined_payload jsonb,unique(provider,provider_fixture_id));
    insert into football_competitions values('${id(1)}','sportmonks','8');
    insert into football_seasons values('${id(2)}','${id(1)}','sportmonks',true,'25600');
    insert into football_clubs(id,provider,provider_team_id,name) values('${id(11)}','sportmonks','11','Home'),('${id(12)}','sportmonks','12','Away');
    insert into football_data_sync_runs values('${id(3)}','sportmonks','live_scores','running',clock_timestamp());
    insert into football_fixtures(id,provider,provider_fixture_id,season_id,competition_id,starts_at,status) values('${id(380)}','sportmonks','380','${id(2)}','${id(1)}','2026-09-18T10:00Z','NS'),
      ('${id(381)}','sportmonks','381','${id(2)}','${id(1)}','2026-09-19T10:00Z','Full Time'),
      ('${id(382)}','sportmonks','382','${id(2)}','${id(1)}','2026-09-20T10:00Z','NS');
    update football_fixtures set home_club_id='${id(11)}',away_club_id='${id(12)}';
    grant select,insert,update on all tables in schema public to service_role;`);
  await db.exec(migration);
  return db;
}
const claim = async (db: DB, now="2026-09-21T10:00Z", run=id(3)) => (await db.query(
  "select touchline_claim_fixture_recovery($1,$2,$3) as claim",[id(2),run,now])).rows[0].claim as Record<string, unknown> | null;

test("recovery club schema comes from the canonical foundation migration", () => {
  assert.match(canonicalClubSchema!, /provider_team_id text not null/);
  assert.doesNotMatch(canonicalClubSchema!, /provider_club_id/);
});

test("backoff is bounded, but never violates a longer Retry-After", () => {
  assert.equal(recoveryDelaySeconds(1),300);
  assert.equal(recoveryDelaySeconds(100),21600);
  assert.equal(recoveryDelaySeconds(1,90000),90000);
  assert.equal(recoveryDelaySeconds(1,NaN,true),86400);
  assert.equal(recoveryFixtureMatches({ provider:"sportmonks",providerId:"380",competitionId:"8",seasonId:"old" } as never,
    { seasonId:id(2),providerSeasonId:"25600",competitionId:id(1) }),false);
});

test("durable SQL finds fixture380 and final without feed; caps claims at two and preserves crash backoff", { skip: !modulePath }, async () => {
  const db=await database();
  try {
    assert.equal((await claim(db))?.providerFixtureId,"380");
    assert.equal((await claim(db))?.providerFixtureId,"381");
    assert.equal(await claim(db),null);
    await db.exec(`update football_data_sync_runs set status='error'; insert into football_data_sync_runs values('${id(4)}','sportmonks','live_scores','running',clock_timestamp());`);
    assert.equal((await claim(db,"2026-09-21T10:05Z",id(4)))?.providerFixtureId,"382");
    assert.equal(await claim(db,"2026-09-21T10:05Z",id(4)),null);
    await assert.rejects(()=>claim(db,"2026-09-21T10:05Z",id(3)),/LEASE_REQUIRED/);
  } finally { await db.close(); }
});

test("SQL ACLs are service-only, expired claims cannot ack, and attempt limit is explicit review", { skip: !modulePath }, async () => {
  const db=await database();
  try {
    const acl=await db.query("select has_function_privilege('anon','public.touchline_claim_fixture_recovery(uuid,uuid,timestamptz,text[])','execute') as anon,has_table_privilege('authenticated','touchline_fixture_recovery','select') as client");
    assert.equal(acl.rows[0].anon,false); assert.equal(acl.rows[0].client,false);
    await claim(db);
    await db.exec(`update touchline_fixture_recovery set attempt_count=8,next_attempt_at='2026-09-21T10:00Z';`);
    await claim(db);
    const row=(await db.query("select state,last_error_code from touchline_fixture_recovery where fixture_id=$1",[id(380)])).rows[0];
    assert.equal(row.state,"needs_review"); assert.equal(row.last_error_code,"attempt_limit");
    await db.exec("update football_data_sync_runs set status='error'");
    await assert.rejects(()=>db.query("select touchline_finish_fixture_recovery($1,$2,'2026-09-21T10:00Z','pending','timeout','2026-09-21T11:00Z')",[id(381),id(3)]),/LEASE_REQUIRED/);
  } finally { await db.close(); }
});

test("complete final feed is not refetched even when statistics need local reconciliation", { skip: !modulePath }, async () => {
  const db=await database();
  try {
    const lineups=["19","20"].flatMap((teamId,team)=>Array.from({length:20},(_,i)=>({teamId,playerId:String(100+team*100+i),isStarter:i<11,isSubstitute:i>=11,formationPosition:String(i+1)})));
    const payload={provider:"sportmonks",providerId:"381",status:"Full Time",homeTeam:{providerId:"19"},awayTeam:{providerId:"20"}};
    await db.query("insert into football_fantasy_fixture_feeds(provider,provider_fixture_id,fixture_payload,lineups_payload,events_payload,last_synced_at) values('sportmonks','381',$1,$2,'[]','2026-09-21T09:00Z')",[JSON.stringify(payload),JSON.stringify(lineups)]);
    assert.equal((await claim(db))?.providerFixtureId,"380");
    assert.equal((await claim(db))?.providerFixtureId,"382");
  } finally { await db.close(); }
});

test("service role fencing rejects stale running lease and replaced claim before any feed write", { skip: !modulePath }, async () => {
  const db=await database();
  const feed=JSON.stringify({fixture:{provider:"sportmonks",providerId:"380",competitionId:"8",seasonId:"25600",homeTeam:{providerId:"11"},awayTeam:{providerId:"12"},status:"Full Time",homeScore:2,awayScore:1},lineups:[],events:[],formations:[],sidelined:[]});
  const write=()=>db.query("select touchline_persist_recovery_feed($1,$2,$3,'[]') as ready",[id(380),id(3),feed]);
  try {
    await db.exec("set role service_role");
    await claim(db);
    assert.equal((await write()).rows[0].ready,false);
    // Lost receipt: retry is a single upsert, not duplicate rows or new claims.
    await write();
    assert.equal((await db.query("select count(*)::int as n from football_fantasy_fixture_feeds")).rows[0].n,1);
    // A prior successful marker must not survive a later incomplete write.
    await db.exec("update touchline_fixture_recovery set ingestion_ready=true,ingestion_feed_synced_at=clock_timestamp()");
    await write();
    const readiness=(await db.query("select ingestion_ready,ingestion_feed_synced_at from touchline_fixture_recovery where fixture_id=$1",[id(380)])).rows[0];
    assert.equal(readiness.ingestion_ready,false); assert.equal(readiness.ingestion_feed_synced_at,null);
    await assert.rejects(()=>db.query("select touchline_finish_fixture_recovery($1,$2,'2026-09-21T10:00Z','recovered','complete','2026-09-21T11:00Z')",[id(380),id(3)]),/INGESTION_PENDING/);
    assert.equal((await db.query("select status from football_fixtures where id=$1",[id(380)])).rows[0].status,"Full Time");
    await db.exec("update football_data_sync_runs set started_at=clock_timestamp()-interval '11 minutes'");
    await assert.rejects(write,/CLAIM_LOST/);
    await assert.rejects(()=>claim(db),/LEASE_REQUIRED/);
    await assert.rejects(()=>db.query("select touchline_finish_fixture_recovery($1,$2,'2026-09-21T10:00Z','pending','timeout','2026-09-21T11:00Z')",[id(380),id(3)]),/LEASE_REQUIRED/);
    await db.exec(`update football_data_sync_runs set started_at=clock_timestamp(); insert into football_data_sync_runs values('${id(4)}','sportmonks','live_scores','running',clock_timestamp()); update touchline_fixture_recovery set claimed_run_id='${id(4)}';`);
    await assert.rejects(write,/CLAIM_LOST/);
  } finally { await db.close(); }
});

test("due SQL selection is not truncated behind 379 earlier historical fixtures", { skip: !modulePath }, async () => {
  const db=await database();
  try {
    await db.exec(`insert into football_fixtures(id,provider,provider_fixture_id,season_id,competition_id,starts_at,status)
      select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'sportmonks',n::text,'${id(2)}','${id(1)}','2026-08-01'::timestamptz,'Full Time' from generate_series(1,379) n;
      insert into touchline_fixture_recovery(fixture_id,last_attempt_at,next_attempt_at,attempt_count,state)
      select id,clock_timestamp(),clock_timestamp(),1,'recovered' from football_fixtures where provider_fixture_id::int<380;`);
    assert.equal((await claim(db))?.providerFixtureId,"380");
  } finally { await db.close(); }
});

test("atomic feed persistence rejects a different season without changing canonical data", { skip: !modulePath }, async () => {
  const db=await database();
  try {
    await claim(db);
    await assert.rejects(()=>db.query("select touchline_persist_recovery_feed($1,$2,$3,'[]')",[id(380),id(3),JSON.stringify({fixture:{provider:"sportmonks",providerId:"380",competitionId:"8",seasonId:"old"},lineups:[],events:[],formations:[],sidelined:[]})]),/FEED_IDENTITY/);
    assert.equal((await db.query("select count(*)::int as n from football_fantasy_fixture_feeds")).rows[0].n,0);
  } finally { await db.close(); }
});

test("recovery binds ordered canonical participants before mutating feed, scores, readiness or shirts", { skip: !modulePath }, async () => {
  const db=await database();
  const feed={fixture:{provider:"sportmonks",providerId:"380",competitionId:"8",seasonId:"25600",homeTeam:{providerId:"11"},awayTeam:{providerId:"12"},status:"Full Time",homeScore:9,awayScore:8},lineups:[],events:[],formations:[],sidelined:[]};
  const snapshot=async()=> (await db.query(`select
    (select jsonb_agg(to_jsonb(f)) from football_fixtures f) as fixtures,
    (select jsonb_agg(to_jsonb(f)) from football_fantasy_fixture_feeds f) as feeds,
    (select jsonb_agg(to_jsonb(q)) from touchline_fixture_recovery q) as recovery,
    (select jsonb_agg(to_jsonb(s)) from shirt_calls s) as shirts`)).rows;
  try {
    await claim(db);
    await db.exec(`create table shirt_calls(value text);
      insert into shirt_calls values('preserved');
      create function public.touchline_card_engine_reconcile_official_lineup_shirts(text,timestamptz,jsonb)
      returns void language sql as 'insert into public.shirt_calls values(''called'')';
      insert into football_fantasy_fixture_feeds(provider,provider_fixture_id,fixture_payload,lineups_payload,events_payload,last_synced_at)
      values('sportmonks','380','{"previous":true}','[]','[]','2026-09-20T10:00Z');
      update touchline_fixture_recovery set ingestion_ready=true,ingestion_feed_synced_at='2026-09-20T10:00Z';
      grant select,insert on shirt_calls to service_role;
      set role service_role;`);
    const cases = [
      {name:"wrong clubs",home:"99",away:"100"},
      {name:"swapped clubs",home:"12",away:"11"},
      {name:"missing home",home:undefined,away:"12"},
      {name:"missing away",home:"11",away:undefined},
      {name:"equal participants",home:"11",away:"11"},
      {name:"unknown canonical club",home:"11",away:"12",setup:`update football_fixtures set home_club_id='${id(99)}' where id='${id(380)}'`},
      {name:"missing canonical club",home:"11",away:"12",setup:`update football_fixtures set home_club_id=null where id='${id(380)}'`},
      {name:"wrong canonical provider",home:"11",away:"12",setup:`update football_clubs set provider='other' where id='${id(11)}'`},
      {name:"blank canonical provider ID",home:"11",away:"12",setup:`update football_clubs set provider_team_id='' where id='${id(11)}'`},
      {name:"equal canonical participants",home:"11",away:"12",setup:`update football_fixtures set away_club_id='${id(11)}' where id='${id(380)}'`},
    ];
    for (const entry of cases) {
      await db.exec(`update football_fixtures set home_club_id='${id(11)}',away_club_id='${id(12)}' where id='${id(380)}'; update football_clubs set provider='sportmonks',provider_team_id='11' where id='${id(11)}';`);
      if (entry.setup) await db.exec(entry.setup);
      const before=await snapshot();
      const candidate={...feed,fixture:{...feed.fixture,homeTeam:entry.home ? {providerId:entry.home} : undefined,awayTeam:entry.away ? {providerId:entry.away} : undefined}};
      await assert.rejects(()=>db.query("select touchline_persist_recovery_feed($1,$2,$3,$4)",[id(380),id(3),JSON.stringify(candidate),JSON.stringify(Array.from({length:40},()=>({})))]),/RECOVERY_FEED_PARTICIPANTS/,entry.name);
      assert.deepEqual(await snapshot(),before,`${entry.name}: no mutation`);
    }
    await db.exec(`update football_fixtures set home_club_id='${id(11)}',away_club_id='${id(12)}' where id='${id(380)}';`);
    // Legacy normalized teams need only their canonical provider ID; names,
    // logos, source metadata and optional team provider fields are not required.
    const result=await db.query("select touchline_persist_recovery_feed($1,$2,$3,'[]') as ready",[id(380),id(3),JSON.stringify(feed)]);
    assert.equal(result.rows[0].ready,false);
    assert.deepEqual((await db.query("select status,home_score,away_score from football_fixtures where id=$1",[id(380)])).rows,[{status:"Full Time",home_score:9,away_score:8}]);
  } finally { await db.close(); }
});
