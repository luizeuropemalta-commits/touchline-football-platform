import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clubRoundDatabase } from './helpers/club-round-database.mts';
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from '../lib/touchlineArena/formation-geometry.ts';
import { acquireClubPlayer } from '../lib/touchlineFantasy/club-acquisition.ts';
import { allocateClubPlayers } from '../lib/touchlineFantasy/club-allocation.ts';
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('all collection migrations allow service-role writes without exposing the private projector',async()=>{
  const db=await clubRoundDatabase();
  try {
    await db.exec(`insert into users values('${id(1)}');insert into football_competitions values('${id(2)}');insert into football_seasons values('${id(3)}');
      insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
        values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);
      insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(1)}','active','qa_grant','standard');
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status)
        values('${id(6)}','${id(4)}','${id(2)}','${id(3)}',clock_timestamp()+interval '2 hours','NS');
      select touchline_fantasy_sync_gameweeks();
      insert into football_players(id,current_club_id,position) values('${id(100)}','${id(20)}','GK');
      insert into football_player_market_values values('${id(300)}','${id(100)}',10000000,'verified','verified');
      insert into touchline_card_publications(id,player_id,publication_status,market_value_id) values('${id(400)}','${id(100)}','published','${id(300)}');
      grant select on touchline_fantasy_entitlements,touchline_fantasy_configs,touchline_card_contracts,touchline_coach_contracts,
        touchline_fantasy_user_gameweeks,touchline_fantasy_user_gameweek_selections,touchline_fantasy_gameweeks,
        football_players,football_player_market_values,touchline_card_publications,touchline_formation_geometry_versions to service_role;`);
    const geometry=TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY['4-3-3'];
    await db.query("insert into touchline_formation_geometry_versions values('4-3-3',1,'published',$1::jsonb)",[JSON.stringify(geometry)]);
    await db.exec('set role service_role');
    assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege(current_user,'touchline_fantasy_market_window_projection(timestamptz)','execute') allowed")).rows[0].allowed,false);
    const coach={id:'307',tier:'ruby-red' as const,valueEur:5_000_000};
    const initialized=(await db.query<{state:import('../lib/touchlineFantasy/club-acquisition.ts').ClubAcquisitionState}>(
      'select touchline_club_initialize_collection($1,$2,$3,$4::jsonb) state',[id(1),id(3),'standard',JSON.stringify(coach)])).rows[0].state;
    const command={playerId:id(100),area:'reserves' as const,slot:0,expectedRevision:0,idempotencyKey:'service_acquire'};
    const next=acquireClubPlayer(initialized,command,{marketOpen:true,allowedClubIds:null,offer:{playerId:id(100),clubId:id(20),position:'GK',valueEur:10_000_000,published:true}}).state;
    const commit=(proposed:typeof next,cmd=command)=>db.query('select touchline_club_commit_acquisition($1,$2,$3,$4::jsonb,$5::jsonb)',
      [id(1),id(3),cmd.expectedRevision,JSON.stringify(proposed),JSON.stringify(cmd)]);
    const cheap={...next,balanceEur:initialized.balanceEur-1,players:[{...next.players[0],valueEur:1}],receipts:[{...next.receipts[0],valueEur:1}]};
    await assert.rejects(()=>commit(cheap),/CLUB_OFFER_UNAVAILABLE/);
    await assert.rejects(()=>commit({...next,receipts:[{...next.receipts[0],valueEur:2}]}),/CLUB_RECEIPTS_INVALID/);
    await assert.rejects(()=>commit({...next,players:[{...next.players[0],slot:99}],receipts:[{...next.receipts[0],slot:99}]},{...command,slot:99}),/CLUB_ROSTER_INVALID/);
    for(const clubLimit of [true,false]) {
      const owned=Array.from({length:3},(_,n)=>({...next.players[0],playerId:id(200+n),slot:n,area:'outside' as const,
        clubId:clubLimit?id(20):id(21+n),position:clubLimit?(['GK','CB','RB'] as const)[n]:'GK' as const}));
      const seeded={...initialized,revision:3,balanceEur:initialized.balanceEur-30_000_000,players:owned};
      await db.query('update touchline_club_collections set state=$1::jsonb,revision=3',[JSON.stringify(seeded)]);
      const rejected={...next,revision:4,balanceEur:seeded.balanceEur-10_000_000,players:[...owned,next.players[0]],receipts:[{...next.receipts[0],revision:4}]};
      await assert.rejects(()=>commit(rejected,{...command,expectedRevision:3}),clubLimit?/CLUB_TEAM_LIMIT/:/CLUB_POSITION_FULL/);
      assert.deepEqual((await db.query<{state:typeof seeded}>('select state from touchline_club_collections')).rows[0].state,seeded,'rejected mutation leaves ownership and cash unchanged');
    }
    await db.query('update touchline_club_collections set state=$1::jsonb,revision=0',[JSON.stringify(initialized)]);
    assert.equal((await db.query<{n:number}>('select count(*)::int n from touchline_club_collection_operations')).rows[0].n,0);
    const result=await db.query<{state:typeof next}>('select touchline_club_commit_acquisition($1,$2,$3,$4::jsonb,$5::jsonb) state',[id(1),id(3),0,JSON.stringify(next),JSON.stringify(command)]);
    assert.deepEqual(result.rows[0].state,next);
    const form={action:'formation' as const,formationCode:'4-3-3',expectedRevision:1,idempotencyKey:'service_formation'};
    const formed=allocateClubPlayers(next,form,{marketOpen:true,geometry,reservedIds:[],primaryDetails:{[id(100)]:'Goalkeeper'}});
    assert.deepEqual((await db.query<{state:typeof formed}>('select touchline_club_commit_allocation($1,$2,$3,$4::jsonb,$5::jsonb) state',
      [id(1),id(3),1,JSON.stringify(formed),JSON.stringify(form)])).rows[0].state,formed);
    await db.exec('reset role');
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(()=>db.query('select touchline_club_lock_open_round($1)',[id(3)]),/permission denied/);
      await db.exec('reset role');
    }
  }finally{await db.close();}
});
for (const retiredCap of [false, true]) test(`collection XI uses installed save/lock lifecycle without reopening the old free-XI route (retired cap: ${retiredCap})`,async()=>{
  const db=await clubRoundDatabase();
  try {
    const geometry=TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY['4-3-3'];
    if (retiredCap) {
      const qaPreimage = JSON.parse(readFileSync(new URL('./fixtures/qa-club-cap-preimage-20261018.json',import.meta.url),'utf8')) as {definition:string}[];
      await db.exec(qaPreimage.map(row => row.definition).join(';\n'));
      await db.exec(readFileSync(new URL('../supabase/migrations/20261017195405_club_collection_remove_real_club_cap.sql',import.meta.url),'utf8'));
    }
    await db.exec(`insert into users values('${id(1)}');insert into football_competitions values('${id(2)}');insert into football_seasons values('${id(3)}');
      insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
        values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);
      insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(1)}','active','qa_grant','standard');
      insert into touchline_fantasy_gameweeks(id,competition_id,season_id,round_id,gameweek_number,state,market_opens_at,locks_at,first_fixture_at,last_fixture_at)
        values('${id(5)}','${id(2)}','${id(3)}','${id(4)}',1,'MARKET_OPEN',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp()+interval '3 hours');`);
    await db.query("insert into touchline_formation_geometry_versions values('4-3-3',1,'published',$1::jsonb)",[JSON.stringify(geometry)]);
    // Fixtures use the actual tactical side rather than the old broad attacker
    // bucket (which assigned an RW to both wings).
    const position: Record<string,string>={GK:'GK',RCB:'CB',LCB:'CB',RB:'RB',LB:'LB',RCM:'CM',CM:'CM',LCM:'CM',RW:'RW',LW:'LW',ST:'CF'};
    const primaryByPosition: Record<string,string>={GK:'Goalkeeper',CB:'Centre Back',RB:'Right Back',LB:'Left Back',DM:'Defensive Midfield',
      MID:'Central Midfield',RW:'Right Wing',LW:'Left Wing',CF:'Centre Forward'};
    const players=[];
    for(let n=0;n<11;n++) {
      const club=id(retiredCap?20:20+Math.floor(n/3)),pid=id(100+n),pos=position[geometry.slots[n].id];
      await db.exec(`insert into football_clubs values('${club}','sportmonks','${20+Math.floor(n/3)}') on conflict do nothing;
        insert into football_players values('${pid}','sportmonks','${100+n}','${club}','${pos}','${pos}');
        insert into football_squad_members values('${id(200+n)}','sportmonks','${club}','${pid}','${pos}','${pos}','active');
        insert into football_player_market_values values('${id(300+n)}','${pid}',40000000,'verified','verified');
        insert into touchline_card_publications values('${id(400+n)}','${pid}','${id(200+n)}','${id(300+n)}','published',clock_timestamp());`);
      players.push({playerId:pid,clubId:club,position:pos==='CM'?'MID':pos,valueEur:40_000_000,area:'starters',slot:n});
    }
    await db.exec(`insert into football_fixtures(id,round_id,competition_id,season_id,provider,provider_fixture_id,starts_at,status,home_club_id,away_club_id)
      values('${id(6)}','${id(4)}','${id(2)}','${id(3)}','sportmonks','10000',clock_timestamp()+interval '2 hours','NS','${id(20)}','${id(21)}')`);
    // Nine fixed bench roles plus the third goalkeeper outside. The later swap
    // stays GK-for-GK while proving that a bench change invalidates confirmation.
    for(let n=0;n<10;n++)players.push({playerId:id(600+n),clubId:id(700+n),position:['GK','CB','RB','LB','DM','MID','RW','LW','CF','GK'][n],
      valueEur:1_000_000,area:n<9?'reserves':'outside',slot:n<9?n:0});
    const primaryDetails=Object.fromEntries(players.map(player=>[player.playerId,primaryByPosition[player.position]]));
    const state={revision:11,seasonId:id(3),plan:'standard',balanceEur:45_000_000,coach:{id:'307',tier:'ruby-red',valueEur:5_000_000},formationCode:'4-3-3',players,receipts:[]};
    await db.query('insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,11,$3::jsonb)',[id(1),id(3),JSON.stringify(state)]);
    const selections=players.filter(p=>p.area==='starters').map((p,n)=>({playerId:p.playerId,slotId:geometry.slots[n].id}));
    const args=[id(1),id(5),'307','4-3-3',JSON.stringify(selections),'confirm','confirm_1'];
    const save=(argsOverride=args,revision=11)=>db.query<{result:{ok:boolean}}>('select touchline_club_save_lineup($1,$2,$3,$4,$5::jsonb,$6,$7,$8) result',[...argsOverride,revision]);
    await assert.rejects(()=>save(args,10),/CLUB_STALE_REVISION/);
    await assert.rejects(()=>db.query('select touchline_fantasy_save_lineup($1,$2,$3,$4,$5::jsonb,$6,$7)',args),/CLUB_COLLECTION_ROUTE_REQUIRED/);
    const forged=structuredClone(selections);forged[0].playerId=id(999);
    await assert.rejects(()=>save([...args.slice(0,4),JSON.stringify(forged),...args.slice(5)]),/CLUB_LINEUP_OWNERSHIP_MISMATCH/);
    assert.equal((await save()).rows[0].result.ok,true);
    assert.equal((await save()).rows[0].result.ok,true);
    const persisted=(await db.query<{id:string;budget_eur_snapshot:number;state:string}>('select id,budget_eur_snapshot,state from touchline_fantasy_user_gameweeks')).rows[0];
    assert.equal(Number(persisted.budget_eur_snapshot),495_000_000,'collection envelope, not old 400M or extra wallet');
    assert.equal((await db.query<{owned:boolean}>('select touchline_club_round_is_owned($1) owned',[persisted.id])).rows[0].owned,true);
    assert.deepEqual((await db.query<{state:unknown}>('select state from touchline_club_collections')).rows[0].state,state,'saving XI never charges again');
    const move={action:'move' as const,playerId:id(600),area:'outside' as const,slot:0,expectedRevision:11,idempotencyKey:'swap_bench'};
    const moved=allocateClubPlayers(state as Parameters<typeof allocateClubPlayers>[0],move,{marketOpen:true,geometry,reservedIds:[],primaryDetails});
    assert.equal(moved.players.find(player=>player.playerId===id(600))?.area,'outside');
    assert.equal(moved.players.find(player=>player.playerId===id(609))?.area,'reserves');
    assert.equal(moved.players.find(player=>player.playerId===id(609))?.slot,0);
    assert.equal(moved.balanceEur,state.balanceEur,'allocation never releases a contract or changes the wallet');
    await db.query('select touchline_club_commit_allocation($1,$2,$3,$4::jsonb,$5::jsonb)',[id(1),id(3),11,JSON.stringify(moved),JSON.stringify(move)]);
    assert.equal((await db.query<{owned:boolean}>('select touchline_club_round_is_owned($1) owned',[persisted.id])).rows[0].owned,false,'reserve swap requires reconfirmation even with identical XI');
    assert.equal((await save([...args.slice(0,6),'reconfirm_bench'],12)).rows[0].result.ok,true);
    assert.equal((await db.query<{owned:boolean}>('select touchline_club_round_is_owned($1) owned',[persisted.id])).rows[0].owned,true);
    await db.exec(`update touchline_fantasy_gameweeks set locks_at=clock_timestamp()-interval '1 second' where id='${id(5)}'`);
    await db.exec("update football_fixtures set starts_at=clock_timestamp()+interval '4 minutes'");
    await assert.rejects(()=>save([...args.slice(0,6),'confirm_2'],12),/TL_FANTASY_GAMEWEEK_LOCKED/);
    await db.query('select touchline_fantasy_lock_gameweek($1)',[id(5)]);
    assert.equal((await db.query<{state:string}>('select state from touchline_fantasy_user_gameweeks')).rows[0].state,'LOCKED');
    assert.equal((await db.query<{n:number}>('select count(*)::int n from touchline_fantasy_locked_selections')).rows[0].n,11);
    await assert.rejects(()=>db.exec('update touchline_fantasy_user_gameweeks set collection_revision_snapshot=13'),/TL_FANTASY_LOCKED_SNAPSHOT_IMMUTABLE/);
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(()=>save(),/permission denied/);await db.exec('reset role');
    }
  } finally {await db.close();}
});

test('shared window closes five minutes before kickoff and reopens only five minutes after actual finality',async()=>{
  const db=await clubRoundDatabase();
  try {
    await db.exec(`insert into football_competitions values('${id(2)}');insert into football_seasons values('${id(3)}');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
        values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);
      insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1'),('${id(7)}','${id(2)}','${id(3)}','Gameweek 2');
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status,finalized_at) values
        ('${id(6)}','${id(4)}','${id(2)}','${id(3)}','2030-08-01T12:00:00Z','FT','2030-08-01T14:00:00Z'),
        ('${id(8)}','${id(7)}','${id(2)}','${id(3)}','2030-08-02T12:00:00Z','NS',null);`);
    const at=async(time:string)=>(await db.query<{state:string;locks_at:string;market_opens_at:string}>(
      'select state,locks_at,market_opens_at from touchline_fantasy_market_window_projection($1::timestamptz) where round_id=$2',[time,id(7)])).rows[0];
    assert.equal((await at('2030-08-01T14:04:59Z')).state,'UPCOMING');
    assert.equal((await at('2030-08-01T14:05:00Z')).state,'MARKET_OPEN');
    assert.equal((await at('2030-08-02T11:54:59Z')).state,'MARKET_OPEN');
    assert.equal((await at('2030-08-02T11:55:00Z')).state,'LOCKED');
    await db.exec(`insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status)
      values('${id(9)}','${id(4)}','${id(2)}','${id(3)}','2030-08-01T12:00:00Z','NS')`);
    assert.equal((await at('2030-08-02T11:00:00Z')).state,'UPCOMING','scheduled end cannot replace final whistle');
    assert.equal((await db.query<{open:boolean}>('select touchline_club_market_is_open($1) open',[id(3)])).rows[0].open,false,
      'acquisition rechecks canonical projection rather than trusting a materialized row');
  }finally{await db.close();}
});
