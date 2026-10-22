import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { CLUB_ACQUISITION_BUDGETS, CLUB_COACH_VALUES, CLUB_POSITION_LIMITS, acquireClubPlayer, inspectClubAcquisition, type ClubAcquisitionState } from "../../lib/touchlineFantasy/club-acquisition.ts";
import { clubPlayerPosition } from "../../lib/touchlineFantasy/club-position.ts";
import { allocateClubPlayers, clubStarterSelections } from "../../lib/touchlineFantasy/club-allocation.ts";
import type { TouchlineFormationGeometry } from "../../lib/touchlineArena/formation-geometry.ts";
import { recognizedSportmonksDetailedPosition } from "../../lib/football-data/sportmonks-position-taxonomy.ts";
import { primaryPositionFitsTacticalSlot } from "../../lib/touchlineFantasy/club-primary-position-policy.ts";
import { CLUB_RESERVE_POSITIONS, collectionSlotPlan } from "../../lib/touchlineFantasy/club-position-plan.ts";

type Position = keyof typeof CLUB_POSITION_LIMITS;
export type CataloguePlayer = Readonly<{ player_id: string; club_id: string; name: string; club_name: string; position: string; primary_detail?: string; value_eur: number }>;
export type PlannedPlayer = CataloguePlayer & { positionCode: Position };
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

/** Read-only planning. Never calls a service, creates ownership, or supplies a wallet. */
export function planQaRoster(catalogue: readonly CataloguePlayer[], options: {
  projectRef: string; coachValue: number; reserveCredits: number; exclude?: readonly string[];
}) {
  check(options.projectRef === "xgxbwqxjssxxuihuwmgy", "QA_TARGET_REQUIRED");
  check(Object.values(CLUB_COACH_VALUES).includes(options.coachValue as never), "INVALID_COACH_VALUE");
  check(Number.isSafeInteger(options.reserveCredits) && options.reserveCredits > 0, "POSITIVE_FEE_RESERVE_REQUIRED");
  const cap = CLUB_ACQUISITION_BUDGETS.vip - options.coachValue - options.reserveCredits;
  check(cap > 0, "INSUFFICIENT_BUDGET");
  const excluded = new Set(options.exclude ?? []);
  const seen = new Set<string>();
  const players: PlannedPlayer[] = [];
  for (const row of catalogue) {
    check(!seen.has(row.player_id), "DUPLICATE_CATALOGUE_ID");
    seen.add(row.player_id);
    check(row.player_id && row.club_id && Number.isSafeInteger(row.value_eur) && row.value_eur > 0, "INVALID_CATALOGUE_PLAYER");
    const positionCode = clubPlayerPosition(row.position);
    if (positionCode && !excluded.has(row.player_id)) players.push({ ...row, positionCode });
  }
  players.sort((a,b) => a.player_id.localeCompare(b.player_id));
  const positions = Object.keys(CLUB_POSITION_LIMITS) as Position[];
  const clubs = [...new Set(players.map(p => p.club_id))].sort();
  type Edge = { to: number; rev: number; capacity: number; cost: number; player?: PlannedPlayer };
  const sink = 1 + positions.length + clubs.length;
  const graph: Edge[][] = Array.from({length: sink + 1}, () => []);
  const edge = (from: number, to: number, capacity: number, cost: number, player?: PlannedPlayer) => {
    const forward: Edge = {to, rev: graph[to].length, capacity, cost, player};
    const reverse: Edge = {to: from, rev: graph[from].length, capacity: 0, cost: -cost};
    graph[from].push(forward); graph[to].push(reverse);
  };
  positions.forEach((p,n) => edge(0,n+1,CLUB_POSITION_LIMITS[p],0));
  clubs.forEach((_,n) => edge(1+positions.length+n,sink,35,0));
  players.forEach(p => edge(positions.indexOf(p.positionCode)+1,1+positions.length+clubs.indexOf(p.club_id),1,p.value_eur,p));
  // Minimum-cost flow gives a feasible floor; real clubs have no quantity cap.
  for (let flow=0;flow<35;flow++) {
    const dist=Array(graph.length).fill(Infinity), from=Array(graph.length).fill(-1), via=Array(graph.length).fill(-1);
    const queued=Array(graph.length).fill(false), queue=[0]; dist[0]=0;queued[0]=true;
    for(let cursor=0;cursor<queue.length;cursor++) {
      const node=queue[cursor];queued[node]=false;
      graph[node].forEach((e,i) => {
        if(e.capacity && dist[e.to]>dist[node]+e.cost) {
          dist[e.to]=dist[node]+e.cost;from[e.to]=node;via[e.to]=i;
          if(!queued[e.to]) {queue.push(e.to);queued[e.to]=true;}
        }
      });
    }
    check(Number.isFinite(dist[sink]), "NO_FEASIBLE_35_PLAYER_ROSTER");
    for(let node=sink;node!==0;node=from[node]) {
      const e=graph[from[node]][via[node]];e.capacity--;graph[node][e.rev].capacity++;
    }
  }
  const selected=graph.flatMap(edges=>edges.filter(e=>e.player && e.capacity===0).map(e=>e.player!));
  let cost=selected.reduce((sum,p)=>sum+p.value_eur,0);
  check(cost<=cap,"NO_ROSTER_WITHIN_BUDGET");
  // Deterministic same-position upgrades; never claims global optimality.
  // Maximises each affordable upgrade, while retaining a fee reserve.
  for (;;) {
    const owned=new Set(selected.map(p=>p.player_id));
    let best: {index:number; player:PlannedPlayer; gain:number}|null=null;
    selected.forEach((old,index)=>players.forEach(player=>{
      const gain=player.value_eur-old.value_eur;
      if(owned.has(player.player_id)||player.positionCode!==old.positionCode||gain<=0||cost+gain>cap) return;
      if(!best || gain>best.gain)best={index,player,gain};
    }));
    if(!best)break;
    const upgrade=best as {index:number;player:PlannedPlayer;gain:number};
    selected[upgrade.index]=upgrade.player;cost+=upgrade.gain;
  }
  const byPosition=Object.fromEntries(positions.map(p=>[p,selected.filter(v=>v.positionCode===p).length]));
  const byClub=Object.fromEntries(clubs.map(c=>[c,selected.filter(v=>v.club_id===c).length]).filter(([,n])=>Number(n)>0));
  check(selected.length===35,"INVALID_RESULT");
  return {kind:"QA_ROSTER_PLAN_ONLY",applied:false,optimality:"feasible-greedy-upgrades-not-global-proof",
    budget:CLUB_ACQUISITION_BUDGETS.vip,coachValue:options.coachValue,playersValue:cost,
    remainingCredits:CLUB_ACQUISITION_BUDGETS.vip-options.coachValue-cost,byPosition,byClub,
    players:selected.sort((a,b)=>positions.indexOf(a.positionCode)-positions.indexOf(b.positionCode)||b.value_eur-a.value_eur)};
}

/** Offline rehearsal through the same domain transitions as canonical purchases.
 * The remote initializer must still return the matching starting state before execution.
 * This function performs no I/O and its projected state is never a receipt of ownership.
 */
export function rehearseQaRoster(plan: ReturnType<typeof planQaRoster>, options: {
  seasonId: string; coach: ClubAcquisitionState["coach"]; geometry: TouchlineFormationGeometry;
  commandPrefix: string;
}) {
  check(plan.kind==="QA_ROSTER_PLAN_ONLY" && plan.applied===false,"PLAN_ONLY_REQUIRED");
  check(options.coach.valueEur===plan.coachValue,"COACH_PLAN_MISMATCH");
  check(/^[a-zA-Z0-9_-]{8,80}$/.test(options.commandPrefix),"INVALID_COMMAND_PREFIX");
  const initial: ClubAcquisitionState={revision:0,seasonId:options.seasonId,plan:"vip",
    balanceEur:plan.budget-plan.coachValue,coach:options.coach,players:[],receipts:[]};
  inspectClubAcquisition(initial);
  const formation={action:"formation" as const,formationCode:options.geometry.formationCode,
    expectedRevision:0,idempotencyKey:options.commandPrefix+"_formation"};
  let state=allocateClubPlayers(initial,formation,{marketOpen:true,geometry:options.geometry,reservedIds:[]});
  // Exact catalogue details are required for rehearsal; broad quota labels
  // alone cannot authorize tactical eligibility or invent a real player's role.
  const primaryDetails=Object.fromEntries(plan.players.map(player=>{
    const detail=recognizedSportmonksDetailedPosition(player.primary_detail ?? player.position);
    check(detail && clubPlayerPosition(detail)===player.positionCode,"CLUB_PRIMARY_POSITION_UNCONFIRMED");
    return [player.player_id,detail];
  }));
  const remaining=[...plan.players].sort((a,b)=>b.value_eur-a.value_eur||a.player_id.localeCompare(b.player_id));
  const destinations: {player:PlannedPlayer;area:"starters"|"reserves"|"outside";slot:number}[]=[];
  const fillStarters=(n:number):boolean=>{
    if(n===11)return true;
    const tried=new Set<string>();
    for(let index=0;index<remaining.length;index++) {
      const player=remaining[index],detail=primaryDetails[player.player_id];
      if(!detail || tried.has(detail))continue;
      tried.add(detail);
      if(!primaryPositionFitsTacticalSlot(detail,options.geometry.formationCode,options.geometry.slots[n].id)
        || remaining.filter(p=>p.positionCode===player.positionCode).length<=1)continue;
      remaining.splice(index,1);destinations.push({player,area:"starters",slot:n});
      if(fillStarters(n+1))return true;
      destinations.pop();remaining.splice(index,0,player);
    }
    return false;
  };
  check(fillStarters(0),"ROSTER_CANNOT_FILL_FORMATION");
  // Give the bench one of each exact position, then retain fifteen for exchange.
  for(const position of CLUB_RESERVE_POSITIONS) {
    const index=remaining.findIndex(p=>p.positionCode===position);
    check(index>=0,"ROSTER_CANNOT_FILL_POSITIONAL_BENCH");
    destinations.push({player:remaining.splice(index,1)[0],area:"reserves",slot:destinations.length-11});
  }
  const slotPlan=collectionSlotPlan(options.geometry,destinations.map(({player,area,slot})=>({
    playerId:player.player_id,position:player.positionCode,primaryDetail:primaryDetails[player.player_id]!,area,slot,
  })),primaryDetails);
  check(slotPlan,"ROSTER_CANNOT_FILL_FORMATION");
  slotPlan!.outside.forEach((position,slot)=>{
    const index=remaining.findIndex(player=>player.positionCode===position);
    check(index>=0,"ROSTER_CANNOT_FILL_EXCHANGE");
    destinations.push({player:remaining.splice(index,1)[0],area:"outside",slot});
  });
  const acquisitions=destinations.map(({player,area,slot},n)=>{
    const command={playerId:player.player_id,area,slot,expectedRevision:state.revision,
      idempotencyKey:options.commandPrefix+"_player_"+String(n).padStart(2,"0")};
    const offer={playerId:player.player_id,clubId:player.club_id,position:player.positionCode,
      valueEur:player.value_eur,published:true,primaryDetail:primaryDetails[player.player_id]!};
    const next=acquireClubPlayer(state,command,{marketOpen:true,allowedClubIds:null,offer}).state;
    state=next;return {command,offer};
  });
  check(state.balanceEur===plan.remainingCredits,"REHEARSAL_BALANCE_MISMATCH");
  check(clubStarterSelections(state,options.geometry,primaryDetails).length===11,"REHEARSAL_STARTERS_INCOMPLETE");
  check(collectionSlotPlan(options.geometry,state.players,primaryDetails),"REHEARSAL_POSITION_PLAN_INVALID");
  check(state.players.filter(p=>p.area==="reserves").length===9 && state.players.filter(p=>p.area==="outside").length===15,"REHEARSAL_AREAS_INVALID");
  return {applied:false,initial,formation,acquisitions,projectedState:state};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [path,projectRef]=process.argv.slice(2);
  check(path && projectRef,"Usage: plan-clubowner-test-rosters.mts <verified-catalogue.json> <QA-project-ref>");
  const catalogue=JSON.parse(readFileSync(path,"utf8")) as CataloguePlayer[];
  const first=planQaRoster(catalogue,{projectRef,coachValue:70_000_000,reserveCredits:50_000_000});
  const second=planQaRoster(catalogue,{projectRef,coachValue:50_000_000,reserveCredits:50_000_000,
    exclude:first.players.map(p=>p.player_id)});
  process.stdout.write(JSON.stringify({first,second},null,2)+"\n");
}
