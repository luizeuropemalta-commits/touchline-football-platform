import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {discoveryRegistrationIntent} from '../lib/touchlineArena/discovery-registration.ts';
const id='11111111-1111-4111-8111-111111111111';
test('signup intention is explicit, bounded, versioned and never inferred',()=>{
 for(const value of [undefined,null,{},'', 'a','person@example.com','x\ny','a'.repeat(61)]) assert.equal(discoveryRegistrationIntent(value),null);
 assert.deepEqual(discoveryRegistrationIntent('  Club Owner  '),{touchline_discovery_signup_v1:{version:1,public_name:'Club Owner',published:true}});
});
test('confirmed signup inserts once; retries preserve privacy and ID; customer cannot invoke',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create schema auth;
 create role anon;create role authenticated;create role service_role;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb,is_anonymous boolean default false,banned_until timestamptz,raw_app_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
 insert into auth.users(id,raw_user_meta_data) values('${id}','{}');`);
 for (const migration of ['20261027201704_touchline_clubowner_public_discovery.sql','20261030133824_touchline_people_public_avatar_consent.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../supabase/migrations/20261101162000_touchline_people_signup_intent.sql',import.meta.url),'utf8'));
 const call=()=>db.query('select public.touchline_people_bootstrap_signup($1)',[id]);
 const rows=async()=> (await db.query('select * from touchline_people_private.profiles')).rows;
 await call();assert.equal((await rows()).length,0,'absent intent is not inferred');
 await db.query('select public.touchline_people_bootstrap_signup($1)',['22222222-2222-4222-8222-222222222222']);assert.equal((await rows()).length,0,'missing user creates nothing');
 await db.exec('update auth.users set email_confirmed_at=now()');
 for(const invalid of [{version:1,public_name:'Name',published:false},{version:1,published:true},{version:1,public_name:'a@b',published:true},{version:1,public_name:' ',published:true},{version:1,public_name:42,published:true}]) {
  await db.query('update auth.users set raw_user_meta_data=$1',[JSON.stringify({touchline_discovery_signup_v1:invalid})]);await assert.rejects(call(),/INVALID_SIGNUP_INTENT/);
 }
 await db.exec('update auth.users set email_confirmed_at=null');
 const intent=discoveryRegistrationIntent('My public name');
 await db.query('update auth.users set raw_user_meta_data=$1',[JSON.stringify(intent)]);
 await call();assert.equal((await rows()).length,0,'unconfirmed remains absent');
 await db.exec('update auth.users set email_confirmed_at=now(),is_anonymous=true');await call();assert.equal((await rows()).length,0);
 await db.exec("update auth.users set is_anonymous=false,banned_until=now()+interval '1 day'");await call();assert.equal((await rows()).length,0);
 await db.exec('update auth.users set banned_until=null');await call();
 const first=(await rows())[0];assert.equal(first.published,true);assert.equal(first.photo_published,false);assert.equal(first.display_name,'My public name');
 await db.exec('update touchline_people_private.profiles set photo_published=true');await call();assert.equal((await rows())[0].photo_published,true,'retry preserves photo consent');
 await db.exec("update touchline_people_private.profiles set published=false,photo_published=false,display_name='Private choice'");
 await call();const preserved=(await rows())[0];assert.equal(preserved.public_id,first.public_id);assert.equal(preserved.display_name,'Private choice');assert.equal(preserved.published,false);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(call(),/permission denied/);await db.exec('reset role');}
 await db.exec('set role service_role');await call();await db.exec('reset role');
 await db.query('update auth.users set raw_user_meta_data=$1',[JSON.stringify({touchline_discovery_signup_v1:{version:2,public_name:'Wrong version',published:true}})]);await assert.rejects(call(),/INVALID_SIGNUP_INTENT/);
 } finally {await db.close();}
});
