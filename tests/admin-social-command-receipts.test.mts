import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111';
const checksum='sha256:'+'a'.repeat(64);
function fixture(route: 'review'|'template-policy', receipt: unknown, rpcError=false, contentType='MATCH_PREVIEW', rankingSource?:()=>string) {
 const calls: string[]=[];const intents:string[]=[];let sourceReads=0;
 const template={id,templateIdentityChecksum:checksum,visualTemplateChecksum:checksum,baseCopyChecksum:checksum,exemplarManifestChecksum:checksum,exemplarArtifactChecksum:checksum,artifactStorageProvider:'SUPABASE_STORAGE',artifactStorageBucket:'touchline-social-drafts',artifactStorageKey:'immutable',artifactEtag:null,artifactContentType:'image/png',artifactByteLength:12,width:1080,height:1350};
 const draft={id,content_type:contentType,team_provider_id:'123',approval_state:'REVIEW_REQUIRED',caption_approval_state:'REVIEW_REQUIRED',artwork_approval_state:'REVIEW_REQUIRED',caption_checksum:checksum,artifact_checksum:checksum,manifest_checksum:checksum,source_version:'1',source_checksum:checksum,source_revision_checksum:checksum,input_checksum:checksum,artifact_storage_provider:'SUPABASE_STORAGE',artifact_storage_bucket:'touchline-social-drafts',artifact_storage_key:'immutable',artifact_etag:null,artifact_content_type:'image/png',artifact_byte_length:12,width:1080,height:1350};
 const queryFor=(table:string)=>{
  const data=table==='touchline_social_publication_drafts'?draft:table==='touchline_social_generation_reviews'?{review_state:'GENERATED',generated_draft_id:id}:table==='touchline_social_generation_cycles'?{lease_token:null,consecutive_failures:0,last_completed_at:new Date().toISOString(),last_outcome:'SUCCESS'}:{id};
  const query={select:()=>query,eq:()=>query,in:async()=>({data:[],error:null}),maybeSingle:async()=>({data,error:null})};return query;
 };
 const deps:Record<string,unknown>={
 'next/server':{NextResponse:{json:Response.json}},
 '@/lib/admin/owner':{isOwnerEmail:()=>true},'@/lib/touchlineArena/auth-access':{hasTouchLineArenaAccess:()=>true},
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id,email:'synthetic.invalid'}},error:null})},rpc:async(name:string)=>{calls.push(name);return{data:receipt,error:rpcError?{message:'PRIVATE_REPLAY_REJECTED'}:null};}})},
 '@/lib/supabase/admin':{createAdminClient:()=>({from:queryFor,rpc:async(name:string)=>{if(name.includes('issue_review_intent'))intents.push(name);return{data:name.includes('read_template')?template:{intentId:id},error:null};}})},
 '@/lib/touchlineArena/social-artifact-storage-server':{assertTouchlineSocialQaRuntime:()=>{},createTouchlineSocialArtifactStorageFromEnvironment:()=>({})},
 '@/lib/touchlineArena/social-publication-contract':{verifyTouchlineSocialStoredArtifact:async()=>({ok:true})},
 '@/lib/touchlineArena/social-confirmed-event-contract':{TOUCHLINE_SOCIAL_CONFIRMED_EVENT_CONTENT_TYPES:[]},
 '@/lib/touchlineArena/social-draft-executor-health':{touchlineSocialExecutorHealth:()=>({operational:true})},
 '@/lib/touchlineArena/social-lineup-draft-server':{readTouchlineSocialLineupDraft:async()=>({ok:true,data:{sourceVersion:'1',sourceChecksum:checksum,sourceRevisionChecksum:checksum}})},
 '@/lib/touchlineArena/social-ranking-family-draft-server':{readTouchlineSocialRankingFamilyDraft:async()=>{sourceReads++;return{ok:true,data:{sourceVersion:'1',sourceChecksum:rankingSource?.()??checksum,sourceRevisionChecksum:checksum}};}},
 '@/lib/touchlineArena/social-match-preview-draft-server':{readTouchlineSocialMatchPreviewDraft:async()=>({ok:true,data:{sourceVersion:'1',sourceChecksum:checksum,sourceRevisionChecksum:checksum}})},
 };
 const exports:Record<string,(request:Request)=>Promise<Response>>={};
 const source=readFileSync(new URL(`../app/api/admin/social-publications/${route}/route.ts`,import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,TextDecoder,setTimeout,clearTimeout,require:(name:string)=>{if(name in deps)return deps[name];assert.ok(name.startsWith('@/lib/touchlineArena/social-'));return{};}});
 return {calls,intents,sourceReads:()=>sourceReads,run:(action:string)=>exports.POST(Object.assign(new Request('https://qa.invalid/api',{method:'POST',headers:{origin:'https://qa.invalid','content-type':'application/json'},body:JSON.stringify({action,draftId:id,templateId:id,expectedIdentityChecksum:checksum,expectedContentChecksum:checksum,expectedChecksum:checksum,expectedManifestChecksum:checksum,scopeKey:'GLOBAL',killSwitchEngaged:true,dailyQuota:10,minimumGapSeconds:60})}),{nextUrl:new URL('https://qa.invalid/api')}))};
}
const cases=[
 ['template-policy','set-delivery-control',{outcome:'updated',scopeKey:'GLOBAL',killSwitchEngaged:true,blockedCandidates:0,outboundMode:'DISABLED'}],
 ['template-policy','approve-template-artwork',{outcome:'approved',reviewKind:'ARTWORK',state:'TEMPLATE_APPROVAL_REQUIRED'}],
 ['template-policy','approve-template-caption',{outcome:'approved',reviewKind:'CAPTION',state:'TEMPLATE_APPROVED'}],
 ['template-policy','enable-auto-publish',{outcome:'updated',state:'AUTO_PUBLISH_ENABLED',blockedCandidates:0}],
 ['template-policy','pause-template',{outcome:'updated',state:'PAUSED',blockedCandidates:2}],
 ['template-policy','revoke-template',{outcome:'updated',state:'REVOKED',blockedCandidates:1}],
 ['review','approve-artwork',{ok:true,draftId:id,review:'ARTWORK'}],
 ['review','approve-caption',{ok:true,draftId:id,review:'CAPTION'}],
] as const;
for(const [route,action,receipt] of cases){
 test(`${action}: SQL receipt accepted; null or mismatched receipt is unconfirmed`,async()=>{
  const good=fixture(route,receipt);assert.equal((await good.run(action)).status,200);assert.equal(good.calls.length,1);
  const invalid:unknown[]=[null,[],{},true,{...receipt,outcome:'unknown',ok:false},{...receipt,state:'WRONG',review:'WRONG',reviewKind:'WRONG',scopeKey:'WRONG',draftId:'00000000-0000-4000-8000-000000000000'}];
  if('blockedCandidates'in receipt)invalid.push({...receipt,blockedCandidates:-1},{...receipt,blockedCandidates:0.5});
  for(const value of invalid){const h=fixture(route,value);const r=await h.run(action);assert.equal(r.status,503,JSON.stringify(value));assert.notEqual((await r.json()).ok,true);assert.equal(h.calls.length,1,'no blind mutation retry');}
  const replay=fixture(route,receipt,true);const response=await replay.run(action);assert.equal(response.status,409);assert.ok(!(await response.text()).includes('PRIVATE'));
 });
}

for(const kind of ['ARTWORK','CAPTION'] as const) test(`LINEUP ${kind} requires revision and exact approved checksums`,async()=>{
 const action=kind==='ARTWORK'?'approve-artwork':'approve-caption';
 const key=kind==='ARTWORK'?'approvedArtifactChecksum':'approvedCaptionChecksum';
 const receipt={ok:true,draftId:id,review:kind,revision:1,approvedManifestChecksum:checksum,[key]:checksum};
 const good=fixture('review',receipt,false,'LINEUP');assert.equal((await good.run(action)).status,200);
 assert.equal(good.calls[0],kind==='ARTWORK'?'touchline_social_approve_artwork':'touchline_social_approve_caption');
 for(const value of [{...receipt,revision:0},{...receipt,revision:1.5},{...receipt,[key]:'wrong'},{...receipt,approvedManifestChecksum:'wrong'},null]){
  const h=fixture('review',value,false,'LINEUP');assert.equal((await h.run(action)).status,503);assert.equal(h.calls.length,1);
 }
});


test('current Top3 approval recaptures after artwork and rejects a changed candidate checksum before intent',async()=>{
 const receipt={ok:true,draftId:id,review:'ARTWORK'};
 const stable=fixture('review',receipt,false,'GAMEWEEK_RANKING_PREVIEW',()=>checksum);
 assert.equal((await stable.run('approve-artwork')).status,200);assert.equal(stable.sourceReads(),2);
 assert.deepEqual(stable.intents,['touchline_social_044_issue_review_intent']);assert.equal(stable.calls.length,1);
 let reads=0;
 const returned=fixture('review',receipt,false,'GAMEWEEK_RANKING_PREVIEW',()=>++reads===1?checksum:'sha256:'+'b'.repeat(64));
 assert.equal((await returned.run('approve-artwork')).status,409);assert.equal(returned.sourceReads(),2);
 assert.deepEqual(returned.intents,[]);assert.deepEqual(returned.calls,[]);
});
