import test from 'node:test';
import assert from 'node:assert/strict';
import { clubRoundDatabase } from './helpers/club-round-database.mts';

const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('installed legacy checkout and collection bootstrap cannot fund parallel current rosters',async()=>{
  const db=await clubRoundDatabase();
  try {
    await db.exec(`insert into users values('${id(1)}'),('${id(2)}'),('${id(8)}');
      insert into football_clubs values('${id(9)}','sportmonks','9');
      insert into football_competitions values('${id(3)}');insert into football_seasons values('${id(4)}');
      insert into football_rounds values('${id(5)}','${id(3)}','${id(4)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
        values('england','${id(3)}','${id(4)}',2990,'GBP',400000000,3);
      insert into touchline_fantasy_entitlements(user_id,status,source,plan_key)
        values('${id(1)}','active','qa_grant','standard'),('${id(2)}','active','qa_grant','standard'),('${id(8)}','active','qa_grant','standard');
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status)
        values('${id(6)}','${id(5)}','${id(3)}','${id(4)}',clock_timestamp()+interval '2 hours','NS');
      select touchline_fantasy_sync_gameweeks();
      insert into touchline_card_price_catalog(price_table_version,tier_key,price_tc) values('2026-07-premier-v1','ruby-red',10);
      insert into touchline_card_inventory(id,player_name,club_name,card_status,sale_status)
        values('${id(7)}','Fixture player','Fixture club','published','available');
      insert into clubowner_credit_ledger(user_id,amount_cents,currency)
        values('${id(1)}',10000,'TC'),('${id(2)}',10000,'TC');
      grant select on touchline_fantasy_entitlements,touchline_fantasy_configs,touchline_card_contracts,touchline_coach_contracts,
        touchline_fantasy_user_gameweeks,touchline_fantasy_user_gameweek_selections,touchline_fantasy_gameweeks to service_role;
      set request.jwt.claim.role='service_role';set role service_role;`);
    const init=(user:string)=>db.query('select touchline_club_initialize_collection($1,$2,$3,$4::jsonb)',
      [user,id(4),'standard',JSON.stringify({id:'307',tier:'ruby-red',valueEur:5_000_000})]);
    const checkout=(user:string,key:string)=>db.query<{result:{idempotentReplay:boolean;totalTc:number}}>(
      'select checkout_touchline_market_cart($1,$2::uuid[],$3) result',[user,[id(7)],key]);
    const hire=(user:string)=>db.query<{result:{ok:boolean;scoringVersion:string}}>(
      'select touchline_hire_coach_contract($1,$2,$3,$4) result',[user,'307',id(9),'legacy_coach_hire']);
    await init(id(1));
    await assert.rejects(()=>checkout(id(1),'collection_wrong_wallet'),/CLUB_COLLECTION_ROUTE_REQUIRED/);
    await assert.rejects(()=>hire(id(1)),/CLUB_COLLECTION_ROUTE_REQUIRED/);
    assert.equal((await hire(id(8))).rows[0].result.scoringVersion,'coach_scoring_v2');
    await assert.rejects(()=>init(id(8)),/CLUB_LEGACY_RESET_REQUIRED/);
    // Non-migrated flow still uses the actual installed wallet/supply checkout.
    const legacy=await checkout(id(2),'legacy_still_valid');
    assert.equal(legacy.rows[0].result.totalTc,10);
    assert.equal(legacy.rows[0].result.idempotentReplay,false);
    assert.equal((await checkout(id(2),'legacy_still_valid')).rows[0].result.idempotentReplay,true);
    await assert.rejects(()=>init(id(2)),/CLUB_LEGACY_RESET_REQUIRED/,'unscoped legacy contract cannot be ignored');
    await db.exec('reset role');
    assert.deepEqual((await db.query('select user_id,sum(amount_cents)::int balance from clubowner_credit_ledger group by user_id order by user_id')).rows,
      [{user_id:id(1),balance:10000},{user_id:id(2),balance:9000}]);
    assert.equal((await db.query('select count(*)::int n from touchline_market_orders')).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from touchline_card_contracts')).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from touchline_club_collections')).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from touchline_club_collection_operations')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from touchline_coach_contracts')).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from touchline_coach_contract_events')).rows[0].n,1);
    // Proven historical ownership remains preserved and is not a current wallet.
    await db.query('update touchline_card_contracts set season_id=$1 where user_id=$2',[id(99),id(2)]);
    await db.exec('set role service_role');
    await init(id(2));
    await assert.rejects(()=>checkout(id(2),'legacy_still_valid'),/CLUB_COLLECTION_ROUTE_REQUIRED/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from touchline_card_contracts')).rows[0].n,1);
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(()=>checkout(id(1),'unauthorized_attempt'),/permission denied/);
      await assert.rejects(()=>hire(id(1)),/permission denied/);
      await db.exec('reset role');
    }
    // Lock-order contract, not a claim of multi-connection concurrency proof.
    for(const signature of ['checkout_touchline_market_cart(uuid,uuid[],text)','touchline_hire_coach_contract(uuid,text,uuid,text)','touchline_club_initialize_collection(uuid,uuid,text,jsonb)']) {
      const definition=(await db.query<{body:string}>('select pg_get_functiondef($1::regprocedure) body',[signature])).rows[0].body;
      assert.match(definition,/pg_advisory_xact_lock\(pg_catalog.hashtextextended\('touchline-club-ownership:'/);
    }
  }finally{await db.close();}
});
