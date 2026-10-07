import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createECDH } from 'node:crypto';
import test from 'node:test';
import { createPushRehearsalStore } from '../lib/touchlineArena/push-rehearsal-store.ts';
import { handlePushRehearsal, type PushRehearsalDependencies } from '../lib/touchlineArena/push-rehearsal-handler.ts';
import { sendMatchWebPush } from '../lib/touchlineArena/match-push-transport.ts';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const installation = '33333333-3333-4333-8333-333333333333';
const device = '44444444-4444-4444-8444-444444444444';
const request = '55555555-5555-4555-8555-555555555555';
const nextRequest = '66666666-6666-4666-8666-666666666666';
const fingerprint = `sha256:${'a'.repeat(64)}`;
const subscription = { endpoint: 'https://fcm.googleapis.com/synthetic-test', keys: {
  p256dh: createECDH('prime256v1').generateKeys().toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url'),
} };
const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const installationGuardMigration = '20261003224152_touchline_push_rehearsal_installation_guard.sql';

test('installation consumption stays inside the account lock and before cooldown without history filters', () => {
  const sql = migration(installationGuardMigration);
  const lock = sql.indexOf('where actor_id=p_actor for update nowait');
  const requestGuard = sql.indexOf('where actor_id=p_actor and request_id=p_request');
  const installationGuard = sql.indexOf('where actor_id=p_actor and installation_id=p_installation');
  const cooldown = sql.indexOf('if v_next > v_now');
  assert.ok(lock >= 0 && lock < requestGuard && requestGuard < installationGuard && installationGuard < cooldown);
  assert.match(sql.slice(sql.lastIndexOf('if exists', installationGuard), cooldown),
    /if exists\(select 1 from public\.touchline_push_rehearsal_attempts\s+where actor_id=p_actor and installation_id=p_installation\)\s+then return jsonb_build_object\('status','duplicate'\); end if;/);
  assert.match(sql, /create index touchline_push_rehearsal_attempts_actor_installation_idx\s+on public\.touchline_push_rehearsal_attempts\(actor_id,installation_id\)/);
  assert.doesNotMatch(sql, /create unique index|delete from|truncate|drop\s+(?:table|function|index)|security definer/i);
});

test('persistent phone rehearsal reservation boundary (local SQL only)', { skip: !modulePath }, async t => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create table public.users(id uuid primary key);
      insert into public.users values('${owner}'),('${other}');
      create function public.touch_updated_at() returns trigger language plpgsql as
      $$begin new.updated_at=now(); return new; end$$;`);
    // Existing migration 005 grants these defaults. The new migration must
    // actively remove inherited privileges, not just add its desired subset.
    await db.exec(`alter default privileges in schema public grant select on tables to anon;
      alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
      alter default privileges in schema public grant select,insert,update,delete on tables to service_role;`);
    await db.exec(`begin;${migration('017_touchline_notification_preferences.sql')}
      ${migration('20260910183000_touchline_notification_devices.sql')}
      ${migration('20260926233755_touchline_notification_devices_forward_restore.sql')}
      ${migration('20261002221350_touchline_push_rehearsal_reservation.sql')}commit;`);
    // Real pre-guard history can contain several consumed requests for one
    // installation. The forward migration must neither delete nor deduplicate it.
    await db.query(`insert into public.touchline_push_rehearsal_attempts
      (actor_id,request_id,installation_id,device_id,subscription_fingerprint,explicit_test_consent_at,expires_at)
      select $1::uuid,id,$2::uuid,$3::uuid,$4,clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute'
      from unnest(array[$5::uuid,$6::uuid]) id`, [other,other,other,fingerprint,
        '01234567-0123-4123-8123-012345678901','11234567-0123-4123-8123-012345678901']);
    const history = (await db.query('select to_jsonb(a) as value from public.touchline_push_rehearsal_attempts a order by request_id')).rows;
    await db.exec(`begin;${migration(installationGuardMigration)}commit;`);
    assert.deepEqual((await db.query('select to_jsonb(a) as value from public.touchline_push_rehearsal_attempts a order by request_id')).rows,history);
    assert.equal((await db.query(`select indisunique from pg_index where indexrelid=
      'public.touchline_push_rehearsal_attempts_actor_installation_idx'::regclass`)).rows[0].indisunique,false);
    await db.query(`insert into public.notification_devices(id,user_id,installation_id,permission,push_subscription)
      values($1,$2,$3,'granted',$4::jsonb)`, [device, owner, installation, JSON.stringify(subscription)]);
    await db.query(`insert into public.notification_preferences(user_id,explicit_consent_at,settings)
      values($1,null,'{"sentinel":"unchanged"}')`, [owner]);
    const originalPreferences = (await db.query('select to_jsonb(p) as value from public.notification_preferences p')).rows;
    const originalDevices = (await db.query('select to_jsonb(d) as value from public.notification_devices d')).rows;
    const expires = async () => new Date((await db.query("select clock_timestamp()+interval '25 seconds' as value")).rows[0].value).toISOString();
    const reserve = async (changes: Record<string, unknown> = {}) => {
      const args = { actor: owner, request, installation, device, fingerprint, subscription: JSON.stringify(subscription), expires: await expires(), ...changes };
      const value = (await db.query(`select public.touchline_reserve_push_rehearsal(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::jsonb,$7::timestamptz) as value`, Object.values(args))).rows[0].value;
      return { args, value };
    };
    const finish = async (reservation: string, outcome: string, actor = owner, id = request) =>
      (await db.query('select public.touchline_finish_push_rehearsal($1::uuid,$2::uuid,$3::uuid,$4::text) as value', [reservation, actor, id, outcome])).rows[0].value;

    await t.test('service-only invoker functions and inaccessible RLS tables', async () => {
      for (const table of ['touchline_push_rehearsal_attempts', 'touchline_push_rehearsal_cooldowns']) {
        const row = (await db.query(`select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass`, [`public.${table}`])).rows[0];
        assert.deepEqual(row, { relrowsecurity: true, relforcerowsecurity: true });
        for (const role of ['anon', 'authenticated']) for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) {
          assert.equal((await db.query('select has_table_privilege($1,$2,$3) as value', [role, `public.${table}`, privilege])).rows[0].value, false);
        }
        for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) {
          assert.equal((await db.query('select has_table_privilege($1,$2,$3) as value', ['service_role', `public.${table}`, privilege])).rows[0].value,
            ['SELECT','INSERT','UPDATE'].includes(privilege), `service_role ${privilege} on ${table}`);
        }
      }
      for (const name of ['touchline_reserve_push_rehearsal','touchline_finish_push_rehearsal']) {
        const row = (await db.query(`select oid,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname=$1`, [name])).rows[0];
        assert.equal(row.prosecdef, false); assert.ok(row.proconfig.includes('search_path=""'));
        assert.ok(row.proconfig.includes('lock_timeout=500ms'));
        for (const role of ['anon','authenticated','service_role']) assert.equal((await db.query('select has_function_privilege($1,$2::oid,\'EXECUTE\') as value', [role,row.oid])).rows[0].value, role==='service_role');
      }
    });
    await t.test('invalid authority, binding, permission and expiry never consume an attempt', async () => {
      for (const changes of [{ actor: other }, { installation: other }, { device: other }, { fingerprint: 'bad' },
        { subscription: '{}' }, { subscription: null }, { expires: '2000-01-01Z' }, { expires: '2099-01-01Z' }, { expires: 'infinity' }]) {
        assert.equal((await reserve(changes)).value.status, 'unavailable');
      }
      await db.query("update public.notification_devices set permission='denied',push_subscription=null where id=$1", [device]);
      assert.equal((await reserve()).value.status,'unavailable');
      await db.query("update public.notification_devices set permission='granted',push_subscription=$2::jsonb where id=$1", [device,JSON.stringify(subscription)]);
      assert.equal((await db.query('select count(*)::int as n from public.touchline_push_rehearsal_attempts where actor_id=$1',[owner])).rows[0].n, 0);
    });
    await t.test('one committed reservation returns exact binding; duplicate and cooldown never issue another', async () => {
      await db.exec('set role service_role');
      const first = await reserve(); assert.equal(first.value.status,'reserved');
      assert.equal(first.value.actorId,owner); assert.equal(first.value.requestId,request);
      assert.equal(first.value.installationId,installation); assert.equal(first.value.deviceId,device);
      assert.equal(first.value.fingerprint,fingerprint);
      assert.equal(new Date(first.value.expiresAt).getTime(),new Date(first.args.expires).getTime());
      assert.equal((await reserve()).value.status,'duplicate');
      assert.equal((await reserve({request:nextRequest})).value.status,'duplicate');
      assert.equal((await reserve({request:nextRequest,installation:other})).value.status,'cooldown');
      assert.equal(await finish(first.value.reservationId,'unknown',other),false);
      assert.equal(await finish(first.value.reservationId,'unknown',owner,nextRequest),false);
      assert.equal(await finish(first.value.reservationId,'unknown'),true);
      assert.equal(await finish(first.value.reservationId,'unknown'),true);
      assert.equal(await finish(first.value.reservationId,'provider_accepted'),false);
      assert.equal((await reserve()).value.status,'duplicate');
      await db.exec('reset role');
      assert.deepEqual((await db.query('select to_jsonb(p) as value from public.notification_preferences p')).rows,originalPreferences);
      assert.equal((await db.query('select count(*)::int as n from public.touchline_push_rehearsal_attempts where actor_id=$1',[owner])).rows[0].n,1);
      // Permission change above is a fixture action; reservation must not rewrite subscription/owner.
      const nowDevices = (await db.query('select to_jsonb(d) as value from public.notification_devices d')).rows;
      assert.deepEqual({...nowDevices[0].value,updated_at:null},{...originalDevices[0].value,updated_at:null});
    });
    await t.test('expired, terminal and deleted-device attempts never become retryable', async () => {
      await db.query("update public.touchline_push_rehearsal_attempts set explicit_test_consent_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' where actor_id=$1",[owner]);
      await db.exec("update public.touchline_push_rehearsal_cooldowns set next_allowed_at=clock_timestamp()-interval '1 second'");
      assert.equal((await reserve()).value.status,'duplicate');
      assert.equal((await reserve({request:nextRequest})).value.status,'duplicate');
      await db.query('delete from public.notification_devices where id=$1',[device]);
      assert.equal((await reserve()).value.status,'duplicate');
      await db.query(`insert into public.notification_devices(id,user_id,installation_id,permission,push_subscription)
        values($1,$2,$3,'granted',$4::jsonb)`,[other,owner,installation,JSON.stringify(subscription)]);
      assert.equal((await reserve({request:nextRequest,device:other})).value.status,'duplicate');
      await db.query('delete from public.notification_devices where id=$1',[other]);
      assert.equal((await db.query('select count(*)::int as n from public.touchline_push_rehearsal_attempts where actor_id=$1',[owner])).rows[0].n,1);
    });
    await t.test('real core and store compose with SQL and encrypted transport; lost receipts never replay',async()=>{
      // Named-argument bridge executes real SQL, not PostgREST or hosted auth.
      const client={
        from(table:string){
          assert.equal(table,'notification_devices');
          const filters=new Map<string,string>();let signal:AbortSignal;
          return {
            select(){return this;},eq(column:string,value:string){filters.set(column,value);return this;},
            abortSignal(value:AbortSignal){signal=value;return this;},
            async maybeSingle(){signal.throwIfAborted();return {error:null,data:(await db.query(`select id,user_id,installation_id,permission,push_subscription
              from public.notification_devices where user_id=$1 and installation_id=$2`,[filters.get('user_id'),filters.get('installation_id')])).rows[0]??null};},
          };
        },
        rpc(name:string,args:Record<string,unknown>){return {async abortSignal(signal:AbortSignal){
          signal.throwIfAborted();
          if(name==='touchline_reserve_push_rehearsal') return {error:null,data:(await db.query(`select public.touchline_reserve_push_rehearsal(
            $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::jsonb,$7::timestamptz) as value`,
            [args.p_actor,args.p_request,args.p_installation,args.p_device,args.p_fingerprint,JSON.stringify(args.p_subscription),args.p_expires_at])).rows[0].value};
          assert.equal(name,'touchline_finish_push_rehearsal');
          return {error:null,data:(await db.query('select public.touchline_finish_push_rehearsal($1::uuid,$2::uuid,$3::uuid,$4::text) as value',
            [args.p_reservation,args.p_actor,args.p_request,args.p_outcome])).rows[0].value};
        }};},
      };
      const ecdh=createECDH('prime256v1');ecdh.generateKeys();
      const vapid={subject:'mailto:qa@example.invalid',publicKey:ecdh.getPublicKey().toString('base64url'),privateKey:ecdh.getPrivateKey().toString('base64url')};
      let transportCalls=0;
      const transport:typeof fetch=async(url,init)=>{
        transportCalls++;assert.equal(url,subscription.endpoint);assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');
        assert.ok(init?.body instanceof Uint8Array);assert.ok(init.body.byteLength>100);
        assert.ok(Number(new Headers(init.headers).get('TTL'))<=30);
        return new Response(null,{status:201});
      };
      const makeRequest=(id:string,installationId:string)=>new Request('https://qa.example/api/notifications/rehearsal',{
        method:'POST',headers:{origin:'https://qa.example','content-type':'application/json','x-touchline-expected-account':owner},
        body:JSON.stringify({installationId,requestId:id,explicitTestConsent:true}),
      });
      await db.query(`insert into public.notification_devices(id,user_id,installation_id,permission,push_subscription)
        values($1,$2,$3,'granted',$4::jsonb)`,[device,owner,installation,JSON.stringify(subscription)]);
      for(const mode of ['accepted','revoked','lost-receipt'] as const){
        await db.exec("reset role; update public.touchline_push_rehearsal_cooldowns set next_allowed_at=clock_timestamp()-interval '1 second'");
        await db.query("update public.notification_devices set permission='granted',push_subscription=$2::jsonb where id=$1",[device,JSON.stringify(subscription)]);
        await db.exec('set role service_role');
        const store=createPushRehearsalStore(client as never);
        const id=mode==='accepted'?'77777777-7777-4777-8777-777777777777':mode==='revoked'?'88888888-8888-4888-8888-888888888888':'99999999-9999-4999-8999-999999999999';
        // Each independent transport scenario owns a fresh logical installation;
        // no attempt history is cleared to make a consumed installation reusable.
        await db.query('update public.notification_devices set installation_id=$1 where id=$2',[id,device]);
        const deps:PushRehearsalDependencies={...store,enabled:true,now:()=>new Date(),actor:async()=>({id:owner,allowed:true}),
          send:async(input)=>sendMatchWebPush({...input,vapid},transport),
        };
        if(mode!=='accepted') deps.reserve=async(input,signal)=>{
          const result=await store.reserve(input,signal);
          if(result.status==='reserved'){
            if(mode==='lost-receipt')throw Error('synthetic lost committed receipt');
            await db.query("update public.notification_devices set permission='denied',push_subscription=null where id=$1",[device]);
          }
          return result;
        };
        const before=transportCalls;
        const response=await handlePushRehearsal(makeRequest(id,id),deps);
        assert.equal(response.status,mode==='accepted'?202:mode==='revoked'?409:503);
        assert.equal(transportCalls-before,mode==='accepted'?1:0);
        if(mode!=='revoked'){
          // A new adapter/request instance cannot replay an accepted or lost
          // committed attempt. This is sequential persistence, not a race test.
          const fresh={...deps,...createPushRehearsalStore(client as never)};
          const retry=await handlePushRehearsal(makeRequest(id,id),fresh);
          assert.equal(retry.status,409);assert.equal((await retry.json()).status,'duplicate');
          assert.equal(transportCalls-before,mode==='accepted'?1:0);
          const newRequestRetry=await handlePushRehearsal(makeRequest(nextRequest,id),fresh);
          assert.equal(newRequestRetry.status,409);assert.equal((await newRequestRetry.json()).status,'duplicate');
          assert.equal(transportCalls-before,mode==='accepted'?1:0);
        }
      }
      await db.exec('reset role');
      assert.deepEqual((await db.query('select to_jsonb(p) as value from public.notification_preferences p')).rows,originalPreferences);
    });
    await t.test('all outcomes consume the installation across expiry, new request and subscription token',async()=>{
      const outcomes=['pending','provider_accepted','rejected','cancelled','unknown'] as const;
      for(const [index,outcome] of outcomes.entries()){
        const suffix=String(index+1).padStart(12,'0');
        const installationId=`aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`;
        const deviceId=`dddddddd-dddd-4ddd-8ddd-${suffix}`;
        const requestId=`bbbbbbbb-bbbb-4bbb-8bbb-${suffix}`;
        const retryId=`cccccccc-cccc-4ccc-8ccc-${suffix}`;
        await db.exec("reset role; update public.touchline_push_rehearsal_cooldowns set next_allowed_at=clock_timestamp()-interval '1 second'");
        await db.query(`insert into public.notification_devices(id,user_id,installation_id,permission,push_subscription)
          values($1,$2,$3,'granted',$4::jsonb)`,[deviceId,other,installationId,JSON.stringify(subscription)]);
        await db.exec('set role service_role');
        const input={actor:other,request:requestId,installation:installationId,device:deviceId};
        const first=await reserve(input); assert.equal(first.value.status,'reserved',outcome);
        // Pending represents interrupted/failed cleanup: it is consuming too.
        if(outcome!=='pending') assert.equal(await finish(first.value.reservationId,outcome,other,requestId),true);
        assert.equal((await reserve({...input,request:retryId})).value.status,'duplicate',`${outcome} before cooldown`);
        await db.exec('reset role');
        await db.query("update public.touchline_push_rehearsal_attempts set explicit_test_consent_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' where id=$1",[first.value.reservationId]);
        await db.query("update public.touchline_push_rehearsal_cooldowns set next_allowed_at=clock_timestamp()-interval '1 second' where actor_id=$1",[other]);
        const replacement={...subscription,endpoint:'https://fcm.googleapis.com/replaced-synthetic-token',keys:{...subscription.keys,auth:Buffer.alloc(16,9).toString('base64url')}};
        await db.query('update public.notification_devices set push_subscription=$1::jsonb where id=$2',[JSON.stringify(replacement),deviceId]);
        await db.exec('set role service_role');
        assert.equal((await reserve({...input,request:retryId,subscription:JSON.stringify(replacement),fingerprint:`sha256:${'b'.repeat(64)}`})).value.status,'duplicate',`${outcome} expired/token changed`);
        const row=(await db.query('select outcome,request_id,subscription_fingerprint from public.touchline_push_rehearsal_attempts where actor_id=$1 and installation_id=$2',[other,installationId])).rows;
        assert.deepEqual(row,[{outcome,request_id:requestId,subscription_fingerprint:fingerprint}]);
      }
      await db.exec('reset role');
      assert.deepEqual((await db.query('select to_jsonb(a) as value from public.touchline_push_rehearsal_attempts a where actor_id=$1 and installation_id=$1 order by request_id',[other])).rows,history);
      assert.equal((await reserve({actor:other,installation:other,device:other,request:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'})).value.status,'duplicate');
    });
  } finally { await db.close(); }
});
