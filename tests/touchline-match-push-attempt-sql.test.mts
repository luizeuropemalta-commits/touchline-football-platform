import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dispatchMatchPush } from '../lib/touchlineArena/match-push-dispatch.ts';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const migration = readFileSync(new URL('../supabase/migrations/20260927042148_touchline_match_push_attempt_reservation.sql', import.meta.url), 'utf8');
const id = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';
const nonce = '33333333-3333-4333-8333-333333333333';
const other = '44444444-4444-4444-8444-444444444444';

test('attempt reservation is one-shot and completion belongs only to its nonce', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.touchline_match_push_outbox(id uuid primary key, state text,
        lease_token uuid, lease_until timestamptz, expires_at timestamptz,
        delivery_kind text, subscription_fingerprint text, completed_at timestamptz);
      grant select,update on public.touchline_match_push_outbox to service_role;
      insert into public.touchline_match_push_outbox values('${id}','claimed','${token}',
        now()+interval '1 hour',now()+interval '1 hour','initial','sha256:'||repeat('a',64),null);`);
    await db.exec(`begin;${migration}commit;set role service_role;`);
    for (const assignment of [`attempt_id='${nonce}'`, 'attempt_started_at=now()', `attempt_id='${nonce}',attempt_started_at='infinity'`]) {
      await assert.rejects(db.exec(`update public.touchline_match_push_outbox set ${assignment}`), /touchline_match_push_attempt_pair/);
    }
    const reserve = async (t = token, n = nonce) => (await db.query(`select public.touchline_reserve_match_push_attempt($1,$2,$3) as ok`, [id,t,n])).rows[0].ok;
    const finish = async (n: string) => (await db.query(`select public.touchline_finish_match_push_attempt($1,$2,$3,'provider_accepted') as ok`, [id,token,n])).rows[0].ok;
    assert.equal(await reserve(other), false);
    assert.equal((await db.query(`select public.touchline_finish_match_push($1,$2,'provider_accepted') as ok`, [id,token])).rows[0].ok, false);
    for (const assignment of ["delivery_kind=null", "subscription_fingerprint=null", "lease_until=now()-interval '1 second'", "expires_at=now()-interval '1 second'"]) {
      await db.exec('begin');
      await db.exec(`update public.touchline_match_push_outbox set ${assignment}`);
      assert.equal(await reserve(), false);
      assert.equal((await db.query('select attempt_id from public.touchline_match_push_outbox')).rows[0].attempt_id,null);
      await db.exec('rollback');
    }
    await db.exec('begin');
    assert.equal(await reserve(),true);
    await db.exec('rollback');
    assert.equal((await db.query('select attempt_id from public.touchline_match_push_outbox')).rows[0].attempt_id,null);
    assert.equal(await reserve(), true);
    assert.equal(await reserve(), false);
    assert.equal(await reserve(token,other), false);
    assert.equal(await finish(other), false);
    assert.equal((await db.query(`select public.touchline_finish_match_push($1,$2,'cancelled') as ok`, [id,token])).rows[0].ok, false);
    await assert.rejects(db.exec(`update public.touchline_match_push_outbox set attempt_id=null,attempt_started_at=null`), /PUSH_ATTEMPT_IMMUTABLE/);
    assert.equal(await finish(nonce), true);
    assert.equal(await finish(nonce), false);
    const row = (await db.query(`select state,attempt_id,isfinite(attempt_started_at) as finite from public.touchline_match_push_outbox`)).rows[0];
    assert.deepEqual(row, {state:'provider_accepted',attempt_id:nonce,finite:true});
    await db.exec('reset role');
    for (const role of ['anon','authenticated','service_role']) {
      const rights = (await db.query(`select has_function_privilege($1,'public.touchline_reserve_match_push_attempt(uuid,uuid,uuid)','EXECUTE') as reserve,
        has_function_privilege($1,'public.touchline_finish_match_push_attempt(uuid,uuid,uuid,text)','EXECUTE') as finish,
        has_function_privilege($1,'public.touchline_finish_match_push(uuid,uuid,text)','EXECUTE') as legacy,
        has_function_privilege($1,'public.touchline_guard_match_push_attempt()','EXECUTE') as guard`, [role])).rows[0];
      assert.deepEqual(rights, {reserve:role==='service_role',finish:role==='service_role',legacy:role==='service_role',guard:false});
    }
  } finally { await db.close(); }
});

test('complete outbox migration chain preserves reserved attempt through expired-lease cleanup', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  const device = '55555555-5555-4555-8555-555555555555';
  const fixture = '66666666-6666-4666-8666-666666666666';
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create table public.notification_devices(id uuid primary key,user_id uuid,permission text,push_subscription jsonb);
      create table public.football_fixtures(id uuid primary key);
      create table public.notification_preferences(user_id uuid,channels jsonb,settings jsonb,frequency text,explicit_consent_at timestamptz);
      create table public.touchline_fixture_alert_subscriptions(user_id uuid,fixture_id uuid);
      insert into public.notification_devices values('${device}','${other}','granted','{}');
      insert into public.football_fixtures values('${fixture}');
      insert into public.notification_preferences values('${other}','{"push":true}','{"goalsAndEvents":true}','realtime',now());
      insert into public.touchline_fixture_alert_subscriptions values('${other}','${fixture}');
      grant select,update on public.notification_devices to service_role;
      grant select on public.notification_preferences,public.touchline_fixture_alert_subscriptions to service_role;`);
    for (const filename of ['20260924222644_touchline_match_push_outbox.sql','20260927005940_touchline_match_push_subscription_binding.sql','20260927023959_touchline_match_push_delivery_kind.sql','20260927042148_touchline_match_push_attempt_reservation.sql']) {
      const sql = readFileSync(new URL('../supabase/migrations/'+filename, import.meta.url),'utf8');
      await db.exec(`begin;${sql}commit;`);
    }
    await db.exec('set role service_role');
    const queued = (await db.query(`select public.touchline_enqueue_match_push($1,$2,'9','sha256:'||repeat('a',64),now(),'{}',now()+interval '1 hour','sha256:'||repeat('b',64),true) id`,[device,fixture])).rows[0].id;
    const claim = (await db.query('select * from public.touchline_claim_match_push_batch(1)')).rows[0];
    assert.equal(claim.id,queued);
    assert.equal(claim.attempt_id,null);
    let reserveCalls=0,transportCalls=0,finishCalls=0;
    let sqlGrant:unknown;
    let loseReceipt=true;
    const httpCalls:Array<{name:string;args:Record<string,unknown>;method:unknown}>=[];
    const admin=createClient('https://synthetic.example.test','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{
      const name=new URL(String(url)).pathname.split('/').at(-1)!;
      const args=JSON.parse(String(init?.body));
      httpCalls.push({name,args,method:init?.method});
      let query:string,values:unknown[];
      if(name==='touchline_reserve_match_push_attempt') {
        query='select public.touchline_reserve_match_push_attempt($1,$2,$3) ok';values=[args.p_id,args.p_lease_token,args.p_attempt_id];
      } else if(name==='touchline_finish_match_push_attempt') {
        query='select public.touchline_finish_match_push_attempt($1,$2,$3,$4) ok';values=[args.p_id,args.p_lease_token,args.p_attempt_id,args.p_state];
      } else if(name==='touchline_finish_match_push') {
        query='select public.touchline_finish_match_push($1,$2,$3) ok';values=[args.p_id,args.p_lease_token,args.p_state];
      } else throw new Error('unexpected RPC');
      const result=(await db.query(query,values)).rows[0].ok;
      if(name==='touchline_reserve_match_push_attempt')sqlGrant=result;
      if(loseReceipt)throw new Error('synthetic post-commit response loss');
      return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
    }}});
    const adapter:Record<string,(...args:unknown[])=>Promise<unknown>>={};
    const adapterJs=ts.transpileModule(readFileSync(new URL('../lib/touchlineArena/match-push-attempt-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(adapterJs,{exports:adapter,require:(name:string)=>{
      if(name==='server-only')return {};
      if(name==='@/lib/supabase/admin')return {createAdminClient:()=>admin};
      throw new Error('unexpected import');
    },Error});
    const digest='sha256:'+'b'.repeat(64);
    const dispatchResult=await dispatchMatchPush({id:queued,leaseToken:claim.lease_token,
      leaseUntil:new Date(claim.lease_until).toISOString(),expiresAt:new Date(claim.expires_at).toISOString()}, {
      enabled:true,attemptId:nonce,now:()=>new Date(),
      loadFresh:async()=>({policy:{sourceChecksum:digest,currentSourceChecksum:digest,sourceVerified:true,
        fixtureOptedIn:true,permission:'granted',subscriptionUnchanged:true,
        queuedSubscriptionFingerprint:digest,currentSubscriptionFingerprint:digest,
        channels:{push:true},settings:{goalsAndEvents:true},frequency:'realtime',
        explicitConsentAt:new Date(0).toISOString(),quietHours:{enabled:false,start:'22:00',end:'07:00',timezone:'UTC'}},
        deliver:async()=>{transportCalls++;return 'provider_accepted';}}),
      reserve:async(received,attempt,signal)=>{
        reserveCalls++;
        return await adapter.reserveMatchPushAttempt(received,attempt,{enabled:true,signal}) as boolean;
      },
      finish:async()=>{finishCalls++;return true;},
    });
    assert.equal(sqlGrant,true);
    assert.equal(dispatchResult,'reservation-unconfirmed');
    assert.deepEqual([reserveCalls,transportCalls,finishCalls],[1,0,0]);
    assert.deepEqual(httpCalls,[{name:'touchline_reserve_match_push_attempt',method:'POST',args:{p_id:queued,p_lease_token:claim.lease_token,p_attempt_id:nonce}}]);
    loseReceipt=false;
    const before = (await db.query('select attempt_id,attempt_started_at from public.touchline_match_push_outbox')).rows[0];
    await db.query("update public.touchline_match_push_outbox set lease_until=clock_timestamp()-interval '1 second' where id=$1",[queued]);
    assert.equal((await db.query('select * from public.touchline_claim_match_push_batch(1)')).rows.length,0);
    const after = (await db.query('select state,attempt_id,attempt_started_at from public.touchline_match_push_outbox')).rows[0];
    assert.deepEqual(after,{state:'uncertain',...before});
    assert.equal((await db.query('select public.touchline_reserve_match_push_attempt($1,$2,$3) ok',[queued,claim.lease_token,other])).rows[0].ok,false);
    assert.equal((await db.query("select public.touchline_finish_match_push_attempt($1,$2,$3,'provider_accepted') ok",[queued,claim.lease_token,nonce])).rows[0].ok,false);
    // Separate event: a pre-transport cancellation wins permanently over reserve.
    const cancelled = (await db.query(`select public.touchline_enqueue_match_push($1,$2,'10','sha256:'||repeat('a',64),now(),'{}',now()+interval '1 hour','sha256:'||repeat('b',64),true) id`,[device,fixture])).rows[0].id;
    const claim2 = (await db.query('select * from public.touchline_claim_match_push_batch(1)')).rows[0];
    assert.equal(claim2.id,cancelled);
    assert.equal(await adapter.finishMatchPushAttempt({id:cancelled,leaseToken:claim2.lease_token},'cancelled',{kind:'unreserved'},{enabled:true,signal:new AbortController().signal}),true);
    assert.deepEqual(httpCalls.at(-1),{name:'touchline_finish_match_push',method:'POST',args:{p_id:cancelled,p_lease_token:claim2.lease_token,p_state:'cancelled'}});
    assert.equal((await db.query('select public.touchline_reserve_match_push_attempt($1,$2,$3) ok',[cancelled,claim2.lease_token,nonce])).rows[0].ok,false);
    const ownedId=(await db.query(`select public.touchline_enqueue_match_push($1,$2,'11','sha256:'||repeat('a',64),now(),'{}',now()+interval '1 hour','sha256:'||repeat('b',64),true) id`,[device,fixture])).rows[0].id;
    const claim3=(await db.query('select * from public.touchline_claim_match_push_batch(1)')).rows[0];
    assert.equal(claim3.id,ownedId);
    const owner={id:ownedId,leaseToken:claim3.lease_token};
    const options={enabled:true,signal:new AbortController().signal};
    assert.equal(await adapter.reserveMatchPushAttempt(owner,other,options),true);
    assert.equal(await adapter.finishMatchPushAttempt(owner,'uncertain',{kind:'reserved',attemptId:other},options),true);
    assert.deepEqual(httpCalls.slice(-2),[
      {name:'touchline_reserve_match_push_attempt',method:'POST',args:{p_id:ownedId,p_lease_token:claim3.lease_token,p_attempt_id:other}},
      {name:'touchline_finish_match_push_attempt',method:'POST',args:{p_id:ownedId,p_lease_token:claim3.lease_token,p_attempt_id:other,p_state:'uncertain'}},
    ]);
    assert.deepEqual((await db.query('select state,attempt_id from public.touchline_match_push_outbox where id=$1',[ownedId])).rows[0],{state:'uncertain',attempt_id:other});
    assert.equal(httpCalls.length,4);
  } finally { await db.close(); }
});

test('attempt migration and runner history fail atomically, including replacement finish', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table public.touchline_match_push_outbox(id uuid,state text,lease_token uuid,
        lease_until timestamptz,expires_at timestamptz,delivery_kind text,subscription_fingerprint text,completed_at timestamptz);
      create function public.touchline_finish_match_push(p_id uuid,p_lease_token uuid,p_state text)
        returns boolean language sql as 'select true';
      create table public.test_history(version text check(false));`);
    await db.exec('begin');
    await db.exec(migration);
    await assert.rejects(db.exec("insert into public.test_history values('20260927042148')"), /check constraint/);
    await db.exec('rollback');
    assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='touchline_match_push_outbox' and column_name in ('attempt_id','attempt_started_at')")).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int n from pg_proc where proname in ('touchline_reserve_match_push_attempt','touchline_finish_match_push_attempt','touchline_guard_match_push_attempt')")).rows[0].n,0);
    assert.equal((await db.query("select public.touchline_finish_match_push(null,null,null) ok")).rows[0].ok,true);
    assert.equal((await db.query('select count(*)::int n from public.test_history')).rows[0].n,0);
  } finally { await db.close(); }
});
