import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createECDH, randomBytes } from 'node:crypto';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const migration = readFileSync(new URL('../supabase/migrations/20260926233755_touchline_notification_devices_forward_restore.sql', import.meta.url),'utf8');
const user = '11111111-1111-4111-8111-111111111111';
const installation = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const historic = readFileSync(new URL('../supabase/migrations/20260910183000_touchline_notification_devices.sql', import.meta.url),'utf8');
const setup = `create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth,public to authenticated,anon;
  create table public.users(id uuid primary key);
  create function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
  insert into public.users values ('${user}');`;

test('forward device restoration rejects NULL subscriptions, preserves rows and enforces ownership', {skip:!modulePath}, async()=>{
  const {PGlite}=await import(modulePath!);
  const db=new PGlite();
  try {
    await db.exec(setup);
    await db.exec(migration);
    for(const subscription of [null,{}, {endpoint:'https://push.example.test/a',keys:{}}]) {
      await assert.rejects(db.query('insert into public.notification_devices(user_id,installation_id,permission,push_subscription) values ($1,$2,$3,$4)',[user,installation,'granted',subscription===null?null:JSON.stringify(subscription)]), /check constraint/);
    }
    await db.query("insert into public.notification_devices(user_id,installation_id,permission) values ($1,$2,'denied')",[user,installation]);
    const before=await db.query('select * from public.notification_devices');
    const constraintBefore=(await db.query("select oid from pg_constraint where conrelid='public.notification_devices'::regclass and conname='notification_devices_subscription_complete'")).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query("select oid from pg_constraint where conrelid='public.notification_devices'::regclass and conname='notification_devices_subscription_complete'")).rows,constraintBefore);
    assert.deepEqual((await db.query('select * from public.notification_devices')).rows,before.rows);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
    assert.equal((await db.query('select * from public.notification_devices')).rows.length,1);
    await assert.rejects(db.exec("delete from public.notification_devices"), /permission denied/);
    await db.exec("select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false)");
    assert.equal((await db.query('select * from public.notification_devices')).rows.length,0);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.exec('select * from public.notification_devices'), /permission denied/);
  } finally {await db.close();}
});

test('forward restoration refuses incompatible existing table without removing rows', {skip:!modulePath},async()=>{
  const {PGlite}=await import(modulePath!);
  const db=new PGlite();
  try {
    await db.exec(setup);
    await db.exec('create table public.notification_devices(note text); insert into public.notification_devices values (\'preserve\')');
    await assert.rejects(db.exec(migration),/incompatible columns/);
    await db.exec('rollback');
    assert.deepEqual((await db.query('select * from public.notification_devices')).rows,[{note:'preserve'}]);
  } finally {await db.close();}
});

test('historical upgrade preserves valid data and permits own upsert but refuses owner reassignment', {skip:!modulePath},async()=>{
  const {PGlite}=await import(modulePath!);
  const db=new PGlite();
  const subscription=JSON.stringify({endpoint:'https://push.example.test/subscription',keys:{p256dh:createECDH('prime256v1').generateKeys().toString('base64url'),auth:randomBytes(16).toString('base64url')}});
  try {
    await db.exec(setup);
    await db.exec(historic);
    await db.query('insert into public.users values ($1)',[other]);
    await db.query("insert into public.notification_devices(user_id,installation_id,permission,updated_at) values ($1,$2,'denied','2000-01-01')",[user,installation]);
    const before=(await db.query('select * from public.notification_devices')).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from public.notification_devices')).rows,before);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`);
    await db.query("insert into public.notification_devices(user_id,installation_id,permission,push_subscription) values ($1,$2,'granted',$3) on conflict(user_id,installation_id) do update set permission=excluded.permission,push_subscription=excluded.push_subscription",[user,installation,subscription]);
    const changed=await db.query("insert into public.notification_devices(user_id,installation_id,permission,push_subscription) values ($1,$2,'default',null) on conflict(user_id,installation_id) do update set permission=excluded.permission,push_subscription=excluded.push_subscription returning id,permission,push_subscription,updated_at",[user,installation]);
    assert.equal(changed.rows[0].id,before[0].id);
    assert.equal(changed.rows[0].permission,'default');
    assert.equal(changed.rows[0].push_subscription,null);
    assert.notEqual(String(changed.rows[0].updated_at),String(before[0].updated_at));
    await assert.rejects(db.query('update public.notification_devices set user_id=$1',[other]),/row-level security/);
    await assert.rejects(db.query("insert into public.notification_devices(user_id,installation_id,permission) values ($1,$2,'denied')",[other,installation]),/row-level security/);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
    assert.equal((await db.query("update public.notification_devices set permission='denied' returning id")).rows.length,0);
  } finally {await db.close();}
});

test('invalid historical rows abort forward migration atomically without deleting or repairing data', {skip:!modulePath},async()=>{
  const {PGlite}=await import(modulePath!);
  const db=new PGlite();
  try {
    await db.exec(setup);
    await db.exec(historic);
    await db.query("insert into public.notification_devices(user_id,installation_id,permission) values ($1,$2,'granted')",[user,installation]);
    const before=(await db.query('select * from public.notification_devices')).rows;
    await assert.rejects(db.exec(migration),/check constraint/);
    await db.exec('rollback');
    assert.deepEqual((await db.query('select * from public.notification_devices')).rows,before);
    assert.equal((await db.query("select 1 from pg_constraint where conrelid='public.notification_devices'::regclass and conname='notification_devices_subscription_complete'")).rows.length,0);
  } finally {await db.close();}
});

test('missing insertion defaults are incompatible and must not be silently accepted', {skip:!modulePath},async()=>{
  const {PGlite}=await import(modulePath!);
  const db=new PGlite();
  try {
    await db.exec(setup);
    await db.exec(historic);
    await db.exec('alter table public.notification_devices alter column id drop default');
    await assert.rejects(db.exec(migration),/incompatible defaults/);
    await db.exec('rollback');
  } finally {await db.close();}
});

for (const [label, drift, expected] of [
  ['deferrable unique arbiter', 'alter table public.notification_devices drop constraint notification_devices_user_id_installation_id_key; alter table public.notification_devices add unique(user_id,installation_id) deferrable', /incompatible identity constraints/],
  ['wrong lookup index', 'drop index public.notification_devices_user_seen_idx; create index notification_devices_user_seen_idx on public.notification_devices(last_seen_at,user_id)', /incompatible lookup index/],
  ['similarly named foreign check', "alter table public.notification_devices drop constraint notification_devices_check; alter table public.notification_devices add constraint notification_devices_check check(push_subscription is null)", /unrecognised subscription constraint/],
  ['divergent new named check', "alter table public.notification_devices add constraint notification_devices_subscription_complete check(permission='denied')", /incompatible named subscription constraint/],
] as const) {
  test(`restoration refuses ${label} and preserves prior schema`, {skip:!modulePath}, async()=>{
    const {PGlite}=await import(modulePath!);
    const db=new PGlite();
    try {
      await db.exec(setup);
      await db.exec(historic);
      await db.exec(drift);
      const before=(await db.query("select oid,conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.notification_devices'::regclass order by conname")).rows;
      await assert.rejects(db.exec(migration),expected);
      await db.exec('rollback');
      assert.deepEqual((await db.query("select oid,conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.notification_devices'::regclass order by conname")).rows,before);
    } finally {await db.close();}
  });
}

test('legacy check recognition uses column identities when physical column order differs', {skip:!modulePath},async()=>{
  const {PGlite}=await import(modulePath!);
  const db=new PGlite();
  try {
    await db.exec(setup);
    const permissionLine="  permission text not null check (permission in ('granted', 'denied', 'default')),\n";
    assert.ok(historic.includes(permissionLine));
    const reordered=historic.replace(permissionLine,'').replace('  id uuid primary key',permissionLine+'  id uuid primary key');
    await db.exec(reordered);
    await db.exec(migration);
    assert.equal((await db.query("select 1 from pg_constraint where conrelid='public.notification_devices'::regclass and conname='notification_devices_check'")).rows.length,0);
    await db.query("insert into public.notification_devices(user_id,installation_id,permission,push_subscription) values ($1,$2,'granted',$3)",[user,installation,JSON.stringify({endpoint:'https://push.example.test/s',keys:{p256dh:'a'.repeat(87),auth:'a'.repeat(22)}})]);
    assert.equal((await db.query('select * from public.notification_devices')).rows.length,1);
  } finally {await db.close();}
});
