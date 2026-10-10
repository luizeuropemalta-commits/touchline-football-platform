import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
assert.ok(runtime, 'Real SQL runtime required; ownership proof cannot skip.');
const { PGlite } = await import(pathToFileURL(runtime).href);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql = (path: string) => readFileSync(new URL(`../supabase/${path}`,import.meta.url),'utf8');

test('central authority binds durable ownership, closes legacy access and rolls back partial admission', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql','20261003233637_touchline_sportmonks_prequery_authority.sql','20261008120529_touchline_squad_quota_prequery_authority.sql','20261009110825_touchline_squad_quota_reserve_admission.sql']) await db.exec(sql(`migrations/${name}`));
    const forward = sql('qa/013_touchline_central_quota_ownership.sql');
    // A legacy in-flight request must retain its public completion path.
    await db.exec("insert into public.touchline_fixture_quota_scopes(account_scope,enabled) values('cutover-probe',true);");
    await assert.rejects(()=>db.exec(forward),/requires disabled, drained/);
    await db.exec('rollback;');
    const legacy=(await db.query("select public.touchline_fixture_quota_admit('cutover-probe',$1,'latest',1,60000) v",[id(90)])).rows[0].v;
    assert.equal(legacy.allowed,true);
    await db.exec("update public.touchline_fixture_quota_scopes set enabled=false where account_scope='cutover-probe';");
    const legacyState=JSON.stringify((await db.query("select row_to_json(s) v from public.touchline_fixture_quota_scopes s where account_scope='cutover-probe'")).rows);
    await assert.rejects(()=>db.exec(forward),/requires disabled, drained/);
    await db.exec('rollback;');
    assert.equal(JSON.stringify((await db.query("select row_to_json(s) v from public.touchline_fixture_quota_scopes s where account_scope='cutover-probe'")).rows),legacyState);
    assert.ok((await db.query("select to_regprocedure('public.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)')::text v")).rows[0].v);
    // Complete the legacy receipt through its original API, not by deleting it.
    const oldObs={requestId:id(90),attempt:1,operation:'fixture',observedAt:new Date().toISOString(),status:200,remaining:1000,requestedEntity:'Fixture',resetAt:null,cooldownUntil:null};
    assert.deepEqual((await db.query("select public.touchline_fixture_quota_complete('cutover-probe',$1,'latest',1,$2,$3::jsonb) v",[id(90),legacy.token,JSON.stringify(oldObs)])).rows[0].v,{persisted:true});
    // Whole-install rollback restores public RPCs and removes private schema.
    await assert.rejects(()=>db.exec(forward.replace(/commit;\s*$/i,'select absent_install_probe(); commit;')));
    await db.exec('rollback;');
    assert.equal((await db.query("select to_regnamespace('touchline_quota_private')::text v")).rows[0].v,null);
    assert.ok((await db.query("select to_regprocedure('public.touchline_fixture_quota_admit(text,uuid,text,integer,integer)')::text v")).rows[0].v);
    await db.exec(forward);
    assert.equal((await db.query('select count(*)::int n from touchline_quota_private.workers')).rows[0].n,0);
    await db.exec("insert into public.touchline_fixture_quota_scopes(account_scope,enabled) values('shared',true); insert into touchline_quota_private.workers values('qa-live','qa','shared',true),('prod-live','production','shared',true),('disabled','qa','shared',false);");
    const admit = async(n:number,worker='qa-live',env='qa') => (await db.query('select public.touchline_central_quota_admit($1,$2,$3,$4,$5,1,60000) v',[worker,env,'shared',id(n),'latest'])).rows[0].v;
    const observation = (n:number) => ({requestId:id(n),attempt:1,operation:'fixture',observedAt:new Date().toISOString(),status:200,requestedEntity:'Fixture',remaining:1000,resetAt:null,cooldownUntil:null});
    const complete = async(n:number,token:string,obs:unknown,worker='qa-live',env='qa') => (await db.query('select public.touchline_central_quota_complete($1,$2,$3,$4,$5,1,$6,$7::jsonb) v',[worker,env,'shared',id(n),'latest',token,JSON.stringify(obs)])).rows[0].v;
    await db.exec("insert into touchline_quota_private.workers values('legacy-reader','qa','cutover-probe',true);");
    assert.deepEqual((await db.query("select public.touchline_central_quota_complete('legacy-reader','qa','cutover-probe',$1,'latest',1,$2,$3::jsonb) v",[id(90),legacy.token,JSON.stringify(oldObs)])).rows[0].v,{persisted:false},'historical owner NULL cannot be claimed through replay');
    assert.deepEqual((await db.query("select public.touchline_central_quota_admit(null,'qa','shared',$1,'latest',1,1000) v",[id(91)])).rows[0].v,{allowed:false});
    for(const [worker,env] of [['missing','qa'],['disabled','qa'],['qa-live','production']]) assert.deepEqual(await admit(1,worker,env),{allowed:false});
    const lease=await admit(1); assert.equal(lease.allowed,true);
    assert.deepEqual((await db.query('select owner_worker_id,owner_environment from public.touchline_fixture_quota_attempts where request_id=$1',[id(1)])).rows[0],{owner_worker_id:'qa-live',owner_environment:'qa'});
    assert.deepEqual(await admit(2,'prod-live','production'),{allowed:false},'shared scope excludes second worker');
    const obs=observation(1);
    const snapshot=async()=>JSON.stringify((await db.query('select row_to_json(q) v from public.touchline_fixture_quota_scopes q')).rows);
    const before=await snapshot();
    for (const index of [0,1,2,3,4,5,6,7]) {
      const params: unknown[]=['qa-live','qa','shared',id(1),'latest',1,lease.token,JSON.stringify(obs)];
      params[index]=null;
      assert.deepEqual((await db.query('select public.touchline_central_quota_complete($1,$2,$3,$4,$5,$6,$7,$8::jsonb) v',params)).rows[0].v,{persisted:false});
      assert.equal(await snapshot(),before);
    }
    assert.deepEqual(await complete(1,lease.token,obs,'prod-live','production'),{persisted:false});
    assert.equal(await snapshot(),before,'foreign completion cannot change lease/cooldown');
    await db.exec("update touchline_quota_private.workers set enabled=false where worker_id='qa-live';");
    assert.deepEqual(await complete(1,lease.token,obs),{persisted:false},'revoked worker cannot finish or replay');
    assert.deepEqual(await admit(2,'prod-live','production'),{allowed:false},'revocation cannot free outstanding quota');
    assert.equal(await snapshot(),before);
    // Test-only operator action. Runtime does not auto-reactivate or reclaim.
    await db.exec("update touchline_quota_private.workers set enabled=true where worker_id='qa-live';");
    assert.deepEqual(await complete(1,lease.token,obs),{persisted:true});
    assert.deepEqual(await complete(1,lease.token,obs),{persisted:true});
    assert.deepEqual(await complete(1,lease.token,{...obs,remaining:999}),{persisted:false});
    assert.deepEqual(await complete(1,lease.token,obs,'prod-live','production'),{persisted:false},'foreign replay denied');
    assert.deepEqual(await admit(1),{allowed:false},'admission replay never authorizes another HTTP');
    // Inject a failure after the original policy inserted lease/attempt but
    // before ownership commits. The enclosing transaction must undo both.
    await db.exec("create function public.fail_owner_probe() returns trigger language plpgsql as $$ begin raise exception 'probe'; end $$; create trigger owner_probe before update of owner_worker_id on public.touchline_fixture_quota_attempts for each row execute function public.fail_owner_probe();");
    const clean=await snapshot();
    await assert.rejects(()=>admit(3),/probe/);
    assert.equal(await snapshot(),clean);
    assert.equal((await db.query('select count(*)::int n from public.touchline_fixture_quota_attempts where request_id=$1',[id(3)])).rows[0].n,0);
    await db.exec('drop trigger owner_probe on public.touchline_fixture_quota_attempts;');
    const prod=await admit(4,'prod-live','production');assert.equal(prod.allowed,true);
    assert.deepEqual(await complete(4,prod.token,observation(4)),{persisted:false});
    assert.deepEqual(await complete(4,prod.token,observation(4),'prod-live','production'),{persisted:true});
    assert.equal((await db.query("select to_regprocedure('public.touchline_fixture_quota_admit(text,uuid,text,integer,integer)')::text v")).rows[0].v,null);
    for (const role of ['anon','authenticated','service_role']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(()=>db.query("select touchline_quota_private.touchline_fixture_quota_admit('shared',$1,'latest',1,60000)",[id(5)]),/permission denied/);
      await assert.rejects(()=>db.query('select * from public.touchline_fixture_quota_attempts'),/permission denied/);
      await assert.rejects(()=>db.query("update public.touchline_fixture_quota_scopes set enabled=true"),/permission denied/);
      await assert.rejects(()=>db.query("update public.touchline_fixture_quota_attempts set owner_worker_id=null"),/permission denied/);
      await assert.rejects(()=>db.query("select touchline_quota_private.touchline_fixture_quota_complete('shared',$1,'latest',1,$2,'{}'::jsonb)",[id(1),lease.token]),/permission denied/);
      if(role!=='service_role') {
        await assert.rejects(()=>admit(5),/permission denied/);
        await assert.rejects(()=>complete(1,lease.token,obs),/permission denied/);
      }
      else {
        const gatewayLease=await admit(5);
        assert.equal(gatewayLease.allowed,true,'gateway role can use ownership wrapper');
        assert.deepEqual(await complete(5,gatewayLease.token,observation(5)),{persisted:true},'gateway role can complete its owned receipt');
      }
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});
