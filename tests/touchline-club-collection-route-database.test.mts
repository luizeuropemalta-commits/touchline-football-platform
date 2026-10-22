import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
import * as acquisition from "../lib/touchlineFantasy/club-acquisition.ts";
import * as service from "../lib/touchlineFantasy/club-acquisition-service.ts";
import * as allocation from "../lib/touchlineFantasy/club-allocation.ts";
import * as position from "../lib/touchlineFantasy/club-position.ts";
import * as commandReader from "../lib/touchlineFantasy/club-request.ts";
import * as authority from "../lib/touchlineFantasy/club-command-authority.ts";
import * as fantasyDomain from "../lib/touchlineFantasy/domain.ts";
import * as primaryIndex from "../lib/touchlineFantasy/club-primary-position-index.ts";
import { collectionSlotPlan } from "../lib/touchlineFantasy/collection-slot-plan.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as registry } from "../lib/touchlineArena/formation-geometry.ts";

const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;
type Handler = (request: Request & {nextUrl: URL}) => Promise<Response>;
type Envelope = {ok: boolean; error?: string; state: acquisition.ClubAcquisitionState; replayed?: boolean};

/** Real route, domain and installed SQL. Only framework/auth/catalogue transport are adapters.
 * This is local integration evidence, not browser, remote QA or multi-connection proof. */
test("collection HTTP handlers persist all 35 purchases, isolate owners and never charge a retry twice", async () => {
  const db = await clubRoundDatabase();
  try {
    await db.exec(`insert into users values('${id(1)}'),('${id(9)}');
      insert into football_competitions values('${id(2)}'); insert into football_seasons values('${id(3)}');
      insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
        values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);
      insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(1)}','active','qa_grant','standard');
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status)
        values('${id(6)}','${id(4)}','${id(2)}','${id(3)}',clock_timestamp()+interval '2 hours','NS');
      select touchline_fantasy_sync_gameweeks();`);
    const geometry = registry["4-3-3"];
    await db.query("insert into touchline_formation_geometry_versions values('4-3-3',1,'published',$1::jsonb)", [JSON.stringify(geometry)]);
    type Position = keyof typeof acquisition.CLUB_POSITION_LIMITS;
    const details:Record<Position,string>={GK:"Goalkeeper",CB:"Centre Back",RB:"Right Back",LB:"Left Back",DM:"Defensive Midfield",MID:"Central Midfield",RW:"Right Wing",LW:"Left Wing",CF:"Centre Forward"};
    const plan=collectionSlotPlan(geometry)!;
    const positions=[...plan.starters,...plan.reserves,...plan.outside];
    assert.equal(positions.length, 35);
    const catalogue = [];
    for (let n = 0; n < 35; n++) {
      await db.query("insert into football_players(id,current_club_id,position) values($1,$2,$3)", [id(100+n),id(20+Math.floor(n/3)),positions[n]]);
      await db.query("insert into football_player_market_values values($1,$2,1000000,'verified','verified')", [id(300+n),id(100+n)]);
      await db.query("insert into touchline_card_publications(id,player_id,publication_status,market_value_id) values($1,$2,'published',$3)", [id(400+n),id(100+n),id(300+n)]);
      catalogue.push({id:id(100+n),canonicalPlayerId:id(100+n),position:details[positions[n]],primaryPositionDetail:details[positions[n]],editorialCard:{marketValueEur:1_000_000}});
    }
    await db.exec(`grant select on touchline_fantasy_entitlements,touchline_fantasy_configs,touchline_card_contracts,touchline_coach_contracts,
      touchline_fantasy_user_gameweeks,touchline_fantasy_user_gameweek_selections,touchline_fantasy_gameweeks,
      football_players,football_player_market_values,touchline_card_publications,touchline_formation_geometry_versions to service_role;
      set role service_role;`);

    // Explicit identifiers only: the adapter cannot turn a request into arbitrary SQL.
    const tables: Record<string, readonly string[]> = {
      touchline_fantasy_configs:["season_id","competition_key","status"],
      touchline_club_collections:["state","user_id","season_id"],
      touchline_club_collection_operations:["command","user_id","season_id","idempotency_key"],
      touchline_club_player_reservations:["player_id","user_id","season_id"],
      football_players:["current_club_id","id"],
    };
    const rpcArgs: Record<string, readonly string[]> = {
      touchline_club_initialize_collection:["p_user_id","p_season_id","p_plan","p_coach"],
      touchline_club_commit_acquisition:["p_user_id","p_season_id","p_expected_revision","p_next","p_command"],
      touchline_club_commit_allocation:["p_user_id","p_season_id","p_expected_revision","p_next","p_command"],
    };
    const admin = {
      from(table: string) {
        assert.ok(Object.hasOwn(tables,table));
        let selected: string[] = []; const filters: [string,unknown][] = [];
        const execute = async (single: boolean) => {
          const where = filters.map(([key], n) => `${key}=$${n+1}`).join(" and ");
          try {
            const result = await db.query<Row>(`select ${selected.join(",")} from ${table}${where ? ` where ${where}` : ""}`,filters.map(([,value])=>value));
            return {data:single ? result.rows[0] ?? null : result.rows,error:null};
          } catch (error) {return {data:null,error:{message:String(error)}};}
        };
        const query = {
          select(columns: string) {selected=columns.split(",");assert.ok(selected.every(c=>tables[table].includes(c)));return query;},
          eq(key: string,value: unknown) {assert.ok(tables[table].includes(key));filters.push([key,value]);return query;},
          single:()=>execute(true), maybeSingle:()=>execute(true),
          then:<T>(resolve:(value:Awaited<ReturnType<typeof execute>>)=>T)=>execute(false).then(resolve),
        };
        return query;
      },
      async rpc(name: string, args: Row) {
        assert.ok(Object.hasOwn(rpcArgs,name));
        try {
          const keys=rpcArgs[name], values=keys.map(key=>typeof args[key]==="object"?JSON.stringify(args[key]):args[key]);
          const result=await db.query<{state:unknown}>(`select ${name}(${keys.map((key,n)=>`$${n+1}${["p_coach","p_next","p_command"].includes(key)?"::jsonb":""}`).join(",")}) state`,values);
          return {data:result.rows[0].state,error:null};
        } catch (error) {return {data:null,error:{message:String(error)}};}
      },
    };
    let owner: string | null=id(1), enabled=true;
    const snapshot={entitlementActive:true,marketAccess:{planKey:"standard"},catalogue,
      coaches:[{id:"307",slot:{cardTier:"ruby-red"}}],formationRegistry:registry,
      activeGameweek:{state:"MARKET_OPEN",marketOpensAt:new Date(Date.now()-60_000).toISOString(),locksAt:new Date(Date.now()+3_600_000).toISOString()}};
    const modules: Record<string,unknown> = {
      "server-only":{}, "next/server":{NextResponse:Response},
      "@/lib/supabase/admin":{createAdminClient:()=>admin},
      "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user:owner?{id:owner}:null},error:null})}})},
      "@/lib/touchlineFantasy/server":{loadTouchlineFantasyReadSnapshot:async()=>snapshot},
      "./club-acquisition":acquisition, "@/lib/touchlineFantasy/club-acquisition":acquisition,
      "@/lib/touchlineFantasy/club-acquisition-service":service,
      "@/lib/touchlineFantasy/club-allocation":allocation,
      "@/lib/touchlineFantasy/club-position":position,
      "@/lib/touchlineFantasy/club-primary-position-index":primaryIndex,
      "@/lib/touchlineFantasy/club-request":commandReader,
      "@/lib/touchlineFantasy/club-command-authority":authority,
      // Owner initializes before reading; other-account read has no entitlement.
      // The actual allowance preflight has its own read-only regression.
      "@/lib/touchlineFantasy/club-initial-budget-server":{readClubInitialBudget:(_admin:unknown,requestedOwner:string)=>{assert.notEqual(requestedOwner,id(1));return null;}},
      "@/lib/touchlineFantasy/domain":fantasyDomain,
    };
    function load<T>(path: string): T {
      const exports={};
      const source=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
      runInNewContext(source,{exports,Date,Error,URL,TextEncoder,performance,process:{env:{}},require:(name:string)=>{assert.ok(Object.hasOwn(modules,name),name);return modules[name];}});
      return exports as T;
    }
    const store=load<Record<string,unknown>>("lib/touchlineFantasy/club-collection-server.ts");
    modules["@/lib/touchlineFantasy/club-collection-server"]={...store,clubCollectionEnabled:()=>enabled};
    modules["@/lib/touchlineFantasy/club-collection-read-server"]=load("lib/touchlineFantasy/club-collection-read-server.ts");
    modules["@/lib/touchlineFantasy/club-collection-read-handler"]=load("lib/touchlineFantasy/club-collection-read-handler.ts");
    const route=load<{GET:()=>Promise<Response>;POST:Handler}>("app/api/touchline-fantasy/collection/route.ts");
    const initialize=load<{POST:Handler}>("app/api/touchline-fantasy/collection/initialize/route.ts");
    const allocate=load<{POST:Handler}>("app/api/touchline-fantasy/collection/allocation/route.ts");
    const lineup=load<{POST:Handler}>("app/api/touchline-fantasy/lineup/route.ts");
    async function post(handler:Handler, body:unknown, expected=200, origin="http://localhost:3319") {
      const url="http://localhost:3319/api/touchline-fantasy/collection";
      const request=Object.assign(new Request(url,{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify({expectedAccountId:id(1),expectedSeasonId:id(3),...(body as Row)})}),{nextUrl:new URL(url)});
      const response=await handler(request), payload=await response.json() as Envelope;
      assert.equal(response.status,expected,JSON.stringify(payload));return payload;
    }
    enabled=false;assert.equal((await route.GET()).status,503);enabled=true;
    owner=null;assert.equal((await route.GET()).status,401);owner=id(1);
    let state=(await post(initialize.POST,{coachId:"307"})).state;
    assert.equal(state.balanceEur,745_000_000);
    assert.deepEqual((await post(initialize.POST,{coachId:"307"})).state,state,"initialization retry cannot replenish budget");
    state=(await post(allocate.POST,{action:"formation",formationCode:"4-3-3",expectedRevision:state.revision,idempotencyKey:"formation_initial"})).state;
    // Two real database contexts with the SAME revision expose unsafe retry rebinding.
    const pending={playerId:id(100),area:"starters",slot:0,expectedRevision:state.revision,idempotencyKey:"pending_context"};
    const pendingMove={action:"formation",formationCode:"4-3-3",expectedRevision:state.revision,idempotencyKey:"pending_formation"};
    const pendingLineup={gameweekId:id(5),selectedCoachId:"307",formationCode:"4-3-3",selections:[],action:"draft",idempotencyKey:"pending_lineup",collectionRevision:state.revision};
    await db.exec('reset role');
    await db.query('insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,$3,$4::jsonb)',[id(9),id(3),state.revision,JSON.stringify(state)]);
    await db.query('insert into football_seasons values($1)',[id(8)]);
    await db.query('insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,$3,$4::jsonb)',[id(1),id(8),state.revision,JSON.stringify({...state,seasonId:id(8)})]);
    await db.exec('set role service_role');
    const baseline=(await db.query('select user_id,season_id,revision,state from touchline_club_collections order by user_id,season_id')).rows;
    const operations=(await db.query('select * from touchline_club_collection_operations')).rows;
    owner=id(9);
    for(const [handler,body] of [[route.POST,pending],[allocate.POST,pendingMove],[initialize.POST,{coachId:"307"}],[lineup.POST,pendingLineup]] as const) {
      assert.equal((await post(handler,body,409)).error,"CLUB_CONTEXT_CHANGED");
    }
    owner=id(1);await db.exec('reset role');
    await db.query('update touchline_fantasy_configs set season_id=$1',[id(8)]);await db.exec('set role service_role');
    for(const [handler,body] of [[route.POST,pending],[allocate.POST,pendingMove],[initialize.POST,{coachId:"307"}],[lineup.POST,pendingLineup]] as const) {
      assert.equal((await post(handler,body,409)).error,"CLUB_CONTEXT_CHANGED");
    }
    assert.deepEqual((await db.query('select user_id,season_id,revision,state from touchline_club_collections order by user_id,season_id')).rows,baseline);
    assert.deepEqual((await db.query('select * from touchline_club_collection_operations')).rows,operations);
    await db.exec('reset role');await db.query('update touchline_fantasy_configs set season_id=$1',[id(3)]);
    await db.query('delete from touchline_club_collections where user_id=$1 or season_id=$2',[id(9),id(8)]);await db.exec('set role service_role');
    for (let n=0;n<35;n++) {
      const command={playerId:id(100+n),area:n<11?"starters":n<20?"reserves":"outside",slot:n<11?n:n<20?n-11:n-20,expectedRevision:state.revision,idempotencyKey:`purchase_${n}`};
      if(n===0) {
        await post(route.POST,{...command,balanceEur:999_000_000},400);
        await post(route.POST,command,403,"https://untrusted.invalid");
      }
      state=(await post(route.POST,command)).state;
      assert.equal(state.balanceEur,745_000_000-(n+1)*1_000_000);
      const retry=await post(route.POST,command);assert.equal(retry.replayed,true);assert.deepEqual(retry.state,state);
    }
    assert.equal(state.players.length,35);assert.equal(state.balanceEur,710_000_000);
    assert.deepEqual(Object.fromEntries(["starters","reserves","outside"].map(area=>[area,state.players.filter(p=>p.area===area).length])),{starters:11,reserves:9,outside:15});
    const reload=await route.GET();assert.equal(reload.headers.get("cache-control"),"private, no-store");
    assert.deepEqual((await reload.json()).state,state);
    owner=id(9);assert.equal((await (await route.GET()).json()).state,null,"another authenticated account cannot see the collection or balance");
    owner=id(1);
    await db.exec("reset role; update football_fixtures set starts_at=clock_timestamp()+interval '4 minutes'; set role service_role");
    const before=structuredClone(state);
    const rejected=await post(allocate.POST,{action:"move",playerId:state.players[11].playerId,area:"outside",slot:0,expectedRevision:state.revision,idempotencyKey:"move_after_lock"},409);
    assert.match(rejected.error!,/CLUB_MARKET_CLOSED/);
    assert.deepEqual((await (await route.GET()).json()).state,before,"SQL rejects a stale open-window HTTP snapshot without changing the roster or wallet");
  } finally {await db.close();}
});
