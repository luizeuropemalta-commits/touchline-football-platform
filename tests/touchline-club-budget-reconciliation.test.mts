import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
test("operator-only reconciliation: exact CAS, entitlement, rollback, replay and stale interleaving",async()=>{
  const db=await clubRoundDatabase();
  const owner="70000000-0000-4000-8000-000000000001", season="70000000-0000-4000-8000-000000000002";
  const evidence="fixture-only: original grant and complete operation audit verified";
  const players=Array.from({length:22},(_,n)=>({playerId:`fixture-${n}`,valueEur:n===21?139900000:50000000}));
  const state={revision:42,seasonId:season,plan:"vip",balanceEur:100000,coach:{id:"fixture",valueEur:10000000},players,receipts:players.map(p=>({...p}))};
  const call=(expected=state)=>db.query<{result:{state:typeof state;replayed:boolean}}>("select touchline_budget_admin.reconcile_vip($1,$2,$3::jsonb,$4) result",[owner,season,JSON.stringify(expected),evidence]);
  try {
    await db.exec(readFileSync(new URL("../supabase/migrations/20261020163255_club_collection_budget_reconciliation.sql",import.meta.url),"utf8"));
    await db.query("insert into users values($1)",[owner]);await db.query("insert into football_seasons values($1)",[season]);
    await db.query("insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,42,$3::jsonb)",[owner,season,JSON.stringify(state)]);
    await assert.rejects(call(),/BUDGET_VIP_ENTITLEMENT_REQUIRED/);
    await db.query("insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values($1,'active','qa_grant','vip')",[owner]);
    await db.exec("set role service_role");await assert.rejects(call(),/permission denied/);await db.exec("reset role");
    await assert.rejects(call({...state,balanceEur:0}),/BUDGET_STALE_STATE/);
    await db.exec("update touchline_club_collections set state=jsonb_set(state,'{balanceEur}','1')");
    await assert.rejects(call({...state,balanceEur:1}),/BUDGET_BASE_UNEXPECTED/);
    await db.exec("update touchline_club_collections set state=jsonb_set(state,'{balanceEur}','100000')");
    await db.exec("begin");const first=(await call()).rows[0].result;
    assert.equal(first.state.balanceEur,1800100000);assert.equal(first.state.revision,43);
    assert.deepEqual(first.state.players,state.players);assert.deepEqual(first.state.coach,state.coach);assert.deepEqual(first.state.receipts,state.receipts);
    await db.exec("rollback");
    assert.equal((await db.query("select * from touchline_budget_admin.reconciliations")).rows.length,0);
    assert.equal((await db.query<{revision:number}>("select revision from touchline_club_collections")).rows[0].revision,42);
    // A competing committed command changes the snapshot before this request.
    await db.exec("update touchline_club_collections set revision=43,state=jsonb_set(state,'{revision}','43')");
    await assert.rejects(call(),/BUDGET_STALE_STATE/);
    await db.exec("update touchline_club_collections set revision=42,state=jsonb_set(state,'{revision}','42')");
    const responses=await Promise.all([call(),call()]);
    assert.deepEqual(responses.map(r=>r.rows[0].result.replayed),[false,true]);
    assert.equal((await db.query("select * from touchline_budget_admin.reconciliations")).rows.length,1);
    await assert.rejects(call({...state,balanceEur:1}),/BUDGET_REPLAY_CONFLICT/);
  } finally {await db.close();}
});
