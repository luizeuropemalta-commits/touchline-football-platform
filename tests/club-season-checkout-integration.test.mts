import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { beginClubSeasonCheckout } from '../lib/stripe/club-season-checkout-service.ts';
import { buildClubSeasonCheckoutRequest, type ClubSeasonCheckoutOrder } from '../lib/stripe/club-season-checkout-request.ts';
import { handleClubSeasonCheckoutStatus } from '../lib/stripe/club-season-checkout-status.ts';
import { processClubSeasonWebhook, type SeasonWebhookStore, type SeasonWebhookSubject } from '../lib/stripe/club-season-webhook-service.ts';
import { CLUB_SEASON_TEST_ACCOUNT, CLUB_SEASON_TEST_CATALOGUE, clubSeasonChargeMinor, type ClubSeasonPaymentEvidence } from '../lib/stripe/club-season-test-catalogue.ts';

// This is a local service-to-SQL integration, not Stripe, Supabase HTTP, browser,
// or multi-connection concurrency evidence. Existing table dependencies below
// are reduced fixtures; the order, attachment and fulfillment functions are the
// actual migrations, and mapping/checkout/webhook/status use production modules.
const owner = '11111111-1111-4111-8111-111111111111';
const otherOwner = '22222222-2222-4222-8222-222222222222';
const season = '33333333-3333-4333-8333-333333333333';

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table users(id uuid primary key);
    insert into users values('${owner}'),('${otherOwner}');
    create table football_seasons(id uuid primary key,starts_at date,ends_at date);
    insert into football_seasons values('${season}',current_date-30,current_date+90);
    create table touchline_fantasy_configs(season_id uuid,competition_key text,status text);
    insert into touchline_fantasy_configs values('${season}','england','active');
    create table touchline_fantasy_entitlements(
      user_id uuid,entitlement_key text,status text,source text,plan_key text,
      provider_customer_reference text,provider_subscription_reference text,
      current_period_start timestamptz,current_period_end timestamptz,
      last_provider_event_created_at timestamptz,metadata jsonb not null default '{}',
      updated_at timestamptz default now(),primary key(user_id,entitlement_key));
    create table touchline_club_collections(user_id uuid,season_id uuid,revision bigint,
      state jsonb,updated_at timestamptz default now(),primary key(user_id,season_id),
      check((state->>'revision')::bigint=revision),check((state->>'balanceEur')::numeric>=0));
    create table touchline_fantasy_subscription_events(provider_event_id text primary key,
      event_type text,livemode boolean,user_id uuid,provider_subscription_reference text,
      entitlement_status text,processed_at timestamptz default now());
    create table touchline_fantasy_audit_events(user_id uuid,event_type text,metadata jsonb);
    create table touchline_coach_contracts(id text primary key,user_id uuid,status text,value bigint);
    create table touchline_card_contracts(id text primary key,user_id uuid,season_id uuid,status text,value bigint);
    create table touchline_fantasy_gameweeks(id uuid,season_id uuid);
    create table touchline_fantasy_user_gameweeks(id uuid,user_id uuid,gameweek_id uuid);
    create table touchline_fantasy_user_gameweek_selections(user_gameweek_id uuid);
    grant select,update on users to service_role;
    grant select on football_seasons,touchline_fantasy_configs,touchline_coach_contracts,
      touchline_card_contracts,touchline_fantasy_gameweeks,touchline_fantasy_user_gameweeks,
      touchline_fantasy_user_gameweek_selections to service_role;
    grant select,insert,update on touchline_fantasy_entitlements,touchline_club_collections to service_role;
    insert into touchline_fantasy_entitlements(user_id,entitlement_key,status,source,plan_key)
      values('${owner}','fantasy_access','active','beta_free','beta');
    insert into touchline_card_contracts values('existing-player','${owner}','${season}','active',40000000);
    insert into touchline_coach_contracts values('existing-coach','${owner}','active',5000000);
    insert into touchline_club_collections values('${owner}','${season}',3,
      '{"seasonId":"${season}","revision":3,"plan":"beta","balanceEur":55000000,
      "coach":{"id":"existing-coach","valueEur":5000000},
      "players":[{"playerId":"existing-player","contractId":"existing-player"}],
      "receipts":[{"key":"previous-purchase"}],"formationCode":"4-3-3"}',now());
  `);
  for (const migration of [
    '20260825182600_touchline_fantasy_subscription_event_ordering.sql',
    '20261028220000_club_season_test_orders.sql',
    '20261029000100_club_season_test_fulfillment.sql',
  ]) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  await db.exec('set role service_role');
  return db;
}

function paidEvidence(order: ClubSeasonCheckoutOrder, sessionId: string): ClubSeasonPaymentEvidence {
  const product = CLUB_SEASON_TEST_CATALOGUE[order.plan];
  const amount = clubSeasonChargeMinor(order);
  return {
    accountId: CLUB_SEASON_TEST_ACCOUNT, id: sessionId, livemode: false,
    mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'eur',
    amount_total: amount, amount_subtotal: amount,
    total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 },
    client_reference_id: order.userId,
    metadata: { touchlineOrderId: order.id, touchlineSeasonId: order.seasonId, touchlinePlan: order.plan,
      ...(order.previousPaidPlan ? { touchlinePreviousPaidPlan: order.previousPaidPlan } : {}) },
    lines: { has_more: false, data: [{ quantity: 1, price: {
      id: order.previousPaidPlan ? 'price_InlineUpgrade' : product.priceId,
      product: product.productId, active: !order.previousPaidPlan, livemode: false,
      currency: 'eur', unit_amount: amount, recurring: null,
    } }] },
  };
}

if (!process.execArgv.includes('--conditions=react-server')) {
  test('season checkout integrates persisted orders, payment processing and committed return status', () => {
    // Honor the same server-only condition as the application without modifying
    // modules or loading any .env / external service credentials.
    const result = spawnSync(process.execPath, [
      '--conditions=react-server', '--experimental-strip-types', '--test', fileURLToPath(import.meta.url),
    ], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 60_000,
      env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' } });
    assert.equal(result.status, 0, result.stdout + result.stderr + String(result.error ?? ''));
  });
} else {
  test('local checkout → provider evidence → transaction → owner status', async t => {
    const { createClubSeasonOrderStore, mapClubSeasonStoredOrder } = await import('../lib/stripe/club-season-order-store.server.ts');
    const db = await createDatabase();
    try {
      const json = async (query: string, params: unknown[] = []) =>
        (await db.query<{ value: unknown }>(query, params)).rows[0]?.value;
      const readOrder = (id: string) => json('select to_jsonb(o) value from touchline_club_season_test_orders o where id=$1::uuid', [id]);
      // Only transport is substituted: each adapter RPC executes the real SQL.
      const transport = {
        async rpc(name: string, args: Record<string, unknown>) {
          try {
            if (name === 'touchline_club_prepare_season_test_order') return {
              data: await json('select to_jsonb(touchline_club_prepare_season_test_order($1::uuid,$2)) value', [args.p_user_id, args.p_plan]), error: null,
            };
            assert.equal(name, 'touchline_club_attach_season_test_session');
            return { data: await json('select to_jsonb(touchline_club_attach_season_test_session($1::uuid,$2::uuid,$3)) value',
              [args.p_user_id, args.p_order_id, args.p_session_id]), error: null };
          } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : String(error) } }; }
        },
      };
      const store = createClubSeasonOrderStore(transport as Parameters<typeof createClubSeasonOrderStore>[0]);
      const sessions = new Map<string, {
        order: ClubSeasonCheckoutOrder; request: ReturnType<typeof buildClubSeasonCheckoutRequest>;
        sessionId: string; url: string;
      }>();
      let loseFirstResponse = true;
      const dependencies = { store, async createCheckout(order: ClubSeasonCheckoutOrder) {
        const request = buildClubSeasonCheckoutRequest(order);
        let session = sessions.get(request.idempotencyKey);
        if (session) assert.deepEqual(request, session.request, 'retry must preserve exact provider request');
        else {
          const sessionId = `cs_test_${order.id.replaceAll('-', '')}`;
          session = { order, request, sessionId, url: `https://checkout.stripe.com/c/pay/${sessionId}` };
          sessions.set(request.idempotencyKey, session);
        }
        if (loseFirstResponse) { loseFirstResponse = false; throw new Error('SYNTHETIC_PROVIDER_RESPONSE_LOST'); }
        return { sessionId: session.sessionId, url: session.url };
      } };
      const webhookStore: SeasonWebhookStore = {
        async read(id) {
          const row = await readOrder(id);
          if (!row) return null;
          const order = mapClubSeasonStoredOrder(row);
          return { ...order, sessionId: order.sessionId ?? '' };
        },
        fulfill: (id, event, evidence) => json('select touchline_club_fulfill_season_test_order($1::uuid,$2,$3::jsonb) value', [id, event, JSON.stringify(evidence)]),
        review: (id, event, kind, sessionId) => json('select touchline_club_review_season_test_order($1::uuid,$2,$3,$4) value', [id, event, kind, sessionId]),
        expire: (id, event, sessionId) => json('select touchline_club_expire_season_test_order($1::uuid,$2,$3) value', [id, event, sessionId]),
      };
      const subject = (id: string): SeasonWebhookSubject => {
        const saved = sessions.get(`club-season-test:${id}`)!;
        return { orderId: id, sessionId: saved.sessionId, ownerId: owner, seasonId: season,
          plan: saved.order.plan, previousPaidPlan: saved.order.previousPaidPlan, kind: 'payment',
          evidence: paidEvidence(saved.order, saved.sessionId) };
      };
      const status = (sessionId: string, userId = owner) => handleClubSeasonCheckoutStatus(
        new Request(`https://qa.example.test/api/touchline-fantasy/season-checkout/status?session_id=${sessionId}`), {
          configured: () => true, authenticate: async () => userId,
          read: (user, sessionId) => json('select to_jsonb(o) value from touchline_club_season_test_orders o where user_id=$1::uuid and session_id=$2', [user, sessionId]),
        });
      const collection = async () => await json('select state value from touchline_club_collections where user_id=$1::uuid', [owner]) as Record<string, unknown>;
      const contracts = () => json(`select jsonb_build_object(
        'players',(select jsonb_agg(to_jsonb(c)) from touchline_card_contracts c),
        'coach',(select jsonb_agg(to_jsonb(c)) from touchline_coach_contracts c)) value`);
      const before = await collection();
      const beforeContracts = await contracts();
      let standard!: Awaited<ReturnType<typeof beginClubSeasonCheckout>>;
      let master!: Awaited<ReturnType<typeof beginClubSeasonCheckout>>;

      await t.test('lost provider response and checkout retry reuse one persisted order and session', async () => {
        const input = { ownerId: owner, plan: 'standard' as const, expectedAmountMinor: 4990 };
        await assert.rejects(beginClubSeasonCheckout(input, dependencies), /SYNTHETIC_PROVIDER_RESPONSE_LOST/);
        assert.equal(sessions.size, 1);
        assert.deepEqual(await collection(), before);
        const providerSession = [...sessions.values()][0];
        assert.equal((await status(providerSession.sessionId)).status, 404, 'session is not attached until successful response');
        standard = await beginClubSeasonCheckout(input, dependencies);
        assert.deepEqual(await beginClubSeasonCheckout(input, dependencies), standard);
        assert.equal(sessions.size, 1);
        assert.equal((await db.query('select count(*)::int n from touchline_club_season_test_orders')).rows[0].n, 1);
        assert.equal((await (await status(standard.sessionId)).json()).status, 'pending');
        assert.deepEqual(await collection(), before);
      });

      await t.test('Standard confirmation commits access, balance and status together; duplicate webhook is inert', async () => {
        await processClubSeasonWebhook('evt_Standard1', subject(standard.orderId), webhookStore);
        const after = await collection();
        assert.equal(after.balanceEur, 705000000); assert.equal(after.plan, 'standard'); assert.equal(after.revision, 4);
        for (const field of ['players', 'coach', 'receipts', 'formationCode']) assert.deepEqual(after[field], before[field]);
        assert.deepEqual(await contracts(), beforeContracts);
        const response = await status(standard.sessionId);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        assert.deepEqual(await response.json(), { ok: true, status: 'paid', plan: 'standard', seasonEndsAt: sessions.get(`club-season-test:${standard.orderId}`)!.order.seasonEndsAt });
        for (const event of ['evt_Standard1', 'evt_StandardRepeated']) {
          assert.deepEqual(await processClubSeasonWebhook(event, subject(standard.orderId), webhookStore), { received: true, duplicate: true });
        }
        assert.deepEqual(await collection(), after);
        assert.equal((await db.query('select count(*)::int n from touchline_club_season_test_events')).rows[0].n, 1);
      });

      await t.test('Master checkout derives EUR40 from actual paid Standard order and stays pending', async () => {
        master = await beginClubSeasonCheckout({ ownerId: owner, plan: 'master', expectedAmountMinor: 4000 }, dependencies);
        const saved = sessions.get(`club-season-test:${master.orderId}`)!;
        assert.equal(saved.order.previousPaidPlan, 'standard');
        assert.deepEqual(saved.request.params.line_items, [{ quantity: 1, price_data: {
          currency: 'eur', product: CLUB_SEASON_TEST_CATALOGUE.master.productId, unit_amount: 4000,
        } }]);
        assert.equal((await (await status(master.sessionId)).json()).status, 'pending');
        assert.equal((await collection()).plan, 'standard');
        assert.equal((await collection()).balanceEur, 705000000);
      });

      await t.test('failed fulfillment rolls back all financial state and status; same-event retry applies once', async () => {
        const beforeUpgrade = await collection();
        const beforeEntitlement = await json('select to_jsonb(e) value from touchline_fantasy_entitlements e where user_id=$1::uuid', [owner]);
        await db.exec(`reset role;
          create function fail_integrated_upgrade() returns trigger language plpgsql as $$begin
            if new.plan_key='master' then raise exception 'INJECTED_INTEGRATION_FAILURE'; end if;
            return new; end$$;
          create trigger fail_integrated_upgrade before update on touchline_fantasy_entitlements
            for each row execute function fail_integrated_upgrade(); set role service_role;`);
        await assert.rejects(processClubSeasonWebhook('evt_Master1', subject(master.orderId), webhookStore), /INJECTED_INTEGRATION_FAILURE/);
        assert.deepEqual(await collection(), beforeUpgrade);
        assert.deepEqual(await json('select to_jsonb(e) value from touchline_fantasy_entitlements e where user_id=$1::uuid', [owner]), beforeEntitlement);
        assert.deepEqual(await contracts(), beforeContracts);
        assert.equal((await (await status(master.sessionId)).json()).status, 'pending');
        assert.equal((await db.query("select count(*)::int n from touchline_club_season_test_events where event_id='evt_Master1'")).rows[0].n, 0);
        await db.exec('reset role; drop trigger fail_integrated_upgrade on touchline_fantasy_entitlements; set role service_role');
        await processClubSeasonWebhook('evt_Master1', subject(master.orderId), webhookStore);
        const upgraded = await collection();
        assert.equal(upgraded.balanceEur, 1455000000); assert.equal(upgraded.plan, 'master'); assert.equal(upgraded.revision, 5);
        assert.equal((await (await status(master.sessionId)).json()).status, 'paid');
        assert.deepEqual(await contracts(), beforeContracts);
        for (const field of ['players', 'coach', 'receipts', 'formationCode']) assert.deepEqual(upgraded[field], before[field]);
        await processClubSeasonWebhook('evt_Master1', subject(master.orderId), webhookStore);
        await processClubSeasonWebhook('evt_MasterRepeated', subject(master.orderId), webhookStore);
        assert.deepEqual(await collection(), upgraded);
        assert.equal((await db.query('select count(*)::int n from touchline_club_season_test_events')).rows[0].n, 2);
        assert.equal(sessions.size, 2);
      });

      await t.test('return status does not reveal another account order or accept success as proof', async () => {
        const foreign = await status(master.sessionId, otherOwner);
        assert.equal(foreign.status, 404);
        assert.deepEqual(await foreign.json(), { ok: false, error: 'SEASON_ORDER_NOT_FOUND' });
        const forged = await handleClubSeasonCheckoutStatus(new Request(
          `https://qa.example.test/api/touchline-fantasy/season-checkout/status?session_id=${master.sessionId}&status=paid`), {
          configured: () => true, authenticate: async () => owner, read: async () => assert.fail('forged request reached storage'),
        });
        assert.equal(forged.status, 400);
      });
    } finally { await db.close(); }
  });
}
