import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../lib/football-data/player-identity-recovery.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(mode='success'){
  const calls:string[]=[];let fetches=0;const exports:Record<string,unknown>={};
  new Function('require','exports','process',compiled)((id:string)=>{
    if(id.includes('provider-factory'))return{createFootballDataProvider:()=>({getPlayerById:async(requested:string)=>{fetches++;return{ok:true,data:{provider:'sportmonks',providerId:mode==='mismatch'?'999':requested,name:'Official',currentTeamId:'3',marketValue:999,raw:{secret:true}}};}})};
    if(id.includes('isolation'))return{inspectTouchlineIsolatedPreviewEnvironment:()=>({status:mode==='invalid'?'invalid':'qa'})};
    throw new Error(id);
  },exports,{env:{VERCEL_ENV:mode==='production'?'production':'preview',TOUCHLINE_QA_SUPABASE_PROJECT_REF:'xgxbwqxjssxxuihuwmgy'}});
  const admin={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push(name);if(name.includes('claim'))return{data:mode==='cooldown'||(mode==='first-cooldown'&&['1','2','3'].includes(String(args.p_player_id)))?null:'run',error:null};assert.doesNotMatch(JSON.stringify(args),/marketValue|currentTeamId|secret/);return{data:'canonical-id',error:null};},from:()=>({update:()=>({eq:()=>({eq:async()=>{calls.push('failure-audit');return{error:null};}})})})};
  return{calls,fetches:()=>fetches,run:(ids=['12'])=>(exports.recoverMissingLineupIdentities as (a:unknown,m:unknown)=>Promise<void>)(admin,ids.map(id=>({providerPlayerId:id,fixtureId:'fixture'})))};
}
for(const mode of ['production','invalid','cooldown'])test(`${mode} never reaches provider`,async()=>{const f=fixture(mode);await f.run();assert.equal(f.fetches(),0);assert.ok(!f.calls.some(c=>c.includes('complete')));});
test('successful exact identity uses audited completion and strips non-identity fields',async()=>{const f=fixture();await f.run();assert.deepEqual(f.calls,['touchline_claim_player_identity_recovery','touchline_complete_player_identity_recovery']);assert.equal(f.fetches(),1);});
test('mismatched response keeps score barrier and records failure',async()=>{const f=fixture('mismatch');await f.run();assert.deepEqual(f.calls,['touchline_claim_player_identity_recovery','failure-audit']);});
test('per-run work is bounded and duplicate or malformed IDs do not consume quota',async()=>{const f=fixture();await f.run(['bad','1','1','2','3','4']);assert.equal(f.fetches(),3);});
test('cooldown identities do not starve later eligible identities',async()=>{const f=fixture('first-cooldown');await f.run(['1','2','3','4']);assert.equal(f.fetches(),1);assert.equal(f.calls.filter(c=>c.includes('claim')).length,4);});
