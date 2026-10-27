import test from "node:test";
import assert from "node:assert/strict";
import { createClubReleaseBrowserRecovery, type ClubReleaseRecoveryDependencies } from "../lib/touchlineFantasy/club-release-browser-recovery.ts";
import type { ClubReleaseRecoveryReference } from "../lib/touchlineFantasy/club-release-recovery.ts";
const id=(n:number)=>`30000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const scope={expectedAccountId:id(1),expectedSeasonId:id(2)};
const reference:ClubReleaseRecoveryReference={...scope,schemaVersion:1,createdAt:1,action:"release",playerId:id(3),expectedRevision:4,idempotencyKey:"recovery_original_key"};
const command={action:"release" as const,playerId:id(3),expectedRevision:4,idempotencyKey:"recovery_original_key"};
const proof=()=>({status:"committed",accountId:id(1),seasonId:id(2),command,operationRevision:5,
  receipt:{idempotency_key:command.idempotencyKey,player_id:id(3),paid_credits:100,fee_credits:10,refund_credits:90,revision:5}});
function setup(rows:ClubReleaseRecoveryReference[]=[reference]) {
  const stored=new Map(rows.map(row=>[row.idempotencyKey,row]));const reads:ClubReleaseRecoveryReference[]=[];let removes=0,closed=0;
  let body:unknown=proof();
  const dependencies:ClubReleaseRecoveryDependencies={now:()=>1,
    open:async()=>({append:async ref=>{stored.set(ref.idempotencyKey,ref);return "inserted";},list:async()=>[...stored.values()],
      remove:async ref=>{removes++;stored.delete(ref.idempotencyKey);},close:()=>{closed++;}}),
    read:async ref=>{reads.push(ref);return body;}};
  return {stored,reads,dependencies,setBody:(value:unknown)=>{body=value;},counts:()=>({removes,closed})};
}
test("confirmed original proof is recovered on a new session with only a read",async()=>{
  const f=setup([]);const first=createClubReleaseBrowserRecovery(scope,f.dependencies);
  await first.prepare(command);first.close();assert.equal(f.stored.size,1);
  const next=createClubReleaseBrowserRecovery(scope,f.dependencies);
  const result=await next.recover(new AbortController().signal);
  assert.equal(result.confirmed.length,1);assert.equal(result.pending.length,0);assert.equal(f.stored.size,0);
  assert.equal(f.reads[0].idempotencyKey,command.idempotencyKey);next.close();
});
test("corrupt or cross-account/season journal entries are rejected before any recovery request",async()=>{
  for(const row of [{...reference,expectedAccountId:id(8)},{...reference,expectedSeasonId:id(9)},{...reference,playerId:"bad"}]) {
    const f=setup([row]);const session=createClubReleaseBrowserRecovery(scope,f.dependencies);
    await assert.rejects(session.recover(new AbortController().signal));
    assert.equal(f.reads.length,0);assert.equal(f.counts().removes,0);session.close();
  }
});
test("unobserved, malformed and other operation receipts never clear the durable intent",async()=>{
  for(const value of [{status:"not_observed"},{...proof(),accountId:id(8)},{...proof(),seasonId:id(9)},
    {...proof(),operationRevision:6},{...proof(),receipt:{...proof().receipt,idempotency_key:"another_key"}},null]) {
    const f=setup();f.setBody(value);const session=createClubReleaseBrowserRecovery(scope,f.dependencies);
    const result=await session.recover(new AbortController().signal);
    assert.equal(result.confirmed.length,0);assert.equal(result.pending.length,1);assert.equal(f.counts().removes,0);session.close();
  }
});
test("a delayed recovery cannot clear references after unmount or signal cancellation",async()=>{
  for(const dispose of [true,false]) {
    const f=setup();let reply!:(value:unknown)=>void;
    const session=createClubReleaseBrowserRecovery(scope,{...f.dependencies,read:()=>new Promise(resolve=>{reply=resolve;})});
    const controller=new AbortController();const reading=session.recover(controller.signal);
    while(!reply)await Promise.resolve();
    if(dispose)session.close();else controller.abort();
    reply(proof());await assert.rejects(reading);assert.equal(f.counts().removes,0);assert.equal(f.stored.size,1);session.close();
  }
});
test("failed journal transaction stops preparation; conflicting intent is never substituted",async()=>{
  const f=setup([]);const journal=await f.dependencies.open();
  const session=createClubReleaseBrowserRecovery(scope,{...f.dependencies,open:async()=>({...journal,append:async()=>{throw new Error("transaction aborted");}})});
  await assert.rejects(session.prepare(command));assert.equal(f.stored.size,0);session.close();
  const g=setup();const other=createClubReleaseBrowserRecovery(scope,g.dependencies);
  await assert.rejects(other.prepare({...command,playerId:id(9)}));assert.equal(g.stored.get(command.idempotencyKey)?.playerId,id(3));other.close();
});
test("failed durable removal keeps the operation pending despite a valid server proof",async()=>{
  const f=setup();const journal=await f.dependencies.open();
  const session=createClubReleaseBrowserRecovery(scope,{...f.dependencies,open:async()=>({...journal,remove:async()=>{throw new Error("abort");}})});
  const result=await session.recover(new AbortController().signal);assert.equal(result.pending.length,1);assert.equal(result.confirmed.length,0);session.close();
});
