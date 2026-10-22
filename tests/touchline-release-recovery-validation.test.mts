import test from "node:test";
import assert from "node:assert/strict";
import { parseClubReleaseRecoveryReference as reference, parseClubReleaseRecoveryResult as parseResult, selectClubReleaseRecoverySnapshot as selectSnapshot, type ClubReleaseRecoveryResult } from "../lib/touchlineFantasy/club-release-recovery.ts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";
const id=(n:number)=>`99000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const context={expectedAccountId:id(1),expectedSeasonId:id(2)};
const currentContext={...context,epoch:1};
const result=(input:unknown,ref:unknown,authority:typeof context)=>parseResult(input,ref,{...authority,epoch:1});
const select=(current:ClubAcquisitionState|null,value:ClubReleaseRecoveryResult)=>selectSnapshot(current,value,currentContext);
const command={action:"release",playerId:id(3),expectedRevision:4,idempotencyKey:"recovery_original"};
const ref={schemaVersion:1,createdAt:1,...context,...command};
const snapshot:ClubAcquisitionState={seasonId:id(2),revision:5,plan:"vip",balanceEur:109_000_000,
  coach:{id:"coach",tier:"sapphire-blue",valueEur:10_000_000},players:[],receipts:[]};
const dto={status:"committed",accountId:id(1),seasonId:id(2),command,operationRevision:5,snapshot,
  receipt:{idempotency_key:command.idempotencyKey,player_id:id(3),paid_credits:10_000_000,fee_credits:1_000_000,refund_credits:9_000_000,revision:5}};
test("minimal versioned reference rejects financial extras and invalid identity/action",()=>{
  assert.deepEqual(reference(ref),ref);
  for(const patch of [{balance:1},{schemaVersion:2},{createdAt:-1},{action:"purchase"},{expectedAccountId:"bad"},{idempotencyKey:"short"}])
    assert.equal(reference({...ref,...patch}),null);
});
test("recovery binds exact owner season command key and expected revision",()=>{
  assert.equal(result(dto,ref,context)?.resolved,true);
  for(const patch of [{accountId:id(9)},{seasonId:id(9)},
    ...[{action:"allocate"},{playerId:id(9)},{idempotencyKey:"another_key"},{expectedRevision:3}].map(p=>({command:{...command,...p}}))])
    assert.equal(result({...dto,...patch},ref,context),null);
  assert.equal(result(dto,ref,{...context,expectedAccountId:id(9)}),null);
});
test("committed requires matching arithmetic and revision, not absent athlete",()=>{
  for(const patch of [{receipt:null},{receipt:{...dto.receipt,fee_credits:0}},
    {receipt:{...dto.receipt,refund_credits:10_000_000}},{receipt:{...dto.receipt,revision:6}},
    {operationRevision:6},{snapshot:{...snapshot,revision:4}},{snapshot:{...snapshot,seasonId:id(9)}}])
    assert.equal(result({...dto,...patch},ref,context),null);
  assert.equal(result({...dto,status:"unknown",receipt:null},ref,context),null);
});
test("unobserved unavailable conflict remain unresolved regardless of age or player absence",()=>{
  for(const status of ["not_observed","unavailable","conflict"]) {
    const checked=result({...dto,status,receipt:null},ref,context);
    assert.ok(checked);assert.equal(checked.resolved,false);assert.equal(select(snapshot,checked),snapshot);
  }
});
test("confirmed newer snapshot cannot be reverted or refunded again",()=>{
  const checked=result(dto,ref,context);assert.ok(checked?.resolved);
  const newer={...snapshot,revision:6,balanceEur:103_000_000};
  assert.equal(select(newer,checked),newer);
  assert.equal(select(snapshot,checked),snapshot);
  assert.equal(select({...newer,seasonId:id(9)},checked)?.seasonId,id(9));
  assert.equal(select(null,checked),snapshot);
  assert.equal(result({...dto,snapshot:newer},ref,context)?.resolved,true);
});
test("historical receipt confirms independently of an optional snapshot",()=>{
  for(const optional of [undefined,null]) {
    const checked=parseResult({...dto,snapshot:optional},ref,currentContext);
    assert.ok(checked?.resolved);assert.equal(checked.snapshot,null);
    assert.equal(selectSnapshot(snapshot,checked,currentContext),snapshot);
    assert.equal(selectSnapshot(null,checked,currentContext),null);
  }
});
test("late response cannot populate null or other-owner state after authority or epoch changes",()=>{
  const checked=parseResult(dto,ref,currentContext);assert.ok(checked?.resolved);
  for(const changed of [{...currentContext,expectedAccountId:id(9)},{...currentContext,expectedSeasonId:id(9)},
    {...currentContext,epoch:2},{...currentContext,epoch:-1}]) {
    assert.equal(selectSnapshot(null,checked,changed),null);
    assert.equal(selectSnapshot(snapshot,checked,changed),snapshot);
  }
  assert.equal(parseResult(dto,ref,{...currentContext,epoch:NaN}),null);
});
test("readquired athlete in a newer snapshot survives historical receipt confirmation",()=>{
  const reacquired:ClubAcquisitionState={...snapshot,revision:7,balanceEur:103_000_000,
    players:[{playerId:id(3),clubId:id(4),position:"RB",area:"outside",slot:1,valueEur:6_000_000}]};
  const checked=parseResult({...dto,snapshot:reacquired},ref,currentContext);assert.ok(checked?.resolved);
  assert.equal(selectSnapshot(null,checked,currentContext),reacquired);
  const latest={...reacquired,revision:8,balanceEur:101_000_000};
  assert.equal(selectSnapshot(latest,checked,currentContext),latest);
});
