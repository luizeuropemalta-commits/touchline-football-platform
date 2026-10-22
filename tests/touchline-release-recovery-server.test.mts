import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as recovery from "../lib/touchlineFantasy/club-release-recovery.ts";
import * as release from "../lib/touchlineFantasy/club-release.ts";
import type { readClubReleaseRecovery, ReleaseRecoveryReadRepository, ReleaseRecoveryScope } from "../lib/touchlineFantasy/club-release-recovery-server.ts";
const exports={} as {readClubReleaseRecovery:typeof readClubReleaseRecovery};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineFantasy/club-release-recovery-server.ts",import.meta.url),"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
{exports,require:(name:string)=>{
  if(name==="server-only")return {};
  if(name==="./club-release-recovery.ts")return recovery;
  if(name==="./club-release.ts")return release;
  throw new Error(`Unexpected dependency ${name}`);
}});
const read=exports.readClubReleaseRecovery;
const id=(n:number)=>`99000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const command={action:"release",playerId:id(3),expectedRevision:4,idempotencyKey:"server_recovery_key"};
const ref={schemaVersion:1,createdAt:1,expectedAccountId:id(1),expectedSeasonId:id(2),...command};
const receipt={player_id:id(3),idempotency_key:command.idempotencyKey,revision:5,paid_credits:10_000_000,fee_credits:1_000_000,refund_credits:9_000_000};
const snapshot={revision:7,seasonId:id(2),plan:"vip",balanceEur:103_000_000,coach:{id:"coach",tier:"sapphire-blue",valueEur:10_000_000},players:[],receipts:[]};
function fixture(options:{op?:unknown;receipt?:unknown;snapshot?:unknown;fail?:string}={}) {
  const calls:{method:string;scope:ReleaseRecoveryScope}[]=[];
  const record=(method:string,scope:ReleaseRecoveryScope)=>{
    calls.push({method,scope});assert.equal(scope.ownerId,id(1));assert.equal(scope.seasonId,id(2));assert.equal(scope.idempotencyKey,command.idempotencyKey);
    if(options.fail===method)throw new Error("fixture unavailable");
  };
  const repo:ReleaseRecoveryReadRepository={
    operation:async scope=>{record("operation",scope);return ("op" in options?options.op:{command,revision:5}) as Awaited<ReturnType<ReleaseRecoveryReadRepository["operation"]>>;},
    receipt:async scope=>{record("receipt",scope);return "receipt" in options?options.receipt:receipt;},
    snapshot:async scope=>{record("snapshot",scope);return "snapshot" in options?options.snapshot:snapshot;},
  };
  return {repo,calls};
}
test("absent auth, mismatched owner and invalid request never query",async()=>{
  for(const [owner,input,epoch,status] of [[null,ref,1,"auth_required"],[id(9),ref,1,"context_changed"],[id(1),{...ref,expectedSeasonId:"bad"},1,"invalid_request"],[id(1),ref,-1,"invalid_request"]] as const) {
    const f=fixture();assert.equal((await read(f.repo,owner,input,epoch)).status,status);assert.equal(f.calls.length,0);
  }
});
test("historical committed receipt is independent of any release gate and optional snapshot",async()=>{
  // No gate dependency exists: requiring one would throw in the module loader above.
  const f=fixture();const value=await read(f.repo,id(1),ref,2);
  assert.equal(value.status,"committed");assert.ok(value.resolved);assert.equal(value.snapshot,null);
  assert.deepEqual(f.calls.map(c=>c.method),["operation","receipt"]);
  assert.equal(value.context.epoch,2);
});
test("not observed is uncertainty; missing receipt and query errors fail closed",async()=>{
  const absent=fixture({op:null});assert.equal((await read(absent.repo,id(1),ref,1)).status,"not_observed");assert.equal(absent.calls.length,1);
  for(const options of [{receipt:null},{receipt:{...receipt,refund_credits:1}},{op:{command,revision:6}},{fail:"operation"},{fail:"receipt"}]) {
    const f=fixture(options);assert.equal((await read(f.repo,id(1),ref,1)).status,"unavailable");
  }
});
test("stored command mismatch refuses receipt lookup",async()=>{
  for(const patch of [{playerId:id(9)},{idempotencyKey:"other_key"},{expectedRevision:3},{action:"allocate"}]) {
    const f=fixture({op:{command:{...command,...patch},revision:5}});
    assert.equal((await read(f.repo,id(1),ref,1)).status,"conflict");assert.equal(f.calls.length,1);
  }
});
test("newer valid snapshot is optional; invalid or failed snapshot cannot erase receipt confirmation",async()=>{
  const f=fixture();const value=await read(f.repo,id(1),ref,1,true);
  assert.ok(value.resolved);assert.deepEqual(value.snapshot,snapshot);assert.equal(f.calls.length,3);
  for(const options of [{snapshot:{...snapshot,revision:4}},{snapshot:{...snapshot,seasonId:id(9)}},{fail:"snapshot"}]) {
    const broken=fixture(options);const receiptOnly=await read(broken.repo,id(1),ref,1,true);
    assert.ok(receiptOnly.resolved);assert.equal(receiptOnly.snapshot,null);
  }
});
