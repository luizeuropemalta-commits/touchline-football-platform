import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
assert.ok(runtime, 'A real local SQL runtime is required; quota proof cannot skip.');
const { PGlite } = await import(pathToFileURL(runtime).href);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const read = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

test('squad admission atomically protects the 500 floor on every HTTP attempt and rejects unknown/stale evidence', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql', '20261003233637_touchline_sportmonks_prequery_authority.sql', '20261008120529_touchline_squad_quota_prequery_authority.sql']) await db.exec(read(name));
    await db.exec("insert into public.touchline_fixture_quota_scopes(account_scope,enabled) values('qa-reserve',true),('qa-empty',true);");
    const admit = async (n: number, endpoint = 'squadExtended', attempt = 1, scope = 'qa-reserve') => (await db.query('select public.touchline_fixture_quota_admit($1,$2,$3,$4,60000) v', [scope,id(n),endpoint,attempt])).rows[0].v;
    const observe = (n: number, endpoint: string, remaining: number, attempt = 1) => ({requestId:id(n),attempt,operation:endpoint,observedAt:new Date().toISOString(),status:200,remaining,requestedEntity:endpoint === 'squad' ? 'PlayerTeam' : 'Player',resetAt:new Date(Date.now()+120000).toISOString(),cooldownUntil:null});
    const complete = async (n: number, endpoint: string, token: string, remaining: number, attempt = 1) => (await db.query('select public.touchline_fixture_quota_complete($1,$2,$3,$4,$5,$6::jsonb) v', ['qa-reserve',id(n),endpoint,attempt,token,JSON.stringify(observe(n,endpoint,remaining,attempt))])).rows[0].v;
    // Seed genuine completion contracts through the predecessor in this
    // disposable database, representing existing confirmed observations.
    for (const [n,endpoint] of [[1,'squad'],[2,'squadExtended']] as const) {
      const lease = await admit(n,endpoint);
      assert.equal(lease.allowed,true);
      assert.deepEqual(await complete(n,endpoint,lease.token,1000),{persisted:true});
    }
    const forward = read('20261009110825_touchline_squad_quota_reserve_admission.sql');
    const functionState = async () => (await db.query("select md5(pg_get_functiondef('public.touchline_fixture_quota_admit(text,uuid,text,integer,integer)'::regprocedure)) body, proacl::text acl from pg_proc where oid='public.touchline_fixture_quota_admit(text,uuid,text,integer,integer)'::regprocedure")).rows[0];
    const predecessor = await functionState();
    await assert.rejects(() => db.exec(forward.replace(/commit;\s*$/i,'select missing_final_history_test(); commit;')),/missing_final_history_test/);
    await db.exec('rollback;');
    assert.deepEqual(await functionState(),predecessor,'a late installation failure must restore predecessor body and ACL');
    await db.exec(forward);
    for (const endpoint of ['squad','squadExtended']) assert.deepEqual(await admit(3,endpoint,1,'qa-empty'),{allowed:false},'unknown quota cannot bootstrap provider traffic');
    const initialCount = (await db.query('select count(*)::int n from public.touchline_fixture_quota_attempts')).rows[0].n;
    const original = observe(2,'squadExtended',1000);
    const basicOriginal = (await db.query('select observation,completed_at from public.touchline_fixture_quota_attempts where request_id=$1',[id(1)])).rows[0];
    await db.query("update public.touchline_fixture_quota_attempts set observation=$2::jsonb,completed_at=clock_timestamp()+interval '1 second' where request_id=$1",[id(1),JSON.stringify({...observe(1,'squad',400),requestedEntity:'Player'})]);
    assert.deepEqual(await admit(9),{allowed:false},'a newer receipt claiming this entity cannot be ignored in favour of the old endpoint balance');
    await db.query('update public.touchline_fixture_quota_attempts set observation=$2::jsonb,completed_at=$3 where request_id=$1',[id(1),JSON.stringify(basicOriginal.observation),basicOriginal.completed_at]);
    const patches = [
      {remaining:500},{remaining:1},{remaining:null},{remaining:'501'},{remaining:500.5},{remaining:9007199254740992},
      {status:429},{status:null},{requestedEntity:'PlayerTeam'}, {requestId:id(99)}, {attempt:2},
      {observedAt:new Date(Date.now()-180000).toISOString()}, {observedAt:new Date(Date.now()+60000).toISOString()},
      {observedAt:null},{resetAt:new Date(Date.now()-60000).toISOString()},{resetAt:'not-a-date'},{resetAt:null},
    ];
    for (const patch of patches) {
      await db.query('update public.touchline_fixture_quota_attempts set observation=$2::jsonb where request_id=$1', [id(2),JSON.stringify({...original,...patch})]);
      assert.deepEqual(await admit(10),{allowed:false},`invalid evidence must not admit: ${JSON.stringify(patch)}`);
      assert.equal((await db.query('select count(*)::int n from public.touchline_fixture_quota_attempts')).rows[0].n,initialCount);
    }
    await db.query('update public.touchline_fixture_quota_attempts set observation=$2::jsonb where request_id=$1', [id(2),JSON.stringify({...original,observedAt:new Date().toISOString(),remaining:501})]);
    const lastAllowed = await admit(11);
    assert.equal(lastAllowed.allowed,true,'501 permits exactly one call while retaining 500');
    assert.deepEqual(await admit(12),{allowed:false},'the same account lease excludes a competing consumer');
    assert.deepEqual(await complete(11,'squadExtended',lastAllowed.token,500),{persisted:true});
    assert.deepEqual(await admit(11,'squadExtended',2),{allowed:false},'retry must recheck the floor, not just ownership');
    assert.deepEqual(await admit(12),{allowed:false});
    const basic = await admit(13,'squad');
    assert.equal(basic.allowed,true,'PlayerTeam has an independent confirmed balance');
    assert.deepEqual(await complete(13,'squad',basic.token,500),{persisted:true});
    assert.deepEqual(await admit(14,'squad'),{allowed:false});
    await db.query('update public.touchline_fixture_quota_attempts set observation=$2::jsonb where request_id=$1',[id(11),JSON.stringify(observe(11,'squadExtended',1000))]);
    const expiredLease = await admit(15);
    assert.equal(expiredLease.allowed,true);
    await db.exec("update public.touchline_fixture_quota_scopes set active_until=clock_timestamp()-interval '1 second' where account_scope='qa-reserve';");
    assert.deepEqual(await admit(16),{allowed:false});
    assert.equal((await db.query("select blocked_unknown from public.touchline_fixture_quota_scopes where account_scope='qa-reserve'")).rows[0].blocked_unknown,true);
    assert.deepEqual(await complete(15,'squadExtended',expiredLease.token,1000),{persisted:true});
    assert.deepEqual(await admit(17),{allowed:false},'a late completion cannot reopen a scope whose lease expired');
    const acl = (await db.query("select has_function_privilege('anon','public.touchline_fixture_quota_admit(text,uuid,text,integer,integer)','execute') anon, has_function_privilege('authenticated','public.touchline_fixture_quota_admit(text,uuid,text,integer,integer)','execute') authenticated, has_function_privilege('service_role','public.touchline_fixture_quota_admit(text,uuid,text,integer,integer)','execute') service")).rows[0];
    assert.deepEqual(acl,{anon:false,authenticated:false,service:true});
    assert.equal((await db.query('select count(*)::int n from public.touchline_fixture_quota_scopes where enabled')).rows[0].n,2,'migration does not activate or add scopes');
  } finally { await db.close(); }
});
