import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { CLUB_COACH_VALUES, inspectClubAcquisition } from '../lib/touchlineFantasy/club-acquisition.ts';
const user='11111111-1111-4111-8111-111111111111',season='22222222-2222-4222-8222-222222222222',publication='33333333-3333-4333-8333-333333333333',club='44444444-4444-4444-8444-444444444444';
const state={revision:0,seasonId:season,plan:'standard',balanceEur:740_000_000,coach:{id:'99991',tier:'sapphire-blue',valueEur:10_000_000},players:[],receipts:[]};
const coach={id:'99991',selectable:true,clubId:club,slot:{cardTier:'sapphire-blue'},catalogueRevision:7,cataloguePublicationId:publication};
function fixture(path:string,replay=false){
 const calls:Array<{name:string;args:Record<string,unknown>}> = [];let catalogueReads=0,recoveryReads=0;
 const admin={from(table:string){const q={select:()=>q,eq:()=>q,single:async()=>({data:{season_id:season},error:null}),maybeSingle:async()=>({data:table==='football_clubs'?{id:club}:replay?table==='touchline_club_collections'?{state}:{id:'contract',coach_provider_id:'99991'}:null,error:null})};return q;},async rpc(name:string,args:Record<string,unknown>){calls.push({name,args});return {data:state,error:null};}};
 const modules:Record<string,unknown>={
  'next/server':{NextResponse:{json:Response.json}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:user,email:'customer@example.test'}},error:null})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/admin/owner':{ownerEmails:()=>['owner@example.test'],isOwnerEmail:()=>false},'@/lib/touchlineArena/auth-access':{hasTouchLineArenaAccess:()=>true},
  '@/lib/touchlineFantasy/club-collection-server':{clubCollectionEnabled:()=>true},'@/lib/touchlineFantasy/club-acquisition':{CLUB_COACH_VALUES,inspectClubAcquisition},
  '@/lib/touchlineFantasy/server':{loadTouchlineFantasyReadSnapshot:async()=>{catalogueReads++;return {entitlementActive:true,marketAccess:{planKey:'standard'},coaches:replay?[]:[coach]};}},
  '@/lib/touchlineFantasy/club-request':{readClubCommand:(r:Request)=>r.json()},
  '@/lib/touchlineFantasy/club-command-authority':{parseClubCommandAuthority:(v:unknown)=>v,clubCommandMatchesAuthority:()=>true},
  '@/lib/touchlineFantasy/club-coach-lifecycle':{parseClubCoachLifecycleCommand:(v:unknown)=>v},
  '@/lib/touchlineFantasy/club-coach-lifecycle-server':{clubCoachLifecycleEnabled:()=>true,createClubCoachLifecycleRepository:()=>({}),commitClubCoachLifecycle:async(_a:unknown,_u:unknown,_s:unknown,_c:unknown,offer:Record<string,unknown>)=>{calls.push({name:'lifecycle',args:offer});}},
  '@/lib/touchlineFantasy/club-coach-lifecycle-recovery-server':{readClubCoachLifecycleRecovery:async()=>({status:replay||recoveryReads++>0?'committed':'not_observed',response:{ok:true,state}})},
  '@/lib/touchlineArena/coach-catalogue-server':{loadCoachCatalogue:async()=>{catalogueReads++;if(replay)throw new Error('must not read today catalogue for historical replay');return {phase:'ready',revision:7,current:[{coach:{providerId:'99991',teamId:'19'},publicationId:publication}]};}},
  '@/lib/touchlineArena/coach-contracts-server':{readTouchlineCoachContracts:async()=>[]},'@/lib/touchlineArena/competition-card-offer':{},
 };
 const exports:Record<string,(r:Request)=>Promise<Response>>={};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>{assert.ok(Object.hasOwn(modules,name),name);return modules[name];},URL,Response});
 return {calls,reads:()=>catalogueReads,run:(method:'POST'|'PUT',body:unknown)=>exports[method](Object.assign(new Request('https://local.test/api',{method,headers:{origin:'https://local.test','sec-fetch-site':'same-origin','content-type':'application/json'},body:JSON.stringify(body)}),{nextUrl:new URL('https://local.test/api')}))};
}
const paths={initialize:'app/api/touchline-fantasy/collection/initialize/route.ts',lifecycle:'app/api/touchline-fantasy/collection/coach/route.ts',arena:'app/api/touchline-arena/coach/route.ts'};
const envelope=(command:unknown)=>({authority:{ownerId:user,seasonId:season},command});
const command={action:'hire-coach',incomingCoachId:'99991',expectedRevision:0,idempotencyKey:'test_hire_key'};

test('real collection initialize and lifecycle routes pass server-owned publication proof to the atomic writer',async()=>{
 const initialize=fixture(paths.initialize);assert.equal((await initialize.run('POST',envelope({coachId:'99991'}))).status,200);
 assert.deepEqual(JSON.parse(JSON.stringify(initialize.calls[0].args.p_coach)),{id:'99991',tier:'sapphire-blue',valueEur:10_000_000,catalogueRevision:7,cataloguePublicationId:publication});
 const lifecycle=fixture(paths.lifecycle);assert.equal((await lifecycle.run('POST',envelope(command))).status,200);
 assert.equal(lifecycle.calls[0].args.catalogueRevision,7);assert.equal(lifecycle.calls[0].args.cataloguePublicationId,publication);assert.equal(lifecycle.calls[0].args.clubId,club);
});
test('real Arena route selects the guarded overload using revision and publication from the server catalogue',async()=>{
 const arena=fixture(paths.arena);assert.equal((await arena.run('PUT',{coachProviderId:'99991',idempotencyKey:'test_hire_key'})).status,200);
 assert.equal(arena.calls[0].name,'touchline_hire_coach_contract');assert.equal(arena.calls[0].args.p_catalogue_revision,7);assert.equal(arena.calls[0].args.p_publication_id,publication);
});
test('historical HTTP replay succeeds when coach is absent from current offers and makes no mutation',async()=>{
 const initialize=fixture(paths.initialize,true);assert.equal((await initialize.run('POST',envelope({coachId:'99991'}))).status,200);assert.equal(initialize.calls.length,0);
 const lifecycle=fixture(paths.lifecycle,true);assert.equal((await lifecycle.run('POST',envelope(command))).status,200);assert.equal(lifecycle.calls.length,0);assert.equal(lifecycle.reads(),0);
 const arena=fixture(paths.arena,true);assert.equal((await arena.run('PUT',{coachProviderId:'99991',idempotencyKey:'test_hire_key'})).status,200);assert.equal(arena.calls.length,0);assert.equal(arena.reads(),0);
});
