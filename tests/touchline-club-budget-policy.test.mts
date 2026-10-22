import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
import { CLUB_PLANS } from "../lib/touchlineFantasy/club-market-rules.ts";
import { TOUCHLINE_FANTASY_BETA_BUDGET_EUR } from "../lib/touchlineFantasy/market-plan-policy.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261020161513_club_collection_approved_plan_budgets.sql", import.meta.url), "utf8");
const id = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("approved collection budgets do not change the historical Beta XI budget", () => {
  assert.deepEqual(Object.values(CLUB_PLANS).map(p => p.budget), [100_000_000,750_000_000,1_500_000_000,3_000_000_000]);
  assert.equal(TOUCHLINE_FANTASY_BETA_BUDGET_EUR,50_000_000);
});
test("forward budget migration preserves installed guards, ACL, coach debit and existing balances", async () => {
  const db = await clubRoundDatabase({beforeApprovedBudgets:true});
  const inspect = () => db.query<{definition:string;acl:unknown}>("select pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where oid='public.touchline_club_initialize_collection(uuid,uuid,text,jsonb)'::regprocedure");
  try {
    const before = (await inspect()).rows[0];
    await db.exec(migration);
    const after = (await inspect()).rows[0];
    assert.equal(after.acl,before.acl);
    assert.equal(after.definition,before.definition.replace("when 'standard' then 500000000 when 'master' then 800000000 when 'vip' then 1200000000","when 'standard' then 750000000 when 'master' then 1500000000 when 'vip' then 3000000000"));
    await db.exec(migration);
    assert.deepEqual((await inspect()).rows[0],after);
    await db.exec(`insert into users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');
      insert into football_competitions values('${id(10)}'); insert into football_seasons values('${id(11)}');
      insert into football_rounds values('${id(12)}','${id(10)}','${id(11)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values('england','${id(10)}','${id(11)}',2990,'GBP',400000000,3);
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status)
      values('${id(13)}','${id(12)}','${id(10)}','${id(11)}',clock_timestamp()+interval '2 hours','NS');
      select touchline_fantasy_sync_gameweeks();`);
    const coach = {id:"fixture-coach",tier:"ruby-red",valueEur:5_000_000};
    for (const [index,plan,budget] of [[1,"standard",750_000_000],[2,"master",1_500_000_000],[3,"vip",3_000_000_000]] as const) {
      await db.query("insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values($1,'active','qa_grant',$2)",[id(index),plan]);
      const init = () => db.query<{state:{balanceEur:number}}>("select touchline_club_initialize_collection($1,$2,$3,$4::jsonb) state",[id(index),id(11),plan,JSON.stringify(coach)]);
      assert.equal((await init()).rows[0].state.balanceEur,budget-5_000_000);
      await db.query("update touchline_club_collections set state=jsonb_set(state,'{balanceEur}','123456'::jsonb) where user_id=$1",[id(index)]);
      await db.exec(migration);
      assert.equal((await init()).rows[0].state.balanceEur,123456);
    }
    await assert.rejects(db.query("select touchline_club_initialize_collection($1,$2,'beta',$3::jsonb)",[id(4),id(11),JSON.stringify(coach)]),/CLUB_INITIAL_STATE_INVALID/);
  } finally { await db.close(); }
});
