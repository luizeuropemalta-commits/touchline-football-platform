import { checksumTouchlineRankingFamilyRenderSource } from "../lib/touchlineArena/social-ranking-family-render-source.ts";
import { createTouchlineCurrentRankingCache } from "../lib/touchlineArena/current-ranking-cache.ts";
import { resolveTouchlineSeasonPlayer } from "../lib/touchlineArena/player-season-presentation.ts";
import { readFileSync } from "node:fs";
import { selectTouchlineSocialRankingTopThree } from "../lib/touchlineArena/social-ranking-family-contract.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import type { TouchlineRankedPlayer } from "../lib/touchlineArena/card-ranking.ts";
import { reader } from "./helpers/touchline-current-ranking-readers.mts";
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildTouchlineRankingSnapshot } from '../lib/touchlineArena/card-ranking.ts';
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from '../lib/touchlineArena/card-rules.ts';
import { parseTouchlineActiveRankingState, parseTouchlineRankingPresentation, type TouchlineActiveRankingState } from '../lib/touchlineArena/card-ranking-live.ts';
import * as current from '../lib/touchlineArena/current-player-ranking.ts';
import type { readTouchlineCurrentLeagueScope } from '../lib/touchlineArena/current-player-eligibility-server';

const id = (n:number) => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope = {competitionId:id(1),seasonId:id(2),providerSeasonId:'70001',effectiveSeason:'2026-27'};
const snapshotId = 'current-regression';
function fixture(count = 8) {
  const input = Array.from({length:count},(_,index) => ({
    playerId:id(index+10),providerPlayerId:String(index+200),name:`Player ${index}`,clubName:'Club',position:['GK','CB','RB','CM','RW','ST'][Math.min(index,5)]!,
    totalRating:index === 7 ? null : index === 6 ? 0 : 1000-index,minutesPlayed:90,appearances:1,
  }));
  const built = buildTouchlineRankingSnapshot({snapshotId,roundId:'round-1',status:'published',generatedAt:'2026-11-04T10:00:00Z',source:'sportmonks-audited',players:input});
  const raw:TouchlineActiveRankingState = {phase:'ranked',leagueKey:'touchline-england',snapshotId,roundId:'round-1',publishedAt:'2026-11-04T10:00:00Z',
    priceTableVersion:TOUCHLINE_CARD_PRICE_TABLE_VERSION,scoringVersion:'player_scoring_v4',coverageStatus:'complete_for_scoring',seasonId:scope.seasonId,
    fixtureIds:['1'],expectedFixtureIds:['1'],totalScorePoints:0,players:built.players,
    cardGoals:{source:'published-card-goals-v1',snapshotId,rows:[...input.map((row,i)=>({playerId:row.playerId,goals:Math.max(0,8-i)})),{playerId:id(count+10),goals:20}]},
    leadershipDecision:{status:'unique-leader',scope:{rankingId:'touchline-player-overall',snapshotId},leader:{subjectType:'player',subjectId:id(10)}},
  };
  const admissions:current.TouchlineCurrentPlayerAdmission[] = Array.from({length:count+1},(_,i)=>({playerId:id(i+10),providerPlayerId:String(i+200),clubId:id(3),membershipId:id(i+30),status:'eligible'}));
  assert.ok(parseTouchlineActiveRankingState(raw));
  return {raw,admissions};
}
function project(raw:TouchlineActiveRankingState,admissions:current.TouchlineCurrentPlayerAdmission[]|null,season=scope) {
  const revision = createHash('sha256').update(JSON.stringify([raw.snapshotId,season,admissions])).digest('hex');
  return current.projectTouchlineCurrentPlayerRanking({raw,scope:season,admissions,revision});
}

test('leave and return to same/different league club keeps UUID season totals and immutable source',()=>{
  const {raw,admissions} = fixture(); const before = JSON.stringify(raw);
  const a = project(raw,admissions); assert.equal(a.phase,'ready');
  const away = admissions.map(row=>row.playerId===id(10)?{...row,status:'outside-league' as const,clubId:id(4),membershipId:null}:row);
  const b = project(raw,away); assert.equal(b.phase,'ready');
  assert.ok(!b.state!.players.some(row=>row.playerId===id(10)));
  assert.ok(!b.state!.cardGoals!.rows.some(row=>row.playerId===id(10)));
  assert.equal(b.state!.players[0]!.officialRank,1);
  assert.equal(b.state!.leadershipDecision,null,'runner-up receives no invented published crown');
  for (const clubId of [id(3),id(5)]) {
    const returned = project(raw,admissions.map(row=>row.playerId===id(10)?{...row,clubId,membershipId:id(90)}:row));
    const row = returned.state!.players.find(row=>row.playerId===id(10))!;
    assert.equal(row.totalRating,a.state!.players.find(row=>row.playerId===id(10))!.totalRating);
    assert.equal(returned.state!.cardGoals!.rows.find(row=>row.playerId===id(10))!.goals,8);
    assert.equal(row.officialRank,1); assert.notEqual(returned.revision,b.revision);
  }
  assert.equal(JSON.stringify(raw),before);
  assert.equal(b.state!.currentProjection!.sourcePlayerCount,raw.players.length);
  assert.equal(b.state!.currentProjection!.eligiblePlayerCount,raw.players.length-1);
  assert.equal(parseTouchlineActiveRankingState(b.state),null,'derived state cannot masquerade as original complete snapshot');
  assert.ok(parseTouchlineRankingPresentation(b.state));
});
test('new season has no inherited rating/goals and preserves prior historical publication',()=>{
  const {raw,admissions}=fixture();const before=JSON.stringify(raw);
  const next=project(raw,admissions,{...scope,seasonId:id(99),providerSeasonId:'70002',effectiveSeason:'2027-28'});
  assert.equal(next.phase,'preseason');assert.equal(next.state!.seasonId,id(99));assert.deepEqual(next.state!.players,[]);
  assert.equal(next.state!.cardGoals,undefined);assert.equal(JSON.stringify(raw),before);
});
test('goals-only candidates require independent complete eligibility; zero ratings remain ranked and null do not',()=>{
  const {raw,admissions}=fixture();
  assert.equal(project(raw,admissions.slice(0,-1)).phase,'unavailable');
  const eligible=project(raw,admissions);assert.equal(eligible.state!.cardGoals!.rows.find(row=>row.playerId===id(18))!.goals,20);
  const removed=project(raw,admissions.map(row=>row.playerId===id(18)?{...row,status:'outside-league' as const,membershipId:null}:row));
  assert.equal(removed.phase,'ready');assert.ok(!removed.state!.cardGoals!.rows.some(row=>row.playerId===id(18)));
  assert.equal(removed.state!.players.find(row=>row.totalRating===0)!.officialRank,7);
  assert.equal(removed.state!.players.find(row=>row.totalRating===null)!.officialRank,null);
});
test('global order uses rating/minutes/appearances/provider tie break after filtering, not club or display name',()=>{
  const {raw,admissions}=fixture();raw.players=raw.players.map((row,i)=>({...row,totalRating:50,minutesPlayed:i===3?180:90,appearances:i===4?2:1}));
  const result=project(raw,admissions);assert.equal(result.state!.players[0]!.playerId,id(13));assert.equal(result.state!.players[1]!.playerId,id(14));
  assert.deepEqual(result.state!.players.map(row=>row.officialRank),[1,2,3,4,5,6,7,8]);
});
test('all proven departures yield explicit empty current view; unknown/duplicate/forged transport fails closed',()=>{
  const {raw,admissions}=fixture();const empty=project(raw,admissions.map(row=>({...row,status:'outside-league' as const,membershipId:null})));
  assert.equal(empty.phase,'ready');assert.deepEqual(empty.state!.players,[]);assert.deepEqual(empty.state!.cardGoals!.rows,[]);
  assert.equal(project(raw,null).phase,'unavailable');assert.equal(project(raw,[...admissions.slice(1),admissions[1]!]).phase,'unavailable');
  const valid=project(raw,admissions);assert.deepEqual(current.parseTouchlineCurrentPlayerRanking(JSON.parse(JSON.stringify(valid)),raw),valid);
  const altered=structuredClone(valid);altered.state!.players[0]!.totalRating=999;
  assert.equal(current.parseTouchlineCurrentPlayerRanking(altered,raw),null);
});

type Row=Record<string,unknown>;
function databaseFixture(count = 8) {
  const {raw,admissions}=fixture(count);
  const tables:Record<string,Row[]>={
    football_competitions:[{id:scope.competitionId,provider:'sportmonks',provider_competition_id:'8'}],
    football_seasons:[{id:scope.seasonId,provider:'sportmonks',provider_season_id:scope.providerSeasonId,competition_id:scope.competitionId,is_current:true,name:'2026/2027'}],
    football_players:admissions.map(row=>({id:row.playerId,provider:'sportmonks',provider_player_id:row.providerPlayerId,current_club_id:row.clubId})),
    football_clubs:[{id:id(3),provider:'sportmonks',provider_team_id:'300',competition_id:scope.competitionId}],
    football_squad_members:admissions.map(row=>({id:row.membershipId,provider:'sportmonks',player_id:row.playerId,club_id:row.clubId,competition_id:scope.competitionId,status:'active',jersey_number:1})),
    touchline_card_publications:admissions.map(row=>({player_id:row.playerId,current_membership_id:row.membershipId,competition_id:scope.competitionId,effective_season:scope.effectiveSeason,publication_status:'published',calculated_tier:'ruby-red',calculated_nominal_price_gbp:10,last_reviewed_at:'2026-11-01T00:00:00Z',internal_source:'editorial'})),
    football_player_market_values:admissions.map(row=>({player_id:row.playerId,market_value_eur:2500000,verified_season:scope.effectiveSeason,status:'verified',confidence:'verified',source:'editorial'})),touchline_card_editorial_overrides:[],
  };
  const calls:string[]=[];const config={errorTable:'',truncateTable:'',before:(_table:string)=>{}};
  const admin={from(table:string){
    assert.ok(Object.hasOwn(tables,table),`Unexpected table ${table}`);let selected:string[]=[];let exact=false;let start=0,end=Infinity;
    const predicates:Array<(row:Row)=>boolean>=[];
    const query={select(columns:string,options?:{count?:string}){assert.ok(!columns.includes('*'));selected=columns.split(',');exact=options?.count==='exact';return query;},
      eq(key:string,value:unknown){predicates.push(row=>row[key]===value);return query;},in(key:string,values:unknown[]){predicates.push(row=>values.includes(row[key]));return query;},
      limit(value:number){end=value-1;return query;},order(){return query;},abortSignal(){return query;},range(from:number,to:number){start=from;end=to;return query;},
      then(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown){return Promise.resolve().then(()=>{
        calls.push(table);config.before(table);const matching=tables[table]!.filter(row=>predicates.every(fn=>fn(row))).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
        const data=matching.slice(start,config.truncateTable===table?start+1:end+1).map(row=>Object.fromEntries(selected.map(key=>[key,row[key]])));
        return {data,error:config.errorTable===table?{message:'PRIVATE sentinel'}:null,count:exact?matching.length:null};
      }).then(resolve,reject);}};return query;
  }} as unknown as Parameters<typeof readTouchlineCurrentLeagueScope>[0];
  return {raw,tables,admin,calls,config};
}
for(const mutation of ['none','outside','inactive','missing-player','missing-membership','unknown-status','duplicate-season','truncated','read-error','unpublished'] as const) {
 test(`canonical reader validates real publication and complete identities: ${mutation}`,async()=>{
  const f=databaseFixture();
  if(mutation==='outside')f.tables.football_clubs![0]!.competition_id=id(500);
  if(mutation==='inactive')f.tables.football_squad_members!.forEach(row=>row.status='inactive');
  if(mutation==='missing-player')f.tables.football_players!.pop();
  if(mutation==='missing-membership')f.tables.football_squad_members!.pop();
  if(mutation==='unknown-status')f.tables.football_squad_members![0]!.status='unknown';
  if(mutation==='duplicate-season')f.tables.football_seasons!.push({...f.tables.football_seasons![0]!,id:id(501)});
  if(mutation==='truncated')f.config.truncateTable='football_players';
  if(mutation==='read-error')f.config.errorTable='football_clubs';
  if(mutation==='unpublished')f.tables.touchline_card_publications![0]!.publication_status='draft';
  const before=JSON.stringify(f.tables);
  const actualScope=await reader.readTouchlineCurrentLeagueScope(f.admin);
  const result=await reader.readTouchlineCurrentPlayerRanking(f.admin,f.raw,actualScope);
  assert.equal(result.phase,['none','outside','inactive'].includes(mutation)?'ready':'unavailable');
  if(mutation==='none')assert.equal(result.state!.players.length,8);
  if(mutation==='outside'||mutation==='inactive')assert.deepEqual(result.state!.players,[]);
  assert.equal(JSON.stringify(f.tables),before);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 });
}
test('transfer during read withdraws whole view; same raw publication later re-enters with changed revision',async()=>{
  const f=databaseFixture();const a=await reader.readTouchlineCurrentPlayerRanking(f.admin,f.raw,await reader.readTouchlineCurrentLeagueScope(f.admin));
  assert.equal(a.phase,'ready');let playerReads=0;
  f.config.before=table=>{if(table==='football_players'&&++playerReads===3)f.tables.football_players![0]!.current_club_id=id(999);};
  const raced=await reader.readTouchlineCurrentPlayerRanking(f.admin,f.raw,scope);assert.equal(raced.phase,'unavailable');
  f.config.before=()=>{};f.tables.football_players![0]!.current_club_id=id(3);f.tables.football_clubs![0]!.competition_id=id(500);
  const away=await reader.readTouchlineCurrentPlayerRanking(f.admin,f.raw,scope);assert.equal(away.phase,'ready');assert.notEqual(away.revision,a.revision);
  f.tables.football_clubs![0]!.competition_id=scope.competitionId;
  const back=await reader.readTouchlineCurrentPlayerRanking(f.admin,f.raw,scope);assert.equal(back.revision,a.revision);assert.deepEqual(back.state,a.state);
});


test('current social Top3 uses the same filtered global order; new drafts do not relabel history',()=>{
  const {raw,admissions}=fixture();const source=JSON.stringify(raw);
  const current=project(raw,admissions.map(row=>row.playerId===id(10)?{...row,status:'outside-league' as const,membershipId:null}:row));
  const players=current.state!.players.map(row=>({...row,name:`Player ${row.playerId}`,clubName:'Current Club',position:'ST',role:'striker'})) as TouchlineRankedPlayer[];
  const cards=players.map(row=>({id:String(row.providerPlayerId),providerPlayerId:row.providerPlayerId,canonicalPlayerId:row.playerId,name:row.name,shortName:row.name,
    clubName:row.clubName,role:'striker',position:'ST',shirtNumber:1,countryCode3:'ENG',marketValue:'verified',cardTier:'ruby-red',
    editorialCard:{tierKey:'ruby-red',cardPrice:{amountMinor:1500,currency:'TC'},lastReviewedAt:'2026-11-04T00:00:00Z'},touchlinePoints:0,seasonTotalRating:row.totalRating})) as ClubOwnerSquadCard[];
  const podium=selectTouchlineSocialRankingTopThree({rankingPlayers:players,cards});assert.ok(podium);
  assert.deepEqual(podium.map(row=>row.card.canonicalPlayerId),[id(11),id(12),id(13)]);
  assert.deepEqual(podium.map(row=>row.overallRank),[1,2,3]);assert.equal(JSON.stringify(raw),source);
  const returned=project(raw,admissions);
  const returnedPlayers=returned.state!.players.map(row=>({...row,name:`Player ${row.playerId}`,clubName:'Current Club',position:'ST',role:'striker'})) as TouchlineRankedPlayer[];
  const returnedCards=returnedPlayers.map(row=>({...cards[0]!,id:String(row.providerPlayerId),providerPlayerId:row.providerPlayerId,canonicalPlayerId:row.playerId,name:row.name,shortName:row.name,seasonTotalRating:row.totalRating}));
  const back=selectTouchlineSocialRankingTopThree({rankingPlayers:returnedPlayers,cards:returnedCards});assert.ok(back);
  assert.deepEqual(back.map(row=>row.card.canonicalPlayerId),[id(10),id(11),id(12)]);
  assert.notEqual(checksumTouchlineRankingFamilyRenderSource({snapshotId:raw.snapshotId,cards:podium}),
    checksumTouchlineRankingFamilyRenderSource({snapshotId:raw.snapshotId,cards:back}));

  for(const name of ['social-ranking-family-draft-server','social-match-preview-draft-server']) {
    const source=readFileSync(new URL(`../lib/touchlineArena/${name}.ts`,import.meta.url),'utf8');
    assert.match(source,/readTouchlineCurrentPlayerRanking/);assert.match(source,/readTouchlineCurrentLeagueScope/);
  }
});


test('650 canonical candidates are paginated by IDs with exact counts and a bounded observed query count',async()=>{
  // 649 rated/unrated rows + one goals-only candidate = 650 identities.
  const f=databaseFixture(649);
  const result=await reader.readTouchlineCurrentPlayerRanking(f.admin,f.raw,await reader.readTouchlineCurrentLeagueScope(f.admin));
  assert.equal(result.phase,'ready');assert.equal(result.admissions.length,650);assert.equal(result.state!.players.length,649);
  assert.equal(f.calls.length,51,'4 scope + 22 canonical identity reads + 25 publication reads');
  assert.equal(f.calls.filter(table=>table==='touchline_card_publications').length,5);
});


test('departed profile/card/zoom keeps same-season total, never current position or mixed identity',()=>{
  const {raw,admissions}=fixture();
  const left=project(raw,admissions.map(row=>row.playerId===id(10)?{...row,status:'outside-league' as const,membershipId:null}:row));
  const facts=resolveTouchlineSeasonPlayer({authority:{playerRanking:left.state,coachLeader:null},enabled:true,playerId:id(10),providerPlayerId:'200',seasonId:scope.seasonId});
  assert.ok(facts);assert.equal(facts.totalRating,1000);assert.equal(facts.positionRank,null);assert.equal(facts.positionGroup,null);
  assert.equal(resolveTouchlineSeasonPlayer({authority:{playerRanking:left.state,coachLeader:null},enabled:true,playerId:id(10),providerPlayerId:'201',seasonId:scope.seasonId}),null);
  const returned=project(raw,admissions);const back=resolveTouchlineSeasonPlayer({authority:{playerRanking:returned.state,coachLeader:null},enabled:true,playerId:id(10),providerPlayerId:'200',seasonId:scope.seasonId});
  assert.equal(back!.totalRating,1000);assert.equal(back!.positionRank,1);
  const zero=resolveTouchlineSeasonPlayer({authority:{playerRanking:returned.state,coachLeader:null},enabled:true,playerId:id(16),providerPlayerId:'206',seasonId:scope.seasonId});assert.equal(zero!.totalRating,0);
  const next=project(raw,admissions,{...scope,seasonId:id(999),providerSeasonId:'70002',effectiveSeason:'2027-28'});
  assert.equal(resolveTouchlineSeasonPlayer({authority:{playerRanking:next.state,coachLeader:null},enabled:true,playerId:id(10),providerPlayerId:'200',seasonId:id(999)}),null);
});


test('650-candidate cache miss/hit counts preserve live scope checks and withdraw after canonical failure',async()=>{
  const f=databaseFixture(649);let clock=100;const stored=new Map<string,unknown>();
  const cache=createTouchlineCurrentRankingCache<current.TouchlineCurrentPlayerRanking>({now:()=>clock,readCached:async(key,fresh)=>{
    if(stored.has(key))return stored.get(key);const value=await fresh();stored.set(key,value);return value;
  }});
  const read=async()=>{
    const liveScope=await reader.readTouchlineCurrentLeagueScope(f.admin);
    assert.ok(liveScope);
    const key=createHash('sha256').update(JSON.stringify([f.raw.snapshotId,liveScope])).digest('hex');
    return cache.load(key,()=>reader.readTouchlineCurrentPlayerRanking(f.admin,f.raw,liveScope),
      (value):value is current.TouchlineCurrentPlayerRanking=>!!current.parseTouchlineCurrentPlayerRanking(value,f.raw));
  };
  assert.equal((await read()).phase,'ready');assert.equal(f.calls.length,51);
  assert.equal((await read()).phase,'ready');assert.equal(f.calls.length,53,'hit performs only the two current-scope reads');
  clock=5100;f.config.errorTable='football_players';
  assert.equal((await read()).phase,'unavailable','expired positive result is withdrawn on canonical failure');
  f.config.errorTable='';f.tables.football_seasons![0]!.id=id(999);f.tables.football_seasons![0]!.provider_season_id='70002';f.tables.football_seasons![0]!.name='2027/2028';
  const next=await read();assert.equal(next.phase,'preseason');assert.equal(next.state!.seasonId,id(999));assert.deepEqual(next.state!.players,[]);
});
