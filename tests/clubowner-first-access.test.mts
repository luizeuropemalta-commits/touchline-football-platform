import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {handlePublicOwners,type PeopleDependencies} from '../lib/touchlineArena/clubowner-public-handler.ts';
const id='11111111-1111-4111-8111-111111111111';
test('first access requires authenticated confirmed actor and gate; stale concurrent attempts preserve private/photo choices',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb,is_anonymous boolean default false,banned_until timestamptz,raw_app_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${id}',now(),'{"touchline_arena_access_v1":true}');`);
 for(const migration of ['20261027201704_touchline_clubowner_public_discovery.sql','20261030133824_touchline_people_public_avatar_consent.sql','20261101171000_touchline_people_first_access.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
 await db.query("select set_config('test.actor',$1,false)",[id]);
 const call=(name='Chosen name',version=1)=>db.query<{profile:Record<string,unknown>}>('select public.touchline_people_complete_first_access($1,$2) as profile',[name,version]);
 await assert.rejects(call(),/PEOPLE_UNAVAILABLE/);
 await db.exec('update touchline_people_private.configuration set enabled=true');
 await db.exec('update auth.users set email_confirmed_at=null');await assert.rejects(call(),/PEOPLE_FORBIDDEN/);
 await db.exec('update auth.users set email_confirmed_at=now(),is_anonymous=true');await assert.rejects(call(),/PEOPLE_FORBIDDEN/);
 await db.exec('update auth.users set is_anonymous=false');
 for(const role of ['anon','service_role']){await db.exec(`set role ${role}`);await assert.rejects(call(),/permission denied/);await db.exec('reset role');}
 await db.exec('set role authenticated');
 for(const name of ['','a','a@b',' spaced ','a'.repeat(61)])await assert.rejects(call(name),/INVALID_SIGNUP_INTENT/);
 await assert.rejects(call('Name',2),/INVALID_SIGNUP_INTENT/);
 const first=(await call()).rows[0].profile;assert.equal(first.displayName,'Chosen name');assert.equal(first.published,true);assert.equal(first.photoPublished,false);
 const results=await Promise.all([call('Other name'),call('Second name')]);for(const result of results)assert.equal(result.rows[0].profile.publicId,first.publicId);
 await db.exec('reset role');await db.exec('update touchline_people_private.profiles set photo_published=true');
 assert.equal((await call()).rows[0].profile.photoPublished,true);
 await db.exec("update touchline_people_private.profiles set photo_published=false,published=false,display_name='Private choice'");
 await db.exec('set role authenticated');const privateResult=(await call('Stale public request')).rows[0].profile;
 assert.equal(privateResult.published,false);assert.equal(privateResult.displayName,'Private choice');assert.equal(privateResult.publicId,first.publicId);
 await db.exec('reset role');assert.equal((await db.query('select * from touchline_people_private.profiles')).rows.length,1);
 }finally{await db.close();}
});
test('onboarding endpoint validates intent, origin, gate and actor; returns narrow own profile without rewriting privacy',async()=>{
 const calls:unknown[]=[];
 const deps:PeopleDependencies={enabled:true,currentActor:async()=>({allowed:true}),rpc:async(name,args)=>{calls.push({name,args});return{publicId:id,displayName:'Private choice',published:false,photoPublished:false,followerCount:0,email:'SECRET'};}};
 const invoke=(body:unknown,override:Partial<PeopleDependencies>={},origin='https://touchline.test')=>handlePublicOwners(new Request('https://touchline.test/api/account/public-profile/onboarding',{method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),'onboarding',{...deps,...override});
 for(const body of [{displayName:'Name'},{displayName:'Name',intentVersion:2},{displayName:'a@b',intentVersion:1},{displayName:'Name',intentVersion:1,accountId:id}])assert.equal((await invoke(body)).status,400);
 const body={displayName:'Chosen name',intentVersion:1};
 assert.equal((await invoke(body,{enabled:false})).status,503);
 assert.equal((await invoke(body,{currentActor:async()=>null})).status,401);
 assert.equal((await invoke(body,{currentActor:async()=>({allowed:false})})).status,403);
 assert.equal((await invoke(body,{},'https://evil.test')).status,403);assert.equal(calls.length,0);
 const response=await invoke(body);assert.equal(response.status,200);const text=await response.text();assert.doesNotMatch(text,/SECRET|email/);assert.equal(JSON.parse(text).profile.published,false);
 assert.deepEqual(calls,[{name:'touchline_people_complete_first_access',args:{p_display_name:'Chosen name',p_intent_version:1}}]);
 assert.equal((await invoke({...body,handle:'alex23'})).status,400);
 assert.equal(calls.length,1,'unsupported identifiers never reach a database writer');
 for(const handle of ['@alex','UPPER','a',null,123])assert.equal((await invoke({...body,handle})).status,400);
 assert.equal((await invoke(body,{rpc:async()=>{throw new Error('down');}})).status,503);
});
