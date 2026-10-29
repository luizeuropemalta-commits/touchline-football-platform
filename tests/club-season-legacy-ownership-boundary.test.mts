import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clubRoundDatabase } from './helpers/club-round-database.mts';

const id = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');

test('seasonal ownership closes both installed legacy entry points before collection bootstrap', async t => {
  const db = await clubRoundDatabase();
  try {
    await db.exec(`
      create table auth.users(id uuid primary key);
      alter table football_competitions add column provider text, add column provider_competition_id text;
      alter table football_clubs add column competition_id uuid, add column name text;
      insert into football_clubs values('${id(50)}','sportmonks','9',null,'Fixture club');
      insert into touchline_card_price_catalog(price_table_version,tier_key,price_tc)
        values('2026-07-premier-v1','ruby-red',10);
      insert into touchline_card_inventory(id,player_name,club_name,card_status,sale_status)
        values('${id(51)}','Fixture player','Fixture club','published','available'),
          ('${id(52)}','Second player','Fixture club','published','available');
      set request.jwt.claim.role='service_role';
    `);
    for (let user = 1; user <= 9; user++) {
      await db.exec(`insert into users values('${id(user)}');
        insert into touchline_fantasy_entitlements(user_id,status,source,plan_key)
          values('${id(user)}','active','qa_grant','standard');
        insert into clubowner_credit_ledger(user_id,amount_cents,currency) values('${id(user)}',10000,'TC');`);
    }
    // Install the real public catalogue overload and its existing four-argument
    // wrapper. The publication gate is OFF; no fake replacement RPC is used.
    await db.exec(sql('20261025193152_club_collection_atomic_coach_lifecycle'));
    await db.exec(sql('20261027210242_touchline_coach_catalogue_editorial'));
    await db.exec(sql('20261027215042_touchline_coach_catalogue_transaction_guard'));
    const hire = (user: number, key: string, provider = '307', full = false) => db.query<{ r: { idempotentReplay: boolean } }>(
      full ? 'select touchline_hire_coach_contract($1,$2,$3,$4,null::integer,null::uuid) r'
        : 'select touchline_hire_coach_contract($1,$2,$3,$4) r', [id(user), provider, id(50), key]);
    const buy = (user: number, key: string, card = id(51)) => db.query<{ r: { idempotentReplay: boolean; totalTc: number } }>(
      'select checkout_touchline_market_cart($1,$2::uuid[],$3) r', [id(user), [card], key]);
    const markSeasonal = (user: number, plan = 'standard', status = 'active') => db.query(
      `update touchline_fantasy_entitlements set source='stripe_test',plan_key=$2,status=$3,
        metadata=jsonb_build_object('seasonTestOrderId',$4::text,'seasonTestSeasonId',$5::text)
        where user_id=$1`, [id(user), plan, status, id(60 + user), id(70)]);
    const snapshot = async () => ({
      coach: (await db.query('select * from touchline_coach_contracts order by id')).rows,
      coachEvents: (await db.query('select * from touchline_coach_contract_events order by id')).rows,
      cards: (await db.query('select * from touchline_card_contracts order by id')).rows,
      orders: (await db.query('select * from touchline_market_orders order by id')).rows,
      wallet: (await db.query('select user_id,sum(amount_cents)::int balance from clubowner_credit_ledger group by user_id order by user_id')).rows,
    });

    await t.test('predecessor reproduces fresh paid customer entering both legacy paths', async () => {
      await markSeasonal(8); await markSeasonal(9);
      assert.equal((await hire(8, 'seasonal_before_patch')).rows[0].r.idempotentReplay, false);
      assert.equal((await buy(9, 'seasonal_before_patch')).rows[0].r.totalTc, 10);
      assert.equal((await db.query('select count(*)::int n from touchline_club_collections')).rows[0].n, 0);
    });
    const signatures = ['checkout_touchline_market_cart(uuid,uuid[],text)', 'touchline_hire_coach_contract(uuid,text,uuid,text,integer,uuid)'];
    const readAttributes = async () => (await db.query(`select oid::regprocedure::text signature,proowner,proacl,proconfig,prosecdef
      from pg_proc where oid=any($1::regprocedure[]) order by signature`, [signatures])).rows;
    const attributes = await readAttributes();
    await db.exec(sql('20261029041409_club_season_legacy_ownership_boundary'));

    await t.test('all paid plans without a collection reject fresh coach and player operations without writes', async () => {
      const before = await snapshot();
      for (const [index, plan] of ['standard', 'master', 'vip'].entries()) {
        const user = index + 1;
        await markSeasonal(user, plan);
        await assert.rejects(hire(user, `seasonal_new_${user}`), /CLUB_COLLECTION_ROUTE_REQUIRED/);
        await assert.rejects(hire(user, `seasonal_full_${user}`, '307', true), /CLUB_COLLECTION_ROUTE_REQUIRED/);
        await assert.rejects(buy(user, `seasonal_new_${user}`), /CLUB_COLLECTION_ROUTE_REQUIRED/);
      }
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('exact committed replay survives seasonal lineage and rejects changed identity or a fresh key', async () => {
      const before = await snapshot();
      assert.equal((await hire(8, 'seasonal_before_patch')).rows[0].r.idempotentReplay, true);
      assert.equal((await hire(8, 'seasonal_before_patch', '307', true)).rows[0].r.idempotentReplay, true);
      assert.equal((await buy(9, 'seasonal_before_patch')).rows[0].r.idempotentReplay, true);
      await assert.rejects(hire(8, 'seasonal_before_patch', '308'), /TL_COACH_HIRE_IDEMPOTENCY_CONFLICT/);
      await assert.rejects(buy(9, 'seasonal_before_patch', id(52)), /TL_MARKET_IDEMPOTENCY_CONFLICT/);
      await assert.rejects(hire(8, 'seasonal_fresh_key'), /CLUB_COLLECTION_ROUTE_REQUIRED/);
      await assert.rejects(buy(9, 'seasonal_fresh_key', id(52)), /CLUB_COLLECTION_ROUTE_REQUIRED/);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('reviewed or expired seasonal access cannot fall back to a legacy wallet', async () => {
      for (const [index, status] of ['past_due', 'expired', 'inactive'].entries()) {
        await markSeasonal(1, 'standard', status);
        await assert.rejects(hire(1, `inactive_coach_${index}`), /CLUB_COLLECTION_ROUTE_REQUIRED/);
        await assert.rejects(buy(1, `inactive_player_${index}`), /CLUB_COLLECTION_ROUTE_REQUIRED/);
      }
    });
    await t.test('normal legacy accounts keep real prices, wallet deductions, receipts and replay', async () => {
      assert.equal((await hire(4, 'normal_coach_hire')).rows[0].r.idempotentReplay, false);
      assert.equal((await hire(4, 'normal_coach_hire')).rows[0].r.idempotentReplay, true);
      assert.equal((await buy(5, 'normal_player_buy')).rows[0].r.totalTc, 10);
      assert.equal((await buy(5, 'normal_player_buy')).rows[0].r.idempotentReplay, true);
      assert.equal((await db.query('select sum(amount_cents)::int balance from clubowner_credit_ledger where user_id=$1', [id(5)])).rows[0].balance, 9000);
    });
    await t.test('ACLs and lock order stay unchanged and the guard runs after replay under the user lock', async () => {
      assert.deepEqual(await readAttributes(), attributes);
      for (const signature of signatures) {
        const body = (await db.query<{ body: string }>('select pg_get_functiondef($1::regprocedure) body', [signature])).rows[0].body;
        assert.ok(body.indexOf('touchline-club-ownership:') < body.indexOf('for update;'));
        assert.ok(body.indexOf('for update;') < body.indexOf('idempotentReplay'));
        assert.ok(body.indexOf('idempotentReplay') < body.indexOf('seasonTestOrderId'));
        assert.doesNotMatch(body, /touchline-fantasy-subscription:/);
      }
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(hire(1, 'unauthorized_hire'), /permission denied/);
        await assert.rejects(buy(1, 'unauthorized_buy'), /permission denied/);
        await db.exec('reset role');
      }
    });
  } finally { await db.close(); }
});
