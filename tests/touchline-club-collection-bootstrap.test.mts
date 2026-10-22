import test from "node:test";
import assert from "node:assert/strict";
import { confirmedCollectionBootstrap } from "../lib/touchlineFantasy/club-collection-bootstrap.ts";
import type { ClubCollectionReadResult } from "../lib/touchlineFantasy/club-collection-read-server.ts";

const authority = { expectedAccountId: "30000000-0000-4000-8000-000000000001", expectedSeasonId: "30000000-0000-4000-8000-000000000003" };
const base: ClubCollectionReadResult = {status:"confirmed",accountId:authority.expectedAccountId,seasonId:authority.expectedSeasonId,state:null,initialBudget:{plan:"vip",balanceEur:3_000_000_000},releaseAvailable:false};
test("SSR bootstrap validates authority, explicit emptiness and exact allowance without granting unavailable data",()=>{
  assert.ok(confirmedCollectionBootstrap(base,authority));
  for(const value of [undefined,null,{status:"unavailable",error:"CLUB_STORAGE_UNAVAILABLE",httpStatus:503},
    {...base,accountId:"other"},{...base,seasonId:"other"},{...base,state:undefined},
    {...base,initialBudget:null},{...base,initialBudget:{plan:"vip",balanceEur:1}},
    {...base,state:{seasonId:authority.expectedSeasonId}}]) {
    assert.equal(confirmedCollectionBootstrap(value as ClubCollectionReadResult,authority),null);
  }
  assert.equal(confirmedCollectionBootstrap(base,null),null);
});
