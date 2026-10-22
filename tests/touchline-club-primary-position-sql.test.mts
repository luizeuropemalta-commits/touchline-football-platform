import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as registry } from "../lib/touchlineArena/formation-geometry.ts";
import { eligiblePrimaryDetails } from "../lib/touchlineFantasy/club-primary-position-policy.ts";
import { collectionSlotPlan } from "../lib/touchlineFantasy/club-position-plan.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261018073030_club_collection_primary_position_contract.sql", import.meta.url),"utf8");
const retirement = readFileSync(new URL("../supabase/migrations/20261017195405_club_collection_remove_real_club_cap.sql", import.meta.url),"utf8");
const preimage = JSON.parse(readFileSync(new URL("./fixtures/qa-club-primary-preimage-20261018.json",import.meta.url),"utf8")) as {
  signature:string;definition:string;definition_md5:string;acl:string;
}[];
const id=(n:number)=>`30000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
type Player={playerId:string;clubId:string;position:string;primaryDetail?:string;valueEur:number;area:string;slot:number};
type State={revision:number;seasonId:string;plan:string;balanceEur:number;coach:{id:string;tier:string;valueEur:number};formationCode?:string;players:Player[];receipts:unknown[]};
const player=(detail:string,position:string,area="outside",slot=0,n=100):Player=>({playerId:id(n),clubId:id(20),position,primaryDetail:detail,valueEur:10_000_000,area,slot});

test("primary SQL policy: installed predecessors, immutable contracts, authoritative detail and bounded completion", async t=>{
  const db=await clubRoundDatabase();
  try {
    assert.equal(preimage.length,3,"all current QA writers must be captured, including allocation");
    for(const fn of preimage)assert.equal(createHash("md5").update(fn.definition).digest("hex"),fn.definition_md5,fn.signature);
    await db.exec(preimage.map(p=>p.definition).join(";\n"));
    const definitionProof=async()=>(await db.query<{signature:string;definition_md5:string;acl:string}>(
      "select oid::regprocedure::text signature,md5(pg_get_functiondef(oid)) definition_md5,proacl::text acl from pg_proc where oid=any($1::regprocedure[]) order by signature",
      [preimage.map(fn=>fn.signature)])).rows;
    const expectedPreimage=preimage.map(({signature,definition_md5,acl})=>({signature,definition_md5,acl})).sort((a,b)=>a.signature.localeCompare(b.signature));
    await t.test("all three installed definitions and ACLs match the fresh QA capture before forward migrations",async()=>{
      assert.deepEqual(await definitionProof(),expectedPreimage);
    });
    await db.exec(retirement);
    await db.exec(`insert into users values('${id(1)}');insert into football_competitions values('${id(2)}');insert into football_seasons values('${id(3)}');
      insert into football_clubs(id) values('${id(20)}');
      insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);
      insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(1)}','active','qa_grant','standard');
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status) values('${id(6)}','${id(4)}','${id(2)}','${id(3)}',clock_timestamp()+interval '2 hours','NS');
      select touchline_fantasy_sync_gameweeks();`);
    for(const [code,geometry] of Object.entries(registry)) await db.query("insert into touchline_formation_geometry_versions values($1,1,'published',$2::jsonb)",[code,JSON.stringify(geometry)]);
    const initial=(await db.query<{state:State}>("select touchline_club_initialize_collection($1,$2,'standard',$3::jsonb) state",[id(1),id(3),JSON.stringify({id:"307",tier:"ruby-red",valueEur:5_000_000})])).rows[0].state;
    const seeded={...initial,formationCode:"4-3-3"};
    await db.query("update touchline_club_collections set state=$1::jsonb",[JSON.stringify(seeded)]);
    const oldPlayer=player('Left Wing','LW');delete oldPlayer.primaryDetail;
    const oldCommand={playerId:oldPlayer.playerId,area:'outside',slot:0,expectedRevision:0,idempotencyKey:'prepolicy_purchase'};
    const oldState={...seeded,revision:1,players:[oldPlayer],balanceEur:seeded.balanceEur-oldPlayer.valueEur};
    await db.query("insert into users values($1)",[id(9)]);
    await db.query("insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,1,$3::jsonb)",[id(9),id(3),JSON.stringify(oldState)]);
    await db.query("insert into touchline_club_collection_operations(user_id,season_id,idempotency_key,command,revision) values($1,$2,'prepolicy_purchase',$3::jsonb,1)",[id(9),id(3),JSON.stringify(oldCommand)]);
    const read=async()=>(await db.query<{state:State}>("select state from touchline_club_collections where user_id=$1",[id(1)])).rows[0].state;
    const seed=async(state:State)=>{await db.query("update touchline_club_collections set state=$1::jsonb,revision=$2 where user_id=$3",[JSON.stringify(state),state.revision,id(1)]);};
    const signatures=["touchline_club_commit_acquisition(uuid,uuid,bigint,jsonb,jsonb)","touchline_club_commit_allocation(uuid,uuid,bigint,jsonb,jsonb)","touchline_club_project_lineup(uuid,uuid,text,text,jsonb,text,text)"];
    const properties=async()=>(await db.query("select oid::regprocedure::text signature,proacl::text acl,prosecdef,proconfig from pg_proc where oid=any($1::regprocedure[]) order by signature",[signatures])).rows;
    const before=await properties();
    const originalDefinitions=(await db.query<{definition:string}>("select pg_get_functiondef(oid) definition from pg_proc where oid=any($1::regprocedure[])",[signatures])).rows;
    await t.test("an unexpected predecessor guard aborts the entire migration instead of deleting unknown validation",async()=>{
      const acquisition=originalDefinitions.find(x=>x.definition.includes('FUNCTION public.touchline_club_commit_acquisition('))!.definition;
      const altered=acquisition.replace("  if v_player->>'area'='starters' then", "  if v_player->>'area'='starters' then\n    perform 1; -- unfamiliar predecessor guard");
      assert.notEqual(altered,acquisition);await db.exec(altered);
      await assert.rejects(db.exec(migration),/CLUB_PRIMARY_UNKNOWN_PREDECESSOR/);
      await db.exec('rollback');await db.exec(acquisition);
      assert.equal((await db.query<{helper:string|null}>("select to_regprocedure('touchline_club_normalize_primary_detail(text)')::text helper")).rows[0].helper,null);
      assert.deepEqual(await read(),seeded);assert.deepEqual(await properties(),before);
    });
    await db.exec(migration);
    await t.test("no data backfill; original grants, search path, lock timeouts and replay-before-policy preserved",async()=>{
      assert.deepEqual(await read(),seeded);
      assert.deepEqual(await properties(),before);
      const definitions=(await db.query<{definition:string}>("select pg_get_functiondef(oid) definition from pg_proc where oid=any($1::regprocedure[])",[signatures])).rows;
      for(const {definition} of definitions){
        assert.doesNotMatch(definition,/CLUB_TEAM_LIMIT/);
        if(definition.includes("v_prior.command")) assert.ok(definition.indexOf("return v_current.state")<definition.indexOf("touchline_club_validate_primary_allocation"));
      }
      for(const name of ["touchline_club_current_primary_detail(uuid)","touchline_club_validate_primary_allocation(jsonb,jsonb)"]){
        assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege('authenticated',$1,'EXECUTE') allowed",[name])).rows[0].allowed,false);
        assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege('service_role',$1,'EXECUTE') allowed",[name])).rows[0].allowed,true);
      }
      const replay=(await db.query<{state:State}>("select touchline_club_commit_acquisition($1,$2,0,'{}'::jsonb,$3::jsonb) state",[id(9),id(3),JSON.stringify(oldCommand)])).rows[0].state;
      assert.deepEqual(replay,oldState,"completed pre-policy command replays before requiring primary detail, entitlement or publication");
    });
    await t.test("all eleven formation functions exactly match TS authority; no broad-wing or fullback fallback",async()=>{
      for(const [code,geometry] of Object.entries(registry)){
        for(const slot of geometry.slots){
          const actual=(await db.query<{details:string[]}>("select touchline_club_slot_primary_details($1,$2) details",[code,slot.id])).rows[0].details;
          assert.deepEqual(actual,eligiblePrimaryDetails(code,slot.id),`${code}/${slot.id}`);
        }
      }
      assert.deepEqual((await db.query<{details:string[]}>("select touchline_club_slot_primary_details('4-3-3','RAM') details")).rows[0].details,[]);
    });
    const validate=async(players:Player[],formation="4-3-3")=>db.query("select touchline_club_validate_primary_allocation($1::jsonb,$2::jsonb)",[JSON.stringify({...seeded,formationCode:formation,players}),JSON.stringify(registry[formation as keyof typeof registry])]);
    // Geometry fixtures explicitly seed matching authority. Conflict/security
    // cases below use validate directly, without repairing their test inputs.
    const validatePublished=async(players:Player[],formation="4-3-3")=>{
      for(const p of players)await publish(Number(p.playerId.slice(-12)),p.primaryDetail!);
      return validate(players,formation);
    };
    await t.test("fixed bank categories; exact wings; formation-specific pivots and inside tens",async()=>{
      const bank=[['Goalkeeper','GK'],['Centre Back','CB'],['Right Back','RB'],['Left Back','LB'],['Defensive Midfield','DM'],['Central Midfield','MID'],['Right Wing','RW'],['Left Wing','LW'],['Centre Forward','CF']];
      await validatePublished(bank.map(([d,p],i)=>player(d,p,"reserves",i,100+i)));
      await assert.rejects(validatePublished([player("Left Wing","LW","reserves",6)]),/CLUB_SLOT_POSITION_INVALID/);
      const slot=(code:keyof typeof registry,name:string)=>registry[code].slots.findIndex(s=>s.id===name);
      await assert.rejects(validatePublished([player("Left Wing","LW","starters",slot("4-3-3","RW"))]),/CLUB_SLOT_POSITION_INVALID/);
      await validatePublished([player("Defensive Midfield","DM","starters",slot("4-4-2","RCM"))],"4-4-2");
      await validatePublished([player("Right Wing","RW","starters",slot("4-2-3-1","RAM"))],"4-2-3-1");
      await assert.rejects(validatePublished([player("Right Wing","RW","starters",slot("3-4-2-1","RAM"))],"3-4-2-1"),/CLUB_SLOT_POSITION_INVALID/);
    });
    await t.test("global completion reserves the bank and unfilled XI before using the fifteen outside spaces",async()=>{
      await validatePublished([player("Right Wing","RW","outside",0)]);
      // 4-3-3 needs one RW in the XI and one in the bank: two outside RW make 35 impossible.
      await assert.rejects(validatePublished([player("Right Wing","RW","outside",0),player("Right Wing","RW","outside",1,101)]),/CLUB_POSITION_COMPLETION_IMPOSSIBLE/);
      // 4-4-2 wide midfield accepts true Right Midfield, so the same RW concentration can be feasible.
      await validatePublished([player("Right Wing","RW","outside",0),player("Right Wing","RW","outside",1,101)],"4-4-2");
    });
    await t.test("all outside vacancy labels match the deterministic TS planner",async()=>{
      for(const [code,geometry] of Object.entries(registry)){
        for(const players of [[],[player('Left Wing','LW','outside',0)]] as Player[][]){
          for(const p of players)await publish(Number(p.playerId.slice(-12)),p.primaryDetail!);
          const plan=collectionSlotPlan(geometry,players as Parameters<typeof collectionSlotPlan>[1])!;
          assert.ok(plan);
          for(let i=0;i<15;i++){
            const category=(await db.query<{category:string}>("select touchline_club_planned_outside_category($1::jsonb,$2::jsonb,$3) category",[JSON.stringify({...seeded,formationCode:code,players}),JSON.stringify(geometry),i])).rows[0].category;
            assert.equal(category,plan.outside[i],`${code} outside ${i}`);
          }
        }
      }
    });
    await t.test("a complete 35-player allocation keeps exact quotas and fits the fixed bank",async()=>{
      const plan=collectionSlotPlan(registry['4-3-3'],[])!;
      const details:Record<string,string>={GK:'Goalkeeper',CB:'Centre Back',RB:'Right Back',LB:'Left Back',DM:'Defensive Midfield',MID:'Central Midfield',RW:'Right Wing',LW:'Left Wing',CF:'Centre Forward'};
      const players=[...plan.starters.map((p,i)=>player(details[p],p,'starters',i,400+i)),
        ...plan.reserves.map((p,i)=>player(details[p],p,'reserves',i,500+i)),...plan.outside.map((p,i)=>player(details[p],p,'outside',i,600+i))];
      assert.equal(players.length,35);await validatePublished(players);
      await assert.rejects(validatePublished(players.map((p,i)=>i===34?{...p,primaryDetail:'Right Wing',position:'RW'}:p)),/CLUB_POSITION_COMPLETION_IMPOSSIBLE/);
    });
    async function publish(n:number,detail:string,member=detail){
      await db.query("insert into football_players(id,current_club_id,position,detailed_position) values($1,$2,'attacker',$3) on conflict(id) do update set detailed_position=excluded.detailed_position",[id(n),id(20),detail]);
      await db.query("insert into football_squad_members(id,club_id,player_id,position,detailed_position,status) values($1,$2,$3,'attacker',$4,'active') on conflict(id) do update set detailed_position=excluded.detailed_position,status='active'",[id(n+1000),id(20),id(n),member]);
      await db.query("insert into football_player_market_values values($1,$2,10000000,'verified','verified') on conflict do nothing",[id(n+2000),id(n)]);
      await db.query("insert into touchline_card_publications(id,player_id,current_membership_id,market_value_id,publication_status) values($1,$2,$3,$4,'published') on conflict(id) do update set publication_status='published'",[id(n+3000),id(n),id(n+1000),id(n+2000)]);
    }
    await t.test("stored detail still requires current authority; missing, conflicting and changed metadata fail closed",async()=>{
      const owned=player('Left Wing','LW','outside',0,700);
      await assert.rejects(validate([owned]),/CLUB_PRIMARY_DETAIL_MISSING/);
      await publish(700,'Left Wing');await validate([owned]);
      await publish(700,'Left Wing','Right Wing');
      await assert.rejects(validate([owned]),/CLUB_PRIMARY_DETAIL_CONFLICT/);
      await publish(700,'Right Wing');
      await assert.rejects(validate([owned]),/CLUB_PRIMARY_DETAIL_CONFLICT/);
      await publish(700,'Left Wing');await validate([owned]);
      assert.equal(owned.primaryDetail,'Left Wing','read validation never reclassifies the contract');
    });
    await publish(100,"Left Wing");
    await t.test("legacy detail resolves by current publication without rewriting the old contract",async()=>{
      const legacy=player("Left Wing","LW");delete legacy.primaryDetail;
      await validate([legacy]);
      await assert.rejects(validate([{...legacy,position:"MID"}]),/CLUB_PRIMARY_POSITION_CONFLICT/);
      await db.query("update football_squad_members set detailed_position='Right Wing' where player_id=$1",[id(100)]);
      await assert.rejects(validate([legacy]),/CLUB_PRIMARY_DETAIL_CONFLICT/);
      await db.query("update football_squad_members set detailed_position='Left Wing' where player_id=$1",[id(100)]);
      await seed({...seeded,players:[legacy]});
      const current=await read(),next={...current,revision:1,players:[{...legacy,area:"starters",slot:registry['4-3-3'].slots.findIndex(s=>s.id==='LW')}]};
      const command={action:"move",playerId:legacy.playerId,area:"starters",slot:next.players[0].slot,expectedRevision:0,idempotencyKey:"legacy_lw_move"};
      await db.query("select touchline_club_commit_allocation($1,$2,0,$3::jsonb,$4::jsonb)",[id(1),id(3),JSON.stringify(next),JSON.stringify(command)]);
      assert.deepEqual(await read(),next);
      assert.equal(Object.hasOwn((await read()).players[0],"primaryDetail"),false);
      await db.query("update touchline_card_publications set publication_status='draft' where player_id=$1",[legacy.playerId]);
      await db.query("select touchline_club_commit_allocation($1,$2,0,$3::jsonb,$4::jsonb)",[id(1),id(3),JSON.stringify(next),JSON.stringify(command)]);
      assert.deepEqual(await read(),next,"completed allocation replays before requiring current metadata");
      await publish(100,'Left Wing');
      await seed(seeded);
    });
    await t.test("acquisition rejects forged detail/category atomically, persists real detail and replays before new metadata reads",async()=>{
      const owned=player("Left Wing","LW","outside",12);
      const receipt={key:"primary_purchase",playerId:owned.playerId,area:owned.area,slot:owned.slot,valueEur:owned.valueEur,revision:1};
      const next={...seeded,revision:1,balanceEur:seeded.balanceEur-owned.valueEur,players:[owned],receipts:[receipt]};
      const command={playerId:owned.playerId,area:owned.area,slot:owned.slot,expectedRevision:0,idempotencyKey:receipt.key};
      const commit=(state:State)=>db.query("select touchline_club_commit_acquisition($1,$2,0,$3::jsonb,$4::jsonb)",[id(1),id(3),JSON.stringify(state),JSON.stringify(command)]);
      await assert.rejects(commit({...next,players:[{...owned,primaryDetail:"Right Wing",position:"RW"}]}),/CLUB_PRIMARY_POSITION_CONFLICT/);
      assert.deepEqual(await read(),seeded);
      await commit(next);assert.deepEqual(await read(),next);
      await db.query("update football_players set detailed_position=null where id=$1",[id(100)]);
      await db.query("update football_squad_members set detailed_position=null where player_id=$1",[id(100)]);
      await commit(next);assert.deepEqual(await read(),next,"replay must not re-debit or reclassify");
      const moved={...next,revision:2,players:[{...owned,slot:1}]};
      const moveCommand={action:"move",playerId:owned.playerId,area:"outside",slot:1,expectedRevision:1,idempotencyKey:"current_detail_move"};
      const move=()=>db.query("select touchline_club_commit_allocation($1,$2,1,$3::jsonb,$4::jsonb)",[id(1),id(3),JSON.stringify(moved),JSON.stringify(moveCommand)]);
      await assert.rejects(move(),/CLUB_PRIMARY_DETAIL_MISSING/);
      await publish(100,'Left Wing','Right Wing');await assert.rejects(move(),/CLUB_PRIMARY_DETAIL_CONFLICT/);
      await publish(100,'Right Wing');await assert.rejects(move(),/CLUB_PRIMARY_DETAIL_CONFLICT/);
      assert.deepEqual(await read(),next,"rejected current authority must not move or reclassify the contract");
      const forged={...next,revision:2,players:[{...owned,primaryDetail:"Right Wing",position:"RW",slot:1}]};
      await assert.rejects(db.query("select touchline_club_commit_allocation($1,$2,1,$3::jsonb,$4::jsonb)",[id(1),id(3),JSON.stringify(forged),JSON.stringify({action:"move",playerId:owned.playerId,area:"outside",slot:1,expectedRevision:1,idempotencyKey:"forged_movement"})]),/CLUB_INVALID_TRANSITION/);
      assert.deepEqual(await read(),next);
    });
    await t.test("installed lineup wrapper confirms a true holding pivot and winger in wide midfield without changing their category",async()=>{
      const geometry=registry['4-4-2'];
      const roles:Record<string,[string,string]>={GK:['Goalkeeper','GK'],RB:['Right Back','RB'],RCB:['Centre Back','CB'],LCB:['Centre Back','CB'],LB:['Left Back','LB'],
        RCM:['Defensive Midfield','DM'],LCM:['Central Midfield','MID'],RM:['Right Wing','RW'],LM:['Left Wing','LW'],RST:['Centre Forward','CF'],LST:['Centre Forward','CF']};
      const players=geometry.slots.map((s,i)=>player(...roles[s.id],'starters',i,110+i));
      for(const p of players)await publish(Number(p.playerId.slice(-12)),p.primaryDetail!);
      const state={...seeded,revision:11,formationCode:'4-4-2',balanceEur:seeded.balanceEur-110_000_000,players};
      await seed(state);
      const gameweek=(await db.query<{id:string}>("select id from touchline_fantasy_gameweeks")).rows[0].id;
      const selections=players.map(p=>({playerId:p.playerId,slotId:geometry.slots[p.slot].id}));
      await db.query("select touchline_club_save_lineup($1,$2,'307','4-4-2',$3::jsonb,'confirm','primary_lineup',11)",[id(1),gameweek,JSON.stringify(selections)]);
      assert.equal((await db.query<{state:string}>("select state from touchline_fantasy_user_gameweeks")).rows[0].state,'CONFIRMED');
      assert.deepEqual(await read(),state,"round projection must not rewrite ownership, primary position or balance");
      const saved=(await db.query<{n:number}>("select count(*)::int n from touchline_fantasy_user_gameweek_selections")).rows[0].n;
      assert.equal(saved,11);
    });
    await t.test("definition-only rollback rehearsal restores original ACL without touching persisted ownership",async()=>{
      const current=await read();
      await db.exec(preimage.map(x=>x.definition).join(";\n"));
      assert.deepEqual(await properties(),before);assert.deepEqual(await read(),current);
      assert.deepEqual(await definitionProof(),expectedPreimage,"restore the exact three QA predecessors, not a local fallback");
    });
  }finally{await db.close();}
});
