import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {clubRoundDatabase} from './helpers/club-round-database.mts';
import {parseExchangeDiscovery} from '../lib/touchlineFantasy/exchange-discovery.ts';
import {projectExchangeLedger} from '../lib/touchlineFantasy/exchange-ledger-projection.ts';
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=(file:string)=>readFileSync(new URL(`../supabase/migrations/${file}.sql`,import.meta.url),'utf8');
test('Exchange actual SQL: bilateral atomic receipt, rollback, authorization, replay and history projection',async()=>{
 const db=await clubRoundDatabase();
 try {
  await db.exec(`alter table users add full_name text;alter table football_seasons add starts_at date;alter table football_seasons add ends_at date;alter table football_seasons add competition_id uuid;alter table football_seasons add name text;
   alter table football_players add display_name text;alter table touchline_card_publications add calculated_price_tc bigint;alter table touchline_card_publications add competition_id uuid;alter table touchline_card_publications add effective_season text;
   insert into users values('${id(1)}','Owner A'),('${id(2)}','Owner B'),('${id(9)}','Other');
   insert into football_competitions values('${id(4)}');insert into football_seasons values('${id(3)}',current_date-20,current_date+20,'${id(4)}','2026/2027');
   insert into football_clubs values('${id(5)}','sportmonks','5');
   insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club) values('england','${id(4)}','${id(3)}',2990,'GBP',400000000,3);
   insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(1)}','active','qa_grant','standard'),('${id(2)}','active','qa_grant','standard');`);
  const primary=sql('20261018073030_club_collection_primary_position_contract');
  await db.exec(primary.slice(primary.indexOf('create function public.touchline_club_normalize_primary_detail'),primary.indexOf('create function public.touchline_club_owned_primary_detail')));
  await db.exec(sql('20261025204101_club_exchange_atomic_ledger'));
  await db.exec(sql('20261030011416_club_exchange_beta_pair_boundary'));
  const positions=['GK','GK','GK',...Array(6).fill('CB'),...Array(3).fill('RB'),...Array(3).fill('LB'),...Array(5).fill('DM'),...Array(5).fill('MID'),...Array(3).fill('RW'),...Array(3).fill('LW'),...Array(4).fill('CF')];
  const roster=(offset:number)=>positions.map((position,index)=>({playerId:id(offset+index),clubId:id(5),position,valueEur:100_000_000,area:index<11?'starters':index<20?'reserves':'outside',slot:index<11?index:index<20?index-11:index-20}));
  const before=(offset:number)=>({revision:1,seasonId:id(3),plan:'standard',balanceEur:100_000_000,coach:null,players:roster(offset),receipts:[]});
  for(const [owner,offset] of [[1,100],[2,200]]) await db.query('insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,1,$3)',[id(owner),id(3),JSON.stringify(before(offset))]);
  for(const [n,value] of [[120,80_000_000],[220,100_000_000]]) await db.exec(`insert into football_players values('${id(n)}','sportmonks','${n}','${id(5)}','MID','Central Midfield','Player ${n}');insert into football_squad_members values('${id(n+1000)}','sportmonks','${id(5)}','${id(n)}','MID','Central Midfield','active');insert into football_player_market_values values('${id(n+2000)}','${id(n)}',${value},'verified','verified');insert into touchline_card_publications values('${id(n+3000)}','${id(n)}','${id(n+1000)}','${id(n+2000)}','published',clock_timestamp(),${value},'${id(4)}','2026/27');`);
  const listing=async(owner:number,player:number)=>(await db.query('select touchline_club_exchange_listing($1,$2,$3,true)',[id(owner),id(3),id(player)]));
  const propose=async(key=10)=>(await db.query<{v:Record<string,unknown>}>('select touchline_club_exchange_propose($1,$2,$3,$4,$5,$6,1,1) v',[id(1),id(3),id(key),id(2),id(120),id(220)])).rows[0].v;
  const resolve=async(owner:number,action='accept',key=10)=>(await db.query<{v:Record<string,unknown>}>('select touchline_club_exchange_resolve($1,$2,$3,$4) v',[id(owner),id(3),id(key),action])).rows[0].v;
  await assert.rejects(listing(1,220),/CLUB_MATCH_RELATED_PLAYER/);
  // Same verified acquisition TC units; nominal Card Engine GBP is unrelated.
  await db.exec('update football_player_market_values set market_value_eur=null');
  await assert.rejects(listing(1,120),/CLUB_OFFER_UNAVAILABLE/);
  await db.exec(`update football_player_market_values set market_value_eur=case player_id when '${id(120)}' then 80000000 else 100000000 end;update touchline_card_publications set calculated_price_tc=42`);
  const malformed=before(100);malformed.players[21]={...malformed.players[20]};
  await db.query('update touchline_club_collections set state=$1 where user_id=$2',[JSON.stringify(malformed),id(1)]);
  await assert.rejects(listing(1,120),/CLUB_ROSTER_INVALID/);
  await db.query('update touchline_club_collections set state=$1 where user_id=$2',[JSON.stringify(before(100)),id(1)]);
  await db.exec(`insert into football_fixtures(id,competition_id,season_id,provider,provider_fixture_id,status) values('${id(50)}','${id(4)}','${id(3)}','sportmonks','50','NS');insert into football_fantasy_fixture_feeds(provider,provider_fixture_id,fixture_payload,sidelined_payload) values('sportmonks','50','{"provider":"sportmonks","providerId":"50","status":"NS"}','[{"provider":"sportmonks","fixtureId":"50","playerId":"120","completed":false,"category":"injury"}]');`);
  await assert.rejects(listing(1,120),/CLUB_PLAYER_UNAVAILABLE/);
  await db.exec(`update football_fantasy_fixture_feeds set sidelined_payload='[{"provider":"sportmonks","fixtureId":"50","playerId":"120","completed":false,"category":"suspension"}]'`);
  await assert.rejects(listing(1,120),/CLUB_PLAYER_UNAVAILABLE/);
  // Unknown fixture evidence is not a global lock on every other player.
  await listing(2,220);

  await db.exec(`update football_fixtures set status='FT' where id='${id(50)}'`);
  await listing(1,120);await listing(2,220);
  await propose(12);
  assert.equal((await resolve(2,'decline',12)).status,'declined');
  assert.equal((await db.query<{n:number}>('select count(*)::int n from touchline_club_player_reservations')).rows[0].n,0);
  await propose(11);await assert.rejects(resolve(1,'expire',11),/CLUB_PROPOSAL_NOT_EXPIRED/);
  await db.exec(`update touchline_club_exchange_proposals set expires_at=clock_timestamp()-interval '1 second' where id='${id(11)}'`);
  await assert.rejects(resolve(2,'accept',11),/CLUB_PROPOSAL_EXPIRED/);
  await db.exec("update football_seasons set ends_at=current_date-1;update touchline_fantasy_configs set status='retired'");
  assert.equal((await resolve(1,'expire',11)).status,'expired');
  await db.exec("update football_seasons set ends_at=current_date+20;update touchline_fantasy_configs set status='active'");
  assert.equal((await db.query<{n:number}>('select count(*)::int n from touchline_club_player_reservations')).rows[0].n,0);

  const discovery=async(owner:number)=>(await db.query<{v:{listings:{owner:{accountId:string};player:{valueTc:number}}[];reservations:unknown[];proposals:{proposer:{accountId:string}}[]}}>('select touchline_club_exchange_discovery($1,$2) v',[id(owner),id(3)])).rows[0].v;
  const visible=await discovery(1);assert.ok(parseExchangeDiscovery(visible,{ready:true,accountId:id(1),seasonId:id(3),collectionRevision:1}));assert.equal(visible.listings.length,2);assert.ok(parseExchangeDiscovery(visible,{ready:true,accountId:id(1),seasonId:id(3),collectionRevision:1})!.listings.every(l=>l.negotiationAllowed));assert.equal(visible.listings[1].owner.accountId,id(2));assert.equal(visible.listings[1].player.valueTc,100_000_000);assert.equal(JSON.stringify(visible).includes('balanceEur'),false);
  assert.equal((await propose()).status,'pending');
  assert.equal((await discovery(1)).listings.length,0);assert.equal((await discovery(1)).reservations.length,1);
assert.equal((await propose()).replayed,true);
  await assert.rejects(resolve(1),/CLUB_ACCESS_REQUIRED/);await assert.rejects(resolve(9),/CLUB_PROPOSAL_UNAVAILABLE/);
  await db.exec(`update football_player_market_values set market_value_eur=120000000 where player_id='${id(220)}'`);
  await assert.rejects(resolve(2),/CLUB_OFFER_CHANGED/);
  await db.exec(`update football_player_market_values set market_value_eur=100000000 where player_id='${id(220)}';update touchline_club_collections set state=jsonb_set(state,'{balanceEur}','0') where user_id='${id(1)}'`);
  await assert.rejects(resolve(2),/CLUB_INSUFFICIENT_BALANCE/);
  await db.query('update touchline_club_collections set state=$1 where user_id=$2',[JSON.stringify(before(100)),id(1)]);
  await db.exec(`create function reject_exchange() returns trigger language plpgsql as $$begin raise exception 'TEST_RECEIPT_FAILURE';end;$$;create trigger reject_exchange before insert on touchline_club_exchange_receipts for each row execute function reject_exchange();`);
  await assert.rejects(resolve(2),/TEST_RECEIPT_FAILURE/);
  assert.deepEqual((await db.query<{state:unknown}>('select state from touchline_club_collections where user_id=$1',[id(1)])).rows[0].state,before(100));
  assert.equal((await db.query<{n:number}>('select count(*)::int n from touchline_club_player_reservations')).rows[0].n,2);
  await db.exec('drop trigger reject_exchange on touchline_club_exchange_receipts');
  const result=await resolve(2);assert.equal(result.status,'accepted');assert.equal((await resolve(2)).replayed,true);
  const read=async(owner:number)=>(await db.query<{state:{balanceEur:number;revision:number;players:{playerId:string;valueEur:number}[]}}>('select state from touchline_club_collections where user_id=$1',[id(owner)])).rows[0].state;
  assert.equal((await read(1)).balanceEur,75_000_000);assert.equal((await read(2)).balanceEur,122_500_000);
  assert.equal((await read(1)).revision,2);assert.equal((await read(1)).players.find(p=>p.playerId===id(220))?.valueEur,100_000_000);
  for(const owner of [1,2]){
   const envelope=(await db.query<{v:Parameters<typeof projectExchangeLedger>[0]}>('select touchline_club_exchange_history($1,$2) v',[id(owner),id(3)])).rows[0].v;
   const dto=projectExchangeLedger(envelope);assert.ok(dto);assert.equal(dto.receipts.length,1);assert.equal(dto.seasonNegotiationIncomeTc,owner===1?0:2_500_000);
  }
  assert.equal((await db.query<{n:number}>('select count(*)::int n from touchline_club_player_reservations')).rows[0].n,0);
  // Actual route -> adapter -> actual installed SQL -> DTO, with only Auth and
  // transport boundaries stubbed. No remote Supabase or browser involvement.
  const admin={rpc:async(name:string,args:{p_actor:string;p_season:string;p_id?:string;p_action?:string})=>({data:(await db.query<{v:unknown}>(name==='touchline_club_exchange_resolve'?'select touchline_club_exchange_resolve($1,$2,$3,$4) v':'select touchline_club_exchange_history($1,$2) v',name==='touchline_club_exchange_resolve'?[args.p_actor,args.p_season,args.p_id,args.p_action]:[args.p_actor,args.p_season])).rows[0].v,error:null}),from:()=>({select:()=>({eq:()=>({eq:()=>({single:async()=>({data:{season_id:id(3)},error:null})})})})})};
  const load=(path:string,deps:Record<string,unknown>)=>{const exports:Record<string,unknown>={};runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(key:string)=>{if(!(key in deps))throw new Error(key);return deps[key];},process:{env:{TOUCHLINE_CLUB_COLLECTION_ENABLED:'true',TOUCHLINE_CLUB_EXCHANGE_ENABLED:'true'}},URL,console});return exports;};
  const adapter=load('../lib/touchlineFantasy/club-exchange-server.ts',{'server-only':{},'./exchange-ledger-projection':{projectExchangeLedger},'./exchange-discovery':{parseExchangeDiscovery}});
  const dependencies={'next/server':{NextResponse:{json:(body:unknown,options:unknown)=>({body,options})}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:id(2),email:'customer@example.test'}},error:null})}})},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/admin/owner':{isOwnerEmail:()=>false,ownerEmails:()=>['admin@example.test']},'@/lib/touchlineArena/auth-access':{hasTouchLineArenaAccess:()=>true},'@/lib/touchlineFantasy/club-exchange-server':adapter,'@/lib/touchlineFantasy/club-request':{readClubCommand:async(request:{json:()=>Promise<unknown>})=>request.json()}};
  const route=load('../app/api/touchline-fantasy/exchange/history/route.ts',dependencies);
  const get=route.GET as (request:unknown)=>Promise<{body:{ok:boolean;history:{seasonNegotiationIncomeTc:number;receipts:unknown[]}}}>;
  const response=await get({headers:new Headers({'X-Touchline-Account':id(2)}),nextUrl:new URL(`https://example.test/api/touchline-fantasy/exchange/history?expectedSeasonId=${id(3)}`)});
  assert.equal(response.body.ok,true);assert.equal(response.body.history.seasonNegotiationIncomeTc,2_500_000);assert.equal(response.body.history.receipts.length,1);
  await db.exec("update football_seasons set ends_at=current_date-1;update touchline_fantasy_configs set status='retired'");
  assert.equal((await resolve(2)).replayed,true,'durable accepted replay survives season/config closure');
  const post=load('../app/api/touchline-fantasy/exchange/route.ts',dependencies).POST as (request:unknown)=>Promise<{body:{ok:boolean;replayed:boolean}}>;
  const replay=await post({headers:new Headers({origin:'https://example.test'}),nextUrl:new URL('https://example.test/api/touchline-fantasy/exchange'),json:async()=>({expectedAccountId:id(2),expectedSeasonId:id(3),command:{action:'accept',proposalId:id(10)}})});
  assert.equal(replay.body.ok,true);assert.equal(replay.body.replayed,true,'POST reaches durable replay after active config retired');assert.equal('receipt' in replay.body,false,'no bilateral wallet leaks through POST');assert.equal(JSON.stringify(replay.body).includes('Balance'),false);

  await db.exec('set role authenticated');await assert.rejects(resolve(2),/permission denied/);await assert.rejects(db.query('select * from touchline_club_exchange_receipts'),/permission denied/);await db.exec('reset role');
 } finally {await db.close();}
});
