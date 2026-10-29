import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clubRoundDatabase} from './helpers/club-round-database.mts';
import {acquireClubPlayer,inspectClubAcquisition, type ClubAcquisitionState} from '../lib/touchlineFantasy/club-acquisition.ts';
import {releaseClubCoach,hireClubCoach} from '../lib/touchlineFantasy/club-coach-lifecycle.ts';
import {TOUCHLINE_FANTASY_BETA_BUDGET_EUR} from '../lib/touchlineFantasy/market-plan-policy.ts';
type Proposal = { terms: {quote: {feeTc:number;bonusTc:number}} };
const sql=(n:string)=>readFileSync(new URL(`../supabase/migrations/${n}.sql`,import.meta.url),'utf8');
const id=(n:number)=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('fresh Beta pure wallet uses100M, restricts incoming clubs and permits paid coach lifecycle after initial Ruby',()=>{
 assert.equal(TOUCHLINE_FANTASY_BETA_BUDGET_EUR,100_000_000);
 const state:ClubAcquisitionState={revision:0,seasonId:id(3),plan:'beta',balanceEur:95_000_000,coach:{id:'300',tier:'ruby-red',valueEur:5_000_000},players:[],receipts:[]};
 const command={playerId:id(10),area:'outside' as const,slot:0,expectedRevision:0,idempotencyKey:'beta_buy_01'};
 const offer={playerId:id(10),clubId:id(5),position:'GK' as const,valueEur:1_000_000,published:true};
 assert.throws(()=>acquireClubPlayer(state,command,{marketOpen:true,offer,allowedClubIds:null}),/ALLOWLIST/);
 assert.throws(()=>acquireClubPlayer(state,command,{marketOpen:true,offer,allowedClubIds:[]}),/NOT_ALLOWED/);
 assert.equal(acquireClubPlayer(state,command,{marketOpen:true,offer,allowedClubIds:[id(5)]}).state.balanceEur,94_000_000);
 const release={action:'release-coach' as const,currentCoachId:'300',expectedRevision:0,idempotencyKey:'beta_release_01'};
 assert.throws(()=>releaseClubCoach(state,release,{marketOpen:false,roundLocked:false}),/MARKET_CLOSED/);
 const vacant=releaseClubCoach(state,release,{marketOpen:true,roundLocked:false}).state;
 assert.equal(vacant.balanceEur,99_500_000);inspectClubAcquisition(vacant);
 const hired=hireClubCoach(vacant,{action:'hire-coach',incomingCoachId:'301',expectedRevision:1,idempotencyKey:'beta_hire_01'},{marketOpen:true,roundLocked:false,offer:{id:'301',tier:'sapphire-blue',valueEur:10_000_000,clubId:id(5),published:true}}).state;
 assert.equal(hired.balanceEur,89_500_000);inspectClubAcquisition(hired);
});
test('fresh Beta forward SQL installs on predecessors and preserves funded init/replay, six clubs and legacy boundaries',async()=>{
 const db=await clubRoundDatabase();
 try {
  // Actual enrollment function and receipt schema; owner-VIP side patch is irrelevant to this isolated fixture.
  await db.exec(`alter table users add full_name text;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);create table touchline_platform_owner_accounts(user_id uuid,normalized_email text);`);
  const enroll=sql('20261011012000_touchline_fantasy_beta_enrollment');
  await db.exec(enroll.slice(0,enroll.indexOf('do $migration$'))+'\ncommit;');
  await db.exec(sql('20261025143741_touchline_beta_six_clubs'));
  await db.exec(sql('20261017195405_club_collection_remove_real_club_cap'));
  await db.exec(sql('20261025193152_club_collection_atomic_coach_lifecycle'));
  await db.exec(`alter table football_players add display_name text;alter table football_seasons add starts_at date;alter table football_seasons add ends_at date;alter table football_seasons add competition_id uuid;alter table football_seasons add name text;alter table touchline_card_publications add calculated_price_tc bigint;alter table touchline_card_publications add competition_id uuid;alter table touchline_card_publications add effective_season text;`);
  const primary=sql('20261018073030_club_collection_primary_position_contract');
  await db.exec(primary.slice(primary.indexOf('create function public.touchline_club_normalize_primary_detail'),primary.indexOf('create function public.touchline_club_owned_primary_detail')));
  await db.exec(sql('20261025204101_club_exchange_atomic_ledger'));
  await db.exec(sql('20261025212933_club_beta_full_collection_model'));
  await db.exec(`insert into users values('${id(1)}','Beta');insert into auth.users values('${id(1)}','beta@example.test',now(),'{"touchline_arena_access_v1":true}');insert into football_competitions values('${id(2)}');insert into football_seasons values('${id(3)}',current_date-20,current_date+20,'${id(2)}','2026/2027');insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club) values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status) values('${id(6)}','${id(4)}','${id(2)}','${id(3)}',clock_timestamp()+interval '2 hours','NS');select touchline_fantasy_sync_gameweeks();`);
  const enrollment=(await db.query<{v:{budgetEur:number;allowedClubTeamIds:string[]}}>('select touchline_fantasy_enroll_beta($1,$2) v',[id(1),'beta@example.test'])).rows[0].v;
  assert.equal(enrollment.budgetEur,100_000_000);assert.deepEqual(enrollment.allowedClubTeamIds,['22','117','116','52','3','13']);
  const init=async(tier='ruby-red',value=5_000_000)=>(await db.query<{v:ClubAcquisitionState}>('select touchline_club_initialize_collection($1,$2,$3,$4) v',[id(1),id(3),'beta',JSON.stringify({id:'300',tier,valueEur:value})])).rows[0].v;
  await assert.rejects(init('sapphire-blue',10_000_000),/BETA_COACH_REQUIRED/);
  const initial=await init();assert.equal(initial.balanceEur,95_000_000);assert.deepEqual(await init(),initial);
  await db.exec(sql('20261029160000_beta_initial_coach_same_selection'));
  for (const [i, [tier, valueEur]] of Object.entries({"ruby-red":5_000_000,"sapphire-blue":10_000_000,"amethyst-purple":15_000_000,"radiant-gold":25_000_000,"emerald-green":35_000_000,"clear-diamond":50_000_000,"diamond-gold":70_000_000}).entries()) {
    const owner=id(1000+i);
    await db.query('insert into users values($1,$2)',[owner,'New Beta']);
    await db.query("insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values($1,'active','qa_grant','beta')",[owner]);
    const args=[owner,id(3),'beta',JSON.stringify({id:'300',tier,valueEur})];
    const result=(await db.query<{v:ClubAcquisitionState}>('select touchline_club_initialize_collection($1,$2,$3,$4) v',args)).rows[0].v;
    assert.equal(result.balanceEur,100_000_000-valueEur);
    assert.equal(result.coach?.tier,tier);
    assert.deepEqual((await db.query<{v:ClubAcquisitionState}>('select touchline_club_initialize_collection($1,$2,$3,$4) v',args)).rows[0].v,result);
  }
  assert.deepEqual(await init(),initial); // Existing contracts are preserved.
  for(const [i,provider] of ['22','117','116','52','3','13','19'].entries())await db.exec(`insert into football_clubs values('${id(50+i)}','sportmonks','${provider}')`);
  for(let i=0;i<6;i++)await db.query('select touchline_club_assert_beta_club($1,$2)',['beta',id(50+i)]);
  await assert.rejects(db.query('select touchline_club_assert_beta_club($1,$2)',['beta',id(56)]),/NOT_ALLOWED/);
  await assert.rejects(db.query('select checkout_touchline_market_cart($1,$2,$3)',[id(1),[], 'beta_legacy']),/COLLECTION_ROUTE_REQUIRED/);
  // Full mixed-plan settlement uses server-owned canonical offers and Beta7%, not the UI quote.
  await db.exec(`insert into users values('${id(2)}','Standard');insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(2)}','active','qa_grant','standard');`);
  const positions=['GK','GK','GK',...Array(6).fill('CB'),...Array(3).fill('RB'),...Array(3).fill('LB'),...Array(5).fill('DM'),...Array(5).fill('MID'),...Array(3).fill('RW'),...Array(3).fill('LW'),...Array(4).fill('CF')];
  const roster=(offset:number)=>positions.map((position,index)=>({playerId:id(offset+index),clubId:id(50),position,valueEur:1_000_000,area:index<11?'starters':index<20?'reserves':'outside',slot:index<11?index:index<20?index-11:index-20}));
  const beta={...initial,revision:1,players:roster(100)};
  const standard={...initial,plan:'standard',revision:1,players:roster(200)};
  await db.query('update touchline_club_collections set state=$1,revision=1 where user_id=$2',[JSON.stringify(beta),id(1)]);
  await db.query('insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,1,$3)',[id(2),id(3),JSON.stringify(standard)]);
  for(const [n,value] of [[120,8_000_000],[220,10_000_000]])await db.exec(`insert into football_players values('${id(n)}','sportmonks','${n}','${id(50)}','MID','Central Midfield','Player ${n}');insert into football_squad_members values('${id(n+1000)}','sportmonks','${id(50)}','${id(n)}','MID','Central Midfield','active');insert into football_player_market_values values('${id(n+2000)}','${id(n)}',${value},'verified','verified');insert into touchline_card_publications values('${id(n+3000)}','${id(n)}','${id(n+1000)}','${id(n+2000)}','published',clock_timestamp(),42,'${id(2)}','2026/27');`);
  await db.query('select touchline_club_exchange_listing($1,$2,$3,true)',[id(1),id(3),id(120)]);
  await db.query('select touchline_club_exchange_listing($1,$2,$3,true)',[id(2),id(3),id(220)]);
  const proposal=(await db.query<{v:Proposal}>('select touchline_club_exchange_propose($1,$2,$3,$4,$5,$6,1,1) v',[id(1),id(3),id(300),id(2),id(120),id(220)])).rows[0].v;
  assert.equal(proposal.terms.quote.feeTc,700_000);assert.equal(proposal.terms.quote.bonusTc,350_000);
  const accepted=(await db.query<{v:{status:string}}>('select touchline_club_exchange_resolve($1,$2,$3,$4) v',[id(2),id(3),id(300),'accept'])).rows[0].v;
  assert.equal(accepted.status,'accepted');
  const after=(await db.query<{state:ClubAcquisitionState}>('select state from touchline_club_collections where user_id=$1',[id(1)])).rows[0].state;
  assert.equal(after.balanceEur,92_300_000);assert.equal(after.players.find((x)=>x.playerId===id(220))?.valueEur,10_000_000);
  // The same current published athlete cannot be delivered from a forbidden club to Beta.
  await db.exec(`update football_players set current_club_id='${id(56)}' where id='${id(120)}';update football_squad_members set club_id='${id(56)}' where player_id='${id(120)}';`);
  await db.query('select touchline_club_exchange_listing($1,$2,$3,true)',[id(1),id(3),id(220)]);
  await db.query('select touchline_club_exchange_listing($1,$2,$3,true)',[id(2),id(3),id(120)]);
  await assert.rejects(db.query('select touchline_club_exchange_propose($1,$2,$3,$4,$5,$6,2,2)',[id(2),id(3),id(301),id(1),id(120),id(220)]),/NOT_ALLOWED/);
  // Acquire an entire fresh35-player collection through the actual commit RPC.
  await db.exec(`insert into users values('${id(9)}','FreshBeta');insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(9)}','active','qa_grant','beta');`);
  let fresh=(await db.query<{v:ClubAcquisitionState}>('select touchline_club_initialize_collection($1,$2,$3,$4) v',[id(9),id(3),'beta',JSON.stringify({id:'300',tier:'ruby-red',valueEur:5_000_000})])).rows[0].v;
  const categories={GK:'goalkeeper',CB:'centre-back',RB:'right-back',LB:'left-back',DM:'defensive-midfield',MID:'midfield',RW:'attacker',LW:'attacker',CF:'centre-forward'};
  const geometry={slots:positions.slice(0,11).map(position=>({allowedPositions:[categories[position as keyof typeof categories]]}))};
  await db.query("insert into touchline_formation_geometry_versions values('4-3-3',1,'published',$1)",[JSON.stringify(geometry)]);
  // Formation selection is normally an allocation command; persist its verified empty setup for this acquisition test.
  fresh={...fresh,formationCode:'4-3-3'};await db.query('update touchline_club_collections set state=$1 where user_id=$2',[JSON.stringify(fresh),id(9)]);
  for(let i=0;i<35;i++) {
    const player=roster(400)[i];
    await db.exec(`insert into football_players values('${player.playerId}','sportmonks','${400+i}','${id(50)}','${player.position}',null,'Fresh ${i}');insert into football_player_market_values values('${id(4000+i)}','${player.playerId}',1000000,'verified','verified');insert into touchline_card_publications values('${id(5000+i)}','${player.playerId}',null,'${id(4000+i)}','published',clock_timestamp(),42,'${id(2)}','2026/27');`);
    const command={playerId:player.playerId,area:player.area as 'starters'|'reserves'|'outside',slot:player.slot,expectedRevision:fresh.revision,idempotencyKey:`beta_acquire_${i}`};
    const transition=acquireClubPlayer(fresh,command,{marketOpen:true,allowedClubIds:[id(50)],offer:{...player,position:player.position as keyof typeof categories,published:true}});
    fresh=(await db.query<{v:ClubAcquisitionState}>('select touchline_club_commit_acquisition($1,$2,$3,$4,$5) v',[id(9),id(3),fresh.revision,JSON.stringify(transition.state),JSON.stringify(command)])).rows[0].v;
  }
  assert.equal(fresh.players.length,35);assert.equal(fresh.balanceEur,60_000_000);
  assert.throws(()=>acquireClubPlayer(fresh,{playerId:id(999),area:'outside',slot:0,expectedRevision:35,idempotencyKey:'beta_acquire_36'},{marketOpen:true,allowedClubIds:[id(50)],offer:null}),/ROSTER_FULL/);
  await assert.rejects(db.query('select touchline_club_commit_acquisition($1,$2,$3,$4,$5) v',[id(9),id(3),35,JSON.stringify({...fresh,revision:36,players:[...fresh.players,{...fresh.players[34],playerId:id(999)}]}),JSON.stringify({playerId:id(999),area:'outside',slot:14,expectedRevision:35,idempotencyKey:'beta_acquire_36'})]));
  const releaseCommand={action:'release-coach',currentCoachId:'300',expectedRevision:35,idempotencyKey:'beta_sql_release'};
  const vacant=(await db.query<{v:{state:ClubAcquisitionState}}> ('select touchline_club_coach_lifecycle($1,$2,$3,null) v',[id(9),id(3),JSON.stringify(releaseCommand)])).rows[0].v;
  assert.equal(vacant.state.coach,null);assert.equal(vacant.state.balanceEur,64_500_000);
  const hired=(await db.query<{v:{state:ClubAcquisitionState}}> ('select touchline_club_coach_lifecycle($1,$2,$3,$4) v',[id(9),id(3),JSON.stringify({action:'hire-coach',incomingCoachId:'301',expectedRevision:36,idempotencyKey:'beta_sql_hire'}),JSON.stringify({id:'301',tier:'sapphire-blue',valueEur:10_000_000,clubId:id(50),published:true})])).rows[0].v;
  assert.equal(hired.state.balanceEur,54_500_000);assert.equal(hired.state.coach?.tier,'sapphire-blue');
  const definitions=(await db.query<{definition:string}>("select pg_get_functiondef(oid) definition from pg_proc where proname in('touchline_fantasy_prepare_user_gameweek','touchline_fantasy_save_lineup','touchline_club_project_lineup')")).rows;
  assert.equal(definitions.length,3);for(const d of definitions)assert.ok(!d.definition.includes("when v_plan_key = 'beta' then 50000000"));
 } finally {await db.close();}
});
