import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pageinspect } from '@electric-sql/pglite/contrib/pageinspect';
import { clubRoundDatabase } from './helpers/club-round-database.mts';
import { CLUB_SEASON_TEST_CATALOGUE, CLUB_SEASON_TEST_ACCOUNT } from '../lib/stripe/club-season-test-catalogue.ts';

// Exercises the CLI-created forward migration. Every credential/account below is
// synthetic except the already-public existing TEST catalogue identifiers.
const migration = '20261103212057_club_season_payment_modes';
const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const id = (n: number) => `71000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const season = id(100), competition = id(101), club = id(102), actor = id(90);
const testProfile = 'club-season-test-v1', liveProfile = 'synthetic-live-v1';
const liveAccount = 'acct_SyntheticLiveA', liveVersion = 'synthetic-live-v1';
type Plan = 'standard' | 'master' | 'vip';
type Order = {
  id: string; user_id: string; season_id: string; plan: Plan; previous_paid_plan: Plan | null;
  amount_minor: number; payment_mode: 'test' | 'live'; provider_account: string;
  payment_profile_id: string; catalogue_version: string; product_id: string; price_id: string;
  session_id: string | null;
};
function evidence(order: Order, legacy = false) {
  const isLive = order.payment_mode === 'live';
  const item = CLUB_SEASON_TEST_CATALOGUE[order.plan];
  const session = order.session_id ?? `cs_${isLive ? 'live' : 'test'}_${order.id.replaceAll('-', '')}`;
  return {
    id: session, accountId: order.provider_account ?? CLUB_SEASON_TEST_ACCOUNT, livemode: isLive,
    ...(legacy ? {} : { profileId: order.payment_profile_id, catalogueVersion: order.catalogue_version }),
    mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'eur',
    amount_total: order.amount_minor, amount_subtotal: order.amount_minor,
    total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 },
    client_reference_id: order.user_id,
    metadata: {
      touchlineOrderId: order.id, touchlineSeasonId: order.season_id, touchlinePlan: order.plan,
      ...(order.previous_paid_plan ? { touchlinePreviousPaidPlan: order.previous_paid_plan } : {}),
      ...(isLive ? { touchlinePaymentMode: 'live', touchlinePaymentProfileId: order.payment_profile_id,
        touchlinePaymentAccountId: order.provider_account, touchlineCatalogueVersion: order.catalogue_version } : {}),
    },
    lines: { has_more: false, data: [{ quantity: 1, price: {
      id: order.previous_paid_plan ? 'price_SyntheticInline' : (order.price_id ?? item.priceId),
      product: order.product_id ?? item.productId, active: !order.previous_paid_plan, livemode: isLive,
      currency: 'eur', unit_amount: order.amount_minor, recurring: null,
    } }] },
  };
}

test('season payment modes preserve the actual TEST ledger and bind LIVE obligations before every shortcut', async t => {
  // One real local PostgreSQL instance. Existing helpers install the real
  // collection, legacy purchase/hire and ownership-lock implementations.
  // This is not a multi-connection concurrency claim.
  const db = await clubRoundDatabase({ createDatabase: () => new PGlite({ extensions: { pageinspect } }) });
  try {
    await db.exec(`
      create extension pageinspect;
      alter table public.users add column full_name text;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,updated_at timestamptz);
      create table public.touchline_platform_owner_accounts(user_id uuid,normalized_email text);
      alter table public.football_seasons add column starts_at date,add column ends_at date;
      alter table public.football_competitions add column provider text,add column provider_competition_id text;
      alter table public.football_clubs add column competition_id uuid,add column name text;
      insert into public.football_competitions values('${competition}','sportmonks','8');
      insert into public.football_seasons values('${season}',current_date-30,current_date+90);
      insert into public.football_clubs values('${club}','sportmonks','9','${competition}','Synthetic club');
      insert into public.touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,status)
        values('england','${competition}','${season}',2990,'GBP',750000000,'active');
      insert into public.touchline_card_price_catalog(price_table_version,tier_key,price_tc) values('2026-07-premier-v1','ruby-red',10);
      insert into public.touchline_card_inventory(id,player_name,club_name,card_status,sale_status) values
        ('${id(201)}','Synthetic player A','Synthetic club','published','available'),
        ('${id(202)}','Synthetic player B','Synthetic club','published','available');
      set request.jwt.claim.role='service_role';
      alter default privileges in schema public grant all on tables to service_role;
    `);
    for (let n = 1; n <= 12; n++) {
      await db.query(`insert into public.users(id) values($1);`, [id(n)]);
      await db.query(`insert into auth.users values($1,$2,now(),'{}',now())`, [id(n), `synthetic-${n}@example.invalid`]);
      await db.query(`insert into public.clubowner_credit_ledger(user_id,amount_cents,currency) values($1,10000,'TC')`, [id(n)]);
    }
    await db.query(`insert into public.users(id) values($1)`, [actor]);
    await db.query(`insert into auth.users values($1,'synthetic-owner@example.invalid',now(),'{"touchline_arena_access_v1":true}',now())`, [actor]);
    for (const name of [
      '20260825182600_touchline_fantasy_subscription_event_ordering',
      '20261011011000_touchline_fantasy_owner_vip_access',
      '20261017182144_touchline_owner_guest_plan_access',
      '20261025193152_club_collection_atomic_coach_lifecycle',
      '20261027210242_touchline_coach_catalogue_editorial',
      '20261027215042_touchline_coach_catalogue_transaction_guard',
      '20261028220000_club_season_test_orders',
      '20261029000100_club_season_test_fulfillment',
      '20261029041409_club_season_legacy_ownership_boundary',
      '20261029055452_club_season_test_table_privileges',
    ]) await db.exec(sql(name));
    await db.exec(`grant select,update on public.users to service_role;
      grant select on public.football_seasons,public.touchline_fantasy_configs,public.touchline_card_contracts,public.touchline_coach_contracts,
        public.touchline_fantasy_user_gameweeks,public.touchline_fantasy_gameweeks,public.touchline_fantasy_user_gameweek_selections to service_role;
      grant select,insert,update on public.touchline_fantasy_entitlements to service_role;`);
    const prepareTest = async (user: number, plan: Plan) => (await db.query<{ o: Order }>(
      'select to_jsonb(public.touchline_club_prepare_season_test_order($1,$2)) o', [id(user), plan])).rows[0].o;
    const fulfillTest = (order: Order, event: string) => db.query<{ r: Record<string, unknown> }>(
      'select public.touchline_club_fulfill_season_test_order($1,$2,$3) r', [order.id, event, evidence(order, true)]);
    const prepare = async (user: number, plan: Plan, profile = liveProfile) => (await db.query<{ o: Order }>(
      'select to_jsonb(public.touchline_club_prepare_season_order($1,$2,$3)) o', [id(user), plan, profile])).rows[0].o;
    const fulfill = (order: Order, event: string, input = evidence(order)) => db.query<{ r: Record<string, unknown> }>(
      'select public.touchline_club_fulfill_season_order($1,$2,$3) r', [order.id, event, input]);
    const context = (o: Order) => [o.payment_mode, o.provider_account, o.payment_profile_id, o.catalogue_version];
    const review = (o: Order, event: string, kind = 'charge.refunded', ctx = context(o)) => db.query<{ r: Record<string, unknown> }>(
      'select public.touchline_club_review_season_order($1,$2,$3,$4,$5,$6,$7,$8) r', [o.id, event, kind, evidence(o).id, ...ctx]);
    const expire = (o: Order, event: string, ctx = context(o)) => db.query<{ r: Record<string, unknown> }>(
      'select public.touchline_club_expire_season_order($1,$2,$3,$4,$5,$6,$7) r', [o.id, event, evidence(o).id, ...ctx]);
    const attach = (o: Order, ctx = context(o)) => db.query(
      'select public.touchline_club_attach_season_session($1,$2,$3,$4,$5,$6,$7)', [o.user_id, o.id, evidence(o).id, ...ctx]);
    const asOwner = async (statement: string, params: unknown[] = []) => {
      await db.exec('reset role');
      try { return params.length ? await db.query(statement, params) : await db.exec(statement); } finally { await db.exec('set role service_role'); }
    };
    const snapshot = async () => {
      await db.exec('reset role');
      try {
        const tables = ['touchline_club_season_test_orders', 'touchline_club_season_test_events', 'touchline_fantasy_entitlements',
          'touchline_club_collections', 'touchline_card_contracts', 'touchline_coach_contracts', 'clubowner_credit_ledger'];
        const out: Record<string, unknown> = {};
        for (const table of tables) out[table] = (await db.query(`select coalesce(jsonb_agg(row order by row::text),'[]') rows from (select to_jsonb(t) row from public.${table} t) a`)).rows[0].rows;
        return out;
      } finally { await db.exec('set role service_role'); }
    };
    const collection = async (user: number) => {
      const state = (await db.query<{ state: Record<string, unknown> }>(
        'select state from public.touchline_club_collections where user_id=$1 and season_id=$2', [id(user), season])).rows[0]?.state;
      assert.ok(state, 'expected a real persisted collection fixture');
      return state;
    };
    const fixtureCollection = (user: number, plan: Plan = 'standard') => asOwner(
      `insert into public.touchline_club_collections(user_id,season_id,revision,state) values($1,$2,3,$3)`,
      [id(user), season, { seasonId: season, revision: 3, plan, balanceEur: 500000000, coach: { id: 'synthetic-coach' },
        players: [{ playerId: 'synthetic-preserved-player' }], receipts: [{ key: 'synthetic-preserved-receipt' }], formationCode: '4-3-3' }]);

    // Genuine legacy receipts/contracts exist before the forward guard changes.
    await asOwner(`insert into public.touchline_fantasy_entitlements(user_id,status,source,plan_key)
      values($1,'active','qa_grant','standard'),($2,'active','qa_grant','standard')`, [id(8), id(9)]);
    const buy = (user: number, key: string, card = id(201)) => db.query<{ r: { idempotentReplay: boolean } }>(
      'select public.checkout_touchline_market_cart($1,$2::uuid[],$3) r', [id(user), [card], key]);
    const hire = (user: number, key: string, provider = '307') => db.query<{ r: { idempotentReplay: boolean } }>(
      'select public.touchline_hire_coach_contract($1,$2,$3,$4,null::integer,null::uuid) r', [id(user), provider, club, key]);
    await buy(8, 'synthetic_legacy_buy'); await hire(9, 'synthetic_legacy_hire');

    // Produce a genuine historical receipt with predecessor SQL before migration.
    await db.exec('set role service_role');
    let historical = await prepareTest(1, 'standard');
    const oldReceipt = (await fulfillTest(historical, 'evt_historical')).rows[0].r;
    const oldRows = (await db.query('select to_jsonb(o) row from public.touchline_club_season_test_orders o order by id')).rows;
    const oldEvents = (await db.query('select to_jsonb(e) row from public.touchline_club_season_test_events e order by event_id')).rows;
    const oldEntitlement = (await db.query('select to_jsonb(e) row from public.touchline_fantasy_entitlements e where user_id=$1', [id(1)])).rows;
    const attrs = (await db.query(`select oid,proowner,proacl,proconfig,prosecdef from pg_proc where oid=any($1::regprocedure[]) order by oid`, [[
      'public.checkout_touchline_market_cart(uuid,uuid[],text)',
      'public.touchline_hire_coach_contract(uuid,text,uuid,text,integer,uuid)',
      'public.touchline_fantasy_grant_guest_access(uuid,text,text,text,uuid,text)',
      'public.touchline_club_prepare_season_test_order(uuid,text)',
    ]])).rows;
    await t.test('a changed legacy prerequisite aborts the entire forward migration without partial backfill', async () => {
      await db.exec('reset role');
      const signature = 'public.touchline_fantasy_grant_guest_access(uuid,text,text,text,uuid,text)';
      const source = (await db.query<{ body: string }>('select pg_get_functiondef($1::regprocedure) body', [signature])).rows[0].body;
      const drift = source.replace("v_before ->> 'source' = 'stripe_test'", "v_before->>'source' = 'stripe_test'");
      assert.notEqual(drift, source, 'fixture changes exactly the expected prerequisite shape');
      await db.exec(drift);
      try { await assert.rejects(db.exec(sql(migration)), /SEASON_MODE_LEGACY_SOURCE_DRIFT/); }
      finally { await db.exec('rollback'); }
      assert.equal((await db.query("select to_regnamespace('touchline_payments_private') name")).rows[0].name, null);
      assert.deepEqual((await db.query('select to_jsonb(o) row from public.touchline_club_season_test_orders o order by id')).rows, oldRows);
      assert.deepEqual((await db.query('select to_jsonb(e) row from public.touchline_club_season_test_events e order by event_id')).rows, oldEvents);
      await db.exec(source); await db.exec('set role service_role');
    });
    await db.exec('reset role');
    await db.exec(sql(migration));
    await db.exec('set role service_role');

    await t.test('forward context backfill preserves old receipts and all financial fields byte for byte', async () => {
      const rows = (await db.query(`select to_jsonb(o)-array['payment_mode','payment_profile_id','catalogue_version','product_id','price_id','return_origin'] row from public.touchline_club_season_test_orders o order by id`)).rows;
      const events = (await db.query(`select to_jsonb(e)-array['payment_mode','provider_account','payment_profile_id','catalogue_version'] row from public.touchline_club_season_test_events e order by event_id`)).rows;
      assert.deepEqual(rows, oldRows); assert.deepEqual(events, oldEvents);
      assert.deepEqual((await db.query('select to_jsonb(e) row from public.touchline_fantasy_entitlements e where user_id=$1', [id(1)])).rows, oldEntitlement);
      historical = (await db.query<{ o: Order }>('select to_jsonb(o) o from public.touchline_club_season_test_orders o where id=$1', [historical.id])).rows[0].o;
      assert.equal(historical.payment_mode, 'test'); assert.equal(historical.payment_profile_id, testProfile);
      assert.deepEqual((await fulfillTest(historical, 'evt_historical')).rows[0].r, { ...oldReceipt, replay: true });
      assert.deepEqual((await db.query(`select oid,proowner,proacl,proconfig,prosecdef from pg_proc where oid=any($1::regprocedure[]) order by oid`, [[
        'public.checkout_touchline_market_cart(uuid,uuid[],text)', 'public.touchline_hire_coach_contract(uuid,text,uuid,text,integer,uuid)',
        'public.touchline_fantasy_grant_guest_access(uuid,text,text,text,uuid,text)', 'public.touchline_club_prepare_season_test_order(uuid,text)',
      ]])).rows, attrs);
    });
    await t.test('default QA denies absent/inactive LIVE and cannot be reconfigured by service', async () => {
      const before = await snapshot();
      await assert.rejects(prepare(2, 'standard'), /SEASON_PROFILE_UNAVAILABLE/);
      await assert.rejects(db.exec(`update touchline_payments_private.configuration set live_enabled=true`), { code: '42501' });
      await assert.rejects(db.exec(`update touchline_payments_private.profiles set create_enabled=false`), { code: '42501' });
      assert.deepEqual(await snapshot(), before);
      const config = (await db.query('select * from touchline_payments_private.configuration')).rows[0];
      assert.equal(config.allowed_mode, 'test'); assert.equal(config.live_enabled, false);
      assert.equal((await db.query(`select count(*)::int n from touchline_payments_private.profiles where payment_mode='live'`)).rows[0].n, 0);
    });
    await t.test('TEST wrapper remains operational, fixed upgrade price and immutable retry', async () => {
      await fixtureCollection(1);
      const next = await prepareTest(1, 'master');
      assert.equal(next.amount_minor, 4000); assert.equal(next.previous_paid_plan, 'standard');
      const repeated = await Promise.all([prepareTest(1, 'master'), prepareTest(1, 'master')]);
      assert.ok(repeated.every(o => o.id === next.id), 'single local connection queues the genuine commands');
      await assert.rejects(prepareTest(1, 'vip'), /SEASON_ORDER_IN_PROGRESS/);
      const before = await collection(1); await fulfillTest(next, 'evt_test_upgrade'); const after = await collection(1);
      assert.equal(after.balanceEur, 1250000000); assert.equal(after.revision, 4);
      for (const key of ['coach', 'players', 'receipts', 'formationCode']) assert.deepEqual(after[key], before[key]);
      await assert.rejects(db.query('update public.touchline_club_season_test_orders set return_origin=$2 where id=$1', [next.id, 'https://attacker.invalid']), /SEASON_ORDER_SNAPSHOT_IMMUTABLE/);
      await assert.rejects(db.query('update public.touchline_club_season_test_orders set fulfillment_receipt=$2 where id=$1', [next.id, {}]), /SEASON_ORDER_SNAPSHOT_IMMUTABLE/);
    });
    await t.test('provisioned synthetic LIVE profile still cannot bypass QA policy', async () => {
      const insertProfile = `insert into touchline_payments_private.profiles values(
        $1,'live',$2,$3,$4,
        'prod_SyntheticStandard','price_SyntheticStandard','prod_SyntheticMaster','price_SyntheticMaster','prod_SyntheticVip','price_SyntheticVip',true,true)`;
      for (const origin of ['https://localhost', 'https://127.0.0.1', 'https://127.1', 'https://0x7f.1',
        'https://0177.0.0.1', 'https://[::1]', 'https://a..example.invalid', 'https://user@example.invalid',
        'https://example.invalid:444', 'https://example.invalid/path', 'https://under_score.example.invalid',
        'http://example.invalid', 'https://example.invalid/', 'https://example.invalid?query', 'https://example.invalid#fragment']) {
        await assert.rejects(asOwner(insertProfile, [liveProfile, liveAccount, liveVersion, origin]), { code: '23514' });
      }
      assert.equal((await db.query(`select count(*)::int n from touchline_payments_private.profiles where payment_mode='live'`)).rows[0].n, 0);
      await asOwner(insertProfile, [liveProfile, liveAccount, liveVersion, 'https://synthetic.example.invalid']);
      const before = await snapshot(); await assert.rejects(prepare(2, 'standard'), /SEASON_PROFILE_UNAVAILABLE/); assert.deepEqual(await snapshot(), before);
      await assert.rejects(asOwner(`update touchline_payments_private.configuration set allowed_mode='live',live_enabled=true`), { code: '23514' });
      await assert.rejects(asOwner(`update touchline_payments_private.profiles set provider_account='acct_Replacement' where id=$1`, [liveProfile]), /SEASON_PROFILE_IMMUTABLE/);
      await assert.rejects(asOwner('update touchline_payments_private.profiles set reconcile_enabled=false where id=$1', [liveProfile]), { code: '23514' });
    });
    const pendingTest = await prepareTest(5, 'standard');
    await t.test('only explicit synthetic Production configuration admits LIVE; TEST never funds it', async () => {
      await asOwner(`update touchline_payments_private.configuration set deployment_target='production',project_ref='abcdefghijklmnopqrst',allowed_mode='live',live_enabled=true`);
      const before = await snapshot(); await assert.rejects(prepare(1, 'vip'), /SEASON_PAYMENT_CONTEXT_REQUIRES_REVIEW/); assert.deepEqual(await snapshot(), before);
      await assert.rejects(prepareTest(2, 'standard'), /SEASON_PROFILE_UNAVAILABLE/);
      await assert.rejects(prepare(5, 'standard'), /SEASON_ORDER_CONTEXT_MISMATCH/);
      assert.equal((await db.query('select state from public.touchline_club_season_test_orders where id=$1', [pendingTest.id])).rows[0].state, 'pending', 'mode changes never discard an uncertain request');
      const quote = (await db.query<{ r: Record<string, unknown> }>('select public.touchline_club_quote_season_plans($1,$2) r', [id(2), liveProfile])).rows[0].r;
      assert.deepEqual(quote, { standard: { amountMinor: 4990 }, master: { amountMinor: 8990 }, vip: { amountMinor: 16990 } });
    });
    await t.test('generic preparation retains the exclusive non-key-changing owner mutex', async () => {
      await db.exec('begin');
      try {
        await prepare(7, 'standard'); await db.exec('reset role');
        const flags = (await db.query<{ raw_flags: string[] }>(`select (heap_tuple_infomask_flags(h.t_infomask,h.t_infomask2)).*
          from public.users u cross join lateral heap_page_items(get_raw_page('public.users',
            split_part(trim(both '()' from u.ctid::text),',',1)::bigint)) h
          where u.id=$1 and h.lp=split_part(trim(both '()' from u.ctid::text),',',2)::int`, [id(7)])).rows[0].raw_flags;
        assert.ok(flags.includes('HEAP_XMAX_EXCL_LOCK'));
        assert.ok(!flags.includes('HEAP_KEYS_UPDATED'), 'collection FK KEY SHARE must remain compatible');
      } finally { await db.exec('rollback'); await db.exec('set role service_role'); }
    });
    let standard: Order, master: Order;
    await t.test('LIVE attach and fulfillment reject each wrong context and metadata without writes', async () => {
      standard = await prepare(2, 'standard'); const before = await snapshot();
      for (const wrong of [['test', liveAccount, liveProfile, liveVersion], ['live', 'acct_Other', liveProfile, liveVersion],
        ['live', liveAccount, testProfile, liveVersion], ['live', liveAccount, liveProfile, 'different-version']]) {
        await assert.rejects(attach(standard, wrong), /SEASON_(ORDER_CONTEXT_MISMATCH|PROFILE_UNAVAILABLE)/);
      }
      const e = evidence(standard);
      for (const patch of [{ accountId: 'acct_Other' }, { livemode: false }, { profileId: testProfile }, { catalogueVersion: 'other' },
        { amount_total: 1 }, { currency: 'gbp' }, { client_reference_id: id(3) }, { lines: { has_more: false, data: [] } },
        ...[{ product: 'prod_Wrong' }, { id: 'price_Wrong' }, { unit_amount: 1 }, { livemode: false }, { recurring: { interval: 'month' } }].map(patch => ({ lines: { has_more: false, data: [{ quantity: 1, price: { ...e.lines.data[0].price, ...patch } }] } })),
        ...['touchlinePaymentMode', 'touchlinePaymentProfileId', 'touchlinePaymentAccountId', 'touchlineCatalogueVersion'].map(key => ({ metadata: { ...e.metadata, [key]: 'wrong' } }))]) {
        await assert.rejects(fulfill(standard, 'evt_invalid', { ...e, ...patch } as typeof e), /SEASON_(ORDER_CONTEXT_MISMATCH|PROFILE_UNAVAILABLE|PAYMENT_UNCONFIRMED)/);
      }
      assert.deepEqual(await snapshot(), before);
      await attach(standard); await fulfill(standard, 'evt_live_first');
      assert.equal((await db.query('select source from public.touchline_fantasy_entitlements where user_id=$1', [id(2)])).rows[0].source, 'stripe_live');
    });
    await t.test('paid duplicate validates context before its shortcut and grants no second allocation', async () => {
      const before = await snapshot(); const e = evidence(standard);
      for (const patch of [{ accountId: 'acct_Other' }, { livemode: false }, { profileId: testProfile }, { catalogueVersion: 'other' }]) {
        await assert.rejects(fulfill(standard, 'evt_live_first', { ...e, ...patch }), /SEASON_(ORDER_CONTEXT_MISMATCH|PROFILE_UNAVAILABLE)/);
      }
      assert.deepEqual(await snapshot(), before);
      assert.equal((await fulfill(standard, 'evt_live_first')).rows[0].r.replay, true);
      assert.equal((await fulfill(standard, 'evt_live_repeat')).rows[0].r.replay, true);
      assert.equal((await db.query('select count(*)::int n from public.touchline_club_collections where user_id=$1', [id(2)])).rows[0].n, 0, 'payment does not fabricate collection/contracts');
    });
    await t.test('existing event identity cannot be claimed by another paid order', async () => {
      const other = await prepare(6, 'standard'); const before = await snapshot();
      await assert.rejects(fulfill(other, 'evt_live_first'), /SEASON_EVENT_CONFLICT/);
      assert.deepEqual(await snapshot(), before);
      await expire(other, 'evt_other_expired');
    });
    await t.test('create gate OFF still settles and expires previously accepted obligations', async () => {
      await fixtureCollection(2); master = await prepare(2, 'master'); const expiring = await prepare(3, 'standard');
      assert.equal(master.amount_minor, 4000);
      await asOwner('update touchline_payments_private.profiles set create_enabled=false where id=$1', [liveProfile]);
      await assert.rejects(prepare(4, 'standard'), /SEASON_PROFILE_UNAVAILABLE/);
      await attach(master); await fulfill(master, 'evt_live_upgrade'); await expire(expiring, 'evt_live_expired');
      assert.equal((await collection(2)).balanceEur, 1250000000);
      assert.equal((await db.query('select state from public.touchline_club_season_test_orders where id=$1', [expiring.id])).rows[0].state, 'expired');
      await asOwner('update touchline_payments_private.profiles set create_enabled=true where id=$1', [liveProfile]);
    });
    await t.test('risk, expired, and late-paid replay reject mode/account/profile before terminal shortcuts', async () => {
      const before = await snapshot();
      for (const wrong of [['test', liveAccount, liveProfile, liveVersion], ['live', 'acct_Other', liveProfile, liveVersion],
        ['live', liveAccount, testProfile, liveVersion], ['live', liveAccount, liveProfile, 'other']]) {
        await assert.rejects(review(master, 'evt_invalid_risk', 'charge.refunded', wrong), /SEASON_(ORDER_CONTEXT_MISMATCH|PROFILE_UNAVAILABLE)/);
        await assert.rejects(review(master, 'evt_invalid_late', 'season.payment_late', wrong), /SEASON_(ORDER_CONTEXT_MISMATCH|PROFILE_UNAVAILABLE)/);
        await assert.rejects(expire(master, 'evt_invalid_expiry', wrong), /SEASON_(ORDER_CONTEXT_MISMATCH|PROFILE_UNAVAILABLE)/);
      }
      assert.deepEqual(await snapshot(), before);
      assert.equal((await review(master, 'evt_late_paid', 'season.payment_late')).rows[0].r.replay, true);
      await expire(master, 'evt_stale_expiry');
      assert.equal((await db.query('select state from public.touchline_club_season_test_orders where id=$1', [master.id])).rows[0].state, 'paid');
    });
    await t.test('failure after wallet update rolls back entitlement, order, event and wallet together', async () => {
      const vip = await prepare(2, 'vip'); assert.equal(vip.amount_minor, 8000);
      await asOwner(`create function public.synthetic_fail_vip() returns trigger language plpgsql as $$begin if new.plan_key='vip' then raise exception 'SYNTHETIC_FAILURE'; end if; return new;end$$;
        create trigger synthetic_fail_vip before update on public.touchline_fantasy_entitlements for each row execute function public.synthetic_fail_vip();`);
      const before = await snapshot(); await assert.rejects(fulfill(vip, 'evt_atomic_failure'), /SYNTHETIC_FAILURE/); assert.deepEqual(await snapshot(), before);
      await asOwner('drop trigger synthetic_fail_vip on public.touchline_fantasy_entitlements; drop function public.synthetic_fail_vip()');
      await expire(vip, 'evt_vip_expired');
    });
    await t.test('full seasonal EUR prices and direct Standard-to-VIP upgrade use the same actual fulfillment', async () => {
      for (const [user, plan, amount] of [[10, 'master', 8990], [11, 'vip', 16990]] as const) {
        const order = await prepare(user, plan); assert.equal(order.amount_minor, amount);
        const result = (await fulfill(order, `evt_full_${plan}`)).rows[0].r;
        assert.equal(result.amountMinor, amount); assert.equal(result.creditsAdded, 0);
      }
      const initial = await prepare(12, 'standard'); await fulfill(initial, 'evt_direct_initial');
      const upgrade = await prepare(12, 'vip'); assert.equal(upgrade.amount_minor, 12000);
      await fulfill(upgrade, 'evt_direct_vip');
    });
    await t.test('different Live account never inherits paid upgrade credit or replaces current access', async () => {
      await asOwner(`insert into touchline_payments_private.profiles values(
        'synthetic-live-other','live','acct_SyntheticLiveB','synthetic-live-other','https://synthetic.example.invalid',
        'prod_OtherStandard','price_OtherStandard','prod_OtherMaster','price_OtherMaster','prod_OtherVip','price_OtherVip',true,true)`);
      const before = await snapshot();
      await assert.rejects(prepare(2, 'vip', 'synthetic-live-other'), /SEASON_PAYMENT_CONTEXT_REQUIRES_REVIEW/);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('refund ancestor suspends only its exact lineage and leaves assets/balance intact', async () => {
      const before = await collection(2); await review(standard, 'evt_ancestor_refund');
      assert.equal((await db.query('select status from public.touchline_fantasy_entitlements where user_id=$1', [id(2)])).rows[0].status, 'past_due');
      assert.deepEqual(await collection(2), before);
      assert.equal((await review(standard, 'evt_ancestor_refund')).rows[0].r.replay, true);
      await assert.rejects(prepare(2, 'vip'), /SEASON_PAYMENT_REQUIRES_REVIEW/);
      const protectedBefore = await snapshot();
      await assert.rejects(review(standard, 'evt_ancestor_refund', 'charge.refunded', ['live', 'acct_Other', liveProfile, liveVersion]), /SEASON_ORDER_CONTEXT_MISMATCH/);
      assert.deepEqual(await snapshot(), protectedBefore);
    });
    await t.test('wrong-account current lineage is not suspended by a genuine historical risk', async () => {
      await asOwner(`update public.touchline_fantasy_entitlements set status='active',metadata=metadata||'{"seasonPaymentAccountId":"acct_DifferentCurrent"}' where user_id=$1`, [id(2)]);
      await review(master, 'evt_old_account_dispute', 'charge.dispute.created');
      assert.equal((await db.query('select status from public.touchline_fantasy_entitlements where user_id=$1', [id(2)])).rows[0].status, 'active');
    });
    await t.test('legacy monthly, guest and VIP grants cannot replace LIVE with null provider subscription refs', async () => {
      const live = await prepare(4, 'standard'); await fulfill(live, 'evt_live_guest_protection');
      const before = (await db.query('select to_jsonb(e) row from public.touchline_fantasy_entitlements e where user_id=$1', [id(4)])).rows;
      const legacy = await db.query<{ r: { seasonalPlanPreserved: boolean } }>(`select public.touchline_fantasy_apply_test_subscription_event(
        'evt_old_monthly',clock_timestamp(),'customer.subscription.deleted',false,$1,'cus_synthetic','sub_synthetic','canceled',now(),now()+interval '1 day') r`, [id(4)]);
      assert.equal(legacy.rows[0].r.seasonalPlanPreserved, true);
      for (const plan of ['standard', 'master', 'vip']) await assert.rejects(db.query(`select public.touchline_fantasy_grant_guest_access($1,'synthetic-owner@example.invalid','synthetic-4@example.invalid','Synthetic protection test',$2,$3)`, [actor, id(300 + plan.length), plan]), /VIP_PAID_SUBSCRIPTION_CANCELLATION_REQUIRED/);
      await assert.rejects(db.query(`select public.touchline_fantasy_grant_vip_access($1,'synthetic-owner@example.invalid','synthetic-4@example.invalid','Synthetic protection test',$2)`, [actor, id(350)]), /VIP_PAID_SUBSCRIPTION_CANCELLATION_REQUIRED/);
      assert.deepEqual((await db.query('select to_jsonb(e) row from public.touchline_fantasy_entitlements e where user_id=$1', [id(4)])).rows, before);
    });
    await t.test('LIVE seasonal customer cannot enter either legacy ownership route before bootstrap', async () => {
      const before = await snapshot();
      await assert.rejects(db.query('select public.checkout_touchline_market_cart($1,$2::uuid[],$3)', [id(4), [id(201)], 'synthetic_new_buy']), /CLUB_COLLECTION_ROUTE_REQUIRED/);
      await assert.rejects(db.query('select public.touchline_hire_coach_contract($1,$2,$3,$4,null::integer,null::uuid)', [id(4), '307', club, 'synthetic_new_hire']), /CLUB_COLLECTION_ROUTE_REQUIRED/);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('exact committed legacy replay survives neutral lineage while fresh requests remain closed', async () => {
      // Deliberate historical fixture: a later seasonal entitlement exists while
      // already-committed old purchase/hire receipts must remain replayable.
      for (const user of [8, 9]) await asOwner(`update public.touchline_fantasy_entitlements set source='stripe_live',
        metadata=jsonb_build_object('seasonPaymentOrderId',$2::text,'seasonPaymentSeasonId',$3::text,
          'seasonPaymentMode','live','seasonPaymentAccountId',$4::text) where user_id=$1`, [id(user), id(600 + user), season, liveAccount]);
      const before = await snapshot();
      assert.equal((await buy(8, 'synthetic_legacy_buy')).rows[0].r.idempotentReplay, true);
      assert.equal((await hire(9, 'synthetic_legacy_hire')).rows[0].r.idempotentReplay, true);
      await assert.rejects(buy(8, 'synthetic_legacy_buy', id(202)), /TL_MARKET_IDEMPOTENCY_CONFLICT/);
      await assert.rejects(hire(9, 'synthetic_legacy_hire', '308'), /TL_COACH_HIRE_IDEMPOTENCY_CONFLICT/);
      await assert.rejects(buy(8, 'synthetic_fresh_buy'), /CLUB_COLLECTION_ROUTE_REQUIRED/);
      await assert.rejects(hire(9, 'synthetic_fresh_hire'), /CLUB_COLLECTION_ROUTE_REQUIRED/);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('server cannot rewrite profiles/receipts or erase orders; browsers cannot call either API', async () => {
      for (const statement of [
        'delete from public.touchline_club_season_test_orders', 'truncate public.touchline_club_season_test_orders cascade',
        "update public.touchline_club_season_test_events set receipt='{}'", 'delete from public.touchline_club_season_test_events',
        'truncate public.touchline_club_season_test_events', 'delete from touchline_payments_private.profiles',
        'truncate touchline_payments_private.profiles cascade',
      ]) await assert.rejects(db.exec(statement), { code: '42501' });
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`reset role;set role ${role}`);
        await assert.rejects(prepare(5, 'standard'), { code: '42501' });
        await assert.rejects(fulfill(master, 'evt_unauthorized'), { code: '42501' });
        await assert.rejects(prepareTest(5, 'standard'), { code: '42501' });
        await assert.rejects(db.exec('select * from touchline_payments_private.profiles'), { code: '42501' });
      }
      await db.exec('reset role;set role service_role');
    });
  } finally { await db.close(); }
});
