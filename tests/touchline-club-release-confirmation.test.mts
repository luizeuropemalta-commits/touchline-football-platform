import test from "node:test";
import assert from "node:assert/strict";
import { parseClubReleaseCommand, clubReleaseConfirmation } from "../lib/touchlineFantasy/club-release.ts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";
const playerId="30000000-0000-4000-8000-000000000007";
const state:ClubAcquisitionState={revision:1,seasonId:"season",plan:"vip",balanceEur:700_000_000,
  coach:{id:"coach",tier:"sapphire-blue",valueEur:10_000_000},receipts:[],
  players:[{playerId,clubId:"club",position:"RB",area:"outside",slot:1,valueEur:45_000_000}]};
test("release confirmation uses the owned contract and does not mutate or refund the squad",()=>{
  const before=structuredClone(state);
  assert.deepEqual(clubReleaseConfirmation(state,playerId),{playerId,revision:1,paidCredits:45_000_000,rate:10,fee:4_500_000,refund:40_500_000});
  assert.deepEqual(state,before);
  assert.throws(()=>clubReleaseConfirmation(state,"someone-else"),/CLUB_PLAYER_NOT_OWNED/);
});
test("release command cannot supply refunds, prices, owner, plan or an exemption",()=>{
  const command={action:"release",playerId,expectedRevision:1,idempotencyKey:"release_original"};
  assert.deepEqual(parseClubReleaseCommand(command),command);
  for(const patch of [{refund:45_000_000},{fee:0},{ownerId:playerId},{plan:"vip"},{reason:"left-league"},{expectedRevision:1.1},{action:"move"},{playerId:"wrong"}])
    assert.equal(parseClubReleaseCommand({...command,...patch}),null);
});
