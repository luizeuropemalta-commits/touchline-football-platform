import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { buildQaCandidateEnvironments } from '../scripts/local/qa-candidate-environment.mts';
import { parseCandidateArguments, assertCandidateCapacityReadings } from '../scripts/local/qa-candidate-runtime.mts';
import { inspectTouchlineIsolatedPreviewEnvironment } from '../lib/touchlinePreview/isolation.ts';
import { TOUCHLINE_QA_SUPABASE_ORIGIN } from '../lib/touchlineArena/qa-canonical-persona.ts';
const source={NEXT_PUBLIC_SUPABASE_URL:TOUCHLINE_QA_SUPABASE_ORIGIN,NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'};
const compile=ts.transpileModule(readFileSync(new URL('../next.config.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function config(env:Record<string,string|undefined>) {
 const exports:Record<string,unknown>={};
 runInNewContext(compile,{exports,process:{env},require:(name:string)=>{
  if(name==='@sentry/nextjs') return {withSentryConfig:(value:unknown)=>value};
  assert.equal(name,'./lib/touchlinePreview/isolation.ts');return {assertTouchlineIsolatedPreviewEnvironment(){}};
 }});
 return exports.default as {experimental?:{cpus?:number;webpackMemoryOptimizations?:boolean}};
}
test('explicit local build constructs bounded environment and ignores host/source flag injection',()=>{
 const injected={NODE_OPTIONS:'--require=unsafe',TOUCHLINE_LOCAL_QA_BUILD:'1',VERCEL:'1',NEXT_WEBPACK_PARALLELISM:'900'};
 const normal=buildQaCandidateEnvironments({...source,...injected},injected,{qaMarketContext:false}).preview;
 assert.equal(normal.NODE_OPTIONS,'--max-old-space-size=4096');assert.equal(normal.TOUCHLINE_LOCAL_QA_BUILD,undefined);assert.equal(normal.VERCEL,undefined);
 const build=buildQaCandidateEnvironments({...source,...injected},injected,{qaMarketContext:false,localBuild:true}).preview;
 assert.equal(build.NODE_OPTIONS,'--max-old-space-size=1536');assert.equal(build.NEXT_WEBPACK_PARALLELISM,'1');assert.equal(build.NODE_ENV,'production');
 assert.equal(inspectTouchlineIsolatedPreviewEnvironment(build).status,'qa');
 assert.equal(config(build).experimental?.cpus,1);assert.equal(config(build).experimental?.webpackMemoryOptimizations,true);
 assert.throws(()=>buildQaCandidateEnvironments(source,{}, {qaMarketContext:false,localBuild:'true' as unknown as boolean}),/boolean localBuild/);
});
test('local memory profile never changes hosted/foreign/normal configuration',()=>{
 const env=buildQaCandidateEnvironments(source,{}, {qaMarketContext:false,localBuild:true}).preview;
 for(const change of [{VERCEL_GIT_COMMIT_REF:'main'},{VERCEL:'0'},{VERCEL:'1'},{VERCEL_ENV:'production'},{TOUCHLINE_QA_SUPABASE_PROJECT_REF:'foreign'},{TOUCHLINE_DEPLOYMENT_MODE:'production'},{TOUCHLINE_LOCAL_QA_BUILD:undefined},{NODE_ENV:'development'}]) {
  const actual=config({...env,...change});assert.equal(actual.experimental?.cpus,undefined);assert.equal(actual.experimental?.webpackMemoryOptimizations,undefined);
 }
});
test('build command is explicit and critical pressure remains refused',()=>{
 assert.equal(parseCandidateArguments(['--build','--env-file','/synthetic/QA.env']).mode,'--build');
 assert.throws(()=>assertCandidateCapacityReadings(4,20*1024*1024,true),/pressure=4/);
 assert.throws(()=>assertCandidateCapacityReadings(1,1024*1024,true),/availableKiB/);
});

test('local profile flag remains forbidden to hosted QA or foreign identity in real isolation guard',()=>{
 const env=buildQaCandidateEnvironments(source,{}, {qaMarketContext:false,localBuild:true}).preview;
 for(const change of [{VERCEL:'1'},{VERCEL:'0'},{VERCEL_GIT_COMMIT_REF:'main'},{TOUCHLINE_QA_SUPABASE_PROJECT_REF:'foreign'},{NODE_ENV:'development'}]) {
  assert.equal(inspectTouchlineIsolatedPreviewEnvironment({...env,...change}).status,'invalid');
 }
});
