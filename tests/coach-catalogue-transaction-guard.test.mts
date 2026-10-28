import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { clubRoundDatabase } from './helpers/club-round-database.mts';
import { legacyCoachCatalogue, parseCoachCatalogue } from '../lib/touchlineArena/coach-catalogue-contract.ts';
const id=(n:number)=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const legacy=legacyCoachCatalogue().current;

test('real installed coach writes reject read→publication→commit races and retain exact historical replay',async t=>{
 const db=await clubRoundDatabase();
 try{
  await db.exec(`alter table football_competitions add column provider text,add column provider_competition_id text;
   alter table football_clubs add column competition_id uuid,add column name text;
   create table auth.users(id uuid primary key);insert into auth.users values('${id(99)}');
   insert into football_competitions values('${id(50)}','sportmonks','8');insert into football_seasons values('${id(51)}');
   insert into football_rounds values('${id(52)}','${id(50)}','${id(51)}','Gameweek 1');
   insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
    values('england','${id(50)}','${id(51)}',2990,'GBP',400000000,3);
   insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status) values('${id(53)}','${id(52)}','${id(50)}','${id(51)}',clock_timestamp()+interval '2 hours','NS');
   select touchline_fantasy_sync_gameweeks();set request.jwt.claim.role='service_role';`);
  for(let n=1;n<=10;n++)await db.exec(`insert into users values('${id(n)}');insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(n)}','active','qa_grant','standard');`);
  for(const [n,e] of legacy.entries())await db.query('insert into football_clubs values($1,$2,$3,$4,$5)',[id(100+n),'sportmonks',e.coach.teamId,id(50),`Club ${e.coach.teamId}`]);
  await db.exec(sql('20261025193152_club_collection_atomic_coach_lifecycle'));
  await db.exec(sql('20261027210242_touchline_coach_catalogue_editorial'));
  await db.exec(sql('20261027215042_touchline_coach_catalogue_transaction_guard'));
  await db.exec('create table touchline_coach_fixture_points(contract_id uuid,fixture_context text,outcome text,touchline_points int,scoring_version text)');
  const scoring=readFileSync(new URL('../supabase/qa/017_touchline_qa_score_points_engine_v2.sql',import.meta.url),'utf8');
  const scoringStart=scoring.indexOf('create or replace function public.touchline_coach_points_snapshot(');
  await db.exec(scoring.slice(scoringStart,scoring.indexOf('\n$$;',scoringStart)+4));
  const scalar=async(query:string,args:unknown[]=[]) => (await db.query<{result:Record<string,unknown>}>(query,args)).rows[0].result;
  const init=(user:number,offer:object)=>scalar('select touchline_club_initialize_collection($1,$2,$3,$4::jsonb) result',[id(user),id(51),'standard',JSON.stringify(offer)]);
  const hire={action:'hire-coach',incomingCoachId:'99991',expectedRevision:0,idempotencyKey:'catalogue_hire_1'};
  const lifecycle=(offer:object)=>scalar('select touchline_club_coach_lifecycle($1,$2,$3::jsonb,$4::jsonb) result',[id(1),id(51),JSON.stringify(hire),JSON.stringify(offer)]);
  const arena=(user:number,provider:string,club:string,key:string,revision:number|null=null,publication:string|null=null)=>scalar('select touchline_hire_coach_contract($1,$2,$3,$4,$5,$6) result',[id(user),provider,club,key,revision,publication]);
  await t.test('both database gates OFF preserve original four-argument initialization and Arena hire',async()=>{
   const state=await init(8,{id:legacy[0].coach.providerId,tier:'ruby-red',valueEur:5_000_000});assert.equal(state.balanceEur,745_000_000);
   const receipt=await scalar('select touchline_hire_coach_contract($1,$2,$3,$4) result',[id(9),legacy[0].coach.providerId,id(100),'legacy_before_activation']);assert.equal(receipt.idempotentReplay,false);
  });
  await db.exec('update touchline_coaches_private.configuration set editorial_enabled=true');
  const seed=legacy.map(e=>({providerId:e.coach.providerId,teamId:e.coach.teamId,name:e.coach.name,nationality:e.coach.nationality,countryId:e.coach.countryId,countryCode3:e.countryCode3,observedAt:e.fetchedAt,classification:e.classification}));
  await db.query('select touchline_coach_editorial_command($1,$2,$3,null,null,$4,$5::jsonb,0)',[randomUUID(),id(99),'bootstrap','Explicit historical seed bootstrap for local test',JSON.stringify(seed)]);
  await db.exec('update touchline_coaches_private.configuration set public_enabled=true');
  const catalogue=async()=>parseCoachCatalogue((await scalar('select touchline_read_coach_catalogue() result')));
  const publish=async(provider:string)=>{
   const observation=randomUUID(),candidate=randomUUID();
   await db.query("insert into touchline_coaches_private.observations(id,provider_id,club_id,team_id,source_kind,source_id,source_hash,observed_at,display_name) values($1,$2,$3,$4,'sportmonks.fixture.coaches','synthetic-fixture',repeat('a',64),clock_timestamp(),'Verified new coach')",[observation,provider,id(100),legacy[0].coach.teamId]);
   await db.query('insert into touchline_coaches_private.candidates(id,provider_id,team_id,observation_id) values($1,$2,$3,$4)',[candidate,provider,legacy[0].coach.teamId,observation]);
   for(const [n,action] of ['approve','publish'].entries()){
    const rev=(await db.query<{revision:number}>('select revision from touchline_coaches_private.configuration')).rows[0].revision;
    await db.query('select touchline_coach_editorial_command($1,$2,$3,$4,$5,$6,null,$7)',[randomUUID(),id(99),action,candidate,n+1,'Owner verified current appointment against official evidence',rev]);
   }
  };
  const old=await catalogue(),oldEntry=old.current.find(e=>e.coach.teamId===legacy[0].coach.teamId)!;
  const vacant={revision:0,seasonId:id(51),plan:'standard',balanceEur:100_000_000,coach:null,players:[],receipts:[]};
  await db.query('insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,0,$3::jsonb)',[id(1),id(51),JSON.stringify(vacant)]);
  await publish('99991');
  const fresh=await catalogue(),entry=fresh.current.find(e=>e.coach.providerId==='99991')!;
  const offer={id:'99991',tier:'sapphire-blue',valueEur:10_000_000,clubId:id(100),published:true,catalogueRevision:fresh.revision,cataloguePublicationId:entry.publicationId};
  await t.test('a stale read cannot initialize, hire or debit after owner publication',async()=>{
   const stale={...offer,catalogueRevision:old.revision,cataloguePublicationId:oldEntry.publicationId};
   await assert.rejects(lifecycle(stale),/CLUB_COACH_CATALOGUE_CHANGED/);
   await assert.rejects(init(2,{id:oldEntry.coach.providerId,tier:oldEntry.classification.tierKey,valueEur:5_000_000,catalogueRevision:old.revision,cataloguePublicationId:oldEntry.publicationId}),/CLUB_COACH_CATALOGUE_CHANGED/);
   await assert.rejects(arena(3,oldEntry.coach.providerId,id(100),'stale_arena_hire',old.revision,oldEntry.publicationId),/CLUB_COACH_CATALOGUE_CHANGED/);
   assert.deepEqual((await scalar('select state result from touchline_club_collections where user_id=$1',[id(1)])),vacant);
   assert.equal((await db.query<{n:number}>('select count(*)::int n from touchline_coach_contracts where user_id=$1',[id(3)])).rows[0].n,0);
  });
  let committed:Record<string,unknown>,initialized:Record<string,unknown>;
  await t.test('fresh exact publication succeeds without changing canonical prices or persisting proof metadata',async()=>{
   await assert.rejects(lifecycle({...offer,clubId:id(101)}),/CLUB_COACH_CATALOGUE_CHANGED/);
   await assert.rejects(init(2,{...offer,tier:'ruby-red',valueEur:5_000_000}),/CLUB_COACH_CATALOGUE_CHANGED/);
   committed=await lifecycle(offer);assert.equal((committed.state as {balanceEur:number}).balanceEur,90_000_000);
   initialized=await init(2,{id:'99991',tier:'sapphire-blue',valueEur:10_000_000,catalogueRevision:fresh.revision,cataloguePublicationId:entry.publicationId});
   assert.deepEqual(initialized.coach,{id:'99991',tier:'sapphire-blue',valueEur:10_000_000});
   assert.equal((await arena(3,'99991',id(100),'fresh_arena_hire',fresh.revision,entry.publicationId)).idempotentReplay,false);
   await assert.rejects(scalar('select touchline_hire_coach_contract($1,$2,$3,$4) result',[id(4),'99991',id(100),'legacy_missing_proof']),/CLUB_COACH_CATALOGUE_CHANGED/);
  });
  await publish('99992');
  await t.test('exact durable replay survives retirement and does not debit or rewrite history',async()=>{
   const replay=await lifecycle(offer);assert.equal(replay.replayed,true);assert.deepEqual(replay.state,committed!.state);
   assert.deepEqual(await init(2,{id:'99991',tier:'sapphire-blue',valueEur:10_000_000,catalogueRevision:fresh.revision,cataloguePublicationId:entry.publicationId}),initialized!);
   assert.equal((await arena(3,'99991',id(100),'fresh_arena_hire',fresh.revision,entry.publicationId)).idempotentReplay,true);
   assert.equal((await scalar('select touchline_hire_coach_contract($1,$2,$3,$4) result',[id(3),'99991',id(100),'fresh_arena_hire'])).idempotentReplay,true);
  });
  await t.test('retired contracts can still be released and a gate change rejects an in-flight published offer',async()=>{
   const release={action:'release-coach',currentCoachId:'99991',expectedRevision:1,idempotencyKey:'catalogue_release_1'};
   const result=await scalar('select touchline_club_coach_lifecycle($1,$2,$3::jsonb,null) result',[id(1),id(51),JSON.stringify(release)]);
   assert.equal((result.state as {coach:unknown}).coach,null);
   assert.equal((result.state as {balanceEur:number}).balanceEur,99_000_000);
   const current=await catalogue(),currentEntry=current.current.find(e=>e.coach.providerId==='99992')!;
   await db.exec('update touchline_coaches_private.configuration set public_enabled=false');
   await assert.rejects(arena(4,'99992',id(100),'gate_changed_hire',current.revision,currentEntry.publicationId),/CLUB_COACH_CATALOGUE_CHANGED/);
   assert.equal((await arena(3,'99991',id(100),'fresh_arena_hire',fresh.revision,entry.publicationId)).idempotentReplay,true);
  });
  await t.test('publication lock and post-replay guard are installed; customers cannot invoke proof helper',async()=>{
   const definitions=(await db.query<{signature:string;definition:string}>("select oid::regprocedure::text signature,pg_get_functiondef(oid) definition from pg_proc where proname in ('assert_hire','command','touchline_club_coach_lifecycle','touchline_club_initialize_collection','touchline_hire_coach_contract')")).rows;
   assert.match(definitions.find(d=>d.signature.startsWith('touchline_coaches_private.assert_hire'))!.definition,/configuration where singleton for share/i);
   assert.match(definitions.find(d=>d.signature.startsWith('touchline_coaches_private.command'))!.definition,/configuration where singleton for update/i);
   for(const name of ['touchline_club_coach_lifecycle','touchline_club_initialize_collection']){
    const definition=definitions.find(d=>d.signature.startsWith(name+'('))!.definition;assert.ok(definition.indexOf('return v_')<definition.indexOf('perform touchline_coaches_private.assert_hire'));
   }
   assert.equal((await db.query<{ok:boolean}>("select has_function_privilege('authenticated','touchline_coaches_private.assert_hire(text,uuid,text,integer,uuid)','EXECUTE') ok")).rows[0].ok,false);
  });
 }finally{await db.close();}
});
