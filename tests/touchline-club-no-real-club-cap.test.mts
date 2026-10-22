import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectClubQuota, applyClubTransfer, replaceClubQuotaPlayer } from "../lib/touchlineFantasy/club-market-rules.ts";
import { acquireClubPlayer, type ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";

const migration = readFileSync(new URL("../supabase/migrations/20261017195405_club_collection_remove_real_club_cap.sql", import.meta.url), "utf8");
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

test("all plans permit any real-club concentration while identities, plan and season remain validated", () => {
  const players = Array.from({ length: 35 }, (_, n) => ({ playerId: String(n), clubId: "same" }));
  for (const plan of ["beta", "standard", "master", "vip"] as const) {
    assert.equal(inspectClubQuota(players, plan, "season").get("same"), 35);
  }
  assert.throws(() => inspectClubQuota([...players, players[0]], "vip", "season"), /CLUB_DUPLICATE_PLAYER/);
  assert.throws(() => inspectClubQuota([{playerId:"",clubId:"same"}], "vip", "season"), /CLUB_PLAYER_IDENTITY_REQUIRED/);
  assert.throws(() => inspectClubQuota([{playerId:"p",clubId:" "}], "vip", "season"), /CLUB_PLAYER_IDENTITY_REQUIRED/);
  assert.throws(() => inspectClubQuota(players, "unknown" as "vip", "season"), /CLUB_PLAN_INVALID/);
  assert.throws(() => inspectClubQuota(players, "vip", " "), /CLUB_SEASON_REQUIRED/);
});

test("transfers and exchanges no longer grant or require club-cap exceptions", () => {
  const players = Array.from({ length: 6 }, (_, n) => ({playerId:String(n),clubId:n===5?"other":"same",transferException:{legacy:true}}));
  const moved = applyClubTransfer(players, "vip", "season", { id:"event", playerId:"5",fromClubId:"other",toClubId:"same",confirmed:true });
  assert.equal(inspectClubQuota(moved,"vip","season").get("same"),6);
  assert.equal(Object.hasOwn(moved[5],"transferException"),false);
  const exchanged = replaceClubQuotaPlayer(moved,"5",{playerId:"new",clubId:"same",transferException:{legacy:true}},"vip","season");
  assert.equal(exchanged[5].playerId,"new");
  assert.equal(Object.hasOwn(exchanged[5],"transferException"),false);
  assert.throws(()=>replaceClubQuotaPlayer(moved,"5",moved[0],"vip","season"),/CLUB_ALREADY_OWNED/);
  assert.throws(()=>applyClubTransfer(players,"vip","season",{id:"event",playerId:"5",fromClubId:"other",toClubId:"same",confirmed:false}),/CLUB_TRANSFER_CONFIRMATION_REQUIRED/);
});

test("forward migration removes only active club-cap guards and permits the fourth same-club purchase", async () => {
  const db = await clubRoundDatabase();
  try {
    const qaPreimage = JSON.parse(readFileSync(new URL('./fixtures/qa-club-cap-preimage-20261018.json', import.meta.url), 'utf8')) as {definition:string}[];
    await db.exec(qaPreimage.map(row => row.definition).join(';\n'));
    const signatures = ["touchline_club_commit_acquisition(uuid,uuid,bigint,jsonb,jsonb)", "touchline_club_project_lineup(uuid,uuid,text,text,jsonb,text,text)"];
    const acl = async () => (await db.query("select oid::regprocedure::text signature, proacl::text acl, prosecdef definer from pg_proc where oid in ($1::regprocedure,$2::regprocedure) order by signature",signatures)).rows;
    const before = await acl();
    const originals = await Promise.all(signatures.map(async signature => (await db.query<{definition:string}>("select pg_get_functiondef($1::regprocedure) definition",[signature])).rows[0].definition));
    await db.exec(migration);
    assert.deepEqual(await acl(),before);
    for (const signature of signatures) {
      const definition = (await db.query<{definition:string}>("select pg_get_functiondef($1::regprocedure) definition",[signature])).rows[0].definition;
      assert.doesNotMatch(definition,/CLUB_TEAM_LIMIT/);
      assert.match(definition,/CLUB_(?:INVALID_DEBIT|PLAN_MISMATCH)/);
    }
    // Rehearse definition-only recovery before any purchase, then retry the
    // exact rejected command across the retirement migration below.
    await db.exec(originals.join(";\n"));
    assert.deepEqual(await acl(), before);
    await db.exec(`insert into users values('${id(1)}');insert into football_competitions values('${id(2)}');insert into football_seasons values('${id(3)}');
      insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);
      insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(1)}','active','qa_grant','standard');
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status) values('${id(6)}','${id(4)}','${id(2)}','${id(3)}',clock_timestamp()+interval '2 hours','NS');
      select touchline_fantasy_sync_gameweeks();
      insert into football_players(id,current_club_id,position) values('${id(100)}','${id(20)}','GK');
      insert into football_player_market_values values('${id(300)}','${id(100)}',10000000,'verified','verified');
      insert into touchline_card_publications(id,player_id,publication_status,market_value_id) values('${id(400)}','${id(100)}','published','${id(300)}');`);
    const initial = (await db.query<{state:ClubAcquisitionState}>("select touchline_club_initialize_collection($1,$2,'standard',$3::jsonb) state",[id(1),id(3),JSON.stringify({id:"307",tier:"ruby-red",valueEur:5_000_000})])).rows[0].state;
    const owned = (["GK","CB","RB"] as const).map((position,n)=>({playerId:id(200+n),clubId:id(20),position,valueEur:10_000_000,area:"outside" as const,slot:n}));
    const seeded = {...initial,revision:3,balanceEur:initial.balanceEur-30_000_000,players:owned};
    await db.query("update touchline_club_collections set state=$1::jsonb,revision=3",[JSON.stringify(seeded)]);
    const command = {playerId:id(100),area:"reserves" as const,slot:0,expectedRevision:3,idempotencyKey:"fourth_same_club"};
    const next = acquireClubPlayer(seeded,command,{marketOpen:true,allowedClubIds:null,offer:{playerId:id(100),clubId:id(20),position:"GK",valueEur:10_000_000,published:true}}).state;
    await assert.rejects(db.query("select touchline_club_commit_acquisition($1,$2,3,$3::jsonb,$4::jsonb)",
      [id(1),id(3),JSON.stringify(next),JSON.stringify(command)]), /CLUB_TEAM_LIMIT/);
    assert.deepEqual((await db.query<{state:ClubAcquisitionState}>("select state from touchline_club_collections where user_id=$1",[id(1)])).rows[0].state,seeded);
    assert.equal((await db.query<{n:number}>("select count(*)::int n from touchline_club_collection_operations")).rows[0].n,0);
    await db.exec(migration);
    assert.deepEqual(await acl(),before);
    await assert.rejects(db.query("select touchline_club_commit_acquisition($1,$2,3,$3::jsonb,$4::jsonb)",
      [id(1),id(3),JSON.stringify({...next,balanceEur:seeded.balanceEur}),JSON.stringify(command)]), /CLUB_INVALID_DEBIT/);
    const unchanged = (await db.query<{state:ClubAcquisitionState}>("select state from touchline_club_collections where user_id=$1 and season_id=$2",[id(1),id(3)])).rows[0].state;
    assert.deepEqual(unchanged,seeded,"removing club cap must not allow unpaid acquisition or partial persistence");
    const result = (await db.query<{state:ClubAcquisitionState}>("select touchline_club_commit_acquisition($1,$2,3,$3::jsonb,$4::jsonb) state",[id(1),id(3),JSON.stringify(next),JSON.stringify(command)])).rows[0].state;
    assert.equal(result.players.length,4);
    assert.equal(result.balanceEur,seeded.balanceEur-10_000_000);
    assert.deepEqual(result,next);
    const replay = (await db.query<{state:ClubAcquisitionState}>("select touchline_club_commit_acquisition($1,$2,3,$3::jsonb,$4::jsonb) state",[id(1),id(3),JSON.stringify(next),JSON.stringify(command)])).rows[0].state;
    assert.deepEqual(replay,result,"fourth same-club purchase retry never charges twice");
    assert.equal((await db.query<{n:number}>("select count(*)::int n from touchline_club_collection_operations")).rows[0].n,1);
  } finally { await db.close(); }
});
