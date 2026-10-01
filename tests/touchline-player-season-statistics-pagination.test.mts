import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import {runInNewContext} from "node:vm";
import test from "node:test";
import {execFileSync} from "node:child_process";
type Row=Record<string,unknown>;
const deps:Row={};
for(const f of ["fixture-settlement","player-season-statistics-sync","player-fixture-scoring","player-score-engine-v3","player-score-engine-v4","player-ranking-coverage","player-season-membership-grouping","resilient-batch-upsert","official-team-sheet-readiness"]) Object.assign(deps,await import(`../lib/football-data/${f}.ts`));
const rawSource=process.env.TOUCHLINE_PAGINATION_BASELINE==="1" ? execFileSync("git",["show","HEAD:lib/football-data/player-season-statistics-store.ts"],{encoding:"utf8"}) : readFileSync(new URL("../lib/football-data/player-season-statistics-store.ts",import.meta.url),"utf8");
const source=stripTypeScriptTypes(rawSource).replace(/^import[\s\S]*?;\s*$/gm,"").replace("export async function syncTouchLinePlayerSeasonStatistics","async function syncTouchLinePlayerSeasonStatistics");
const player={id:"player-target",provider:"sportmonks",provider_player_id:"1",position:"Midfielder"};
const membership=(club:string)=>({football_player_id:player.id,competition_id:"league",season_id:"season",club_id:club,football_players:player});
const fixture=(i:number,club="club-a")=>({id:`f${i}`,provider:"sportmonks",provider_fixture_id:String(i),competition_id:"league",season_id:"season",home_club_id:club,away_club_id:"opponent",status:"Full Time",home_score:0,away_score:0});
const feed=(i:number,club="10",rating=7)=>({id:`feed${i}`,provider:"sportmonks",provider_fixture_id:String(i),lineups_payload:[{provider:"sportmonks",fixtureId:String(i),playerId:"1",teamId:club,isStarter:true,statistics:[{code:"minutes-played",value:90},{code:"rating",value:rating}]}],events_payload:[],last_synced_at:"2026-09-21T10:00:00Z"});
function tables(n=1001):Record<string,Row[]>{return {football_fixtures:Array.from({length:n},(_,i)=>fixture(i+1)),football_fantasy_fixture_feeds:Array.from({length:n},(_,i)=>feed(i+1)),football_players:[player],football_clubs:[{id:"club-a",provider:"sportmonks",provider_team_id:"10"},{id:"club-b",provider:"sportmonks",provider_team_id:"11"}],football_player_season_memberships:[{id:"m1",...membership("club-a")}]};}
async function execute(input:Record<string,Row[]>,fault?:{table:string;kind:string},options: {publicationMode?:"publish"|"stage"}={}){
 const writes:Array<{table:string;rows:Row[]}>=[],reads:Array<{table:string;lo:number;chunk:number}>=[],seasons:Row[]=[];let rankings=0;
 const rankingOptions:unknown[]=[];
 const rebuild=async(_admin:unknown,received:unknown)=>{rankings++;rankingOptions.push(received);return {ok:true,snapshotId:null,playerCount:0,published:false,...(options.publicationMode==="stage"?{publicationState:"staged"}:{})};};
 const sync=runInNewContext(source+"\nsyncTouchLinePlayerSeasonStatistics;",{...deps,buildTouchLinePlayerSeasonAggregate:(args:Row)=>{seasons.push(args.season as Row);return (deps.buildTouchLinePlayerSeasonAggregate as (a:Row)=>unknown)(args);},auditTouchlinePlayerScoreSettlementCoverage:async()=>({missingFixtureIds:[],error:null}),rebuildTouchLinePlayerRankingV3:rebuild,rebuildTouchLinePlayerRankingV4:rebuild});
 const admin={from(table:string){let rows=input[table]??[],lo=0,hi=1000,exact=false,chunk=0;const q={
 select(_s:string,o?:{count:string}){exact=o?.count==="exact";return q;},eq(k:string,v:unknown){rows=rows.filter(r=>r[k]===v);return q;},in(k:string,vs:unknown[]){chunk=vs.length;rows=rows.filter(r=>vs.includes(r[k]));return q;},order(){rows=[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)));return q;},range(a:number,b:number){lo=a;hi=b+1;return q;},
 upsert(batch:Row[]){writes.push({table,rows:batch});return Promise.resolve({error:fault?.table===table&&fault.kind==="write"?{message:"synthetic write failure"}:null});},
 then(resolve:(v:unknown)=>unknown){let data=rows.slice(lo,Math.min(hi,lo+1000));let count:number|null=exact?rows.length:null;let error=null;
 if(fault?.table===table){if(fault.kind==="missing-count")count=null;if(fault.kind==="limit")count=50001;if(lo>=500){if(fault.kind==="error")error={message:"failed"};if(fault.kind==="changed")count=rows.length+1;if(fault.kind==="short")data=data.slice(1);if(fault.kind==="duplicate")data=[rows[0],...data.slice(1)];}}
 reads.push({table,lo,chunk});return Promise.resolve({data,count,error}).then(resolve);}};return q;}};
 const result=await sync(admin,options);return {result,writes,reads,seasons,rankings,rankingOptions,aggregate:writes.filter(w=>w.table==="football_player_season_statistics").flatMap(w=>w.rows).find(r=>r.football_player_id===player.id)};
}
test("internal staging forwards publication control after normal V4 facts and aggregate writes",async()=>{
 const x=await execute(tables(1),undefined,{publicationMode:"stage"});
 assert.equal(x.result.ok,true);assert.equal(x.result.rankingPublished,false);assert.equal(x.result.rankingPublicationState,"staged");
 assert.equal(JSON.stringify(x.rankingOptions),JSON.stringify([{publicationMode:"stage"}]));
 assert.ok(x.writes.some(w=>w.table==="touchline_player_fixture_score_settlements"&&w.rows.every(r=>r.scoring_version==="player_scoring_v4")));
 assert.equal(x.aggregate?.scoring_version,"player_scoring_v4");
});
test("1001 fixtures preserve expected universe and rating7007 behind transport cap",async()=>{
 const x=await execute(tables());assert.equal(x.result.ok,true);assert.equal(x.aggregate?.expected_fixture_count,1001);assert.equal((x.aggregate?.summary_payload as Row).totalRating,7007);
 assert.deepEqual(x.reads.filter(r=>r.table==="football_fixtures").map(r=>r.lo),[0,500,1000]);
});
test("1001 historical memberships retain both clubs and total14",async()=>{
 const t=tables(2);t.football_fixtures[1]=fixture(2,"club-b");t.football_fantasy_fixture_feeds[1]=feed(2,"11");
 t.football_player_season_memberships=[...Array.from({length:999},(_,i)=>({id:`m${String(i).padStart(4,"0")}`,...membership("club-z"),football_player_id:`filler${i}`,competition_id:"other"})),{id:"z1",...membership("club-a")},{id:"z2",...membership("club-b")}];
 const x=await execute(t);assert.equal((x.aggregate?.summary_payload as Row).totalRating,14);assert.equal(x.aggregate?.expected_fixture_count,2);
});
for(const kind of ["missing-count","limit","error","changed","short","duplicate"]) for(const table of ["football_fixtures","football_fantasy_fixture_feeds","football_player_season_memberships"]) test(`fail closed ${table} ${kind}`,async()=>{
 const t=tables();if(table==="football_player_season_memberships")t[table]=Array.from({length:1001},(_,i)=>({id:`m${i}`,...membership("club-a")}));
 const x=await execute(t,{table,kind});assert.equal(x.result.ok,false);assert.ok(x.result.errors.length);assert.equal(x.writes.length,0);assert.equal(x.rankings,0);
});
test("complete correction may legitimately reduce points",async()=>{const t=tables(1);t.football_fantasy_fixture_feeds=[feed(1,"10",6)];const x=await execute(t);assert.equal((x.aggregate?.summary_payload as Row).totalRating,6);});

for(const n of [0,499,500,501,1000])test(`transport boundary ${n}`,async()=>{const x=await execute(tables(n));assert.equal(x.result.ok,true);if(n)assert.equal(x.aggregate?.expected_fixture_count,n);});

test("1001 player mappings are chunked and the final identity is preserved",async()=>{
 const t=tables(1);const base=t.football_fantasy_fixture_feeds[0].lineups_payload as Row[];
 t.football_players=Array.from({length:1001},(_,i)=>({...player,id:`player-${i}`,provider_player_id:String(i+1)}));
 t.football_fantasy_fixture_feeds[0].lineups_payload=t.football_players.map(p=>({...base[0],playerId:p.provider_player_id}));
 t.football_player_season_memberships=[];
 const x=await execute(t);assert.equal(x.result.ok,true);
 assert.ok(x.reads.filter(r=>r.table==="football_players").every(r=>r.chunk<=100));
 assert.equal(x.reads.filter(r=>r.table==="football_players").length,11);
 assert.ok(x.writes.filter(w=>w.table==="football_player_season_statistics").flatMap(w=>w.rows).some(r=>r.football_player_id==="player-1000"));
});
for(const table of ["football_players","football_clubs"])test(`mapping ${table} count unavailable prevents all writes`,async()=>{const x=await execute(tables(1),{table,kind:"missing-count"});assert.equal(x.result.ok,false);assert.equal(x.writes.length,0);assert.equal(x.rankings,0);});

for (const table of ["football_players", "football_clubs"]) {
  for (const mode of ["missing", "ambiguous"]) {
    test(`${table} ${mode} lineup identity stops before membership, history and ranking writes`, async () => {
      const t = tables(1);
      t[table] = mode === "missing" ? [] : [...t[table], { ...t[table][0], id: "duplicate-canonical-identity" }];
      const x = await execute(t);
      assert.equal(x.result.ok, false);
      assert.ok(x.result.errors.some((error: string) => error.startsWith("lineup-identity-coverage:")));
      assert.equal(x.writes.length, 0);
      assert.equal(x.rankings, 0);
    });
  }
}

for (const fault of ["foreign-provider", "member-provider", "wrong-fixture", "missing-player", "missing-team"]) {
  test(`lineup provenance ${fault} prevents every write despite colliding mappings`, async () => {
    const t = tables(1);
    const member = (t.football_fantasy_fixture_feeds[0].lineups_payload as Row[])[0];
    if (fault === "foreign-provider") {
      t.football_fixtures[0].provider = "other";
      t.football_fantasy_fixture_feeds[0].provider = "other";
      member.provider = "other";
    }
    if (fault === "member-provider") member.provider = "other";
    if (fault === "wrong-fixture") member.fixtureId = "999";
    if (fault === "missing-player") member.playerId = "";
    if (fault === "missing-team") member.teamId = "";
    const x = await execute(t);
    assert.equal(x.result.ok, false);
    assert.ok(x.result.errors.includes("lineup-provenance-invalid"));
    assert.equal(x.writes.length, 0);
    assert.equal(x.rankings, 0);
  });
}

test("first-ever derived membership retains season competition and club labels",async()=>{
 const t=tables(1);t.football_player_season_memberships=[];
 Object.assign(t.football_fixtures[0],{football_seasons:{name:"2026/2027"},football_competitions:{name:"Premier League"}});
 t.football_clubs[0].name="Club A";
 const x=await execute(t);
 assert.equal(x.seasons[0]?.seasonName,"2026/2027");
 assert.equal(x.seasons[0]?.competitionName,"Premier League");
 assert.equal(x.seasons[0]?.clubName,"Club A");
 assert.match(source,/football_seasons\(name\),football_competitions\(name\)/);
 assert.match(source,/id,provider_team_id,name/);
});

test("V4 producer preserves decimal rating 8.09 without event bonuses or historical-version writes", async () => {
 const t=tables(1);t.football_fantasy_fixture_feeds=[feed(1,"10",8.09)];
 const x=await execute(t);
 assert.equal(x.aggregate?.scoring_version,"player_scoring_v4");
 const settlements=x.writes.filter(w=>w.table==="touchline_player_fixture_score_settlements").flatMap(w=>w.rows);
 assert.equal(settlements.length,1);assert.equal(settlements[0].scoring_version,"player_scoring_v4");assert.equal(settlements[0].touchline_points,8.09);
 assert.equal(x.result.v4FixtureRowsWritten,1);assert.equal(x.result.v3FixtureRowsWritten,0);
 assert.equal(x.result.fixtureRowsWritten,0);assert.equal(x.result.scoringVersion,"player_scoring_v4");
 assert.ok(!x.writes.some(w=>w.table==="football_player_fixture_statistics"));
});

for (const rating of [-1, 11]) test(`V4 invalid rating ${rating} stays blocked and preserves raw evidence`, async () => {
 const t=tables(1);t.football_fantasy_fixture_feeds=[feed(1,"10",rating)];
 const x=await execute(t);
 const row=x.writes.filter(w=>w.table==="touchline_player_fixture_score_settlements").flatMap(w=>w.rows)[0];
 assert.equal(row.rating,null);assert.equal(row.touchline_points,null);
 assert.equal(row.ranking_coverage_status,"unavailable");
 assert.equal((row.statistics_payload as Row).rating,rating);
 assert.equal((x.aggregate?.summary_payload as Row).totalRating,null);
});

for(const mode of ["missing-rating","unused","zero-minutes"])test(`V4 ${mode} retains unknown points, no manufactured zero`,async()=>{
 const t=tables(1);const member=(t.football_fantasy_fixture_feeds[0].lineups_payload as Row[])[0];
 if(mode==="missing-rating")member.statistics=[{code:"minutes-played",value:90}];
 if(mode==="unused")member.isStarter=false;
 if(mode==="zero-minutes")member.statistics=[{code:"minutes-played",value:0},{code:"rating",value:8.09}];
 const x=await execute(t);const row=x.writes.filter(w=>w.table==="touchline_player_fixture_score_settlements").flatMap(w=>w.rows)[0];
 assert.equal(row.touchline_points,null);assert.equal(row.scoring_coverage_status,"unavailable");
 assert.equal(row.rating,mode==="missing-rating"?null:mode==="zero-minutes"?8.09:7);
});
test("V4 retains goal/assist facts without adding their legacy points",async()=>{
 const t=tables(1);t.football_fantasy_fixture_feeds=[feed(1,"10",8.09)];
 t.football_fantasy_fixture_feeds[0].events_payload=[{provider:"sportmonks",providerId:"goal1",fixtureId:"1",playerId:"1",relatedPlayerId:"2",teamId:"10",type:"Goal",status:"recorded"},{provider:"sportmonks",providerId:"goal2",fixtureId:"1",playerId:"2",relatedPlayerId:"1",teamId:"10",type:"Penalty",status:"recorded"}];
 const x=await execute(t);const row=x.writes.filter(w=>w.table==="touchline_player_fixture_score_settlements").flatMap(w=>w.rows)[0];
 assert.equal(row.touchline_points,8.09);assert.equal((row.statistics_payload as Row).goals,1);assert.equal((row.statistics_payload as Row).assists,0);
 assert.equal((row.touchline_points_breakdown as Row[]).length,1);assert.equal((row.touchline_points_breakdown as Row[])[0].ruleCode,"sportmonks-rating");
});
for(const table of ["football_player_season_statistics","touchline_player_fixture_score_settlements"])test(`V4 ${table} failure remains explicit and never falls back to historical-version writes`,async()=>{
 const x=await execute(tables(1),{table,kind:"write"});
 assert.equal(x.result.ok,false);assert.ok(x.result.errors.length>0);assert.ok(x.result.failedFixtureIds.includes("f1"));
 assert.equal(x.result.v4FixtureRowsWritten,0);assert.equal(x.result.v3FixtureRowsWritten,0);assert.equal(x.result.fixtureRowsWritten,0);
 assert.ok(!x.writes.some(w=>w.table==="football_player_fixture_statistics"));
 if(table==="football_player_season_statistics")assert.ok(!x.writes.some(w=>w.table==="touchline_player_fixture_score_settlements"));
});
