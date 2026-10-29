import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pageinspect } from '@electric-sql/pglite/contrib/pageinspect';
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const season='33333333-3333-4333-8333-333333333333';
test('seasonal order persistence uses server prices, locks uncertain purchases and isolates accounts',async t=>{
 const db=new PGlite({extensions:{pageinspect}});
 try {
  await db.exec(`create extension pageinspect;create role anon;create role authenticated;create role service_role bypassrls;
   create table public.users(id uuid primary key);
   create table public.football_seasons(id uuid primary key,starts_at date,ends_at date);
   create table public.touchline_fantasy_configs(season_id uuid,competition_key text,status text);
   insert into public.users values('${user}'),('${other}');
   insert into public.football_seasons values('${season}',current_date-30,current_date+90);
   insert into public.touchline_fantasy_configs values('${season}','england','active');
   grant select,update on public.users to service_role;
   grant select on public.football_seasons,public.touchline_fantasy_configs to service_role;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261028220000_club_season_test_orders.sql',import.meta.url),'utf8'));
  const prepare=async(plan='standard',owner=user)=>(await db.query<{o:Record<string,unknown>}>(
   'select to_jsonb(public.touchline_club_prepare_season_test_order($1::uuid,$2)) o',[owner,plan])).rows[0].o;
  await db.exec('set role service_role');
  let id='';
  await t.test('prepare keeps an exclusive owner mutex without a key-changing lock',async()=>{
   await db.exec('begin');
   try {
    await prepare();await db.exec('reset role');
    const flags=(await db.query<{raw_flags:string[]}>(`select (heap_tuple_infomask_flags(h.t_infomask,h.t_infomask2)).*
     from public.users u cross join lateral heap_page_items(get_raw_page('public.users',
      split_part(trim(both '()' from u.ctid::text),',',1)::bigint)) h
     where u.id=$1::uuid and h.lp=split_part(trim(both '()' from u.ctid::text),',',2)::int`,[user])).rows[0].raw_flags;
    assert.ok(flags.includes('HEAP_XMAX_EXCL_LOCK'),'same-owner operations remain serialized');
    assert.ok(!flags.includes('HEAP_KEYS_UPDATED'),'must remain compatible with collection FK KEY SHARE');
   }finally{await db.exec('rollback');}
  });
  await t.test('one order survives repeated queued requests (single local connection)',async()=>{
   const rows=await Promise.all([prepare(),prepare(),prepare()]);
   id=String(rows[0].id);assert.ok(rows.every(o=>o.id===id));
   assert.equal(rows[0].amount_minor,4990);assert.equal(rows[0].previous_paid_plan,null);
   assert.equal(rows[0].created_at,rows[0].first_attempt_at);
   await assert.rejects(prepare('master'),/SEASON_ORDER_IN_PROGRESS/);
  });
  await t.test('session is owner-bound, test-only and immutable after first attachment',async()=>{
   const attach=(owner:string,s:string)=>db.query('select public.touchline_club_attach_season_test_session($1::uuid,$2::uuid,$3)',[owner,id,s]);
   await assert.rejects(attach(other,'cs_test_one'),/SEASON_ORDER_NOT_FOUND/);
   await assert.rejects(attach(user,'cs_live_one'),/SEASON_SESSION_INVALID/);
   await attach(user,'cs_test_one');await attach(user,'cs_test_one');
   await assert.rejects(attach(user,'cs_test_two'),/SEASON_SESSION_CONFLICT/);
  });
  await t.test('confirmed paid history gives difference only; pending is not treated as paid',async()=>{
   await db.query("update public.touchline_club_season_test_orders set state='paid',paid_at=now() where id=$1::uuid",[id]);
   await assert.rejects(prepare(),/SEASON_PAID_UPGRADE_REQUIRED/);
   const master=await prepare('master');assert.equal(master.previous_paid_plan,'standard');assert.equal(master.amount_minor,4000);
   await assert.rejects(prepare('vip'),/SEASON_ORDER_IN_PROGRESS/);
   await db.query("update public.touchline_club_season_test_orders set state='paid',paid_at=now() where id=$1::uuid",[master.id]);
   const vip=await prepare('vip');assert.equal(vip.previous_paid_plan,'master');assert.equal(vip.amount_minor,8000);
   const otherOrder=await prepare('vip',other);assert.equal(otherOrder.amount_minor,16990);
  });
  await t.test('uncertain expired request does not silently become a new purchase',async()=>{
   const first=await prepare('vip');
   await db.query("update public.touchline_club_season_test_orders set created_at=created_at-interval '2 hours',first_attempt_at=first_attempt_at-interval '2 hours',checkout_expires_at=checkout_expires_at-interval '2 hours' where id=$1::uuid",[first.id]);
   assert.equal((await prepare('vip')).id,first.id);
  });
  await t.test('new-order season closure never prevents recovery of persisted pending order',async()=>{
   const prior=await prepare('vip',other);
   await db.exec('reset role;update public.football_seasons set ends_at=current_date-1;set role service_role');
   assert.equal((await prepare('vip',other)).id,prior.id);
   await db.exec('reset role;update public.football_seasons set ends_at=current_date+90;set role service_role');
  });
  await t.test('database rejects invented amount and customer calls',async()=>{
   await assert.rejects(db.exec('update public.touchline_club_season_test_orders set amount_minor=1'),/check constraint/);
   await db.exec('reset role;set role authenticated');
   await assert.rejects(prepare(),/permission denied/);
   await assert.rejects(db.exec('select * from public.touchline_club_season_test_orders'),/permission denied/);
  });
 } finally {await db.close();}
});
