import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
type FixtureUser={id:string;user_metadata?:Record<string,unknown>;app_metadata?:Record<string,unknown>};
const require=createRequire(import.meta.url),ts=require('typescript');
test('discovery initialization precedes access grant and failure is retryable',async()=>{
 const calls:string[]=[];let fail=false;let grantFail=false;const exports:Record<string,(user:FixtureUser)=>Promise<unknown>>={};
 const admin={rpc:async(name:string)=>{calls.push(name);return{error:fail?new Error('offline'):null};},auth:{admin:{updateUserById:async()=>{calls.push('grant');return{error:grantFail?new Error('grant failed'):null};}}}};
 const mocks:Record<string,unknown>={
  '@/lib/admin/owner':{isOwnerEmail:()=>false},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/server/arena-user':{ensureArenaUserProfile:async()=>{calls.push('profile');}},
  '@/lib/touchlineArena/auth-access':{TOUCHLINE_ARENA_ACCESS_METADATA_KEY:'touchline_arena_access_v1',hasTouchLineArenaAccess:(u:FixtureUser)=>u.app_metadata?.touchline_arena_access_v1===true},
 };
 const source=readFileSync(new URL('../lib/server/touchline-arena-access.ts',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>mocks[name]});
 const user={id:'id',user_metadata:{touchline_discovery_signup_v1:{version:1,public_name:'Club',published:true}}};
 fail=true;await assert.rejects(exports.ensureTouchlineArenaAccess(user),/public profile/);assert.deepEqual(calls,['profile','touchline_people_bootstrap_signup']);
 calls.length=0;fail=false;await exports.ensureTouchlineArenaAccess(user);assert.deepEqual(calls,['profile','touchline_people_bootstrap_signup','grant']);
 calls.length=0;grantFail=true;await assert.rejects(exports.ensureTouchlineArenaAccess(user),/finalized/);assert.deepEqual(calls,['profile','touchline_people_bootstrap_signup','grant']);
 calls.length=0;grantFail=false;await exports.ensureTouchlineArenaAccess(user);assert.deepEqual(calls,['profile','touchline_people_bootstrap_signup','grant']);
 calls.length=0;await exports.ensureTouchlineArenaAccess({id:'legacy',user_metadata:{full_name:'Private name'}});assert.deepEqual(calls,['profile','grant']);
 calls.length=0;await exports.ensureTouchlineArenaAccess({...user,app_metadata:{touchline_arena_access_v1:true}});assert.deepEqual(calls,[]);
});
