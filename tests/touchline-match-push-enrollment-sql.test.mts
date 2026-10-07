import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { matchPushLiveEventWindow } from '../lib/touchlineArena/match-push-live-event-window.ts';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const device = '22222222-2222-4222-8222-222222222222';
const fixture = '33333333-3333-4333-8333-333333333333';
const owner = '44444444-4444-4444-8444-444444444444';
const period = { providerId: '77', fixtureId: '8', typeId: '1', countsFrom: 0,
  sortOrder: 1, started: 1000, ticking: true, hasTimer: true, minutes: 20, seconds: 30 };
const event = (id: string, minute: number) => ({ provider: 'sportmonks', providerId: id, fixtureId: '8', periodId: '77', minute, status: 'recorded', type:'Goal',teamId:'1',playerId:'2' });
test('actual SQL enrollment: baseline, admission, replay, epochs, source and ACL guards', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!); const db = new PGlite();
  try {
    await db.exec(`set timezone='UTC'; create role anon; create role authenticated; create role service_role bypassrls;
      create table notification_devices(id uuid primary key,user_id uuid,permission text,push_subscription jsonb,
        installation_id uuid default '55555555-5555-4555-8555-555555555555',last_seen_at timestamptz default now());
      create table football_fixtures(id uuid primary key,provider text,provider_fixture_id text);
      create table notification_preferences(user_id uuid primary key,channels jsonb,settings jsonb,frequency text,explicit_consent_at timestamptz,quiet_hours jsonb);
      create table touchline_fixture_alert_subscriptions(fixture_id uuid,user_id uuid,created_at timestamptz,primary key(fixture_id,user_id));
      create table football_fantasy_fixture_feeds(provider text,provider_fixture_id text,fixture_payload jsonb,events_payload jsonb,last_synced_at timestamptz,primary key(provider,provider_fixture_id));
      create table football_fixture_events(fixture_id uuid,provider text,provider_event_id text,event_type text,event_status text,minute integer,extra_minute integer,provider_team_id text,provider_player_id text,result text,info text,addition text,primary key(provider,provider_event_id));
      create table touchline_social_source_clock(singleton boolean primary key,revision bigint);
      create table touchline_social_confirmed_event_observations(fixture_provider_id text,event_provider_id text,confirmation_state text,
        stable_observation_count integer,first_observed_at timestamptz,last_observed_at timestamptz,confirmed_at timestamptz,event_fact_checksum text,primary key(fixture_provider_id,event_provider_id));
      insert into notification_devices(id,user_id,permission,push_subscription) values('${device}','${owner}','granted','{"endpoint":"synthetic","keys":{"auth":"synthetic"}}');
      insert into football_fixtures values('${fixture}','sportmonks','8');
      insert into notification_preferences values('${owner}','{"push":true}','{"goalsAndEvents":true}','realtime',now()-interval '1 minute','{"enabled":false}');
      insert into touchline_fixture_alert_subscriptions values('${fixture}','${owner}',now()-interval '1 minute');
      insert into touchline_social_source_clock values(true,1);
      grant usage on schema public to service_role;
      grant select,insert,update,delete on all tables in schema public to service_role;
      revoke update on touchline_fixture_alert_subscriptions from service_role;
      -- Reduced local fixture: trigger names/clock behavior only. Full installed
      -- source-trigger closure is independently tested by its own migration suite.
      create function fence() returns trigger language plpgsql as $$begin
        perform pg_advisory_xact_lock(hashtextextended('touchline-social-source-revision',0));
        update touchline_social_source_clock set revision=revision+1; return new; end$$;
      create trigger touchline_match_push_observation_revision after insert or update or delete on touchline_social_confirmed_event_observations for each row execute function fence();
      create trigger touchline_match_push_feed_freshness_revision after insert or update on football_fantasy_fixture_feeds for each row execute function fence();
      create trigger touchline_social_fixture_feed_invalidation after update of fixture_payload,events_payload on football_fantasy_fixture_feeds for each row execute function fence();
      create trigger touchline_social_fixture_feed_identity_revision after update of provider,provider_fixture_id on football_fantasy_fixture_feeds for each row execute function fence();
      create trigger touchline_social_fixture_feed_presence_revision after insert or delete on football_fantasy_fixture_feeds for each row execute function fence();`);
    for (const name of ['20260924222644_touchline_match_push_outbox.sql','20260927005940_touchline_match_push_subscription_binding.sql',
      '20260927023959_touchline_match_push_delivery_kind.sql','20261002003838_touchline_match_push_identity_ledger.sql','20261002010527_touchline_match_push_enrollment.sql']) {
      const migration=readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
      if(name.includes('enrollment')) {
        await db.exec(`begin;${migration}rollback;`);
        assert.equal((await db.query("select to_regclass('public.touchline_match_push_enrollments') v")).rows[0].v,null);
      }
      await db.exec(`begin;${migration}commit;`);
    }
    let current = { ...period };
    const events = [event('9',19)];
    const persist = async (state='2') => {
      await db.query(`insert into football_fantasy_fixture_feeds values('sportmonks','8',$1,$2,clock_timestamp())
        on conflict(provider,provider_fixture_id) do update set fixture_payload=excluded.fixture_payload,events_payload=excluded.events_payload,last_synced_at=excluded.last_synced_at`,
      [JSON.stringify({ provider:'sportmonks',providerId:'8',providerStateId:state,periods:[current] }),JSON.stringify(events)]);
      for(const item of events) await db.query(`insert into football_fixture_events(fixture_id,provider,provider_event_id,event_type,event_status,minute,provider_team_id,provider_player_id)
        values($1,'sportmonks',$2,'Goal','recorded',$3,'1','2') on conflict(provider,provider_event_id) do nothing`,[fixture,item.providerId,item.minute]);
    };
    const request = async (operation='prepare', id='10') => {
      const source = (await db.query(`select jsonb_build_object('fixture_payload',fixture_payload,'events_payload',events_payload,'last_synced_at',last_synced_at) v from football_fantasy_fixture_feeds`)).rows[0].v;
      const observation = (await db.query(`select to_jsonb(o) v from touchline_social_confirmed_event_observations o where event_provider_id=$1`,[id])).rows[0]?.v;
      return { operation,deviceId:device,fixtureId:fixture,expectedSource:source,expectedObservation:observation,
        expectedClockRevision:String((await db.query('select revision from touchline_social_source_clock')).rows[0].revision),
        expectedSubscription:(await db.query('select push_subscription from notification_devices')).rows[0].push_subscription,
        expectedQuietHours:{enabled:false},subscriptionFingerprint:'sha256:'+'f'.repeat(64), maximumEventLagSeconds:180, maximumSourceAgeSeconds:300,
        eventId:id,sourceChecksum:'sha256:'+'a'.repeat(64),sourceSnapshotAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),locale:'en-GB',generation:'1' };
    };
    const call = async (r: unknown) => (await db.query('select touchline_match_push_enrollment($1) v',[JSON.stringify(r)])).rows[0].v;
    const observe = async (id:string) => db.query(`insert into touchline_social_confirmed_event_observations values('8',$1,'CONFIRMED',2,clock_timestamp()-interval '30 seconds',clock_timestamp(),clock_timestamp(),$2)`,
      [id,'sha256:'+createHash('sha256').update(['8',id,'goal','','1','2',String(events.find(e=>e.providerId===id)!.minute),''].join('|')).digest('hex')]);
    await persist(); await db.exec('set role service_role');
    assert.equal((await call(await request())).status,'baselined');
    assert.equal((await db.query('select count(*)::int n from touchline_match_push_outbox')).rows[0].n,0);
    assert.equal((await call(await request())).status,'ready');
    current = {...period,minutes:23,seconds:0}; events.push(event('10',22)); await persist(); await observe('9'); await observe('10');
    assert.equal((await call(await request('admit','9'))).status,'suppressed');
    assert.equal((await call({...await request('admit'),expectedSubscription:{endpoint:'wrong'}})).status,'unavailable');
    assert.equal((await call({...await request('admit'),expectedSource:{}})).status,'stale-source');
    assert.equal((await call({...await request('admit'),expectedObservation:{}})).status,'unavailable');
    assert.equal((await call({...await request('admit'),expiresAt:new Date(Date.now()+600000).toISOString()})).status,'unavailable');
    await db.exec("update touchline_social_confirmed_event_observations set event_fact_checksum='sha256:'||repeat('0',64) where event_provider_id='10'");
    assert.equal((await call(await request('admit'))).status,'unavailable');
    await db.query("update touchline_social_confirmed_event_observations set event_fact_checksum=$1 where event_provider_id='10'",
      ['sha256:'+createHash('sha256').update('8|10|goal||1|2|22|').digest('hex')]);
    await db.exec("update football_fixture_events set event_status='rescinded' where provider_event_id='10'");
    assert.equal((await call(await request('admit'))).status,'unavailable');
    await db.exec("update football_fixture_events set event_status='recorded' where provider_event_id='10'");
    const req=await request('admit'); const admitted=await call(req);
    assert.equal(admitted.status,'stored-or-existing');
    assert.equal((await db.query('select delivery_kind from touchline_match_push_outbox')).rows[0].delivery_kind,'initial');
    assert.deepEqual(await call(req),admitted);
    const epoch = async () => (await db.query(`select generation::text,needs_baseline from touchline_match_push_enrollments`)).rows[0];
    const interestBefore=(await db.query('select created_at::text v from touchline_fixture_alert_subscriptions')).rows[0].v;
    assert.deepEqual(await epoch(),{generation:'1',needs_baseline:false});
    assert.equal((await db.query('select enrollment_generation::text v from touchline_match_push_outbox')).rows[0].v,'1');
    await assert.rejects(db.exec('update touchline_match_push_outbox set enrollment_generation=2'),/PUSH_ENROLLMENT_IDENTITY_IMMUTABLE/);
    // Each ABA is one transaction: timestamps and final values are unchanged.
    // A newly granted epoch must never resurrect the already queued receipt.
    for (const mutation of [
      `update notification_preferences set channels='{"push":false}'; update notification_preferences set channels='{"push":true}'`,
      `update notification_preferences set settings='{"goalsAndEvents":false}'; update notification_preferences set settings='{"goalsAndEvents":true}'`,
      `update notification_preferences set frequency='paused'; update notification_preferences set frequency='realtime'`,
      `update notification_preferences set explicit_consent_at=null; update notification_preferences set explicit_consent_at=(select consent_at from touchline_match_push_enrollments)`,
      `delete from touchline_fixture_alert_subscriptions; insert into touchline_fixture_alert_subscriptions select fixture_id,'${owner}',interest_created_at from touchline_match_push_enrollments`,
      `update notification_devices set permission='denied',push_subscription=null; update notification_devices set permission='granted',push_subscription=(select subscription from touchline_match_push_enrollments)`,
      `update notification_devices set push_subscription='{"endpoint":"replacement"}'; update notification_devices set push_subscription=(select subscription from touchline_match_push_enrollments)`,
      `update notification_devices set installation_id='66666666-6666-4666-8666-666666666666'; update notification_devices set installation_id='55555555-5555-4555-8555-555555555555'`,
      `update notification_devices set user_id='66666666-6666-4666-8666-666666666666'; update notification_devices set user_id='${owner}'`,
    ]) {
      await db.exec('begin; savepoint epoch_case');
      await db.exec(mutation);
      assert.deepEqual(await epoch(),{generation:'3',needs_baseline:true},mutation);
      assert.equal((await db.query('select enrollment_generation::text v from touchline_match_push_outbox')).rows[0].v,'1');
      const baseline=await call(await request());
      assert.equal(baseline.status,'baselined'); assert.equal(baseline.generation,'4');
      assert.deepEqual(await epoch(),{generation:'4',needs_baseline:false});
      assert.equal((await call(req)).status,'stale-baseline');
      assert.equal((await db.query("select excluded_event_ids @> array['9','10'] v from touchline_match_push_enrollments")).rows[0].v,true);
      assert.equal((await db.query('select count(*)::int n from touchline_match_push_identity_ledger')).rows[0].n,1);
      assert.equal((await db.query('select created_at::text v from touchline_fixture_alert_subscriptions')).rows[0].v,interestBefore,'admission never rewrites interest time');
      await db.exec('rollback to epoch_case; commit');
      assert.deepEqual(await epoch(),{generation:'1',needs_baseline:false});
    }
    await db.exec(`update notification_preferences set channels=channels,settings=settings,frequency=frequency,explicit_consent_at=explicit_consent_at;
      update notification_preferences set settings=settings||'{"marketing":true}',channels=channels||'{"in_app":true}';
      update notification_devices set permission=permission,push_subscription=push_subscription,last_seen_at=clock_timestamp()`);
    assert.deepEqual(await epoch(),{generation:'1',needs_baseline:false},'irrelevant/no-op changes do not cancel legitimate alerts');
    await db.exec(`update notification_preferences set settings='{"goalsAndEvents":true}',channels='{"push":true}'`);
    await db.exec('begin');
    await db.exec(`update notification_preferences set channels='{"push":false}'; update notification_preferences set channels='{"push":true}'`);
    const renewed=await call(await request());
    assert.equal(renewed.status,'baselined');
    const priorCurrent=current;
    current={...period,minutes:25,seconds:0}; events.push(event('11',24));
    await persist(); await observe('11');
    assert.equal((await call({...await request('admit','11'),generation:renewed.generation})).status,'stored-or-existing');
    assert.deepEqual((await db.query('select provider_event_id,enrollment_generation::text generation from touchline_match_push_outbox order by provider_event_id')).rows,
      [{provider_event_id:'10',generation:'1'},{provider_event_id:'11',generation:renewed.generation}],
      'new valid alerts retain their own epoch; old queue identity is never upgraded');
    await db.exec('rollback'); events.pop(); current=priorCurrent;
    await db.exec('begin');
    await db.query(`select touchline_enqueue_match_push($1,$2,'99',$3,clock_timestamp(),'{}',clock_timestamp()+interval '1 minute',$4,true)`,
      [device,fixture,'sha256:'+'c'.repeat(64),'sha256:'+'f'.repeat(64)]);
    assert.equal((await db.query("select enrollment_generation from touchline_match_push_outbox where provider_event_id='99'")).rows[0].enrollment_generation,null,
      'legacy enqueue remains unbound, never inherits the active epoch');
    await assert.rejects(db.exec("update touchline_match_push_outbox set enrollment_generation=1 where provider_event_id='99'"),/PUSH_ENROLLMENT_IDENTITY_IMMUTABLE/);
    await db.exec('rollback');
    await db.exec('begin; delete from notification_devices');
    for(const table of ['touchline_match_push_enrollments','touchline_match_push_outbox','touchline_match_push_identity_ledger'])
      assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0,'device deletion preserves cascade cleanup');
    await db.exec('rollback');
    await db.exec('reset role');
    assert.equal((await db.query(`select has_column_privilege('service_role','touchline_fixture_alert_subscriptions','created_at','UPDATE') v`)).rows[0].v,true);
    assert.equal((await db.query(`select has_column_privilege('service_role','touchline_fixture_alert_subscriptions','user_id','UPDATE') v`)).rows[0].v,false);
    assert.equal((await db.query(`select has_column_privilege('service_role','touchline_fixture_alert_subscriptions','fixture_id','UPDATE') v`)).rows[0].v,false);
    for(const role of ['anon','authenticated'])
      assert.equal((await db.query(`select has_column_privilege($1,'touchline_fixture_alert_subscriptions','created_at','UPDATE') v`,[role])).rows[0].v,false);
    for(const role of ['anon','authenticated','service_role']) {
      assert.equal((await db.query(`select has_function_privilege($1,'touchline_match_push_invalidate_enrollment()','EXECUTE') v`,[role])).rows[0].v,false);
    }
    await db.exec('set role service_role');
    await db.exec('reset role; delete from touchline_match_push_outbox; set role service_role');
    assert.deepEqual(await call(req),admitted);
    assert.equal((await db.query('select count(*)::int n from touchline_match_push_outbox')).rows[0].n,0);
    const stale=await request('admit'); await persist(); assert.equal((await call(stale)).status,'stale-source');
    assert.equal((await call({...await request('admit'),generation:'999'})).status,'stale-baseline');
    await db.exec(`delete from touchline_fixture_alert_subscriptions; insert into touchline_fixture_alert_subscriptions values('${fixture}','${owner}',clock_timestamp())`);
    assert.equal((await call(await request('admit'))).status,'baselined');
    assert.equal((await db.query('select count(*)::int n from touchline_match_push_identity_ledger')).rows[0].n,1);
    await db.exec(`update notification_devices set push_subscription='{"endpoint":"replacement"}'`);
    assert.equal((await call(await request())).status,'baselined');
    await db.exec(`update notification_preferences set channels='{"push":false}'`);
    assert.equal((await call(await request())).status,'unavailable');
    await db.exec(`update notification_preferences set channels='{"push":true}'`);
    await db.exec("update notification_preferences set explicit_consent_at='-infinity'");
    assert.equal((await call(await request())).status,'unavailable');
    await db.exec("update notification_preferences set explicit_consent_at=clock_timestamp()-interval '1 minute'");
    await persist('22'); assert.equal((await call(await request())).status,'unavailable');
    await persist(); current={...current,minutes:18}; await persist();
    assert.equal((await call(await request())).status,'baselined','clock regression must exclude current known events again');
    await db.exec("update football_fantasy_fixture_feeds set last_synced_at=clock_timestamp()-interval '1 hour'");
    assert.equal((await call(await request())).status,'unavailable');
    await db.exec('reset role; begin; alter table football_fantasy_fixture_feeds disable trigger touchline_social_fixture_feed_invalidation; set role service_role');
    await assert.rejects(call(await request()),/PUSH_SOURCE_FENCE_UNAVAILABLE/);
    await db.exec('rollback; reset role');
    await db.exec('reset role; set role authenticated');
    await assert.rejects(call({}),/permission denied/);
    await assert.rejects(db.query('select * from touchline_match_push_enrollments'),/permission denied/);
    await db.exec('reset role; set role anon'); await assert.rejects(call({}),/permission denied/);
  } finally { await db.close(); }
});

test('SQL temporal helper agrees with actual TS on deterministic clock matrix', { skip: !modulePath }, async () => {
  const { PGlite }=await import(modulePath!); const db=new PGlite();
  try {
    const sql=readFileSync(new URL('../supabase/migrations/20261002010527_touchline_match_push_enrollment.sql',import.meta.url),'utf8');
    await db.exec(sql.slice(0,sql.indexOf('create table public.touchline_match_push_enrollments')));
    const current={...period,minutes:23,seconds:0};
    const base={fixtureId:'8',live:true,confirmed:true,periods:[current],baseline:period,current,event:{periodId:'77',minute:22},maximumEventLagSeconds:120};
    const second={...period,providerId:'78',typeId:'2',countsFrom:45,sortOrder:2,started:5000,minutes:48,seconds:0};
    const cases=[base,...[19,20,21,23,24].map(minute=>({...base,event:{periodId:'77',minute}})),
      {...base,maximumEventLagSeconds:59}, {...base,current:{...current,minutes:19},periods:[{...current,minutes:19}]},
      {...base,periods:[current,current]}, {...base,event:{periodId:'99',minute:22}},
      {...base,baseline:{...period,minutes:45},current:{...current,minutes:48},periods:[{...current,minutes:48}],event:{periodId:'77',minute:45,extraMinute:2}},
      {...base,current:second,periods:[{...period,ticking:false,hasTimer:false,ended:4000,minutes:48},second],event:{periodId:'78',minute:47}},
      {...base,current:second,periods:[{...period,ticking:false,ended:6000,minutes:48},second],event:{periodId:'78',minute:47}}];
    for(const value of cases) {
      const actual=(await db.query('select touchline_match_push_window($1,$2,$3,$4,$5,$6) v',
        [value.fixtureId,JSON.stringify(value.periods),JSON.stringify(value.baseline),JSON.stringify(value.current),JSON.stringify(value.event),value.maximumEventLagSeconds])).rows[0].v;
      assert.equal(actual,matchPushLiveEventWindow(value).status,JSON.stringify(value));
    }
  } finally { await db.close(); }
});
