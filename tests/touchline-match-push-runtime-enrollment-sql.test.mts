import assert from 'node:assert/strict';
import { createECDH, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as freshness from '../lib/touchlineArena/match-push-source-freshness.ts';
import * as registration from '../lib/touchlineArena/push-device-contract.ts';
import * as fingerprint from '../lib/touchlineArena/push-subscription-fingerprint.ts';
import * as quiet from '../lib/touchlineArena/notification-quiet-hours.ts';
import * as notification from '../lib/touchlineArena/match-event-notification.ts';
import * as window from '../lib/touchlineArena/match-push-live-event-window.ts';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const fixture='11111111-1111-4111-8111-111111111111', device='22222222-2222-4222-8222-222222222222', user='33333333-3333-4333-8333-333333333333';
const period={providerId:'77',fixtureId:'8',typeId:'1',started:1000,countsFrom:0,sortOrder:1,minutes:20,seconds:0,ticking:true,hasTimer:true};
const event=(id:string,minute:number)=>({provider:'sportmonks',providerId:id,fixtureId:'8',periodId:'77',minute,status:'recorded',type:'Goal',teamId:'1',playerId:'2'});
const sha=(text:string)=>'sha256:'+createHash('sha256').update(text).digest('hex');
type Row=Record<string,unknown>;

// Real runtime, enrollment/ledger SQL and 10540 source fence. Reduced schemas
// and a semantic-feed 039 stand-in are explicit: this is NOT hosted PostgREST,
// full editorial-reader integration, multi-session concurrency or delivery proof.
test('runtime producer composes with real enrollment SQL: baseline, eligible event, replay, exclusion and source race', {skip:!modulePath},async()=>{
  const {PGlite}=await import(modulePath!); const db=new PGlite();
  try {
    await db.exec(`set timezone='UTC'; create role anon; create role authenticated; create role service_role bypassrls;
      create table notification_devices(id uuid primary key,user_id uuid,installation_id uuid,permission text,push_subscription jsonb);
      create table football_fixtures(id uuid primary key,provider text,provider_fixture_id text);
      create table notification_preferences(user_id uuid primary key,channels jsonb,settings jsonb,frequency text,explicit_consent_at timestamptz,quiet_hours jsonb);
      create table touchline_fixture_alert_subscriptions(fixture_id uuid,user_id uuid,created_at timestamptz,primary key(fixture_id,user_id));
      create table football_fantasy_fixture_feeds(provider text,provider_fixture_id text,fixture_payload jsonb,events_payload jsonb,last_synced_at timestamptz,primary key(provider,provider_fixture_id));
      create table football_fixture_events(fixture_id uuid,provider text,provider_event_id text,event_type text,event_status text,minute integer,extra_minute integer,provider_team_id text,provider_player_id text,result text,info text,addition text,primary key(provider,provider_event_id));
      create table touchline_social_source_clock(singleton boolean primary key,revision bigint,updated_at timestamptz);
      create table touchline_social_source_revisions(source_key text primary key,revision bigint,last_reason_code text,updated_at timestamptz);
      create table touchline_social_confirmed_event_observations(fixture_provider_id text,event_provider_id text,confirmation_state text,stable_observation_count integer,
        first_observed_at timestamptz,last_observed_at timestamptz,confirmed_at timestamptz,event_fact_checksum text,primary key(fixture_provider_id,event_provider_id));
      insert into touchline_social_source_clock values(true,1,now());
      insert into football_fixtures values('${fixture}','sportmonks','8');
      insert into notification_preferences values('${user}','{"push":true}','{"goalsAndEvents":true}','realtime',now()-interval '1 minute','{"enabled":false,"start":"22:00","end":"07:00","timezone":"UTC"}');
      insert into touchline_fixture_alert_subscriptions values('${fixture}','${user}',now()-interval '1 minute');
      grant usage on schema public to service_role;
      grant select,insert,update,delete on all tables in schema public to service_role;
      revoke update on touchline_fixture_alert_subscriptions from service_role;
      -- Minimal substitute for 039's unrelated social invalidation graph only.
      create function synthetic_semantic_feed_fence() returns trigger language plpgsql as $$begin
        perform pg_advisory_xact_lock(hashtextextended('touchline-social-source-revision',0));
        update touchline_social_source_clock set revision=revision+1,updated_at=clock_timestamp(); return new; end$$;
      create trigger touchline_social_fixture_feed_invalidation after update of fixture_payload,events_payload on football_fantasy_fixture_feeds for each row execute function synthetic_semantic_feed_fence();
      create trigger touchline_social_fixture_feed_identity_revision after update of provider,provider_fixture_id on football_fantasy_fixture_feeds for each row execute function synthetic_semantic_feed_fence();
      create trigger touchline_social_fixture_feed_presence_revision after insert or delete on football_fantasy_fixture_feeds for each row execute function synthetic_semantic_feed_fence();`);
    const key=createECDH('prime256v1');key.setPrivateKey(Buffer.alloc(32,1));
    const subscription={endpoint:'https://push.example.test/local-only',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}};
    await db.query('insert into notification_devices values($1,$2,$1,\'granted\',$3)',[device,user,JSON.stringify(subscription)]);
    for(const name of ['20260924222644_touchline_match_push_outbox.sql','20260927005940_touchline_match_push_subscription_binding.sql',
      '20260927023959_touchline_match_push_delivery_kind.sql','20261002003838_touchline_match_push_identity_ledger.sql',
      '20261002010527_touchline_match_push_enrollment.sql','20261002010540_touchline_match_push_source_fence.sql',
      '20261002052449_touchline_match_push_source_key_deduplication.sql']) {
      await db.exec(`begin;${readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')}commit;`);
    }
    const events=[event('9',19)]; let current={...period};
    const persist=async()=>{
      await db.query(`insert into football_fantasy_fixture_feeds values('sportmonks','8',$1,$2,clock_timestamp())
        on conflict(provider,provider_fixture_id) do update set fixture_payload=excluded.fixture_payload,events_payload=excluded.events_payload,last_synced_at=excluded.last_synced_at`,
        [JSON.stringify({provider:'sportmonks',providerId:'8',providerStateId:'2',periods:[current]}),JSON.stringify(events)]);
      for(const e of events) await db.query(`insert into football_fixture_events(fixture_id,provider,provider_event_id,event_type,event_status,minute,provider_team_id,provider_player_id)
        values($1,'sportmonks',$2,'Goal','recorded',$3,'1','2') on conflict(provider,provider_event_id) do update set minute=excluded.minute`,[fixture,e.providerId,e.minute]);
    };
    const confirm=async(id:string)=>{
      const e=events.find(e=>e.providerId===id)!;
      await db.query(`insert into touchline_social_confirmed_event_observations values('8',$1,'CONFIRMED',2,clock_timestamp()-interval '30 seconds',clock_timestamp(),clock_timestamp(),$2)
        on conflict(fixture_provider_id,event_provider_id) do update set event_fact_checksum=excluded.event_fact_checksum,last_observed_at=excluded.last_observed_at,confirmed_at=excluded.confirmed_at`,
        [id,sha(['8',id,'goal','','1','2',String(e.minute),''].join('|'))]);
    };
    const clock=async()=>Number((await db.query('select revision from touchline_social_source_clock')).rows[0].revision);
    const checkpoint=async(keys:readonly string[])=>({clockRevision:await clock(),checksum:sha('synthetic-reader-checkpoint'),manifest:Object.fromEntries(keys.map(k=>[k,1]))});
    const receipts:{operation:unknown;eventId:unknown;data:Row}[]=[]; const bridgeErrors:unknown[]=[];
    let race=false;
    const columns:Record<string,string>={
      football_fixtures:'id,provider,provider_fixture_id',touchline_fixture_alert_subscriptions:'fixture_id,user_id,created_at',
      notification_devices:'id,user_id,installation_id,permission,push_subscription',notification_preferences:'user_id,channels,settings,frequency,explicit_consent_at,quiet_hours',
      football_fantasy_fixture_feeds:'provider,provider_fixture_id,fixture_payload,events_payload,last_synced_at',touchline_social_confirmed_event_observations:'*'};
    const filters:Record<string,readonly string[]>={football_fixtures:['provider','provider_fixture_id'],touchline_fixture_alert_subscriptions:['fixture_id'],
      notification_devices:['user_id'],notification_preferences:['user_id'],football_fantasy_fixture_feeds:['provider','provider_fixture_id'],touchline_social_confirmed_event_observations:['fixture_provider_id']};
    const admin={from(table:string){
      assert.ok(table in columns); const clauses:string[]=[], values:unknown[]=[];let cap=0;
      const query={select(projection:string,options:{count:string}){assert.equal(projection,columns[table]);assert.equal(options.count,'exact');return query;},
        eq(name:string,value:unknown){assert.ok(filters[table].includes(name));values.push(value);clauses.push(`${name}::text=$${values.length}`);return query;},
        in(name:string,value:unknown[]){assert.ok(filters[table].includes(name));values.push(value);clauses.push(`${name}::text=any($${values.length}::text[])`);return query;},
        limit(value:number){assert.ok(Number.isSafeInteger(value)&&value>0&&value<=501);cap=value;return query;},
        async abortSignal(signal:AbortSignal){
          assert.equal(signal.aborted,false);
          try {
            assert.ok(cap>0&&clauses.length>0);
            const where=clauses.join(' and ');
            const count=Number((await db.query(`select count(*)::int n from ${table} where ${where}`,values)).rows[0].n);
            // PostgreSQL JSON preserves exact stored timestamptz precision for
            // the same JSONB comparison performed inside admission. No Date
            // roundtrip or synthetic/canned enrollment response.
            const rows=(await db.query(`select to_jsonb(t) payload from (select ${columns[table]} from ${table} where ${where} limit ${cap}) t`,values)).rows;
            return {data:rows.map((r:{payload:unknown})=>r.payload),count,error:null};
          } catch(error){bridgeErrors.push(error);throw error;}
        }}; return query;
    },rpc(name:string,args:{p_request:Row}){
      assert.equal(name,'touchline_match_push_enrollment');
      return {async abortSignal(signal:AbortSignal){
        assert.equal(signal.aborted,false);
        try {
          if(race&&args.p_request.operation==='admit') {race=false;await db.exec('update football_fantasy_fixture_feeds set last_synced_at=clock_timestamp()');}
          const data=(await db.query('select public.touchline_match_push_enrollment($1) payload',[JSON.stringify(args.p_request)])).rows[0].payload;
          receipts.push({operation:args.p_request.operation,eventId:args.p_request.eventId,data});return {data,error:null};
        } catch(error){bridgeErrors.push(error);throw error;}
      }};
    }};
    // Editorial reader/checkpoint are intentionally boundary doubles. They
    // derive fixture/event/clock/timestamps from this DB but do not prove the
    // full publication/rating reader graph. Pure rendering/policy remain real.
    const readSource=async(fixtureId:string,eventId:string)=>{
      assert.equal(fixtureId,'8'); const e=events.find(e=>e.providerId===eventId);assert.ok(e);
      const stamp=(await db.query("select to_jsonb(last_synced_at) t from football_fantasy_fixture_feeds where provider_fixture_id='8'")).rows[0].t as string;
      const cp=await checkpoint(['fixture-provider:8']);
      return {ok:true,data:{sourceProvenance:'PERSISTED_VERIFIED_CONFIRMED_EVENT',fixtureId,eventId,home:{name:'Arsenal'},away:{name:'Chelsea'},score:{home:1,away:0},
        event:{kind:'goal',playerName:'Synthetic player',minute:e.minute,extraMinute:null},matchRating:8.2,touchlinePoints:8.2,
        sourceChecksum:sha('render:'+eventId),sourceSnapshotAt:stamp,sourceRevisionManifest:cp.manifest,sourceRevisionChecksum:cp.checksum,contentType:'GOAL_CONFIRMED'},
        evidence:{canonicalFixtureId:fixture,fixtureProviderId:'8',eventProviderId:eventId,clockRevision:cp.clockRevision,
          eventSyncedAt:stamp,settlementSyncedAt:stamp,fixtureUpdatedAt:stamp,lastObservedAt:stamp}};
    };
    const dependencies:Record<string,unknown>={'server-only':{},'../touchlineArena/social-confirmed-event-draft-server':{readTouchlineConfirmedEventPushSource:readSource},
      '../touchlineArena/social-source-revision-server':{readTouchlineSocialSourceRevisionCheckpoint:checkpoint},
      '../touchlineArena/match-push-source-freshness':freshness,'../touchlineArena/push-device-contract':registration,
      '../touchlineArena/push-subscription-fingerprint':fingerprint,'../touchlineArena/notification-quiet-hours':quiet,
      '../touchlineArena/match-event-notification':notification,'../touchlineArena/match-push-live-event-window':window};
    const exports:{runMatchPushProducer?:(input:unknown)=>Promise<Row>}={};
    const javascript=ts.transpileModule(readFileSync(new URL('../lib/football-data/match-push-producer.ts',import.meta.url),'utf8'),
      {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(javascript,{exports,Buffer,AbortController,performance,setTimeout,clearTimeout,require(name:string){assert.ok(name in dependencies,name);return dependencies[name];}});
    const run=()=>exports.runMatchPushProducer!({admin,fixtureProviderIds:['8'],enabled:true,signal:new AbortController().signal,locale:'en-GB',now:()=>new Date(),
      policy:{maximumEventLagSeconds:180,maximumSourceAgeSeconds:300,sourceAgeMs:Object.fromEntries(freshness.MATCH_PUSH_SOURCE_TIMES.map(k=>[k,300000]))}});
    const count=async(table:'touchline_match_push_outbox'|'touchline_match_push_identity_ledger')=>Number((await db.query(`select count(*)::int n from ${table}`)).rows[0].n);
    await persist();await db.exec('set role service_role');
    const first=await run();assert.equal(first.status,'completed');assert.equal(first.baselined,1);assert.equal(await count('touchline_match_push_outbox'),0);
    assert.equal(await count('touchline_match_push_identity_ledger'),0);assert.equal(receipts.length,1);
    // Existing ID corrected into a recent minute remains excluded. It appears
    // before the genuinely new ID, exercising SQL suppressed -> continue.
    events[0]=event('9',22);events.push(event('10',22));current={...period,minutes:23};await persist();await confirm('9');await confirm('10');
    const next=await run();assert.equal(next.status,'completed');assert.equal(next.storedOrExisting,1);
    assert.ok(receipts.some(r=>r.eventId==='9'&&r.data.status==='suppressed'));
    assert.ok(receipts.some(r=>r.eventId==='10'&&r.data.status==='stored-or-existing'));
    assert.equal(await count('touchline_match_push_outbox'),1);assert.equal(await count('touchline_match_push_identity_ledger'),1);
    const queue=(await db.query('select id,provider_event_id,delivery_kind from touchline_match_push_outbox')).rows[0];
    assert.equal(queue.provider_event_id,'10');assert.equal(queue.delivery_kind,'initial');
    assert.equal((await run()).status,'completed');assert.equal(await count('touchline_match_push_outbox'),1);
    assert.equal((await db.query('select id from touchline_match_push_outbox')).rows[0].id,queue.id);
    const before=await clock();race=true;
    assert.equal((await run()).status,'unavailable');
    assert.ok(await clock()>before,'real freshness trigger must advance the global revision');
    assert.equal(receipts.at(-1)!.data.status,'stale-source');assert.equal(await count('touchline_match_push_outbox'),1);
    assert.equal(await count('touchline_match_push_identity_ledger'),1);assert.deepEqual(bridgeErrors,[]);
  } finally {await db.close();}
});
