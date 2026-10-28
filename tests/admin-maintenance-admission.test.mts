import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {NextRequest,NextResponse} from 'next/server.js';
for(const file of ['sync-starter','player-season-statistics/sync']){
 const source=readFileSync(new URL(`../app/api/football-data/${file}/route.ts`,import.meta.url),'utf8');
 function harness(mode:string){let calls=0;const exports={} as {POST(request:NextRequest):Promise<NextResponse>};const run=async()=>{calls++;return{ok:true,status:'success'};};const imports:Record<string,unknown>={
 'next/server':{NextRequest,NextResponse},'node:crypto':{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},
 '@/lib/admin/owner':{isOwnerEmail:()=>mode!=='customer'},'@/lib/touchlineArena/auth-access':{hasTouchLineArenaAccess:()=>mode!=='no-access'},
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:mode==='anonymous'?null:{email:'owner@example.invalid'}},error:mode==='auth-error'?{}:null})}})},
 '@/lib/supabase/admin':{createAdminClient:()=>({})},
 '@/lib/football-data/capability-sync':{syncSportmonksProviderCapabilities:run},'@/lib/football-data/fixture-schedule-sync':{syncSportmonksFixtureSchedule:run},'@/lib/football-data/starter-sync':{syncSportmonksStarterFoundation:run},'@/lib/football-data/qa-country-sync':{syncQaCountryData:run},'@/lib/football-data/qa-twenty-club-roster-sync':{syncQaTwentyClubRosters:run},
 '@/lib/football-data/player-season-statistics-store':{syncTouchLinePlayerSeasonStatistics:run},'@/lib/touchlinePreview/isolation':{inspectTouchlineIsolatedPreviewEnvironment:()=>({status:'qa'})},'@/lib/football-data/production-sync-runtime':{inspectTouchlineProductionSyncRuntime:()=>({allowed:false})},
 };
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,process:{env:{NODE_ENV:'production',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'qa',TOUCHLINE_QA_SUPABASE_PROJECT_REF:'xgxbwqxjssxxuihuwmgy',FOOTBALL_DATA_SYNC_SECRET:'synthetic-secret'}},require:(k:string)=>{assert.ok(k in imports,k);return imports[k];}});
 const headers:Record<string,string>={};if(mode==='secret')headers.authorization='Bearer synthetic-secret';else if(mode!=='missing-origin')headers.origin=mode==='cross-origin'?'https://evil.invalid':'https://qa.invalid';if(mode==='cross-site')headers['sec-fetch-site']='cross-site';
 return{calls:()=>calls,post:()=>exports.POST(new NextRequest('https://qa.invalid/api?scope=foundation',{method:'POST',headers}))};
 }
 test(`${file}: owner mutation requires current authorized session and same-origin request`,async()=>{for(const mode of ['customer','no-access','anonymous','auth-error','missing-origin','cross-origin','cross-site']){const h=harness(mode);assert.equal((await h.post()).status,401,mode);assert.equal(h.calls(),0,mode);}for(const mode of ['owner','secret']){const h=harness(mode);assert.equal((await h.post()).status,200,mode);assert.equal(h.calls(),1,mode);}});
}
