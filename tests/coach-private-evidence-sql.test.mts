import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { classifyTouchlineCoach } from '../lib/touchlineArena/coach-classification.ts';
import { parseCoachCatalogue, catalogueCoachForTeamHistory, catalogueCoachAssignments } from '../lib/touchlineArena/coach-catalogue-contract.ts';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { projectPrivateFixtureCoachNames } from '../lib/football-data/coach-editorial-evidence.ts';
import { mapSportmonksFixtureCoaches } from '../lib/football-data/fixture-coach-attribution.ts';
const id=(n:number)=>`91000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const raw=()=>({id:901,league_id:8,season_id:701,
  participants:[{id:10,meta:{location:'home'}},{id:11,meta:{location:'away'}}],
  coaches:[{id:101,display_name:'Synthetic Coach A',meta:{fixture_id:901,coach_id:101,participant_id:10}},
    {id:102,display_name:'Synthetic Coach B',meta:{fixture_id:901,coach_id:102,participant_id:11}}]});
const payload=()=>({fixture:{provider:'sportmonks',providerId:'901',competitionId:'8',seasonId:'701',
  startsAt:'2026-09-01T12:00:00Z',status:'NS',homeTeam:{providerId:'10'},awayTeam:{providerId:'11'},
  coachAttribution:mapSportmonksFixtureCoaches(raw())},lineups:[],events:[],formations:[],sidelined:[]});
async function setup(preexisting=false){
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create table football_competitions(id uuid primary key,provider text,provider_competition_id text);
      create table football_seasons(id uuid primary key,competition_id uuid,provider text,provider_season_id text,is_current boolean);
      create table football_clubs(id uuid primary key,provider text,provider_team_id text,competition_id uuid);
      create table football_fixtures(id uuid primary key,provider text,provider_fixture_id text,competition_id uuid,season_id uuid,home_club_id uuid,away_club_id uuid,starts_at timestamptz,status text,home_score int,away_score int,source_updated_at timestamptz);
      create table football_data_sync_runs(id uuid primary key,provider text,sync_type text,status text,started_at timestamptz);
      insert into auth.users values('${id(50)}');
      insert into football_competitions values('${id(1)}','sportmonks','8');
      insert into football_seasons values('${id(2)}','${id(1)}','sportmonks','701',true);
      insert into football_clubs values('${id(10)}','sportmonks','10','${id(1)}'),('${id(11)}','sportmonks','11','${id(1)}');
      insert into football_fixtures values('${id(901)}','sportmonks','901','${id(1)}','${id(2)}','${id(10)}','${id(11)}','2026-09-01T12:00Z','NS',null,null,null);
      insert into football_data_sync_runs values('${id(3)}','sportmonks','live_scores','running',clock_timestamp());`);
    const foundation=sql('015_sportmonks_fantasy_data_foundation');
    await db.exec(foundation.slice(0,foundation.indexOf('create table if not exists public.football_provider_capabilities')));
    if(preexisting)await save(db);
    await db.exec('grant select,insert,update on all tables in schema public to service_role');
    for(const file of ['20261026121254_football_feed_revision_history','20260923185720_touchline_fixture_backlog_recovery',
      '20261002160805_touchline_fixture_recovery_deferral','20261027210242_touchline_coach_catalogue_editorial',
      '20261103103735_coach_private_observation_evidence','20261103110630_coach_historical_identity_publication','20261103120001_coach_catalogue_runtime_activation'])await db.exec(sql(file));
    await db.exec('update touchline_coaches_private.configuration set editorial_enabled=true');
    return db;
  }catch(e){await db.close();throw e;}
}
async function save(db:PGlite,p=payload()){
  return (await db.query<{id:string;at:string}>(`insert into football_fantasy_fixture_feeds(provider,provider_fixture_id,fixture_payload,lineups_payload,events_payload,formations_payload,sidelined_payload,last_synced_at)
    values('sportmonks','901',$1,'[]','[]','[]','[]',clock_timestamp()) on conflict(provider,provider_fixture_id) do update set fixture_payload=excluded.fixture_payload,last_synced_at=excluded.last_synced_at
    returning id,last_synced_at::text at`,[JSON.stringify(p.fixture)])).rows[0];
}
const stage=(db:PGlite,r:{id:string;at:string},p:unknown=payload(),names:unknown=projectPrivateFixtureCoachNames(raw()))=>db.query<{n:number}>(
  'select public.touchline_stage_coach_fixture_v2($1,$2,$3,$4::jsonb,$5::jsonb) n',['901',r.id,r.at,JSON.stringify(p),JSON.stringify(names)]);
const observations=async(db:PGlite)=>(await db.query('select * from touchline_coaches_private.observations order by provider_id,observed_at')).rows;

test('private staging binds names to immutable import, preserves appointments and is idempotent',async()=>{
  const db=await setup();try{
    const r=await save(db);assert.equal((await stage(db,r)).rows[0].n,2);
    const before=await observations(db);assert.equal(before.length,2);assert.ok(before.every(o=>o.source_feed_revision_id!==null));
    await stage(db,r);assert.deepEqual(await observations(db),before);
    assert.equal((await db.query('select * from touchline_coaches_private.current_assignments')).rows.length,0);
    assert.equal((await db.query('select * from touchline_coaches_private.publications')).rows.length,0);
    const stored=(await db.query('select payload from football_feed_revisions')).rows;
    assert.doesNotMatch(JSON.stringify(stored),/Synthetic Coach|display_name|displayName|raw/);
    await db.exec('set role service_role');assert.equal((await stage(db,r)).rows[0].n,2);
    for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>stage(db,r),/permission denied/);}
  }finally{await db.close();}
});
test('new official name with unchanged football revision invalidates approval without duplicate replay',async()=>{
  const db=await setup();try{
    const r=await save(db);await stage(db,r);
    await db.exec(`insert into touchline_coaches_private.identities(id,provider_id) values('${id(101)}','101');
      insert into touchline_coaches_private.publications(id,coach_id,observation_id,classification,actor_id,catalogue_revision)
        select '${id(102)}','${id(101)}',id,'{}','${id(50)}',1 from touchline_coaches_private.observations where provider_id='101';
      insert into touchline_coaches_private.current_assignments values('10','${id(101)}','${id(102)}');`);
    const appointments=(await db.query('select * from touchline_coaches_private.current_assignments')).rows;
    await db.exec("update touchline_coaches_private.candidates set status='approved',reviewed_observation_id=observation_id where provider_id='101'");
    const corrected=raw();corrected.coaches[0].display_name='Synthetic Corrected Coach';
    const next=await save(db);await stage(db,next,payload(),projectPrivateFixtureCoachNames(corrected));
    const read=async()=>(await db.query<{status:string;reviewed_observation_id:string|null;revision:number;display_name:string}>(`select c.status,c.reviewed_observation_id,c.revision,o.display_name from touchline_coaches_private.candidates c join touchline_coaches_private.observations o on o.id=c.observation_id where c.provider_id='101'`)).rows[0];
    const changed=await read();assert.equal(changed.status,'pending');assert.equal(changed.reviewed_observation_id,null);assert.equal(changed.display_name,'Synthetic Corrected Coach');
    assert.equal((await db.query('select * from football_feed_revisions')).rows.length,1);
    await assert.rejects(()=>stage(db,r),/COACH_FEED_RECEIPT_MISMATCH/);
    await stage(db,next,payload(),projectPrivateFixtureCoachNames(corrected));assert.deepEqual(await read(),changed);
    await db.exec("update touchline_coaches_private.candidates set status='approved',reviewed_observation_id=observation_id where provider_id='101'");
    const restored=await save(db);await stage(db,restored);assert.equal((await read()).display_name,'Synthetic Coach A');
    assert.equal((await read()).status,'pending');assert.equal((await read()).reviewed_observation_id,null);
    assert.deepEqual((await db.query('select * from touchline_coaches_private.current_assignments')).rows,appointments);
    await assert.rejects(()=>stage(db,next,payload(),projectPrivateFixtureCoachNames(corrected)),/COACH_FEED_RECEIPT_MISMATCH/);
  }finally{await db.close();}
});
test('stale receipts, changed feed, extra fields, foreign identities and partial pairs cannot create evidence',async()=>{
  const db=await setup();try{
    const r=await save(db),projection=projectPrivateFixtureCoachNames(raw())!;
    const invalid=[{...projection,token:'synthetic'}, {...projection,seasonProviderId:'702'},
      {...projection,identities:[projection.identities[0],projection.identities[0]]},
      {...projection,identities:[{...projection.identities[0],displayName:'<invalid>'},projection.identities[1]]},
      {...projection,identities:[projection.identities[0],{...projection.identities[1],raw:{name:'synthetic'}}]}];
    for(const names of invalid){await assert.rejects(()=>stage(db,r,payload(),names),/COACH_/);assert.equal((await observations(db)).length,0);}
    await assert.rejects(()=>stage(db,r,{...payload(),lineups:[{playerId:'foreign'}]}),/COACH_FEED_RECEIPT_MISMATCH/);
    const changed=payload();changed.fixture.status='Live';await save(db,changed);
    await assert.rejects(()=>stage(db,r),/COACH_FEED_RECEIPT_MISMATCH/);
    assert.equal((await observations(db)).length,0);
    await db.exec('update touchline_coaches_private.configuration set editorial_enabled=false');
    await assert.rejects(()=>stage(db,r),/COACH_CATALOGUE_DISABLED/);
  }finally{await db.close();}
});
test('recovery v2 preserves real reservation fences and returns persisted receipt even when reconciliation is pending',async()=>{
  const db=await setup();try{
    await db.exec('set role service_role');
    const c=(await db.query<{v:{fixtureId:string;reservationId:string}}>('select touchline_claim_fixture_recovery($1,$2,clock_timestamp()) v',[id(2),id(3)])).rows[0].v;
    assert.ok(c?.reservationId);
    const persist=(reservation:string)=>(db.query<{v:{persisted:boolean;reconciliationReady:boolean;receipt:{id:string;persistedAt:string}}}>(
      "select touchline_persist_recovery_feed_v2($1,$2,$3::jsonb,'[]',$4) v",[c.fixtureId,id(3),JSON.stringify(payload()),reservation]));
    await assert.rejects(()=>persist(id(99)),/RECOVERY_CLAIM_LOST/);
    assert.equal((await db.query('select * from football_fantasy_fixture_feeds')).rows.length,0);
    const result=(await persist(c.reservationId)).rows[0].v;
    assert.equal(result.persisted,true);assert.equal(result.reconciliationReady,false);assert.ok(result.receipt.id);
    await stage(db,{id:result.receipt.id,at:result.receipt.persistedAt});
    await db.exec('reset role');assert.equal((await observations(db)).length,2);
    const q=(await db.query<{reservation_resolution:string}>('select reservation_resolution from touchline_fixture_recovery')).rows[0];assert.equal(q.reservation_resolution,'consumed');
  }finally{await db.close();}
});

test('identical official reimport of legacy feed creates observed revision only at validated ingestion staging',async()=>{
  const db=await setup(true);try{
    await db.exec("update football_fantasy_fixture_feeds set last_synced_at=clock_timestamp()");
    const baseline=(await db.query('select * from football_feed_revisions')).rows;
    assert.equal(baseline.length,1);assert.equal(baseline[0].origin,'existing_baseline');
    const r=await save(db);
    assert.deepEqual((await db.query('select * from football_feed_revisions')).rows,baseline,'freshness alone cannot certify official observation');
    const invalid={...projectPrivateFixtureCoachNames(raw())!,seasonProviderId:'999'};
    await assert.rejects(()=>stage(db,r,payload(),invalid),/COACH_/);
    assert.deepEqual((await db.query('select * from football_feed_revisions')).rows,baseline);
    await stage(db,r);
    const revisions=(await db.query('select * from football_feed_revisions order by id')).rows;
    assert.equal(revisions.length,2);assert.deepEqual(revisions[0],baseline[0]);assert.equal(revisions[1].origin,'observed_import');
    assert.ok((await observations(db)).every(o=>o.source_feed_revision_id===revisions[1].id));
    await stage(db,r);assert.equal((await db.query('select * from football_feed_revisions')).rows.length,2);
  }finally{await db.close();}
});


async function historicalFixture(){
  const db=await setup();
  const seeds=Array.from({length:20},(_,i)=>({providerId:String(90000+i),teamId:String(10+i),name:`Synthetic seed ${i}`,countryCode3:'',observedAt:'2026-07-01T00:00:00Z',classification:classifyTouchlineCoach({coachProviderId:String(90000+i)})}));
  for(let i=12;i<30;i++)await db.query("insert into football_clubs values($1,'sportmonks',$2,$3)",[id(i),String(i),id(1)]);
  await db.query("select touchline_coach_editorial_command($1,$2,'bootstrap',null,null,$3,$4::jsonb,0)",[randomUUID(),id(50),'Bootstrap synthetic catalogue for historical publication test',JSON.stringify(seeds)]);
  const r=await save(db);await stage(db,r);
  const candidate=async()=>(await db.query<{id:string;revision:number;observation_id:string}>("select id,revision,observation_id from touchline_coaches_private.candidates where provider_id='101'")).rows[0];
  const revision=async()=>(await db.query<{revision:number}>('select revision from touchline_coaches_private.configuration')).rows[0].revision;
  const command=async(action:string,key=randomUUID(),expected?:number,candidateRevision?:number)=>{
    const c=await candidate();
    return (await db.query<{v:unknown}>('select touchline_coach_editorial_command($1,$2,$3,$4,$5,$6,null,$7) v',[key,id(50),action,c.id,candidateRevision??c.revision,'Verified immutable official historical fixture identity',expected??await revision()])).rows[0].v;
  };
  return {db,candidate,revision,command};
}

test('historical publication adds ranking identity with the same twenty current appointments and exact audited replay',async()=>{
  const {db,command,revision,candidate}=await historicalFixture();try{
    const current=(await db.query('select * from touchline_coaches_private.current_assignments order by team_id')).rows;
    await assert.rejects(command('publish_history'),/PUBLICATION_REFUSED/);
    await command('approve');
    const rev=await revision(),c=await candidate(),key=randomUUID();
    const receipt=await command('publish_history',key,rev,c.revision);
    assert.deepEqual(await command('publish_history',key,rev,c.revision),receipt);
    assert.deepEqual((await db.query('select * from touchline_coaches_private.current_assignments order by team_id')).rows,current);
    await db.exec('update touchline_coaches_private.configuration set public_enabled=true');
    const catalogue=parseCoachCatalogue((await db.query<{v:unknown}>('select touchline_read_coach_catalogue() v')).rows[0].v);
    assert.equal(catalogue.phase,'ready');assert.equal(catalogue.current.length,20);assert.equal(catalogue.history.length,21);
    const runtime=(await db.query<{v:{mode:string;catalogue:unknown}}>('select touchline_read_coach_catalogue_state() v')).rows[0].v;
    assert.equal(runtime.mode,'published');assert.deepEqual(parseCoachCatalogue(runtime.catalogue),catalogue);
    assert.equal(catalogueCoachForTeamHistory(catalogue,'101','10')?.coach.name,'Synthetic Coach A');
    assert.ok(catalogueCoachAssignments(catalogue).some(c=>c.coach_provider_id==='101'&&c.club_provider_id==='10'));
    assert.ok(!catalogue.current.some(c=>c.coach.providerId==='101'),'not offered as current coach');
    assert.equal((await db.query("select count(*)::int n from touchline_coaches_private.audit where action='publish_history'")).rows[0].n,1);
    await assert.rejects(command('publish_history',randomUUID(),rev,c.revision),/STALE/);
  }finally{await db.close();}
});

test('historical publication requires bound observed import, atomic audit and service-only authority',async()=>{
  const {db,command,candidate}=await historicalFixture();try{
    await command('approve');const c=await candidate();
    const original=(await db.query('select source_feed_revision_id from touchline_coaches_private.observations where id=$1',[c.observation_id])).rows[0].source_feed_revision_id;
    await db.query('update touchline_coaches_private.observations set source_feed_revision_id=null where id=$1',[c.observation_id]);
    await assert.rejects(command('publish_history'),/HISTORICAL_EVIDENCE_REQUIRED/);
    await db.query('update touchline_coaches_private.observations set source_feed_revision_id=$1 where id=$2',[original,c.observation_id]);
    await db.exec("create function reject_history_audit() returns trigger language plpgsql as $$begin raise exception 'AUDIT_UNAVAILABLE';end$$;create trigger reject_history_audit before insert on touchline_coaches_private.audit for each row execute function reject_history_audit()");
    const before=(await db.query('select * from touchline_coaches_private.publications order by id')).rows;
    await assert.rejects(command('publish_history'),/AUDIT_UNAVAILABLE/);
    assert.deepEqual((await db.query('select * from touchline_coaches_private.publications order by id')).rows,before);
    assert.equal((await db.query("select count(*)::int n from touchline_coaches_private.identities where provider_id='101'")).rows[0].n,0);
    await db.exec('drop trigger reject_history_audit on touchline_coaches_private.audit');
    for(const role of ['anon','authenticated'])assert.equal((await db.query<{v:boolean}>("select has_function_privilege($1,'public.touchline_coach_editorial_command(uuid,uuid,text,uuid,integer,text,jsonb,integer)','execute') v",[role])).rows[0].v,false);
    await db.exec('set role service_role');
    await db.query("select touchline_coach_editorial_command($1,$2,'publish_history',$3,$4,$5,null,2)",[randomUUID(),id(50),c.id,c.revision,'Verified immutable official historical fixture identity']);
    await assert.rejects(db.exec('update touchline_coaches_private.current_assignments set team_id=team_id'),/permission denied/);
  }finally{await db.close();}
});

test('runtime catalogue switch distinguishes explicit OFF, incomplete ON and missing configuration',async()=>{
  const db=await setup();try{
    await db.exec('set role service_role');
    const read=async()=>(await db.query<{v:unknown}>('select touchline_read_coach_catalogue_state() v')).rows[0].v;
    assert.deepEqual(await read(),{mode:'legacy'});
    await db.exec('update touchline_coaches_private.configuration set public_enabled=true');
    await assert.rejects(read,/COACH_CATALOGUE_INCOMPLETE/);
    await db.exec('update touchline_coaches_private.configuration set public_enabled=false');
    assert.deepEqual(await read(),{mode:'legacy'});
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`);await assert.rejects(read,/permission denied/);
    }
    await db.exec('reset role;delete from touchline_coaches_private.configuration');
    await assert.rejects(read,/query returned no rows/);
  }finally{await db.close();}
});
