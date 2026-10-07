import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimTouchlineFixtureRecovery, finishTouchlineFixtureRecovery, persistTouchlineRecoveryFeed } from "../lib/football-data/fixture-backlog-recovery.ts";
import type { TouchlineFantasyFixtureFeed } from "../lib/football-data/types.ts";

const claim = { fixtureId:"10000000-0000-4000-8000-000000000380", providerFixtureId:"380", attemptCount:1, status:"NS", reservationId:"10000000-0000-4000-8000-000000000090" };
const scope = {seasonId:"season",providerSeasonId:"25600",competitionId:"competition"};
test("new recovery claims reject missing or malformed reservation and attempt", async () => {
  for (const invalid of [{...claim,reservationId:undefined},{...claim,reservationId:"wrong"},{...claim,attemptCount:0},{...claim,attemptCount:9},{...claim,attemptCount:1.5}]) {
    const admin = {rpc:async()=>({data:invalid,error:null})} as unknown as SupabaseClient;
    await assert.rejects(()=>claimTouchlineFixtureRecovery(admin,scope,"run",0,[]),/recovery-claim-invalid/);
  }
  const admin = {rpc:async()=>({data:claim,error:null})} as unknown as SupabaseClient;
  assert.deepEqual(await claimTouchlineFixtureRecovery(admin,scope,"run",0,[]),claim);
});
test("finish and feed persistence carry the same reservation to the RPC boundary", async () => {
  const calls: Array<{name:string,args:Record<string,unknown>}> = [];
  const admin = {rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:true,error:null};}} as unknown as SupabaseClient;
  await finishTouchlineFixtureRecovery(admin,claim,"run",0,"pending","provider_error");
  const feed = {fixture:{provider:"sportmonks",providerId:"380"},lineups:[],events:[],formations:[],sidelined:[]} as unknown as TouchlineFantasyFixtureFeed;
  assert.equal((await persistTouchlineRecoveryFeed(admin,claim,"run",feed)).persisted,true);
  assert.equal(calls.length,2);
  for (const call of calls) assert.equal(call.args.p_reservation_id,claim.reservationId,call.name);
});
