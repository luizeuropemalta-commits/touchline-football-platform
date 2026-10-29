/** Opt-in native PostgreSQL proof, never a remote database connection.
 * Usage: node --experimental-strip-types scripts/qa/verify-club-season-lock-concurrency.mjs /tmp/touchline-season-postgres
 * Runtime must contain pinned @embedded-postgres/darwin-arm64 and pg packages.
 * Installs nothing; starts/stops only its own mkdtemp cluster, with TCP disabled.
 * Dependency schemas/window projection are fixtures. Collection/season SQL and
 * the legacy checkout body/ownership patch are loaded from real migrations.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, appendFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { CLUB_SEASON_TEST_ACCOUNT, CLUB_SEASON_TEST_CATALOGUE } from '../../lib/stripe/club-season-test-catalogue.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = await realpath(process.argv[2] ?? '/tmp/touchline-season-postgres');
assert.ok(runtime.startsWith('/private/tmp/') || runtime.startsWith('/tmp/'), 'runtime must be in the temporary directory');
const requireRuntime = createRequire(join(runtime, 'package.json'));
const { Client } = requireRuntime('pg');
const bin = join(runtime, 'node_modules/@embedded-postgres/darwin-arm64/native/bin');
const cluster = await mkdtemp(join(tmpdir(), 'tl-season-pg-'));
const data = join(cluster, 'data');
const socket = join(cluster, 'socket');
await mkdir(socket, { mode: 0o700 });
const clients = [];
const report = { version: '', cluster, scope: 'isolated synthetic native PostgreSQL; TCP disabled', scenarios: [] };
let started = false;
const migration = name => readFile(join(root, 'supabase/migrations', name), 'utf8');
const season = '33333333-3333-4333-8333-333333333333';
const coach = JSON.stringify({ id: 'synthetic-coach', tier: 'ruby-red', valueEur: 5000000 });
const sub = user => `touchline-fantasy-subscription:${user}`;
const ownership = user => `touchline-club-ownership:${user}`;
const outcomes = promise => promise.then(value => ({ ok: true, value }), error => ({ ok: false, code: error.code, message: error.message }));

try {
  report.version = execFileSync(join(bin, 'postgres'), ['--version'], { encoding: 'utf8' }).trim();
  execFileSync(join(bin, 'initdb'), ['-D', data, '--username=postgres', '--auth-local=trust', '--auth-host=reject', '--encoding=UTF8', '--locale=C', '--no-instructions'], { stdio: 'pipe', timeout: 30_000 });
  await appendFile(join(data, 'postgresql.conf'), `
listen_addresses = ''
unix_socket_directories = '${socket}'
unix_socket_permissions = 0700
port = 55439
shared_buffers = '16MB'
max_connections = 8
deadlock_timeout = '100ms'
statement_timeout = '8s'
log_min_messages = warning
`);
  execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-l', join(cluster, 'postgres.log'), '-w', '-t', '20', 'start'], { stdio: 'pipe', timeout: 25_000 });
  started = true;
  for (let i = 0; i < 4; i++) {
    const client = new Client({ host: socket, port: 55439, database: 'postgres', user: 'postgres', ssl: false, connectionTimeoutMillis: 3000 });
    await client.connect(); clients.push(client);
  }
  const [db, initializer, seasonal, legacy] = clients;
  const pid = async client => (await client.query('select pg_backend_pid() pid')).rows[0].pid;
  const initializerPid = await pid(initializer), seasonalPid = await pid(seasonal), legacyPid = await pid(legacy);
  await db.query(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table users(id uuid primary key);
    create table football_seasons(id uuid primary key,starts_at date,ends_at date);
    insert into football_seasons values('${season}',current_date-30,current_date+90);
    create table touchline_fantasy_configs(season_id uuid,competition_key text,status text);
    insert into touchline_fantasy_configs values('${season}','england','active');
    create table touchline_fantasy_entitlements(user_id uuid references users(id),entitlement_key text,status text,source text,plan_key text,
      provider_customer_reference text,provider_subscription_reference text,current_period_start timestamptz,current_period_end timestamptz,
      last_provider_event_created_at timestamptz,metadata jsonb not null default '{}',updated_at timestamptz default now(),primary key(user_id,entitlement_key));
    create table touchline_fantasy_subscription_events(provider_event_id text primary key,event_type text,livemode boolean,user_id uuid,
      provider_subscription_reference text,entitlement_status text,processed_at timestamptz default now());
    create table touchline_fantasy_audit_events(user_id uuid,event_type text,metadata jsonb);
    create table touchline_coach_contracts(user_id uuid,status text);
    create table touchline_card_contracts(id uuid,user_id uuid,season_id uuid,status text,order_item_id uuid,contracted_at timestamptz);
    create table touchline_fantasy_gameweeks(id uuid,season_id uuid,state text,market_opens_at timestamptz,locks_at timestamptz);
    create table touchline_fantasy_user_gameweeks(id uuid,user_id uuid,gameweek_id uuid);
    create table touchline_fantasy_user_gameweek_selections(user_gameweek_id uuid);
    create table touchline_market_orders(id uuid,user_id uuid,idempotency_key text,card_ids uuid[],item_count int,total_tc int,
      balance_before_tc numeric,balance_after_tc numeric,price_table_versions text[]);
    create table touchline_market_order_items(id uuid,order_id uuid);
    create table touchline_card_inventory(id uuid);
    create function touchline_club_market_is_open(uuid) returns boolean language sql as $$select true$$;
    create function touchline_club_lock_open_round(uuid) returns void language sql as $$select$$;
    -- Unused coach endpoint exists only so the canonical ownership patch can
    -- install its initializer/checkout changes. It is never executed here.
    create function touchline_hire_coach_contract(p_user_id uuid,p_provider text,p_club uuid,p_key text)
    returns jsonb language plpgsql as $$begin
      insert into public.touchline_coach_contracts values(p_user_id,'active'); return '{}'::jsonb;
    end$$;
  `);
  await db.query(await migration('20261017104205_club_collection_atomic_acquisition.sql'));
  const oldCheckout = await migration('022_touchline_market_atomic_checkout.sql');
  const checkoutStart = oldCheckout.indexOf('create or replace function public.checkout_touchline_market_cart(');
  assert.ok(checkoutStart >= 0);
  await db.query(oldCheckout.slice(checkoutStart, oldCheckout.indexOf('$$;', checkoutStart) + 3));
  const window = await migration('20261017110218_club_market_five_minute_window.sql');
  const windowStart = window.indexOf('do $migration$', window.indexOf('-- Purchases/allocation'));
  assert.ok(windowStart >= 0);
  await db.query(window.slice(windowStart, window.indexOf('$migration$;', windowStart) + '$migration$;'.length));
  await db.query(await migration('20261017125838_club_collection_legacy_checkout_boundary.sql'));
  await db.query(await migration('20261020161513_club_collection_approved_plan_budgets.sql'));
  for (const name of ['20260825182600_touchline_fantasy_subscription_event_ordering.sql', '20261028220000_club_season_test_orders.sql', '20261029000100_club_season_test_fulfillment.sql']) await db.query(await migration(name));
  const fixedPrepare = (await db.query("select pg_get_functiondef('touchline_club_prepare_season_test_order(uuid,text)'::regprocedure) definition")).rows[0].definition;
  const earlySubscription = " perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||p_user_id::text,0));";
  assert.ok(fixedPrepare.includes(earlySubscription));

  async function mode(name) {
    let definition = fixedPrepare;
    if (name !== 'fixed') definition = definition.replace(earlySubscription, '');
    if (name === 'old-update') definition = definition.replace('for no key update;', 'for update;');
    await db.query(definition);
  }
  async function fixture(user) {
    await db.query('insert into users values($1)', [user]);
    await db.query("insert into touchline_fantasy_entitlements(user_id,entitlement_key,status,source,plan_key) values($1,'fantasy_access','active','owner_guest_grant','standard')", [user]);
  }
  async function waitBlocked(waiter, blocker) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const blockers = (await db.query('select pg_blocking_pids($1) ids', [waiter])).rows[0].ids;
      if (blockers.includes(blocker)) return;
      await delay(10);
    }
    throw new Error(`expected blocking edge ${waiter} -> ${blocker}`);
  }
  async function transactionResult(client, query, values) {
    try { const result = await client.query(query, values); await client.query('commit'); return result.rows; }
    catch (error) { await client.query('rollback'); throw error; }
  }
  async function twoWay(name, user, expectDeadlock) {
    await mode(name); await fixture(user);
    await initializer.query('begin');
    await initializer.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [sub(user)]);
    await seasonal.query('begin');
    const checkout = outcomes(transactionResult(seasonal, "select touchline_club_prepare_season_test_order($1,'master')", [user]));
    await waitBlocked(seasonalPid, initializerPid);
    const initialize = outcomes(transactionResult(initializer, "select touchline_club_initialize_collection($1,$2,'standard',$3::jsonb)", [user, season, coach]));
    const result = await Promise.all([initialize, checkout]);
    assert.equal(result.some(r => r.code === '40P01'), expectDeadlock, JSON.stringify(result));
    if (!expectDeadlock) assert.ok(result.every(r => r.ok), JSON.stringify(result));
    report.scenarios.push({ test: `two connections: ${name}`, deadlockExpected: expectDeadlock, outcomes: result.map(r => r.ok ? 'committed' : r.code) });
  }
  async function threeWay(name, user, expectDeadlock) {
    await mode(name); await fixture(user);
    await legacy.query('begin');
    await legacy.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [ownership(user)]);
    await initializer.query('begin');
    await initializer.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [sub(user)]);
    await seasonal.query('begin');
    const checkout = outcomes(transactionResult(seasonal, "select touchline_club_prepare_season_test_order($1,'master')", [user]));
    await waitBlocked(seasonalPid, initializerPid);
    // Real legacy function reaches its user-row lock before the deliberate
    // missing-card domain rejection; no legacy purchase is manufactured.
    const legacyCall = outcomes(transactionResult(legacy, "select checkout_touchline_market_cart($1,array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid],'synthetic-lock-test')", [user]));
    if (expectDeadlock) await waitBlocked(legacyPid, seasonalPid);
    const initialize = outcomes(transactionResult(initializer, "select touchline_club_initialize_collection($1,$2,'standard',$3::jsonb)", [user, season, coach]));
    const result = await Promise.all([initialize, checkout, legacyCall]);
    assert.equal(result.some(r => r.code === '40P01'), expectDeadlock, JSON.stringify(result));
    if (!expectDeadlock) {
      assert.ok(result[0].ok && result[1].ok, JSON.stringify(result));
      assert.equal(result[2].message, 'TL_MARKET_CARD_NOT_FOUND');
    }
    report.scenarios.push({ test: `three connections: ${name}`, deadlockExpected: expectDeadlock, outcomes: result.map(r => r.ok ? 'committed' : r.code) });
  }
  await twoWay('old-update', '11111111-1111-4111-8111-111111111111', true);
  await twoWay('row-lock-only', '22222222-2222-4222-8222-222222222222', false);
  await twoWay('fixed', '44444444-4444-4444-8444-444444444444', false);
  await threeWay('row-lock-only', '55555555-5555-4555-8555-555555555555', true);
  await threeWay('fixed', '66666666-6666-4666-8666-666666666666', false);
  await mode('fixed');

  const paidUser = '77777777-7777-4777-8777-777777777777';
  await db.query('insert into users values($1)', [paidUser]);
  const prepare = async plan => (await db.query('select to_jsonb(touchline_club_prepare_season_test_order($1,$2)) o', [paidUser, plan])).rows[0].o;
  function evidence(order) {
    const product = CLUB_SEASON_TEST_CATALOGUE[order.plan];
    return { accountId: CLUB_SEASON_TEST_ACCOUNT, id: `cs_test_${order.id.replaceAll('-', '')}`, livemode: false,
      mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'eur', amount_total: order.amount_minor, amount_subtotal: order.amount_minor,
      total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 }, client_reference_id: paidUser,
      metadata: { touchlineOrderId: order.id, touchlineSeasonId: season, touchlinePlan: order.plan,
        ...(order.previous_paid_plan ? { touchlinePreviousPaidPlan: order.previous_paid_plan } : {}) },
      lines: { has_more: false, data: [{ quantity: 1, price: { id: order.previous_paid_plan ? 'price_InlineUpgrade' : product.priceId,
        product: product.productId, active: !order.previous_paid_plan, livemode: false, currency: 'eur', unit_amount: order.amount_minor, recurring: null } }] } };
  }
  const standard = await prepare('standard');
  await db.query('select touchline_club_fulfill_season_test_order($1,$2,$3::jsonb)', [standard.id, 'evt_nativeStandard', JSON.stringify(evidence(standard))]);
  await db.query("select touchline_club_initialize_collection($1,$2,'standard',$3::jsonb)", [paidUser, season, coach]);
  const master = await prepare('master'); assert.equal(master.amount_minor, 4000);
  const results = await Promise.all([initializer, seasonal].map((client, i) => client.query(
    'select touchline_club_fulfill_season_test_order($1,$2,$3::jsonb) receipt', [master.id, `evt_nativeMaster${i}`, JSON.stringify(evidence(master))])));
  const receipts = results.map(r => r.rows[0].receipt);
  assert.equal(receipts.filter(r => r.replay).length, 1);
  const final = (await db.query('select revision,state from touchline_club_collections where user_id=$1', [paidUser])).rows[0];
  assert.equal(Number(final.revision), 1); assert.equal(final.state.balanceEur, 1495000000);
  assert.equal(final.state.plan, 'master'); assert.deepEqual(final.state.coach, JSON.parse(coach)); assert.deepEqual(final.state.players, []);
  report.scenarios.push({ test: 'two real concurrent Master fulfillments', amountMinor: master.amount_minor, replays: 1,
    revision: Number(final.revision), balanceTC: final.state.balanceEur });
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', '-t', '10', 'stop'], { stdio: 'pipe', timeout: 15_000 });
  report.serverStopped = started;
  await writeFile(join(cluster, 'proof.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
