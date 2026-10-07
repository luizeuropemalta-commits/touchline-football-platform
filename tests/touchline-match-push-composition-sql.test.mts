import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import * as dispatch from '../lib/touchlineArena/match-push-dispatch.ts';
import * as freshness from '../lib/touchlineArena/match-push-source-freshness.ts';
import * as registration from '../lib/touchlineArena/push-device-contract.ts';
import * as fingerprint from '../lib/touchlineArena/push-subscription-fingerprint.ts';
import * as policy from '../lib/touchlineArena/match-push-delivery-policy.ts';
import * as notification from '../lib/touchlineArena/match-event-notification.ts';
import * as vapidConfig from '../lib/touchlineArena/match-push-vapid-config.ts';
import * as transport from '../lib/touchlineArena/match-push-transport.ts';
import { checksumTouchlineConfirmedEventRenderSource } from '../lib/touchlineArena/social-confirmed-event-render-source.ts';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const deviceId = '22222222-2222-4222-8222-222222222222';
const fixtureId = '33333333-3333-4333-8333-333333333333';
const ownerId = '44444444-4444-4444-8444-444444444444';
const installationId = '55555555-5555-4555-8555-555555555555';
const playerId = '66666666-6666-4666-8666-666666666666';
const revisionChecksum = 'sha256:' + 'd'.repeat(64);
const revisionManifest = { 'fixture-provider:8': 1 };
const sqlOrigin = 'https://composition.example.test';
const endpoint = 'https://fcm.googleapis.com/synthetic-composition-token';
// Supplied deterministic test material; no operational key generation or secrets.
const receiver = createECDH('prime256v1'); receiver.setPrivateKey(Buffer.alloc(32, 1));
const signing = createECDH('prime256v1'); signing.setPrivateKey(Buffer.alloc(32, 2));
const subscription = { endpoint, keys: {
  p256dh: receiver.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 3).toString('base64url'),
} };
const vapid = { subject: 'mailto:test@example.test', publicKey: signing.getPublicKey().toString('base64url'),
  privateKey: Buffer.alloc(32, 2).toString('base64url') };
const binding = fingerprint.touchlinePushSubscriptionFingerprint({ installationId, permission: 'granted', subscription });
const expectedPayload = { title: 'Arsenal - Chelsea', body: 'Goal · 23′ · 1 - 0 · Saka',
  tag: 'fixture:8:event:9', href: '/live?fixture=8&lang=en-GB', update: false, eventIcon: 'goal' };

function loadServerModule<T>(filename: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL('../lib/touchlineArena/' + filename, import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(javascript, { exports, Buffer, Date, Error, AbortController, setTimeout, clearTimeout,
    require: (name: string) => {
      assert.ok(name in dependencies, 'Unexpected module: ' + name);
      return dependencies[name];
    },
  });
  return exports as T;
}

// Local composition, NOT hosted PostgREST, provider delivery, or an editorial
// source integration. Editorial source/checkpoint are explicit doubles. All
// claimed-reader queries and attempt RPCs below execute SQL as service_role.
for (const scenario of ['accepted', 'accepted-second-locale', 'reservation-response-lost', 'opt-out-after-reserve', 'opt-out-in-after-reserve', 'provider-503'] as const) {
  test(`single-claim SQL/SDK/encrypted-transport composition: ${scenario}`, { skip: !modulePath }, async () => {
    const { PGlite } = await import(modulePath!);
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth;
        create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        create table public.users(id uuid primary key);
        insert into public.users values('${ownerId}');
        create function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
        create table public.notification_devices(id uuid primary key,user_id uuid,installation_id uuid,permission text,push_subscription jsonb);
        create table public.football_fixtures(id uuid primary key,provider text,provider_fixture_id text);
        ${readFileSync(new URL('../supabase/migrations/017_touchline_notification_preferences.sql', import.meta.url), 'utf8')}
        create table public.touchline_fixture_alert_subscriptions(user_id uuid,fixture_id uuid,created_at timestamptz not null default clock_timestamp(),primary key(user_id,fixture_id));
        grant usage on schema auth,public to authenticated;
        grant usage on schema public to service_role;
        grant select,update on public.notification_devices,public.notification_preferences to service_role;
        grant select on public.football_fixtures to service_role;
        grant select,insert,delete on public.touchline_fixture_alert_subscriptions to service_role;`);
      await db.query('insert into notification_devices values($1,$2,$3,$4,$5)', [deviceId, ownerId, installationId, 'granted', JSON.stringify(subscription)]);
      await db.query('insert into football_fixtures values($1,$2,$3)', [fixtureId, 'sportmonks', '8']);
      await db.query(`insert into notification_preferences(user_id,channels,settings,frequency,explicit_consent_at,quiet_hours) values($1,'{"push":true}','{"goalsAndEvents":true}','realtime',clock_timestamp()-interval '1 minute',$2)`,
        [ownerId, JSON.stringify({ enabled: false, start: '22:00', end: '07:00', timezone: 'UTC' })]);
      await db.query('insert into touchline_fixture_alert_subscriptions(user_id,fixture_id) values($1,$2)', [ownerId, fixtureId]);
      for (const filename of ['20260924222644_touchline_match_push_outbox.sql', '20260927005940_touchline_match_push_subscription_binding.sql',
        '20260927023959_touchline_match_push_delivery_kind.sql', '20260927042148_touchline_match_push_attempt_reservation.sql',
        '20261002003838_touchline_match_push_identity_ledger.sql', '20261002010527_touchline_match_push_enrollment.sql',
        '20261002183141_touchline_notification_game_locale.sql']) {
        await db.exec(`begin;${readFileSync(new URL('../supabase/migrations/' + filename, import.meta.url), 'utf8')}commit;`);
      }
      const chooseLocale = async (locale: string) => {
        await db.exec('set role authenticated');
        try {
          await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ownerId]);
          assert.equal((await db.query('select * from public.touchline_set_game_locale($1)', [locale])).rows[0].game_locale, locale);
        } finally { await db.exec('reset role; set role service_role'); }
      };
      await chooseLocale('en-GB');
      await db.exec('set role service_role;');
      assert.equal((await db.query('select current_user as role')).rows[0].role, 'service_role');
      // Real wall clock agrees with SQL and transport. This is not a fake-time,
      // lock-wait, hosted-schema, or PostgreSQL 17.6 concurrency proof.
      const started = Date.now();
      const sourceTime = new Date(started - 20_000).toISOString();
      const baseSource = { sourceProvenance: 'PERSISTED_VERIFIED_CONFIRMED_EVENT', fixtureId: '8', eventId: '9',
        home: { name: 'Arsenal' }, away: { name: 'Chelsea' }, score: { home: 1, away: 0 },
        event: { kind: 'goal', playerName: 'Saka', minute: 23, extraMinute: null },
        matchRating: 8.2, touchlinePoints: 8.2, sourceSnapshotAt: sourceTime, contentType: 'GOAL_CONFIRMED' };
      const sourceChecksum = checksumTouchlineConfirmedEventRenderSource(baseSource);
      const editorialSource = { ok: true, data: { ...baseSource, sourceChecksum, sourceRevisionManifest: revisionManifest, sourceRevisionChecksum: revisionChecksum },
        evidence: { canonicalFixtureId: fixtureId, canonicalPlayerId: playerId, fixtureProviderId: '8', eventProviderId: '9', playerProviderId: '3',
          eventSyncedAt: sourceTime, settlementSyncedAt: sourceTime, fixtureUpdatedAt: sourceTime, lastObservedAt: sourceTime, clockRevision: 1 } };
      // Explicit synthetic already-admitted epoch. Admission itself is covered
      // by runtime-enrollment SQL tests; this proves the actual downstream
      // reader/transport cannot resurrect an earlier epoch after opt-out/in.
      const checkpoint = { providerId: '77', fixtureId: '8', typeId: '1', started: 1000,
        countsFrom: 0, sortOrder: 1, minutes: 20, seconds: 0, ticking: true, hasTimer: true };
      await db.query(`insert into touchline_match_push_enrollments
        (device_id,fixture_id,generation,interest_created_at,consent_at,subscription,subscription_fingerprint,baseline,last_checkpoint,excluded_event_ids,needs_baseline)
        select $1,$2,1,s.created_at,p.explicit_consent_at,$3,$4,$5,$5,array[]::text[],false
        from touchline_fixture_alert_subscriptions s join notification_preferences p on p.user_id=s.user_id
        where s.user_id=$6 and s.fixture_id=$2`, [deviceId, fixtureId, JSON.stringify(subscription), binding, JSON.stringify(checkpoint), ownerId]);
      const queued = (await db.query(`insert into touchline_match_push_outbox
        (device_id,fixture_id,provider_event_id,source_checksum,source_snapshot_at,payload,expires_at,subscription_fingerprint,delivery_kind,enrollment_generation)
        values($1,$2,'9',$3,$4,$5,$6,$7,'initial',1) returning id`,
        [deviceId, fixtureId, sourceChecksum, sourceTime, JSON.stringify({ schemaVersion: 1, locale: 'en-GB' }), new Date(started + 90_000).toISOString(), binding])).rows[0].id;
      const claimed = (await db.query('select * from public.touchline_claim_match_push_batch(1)')).rows;
      assert.equal(claimed.length, 1);
      assert.equal(claimed[0].id, queued);
      const claim = { id: String(queued), leaseToken: String(claimed[0].lease_token),
        leaseUntil: new Date(claimed[0].lease_until).toISOString(), expiresAt: new Date(claimed[0].expires_at).toISOString() };
      const queryContracts: Record<string, { select: string; filters: Record<string, string>; sql: string; values: unknown[] }> = {
        touchline_match_push_outbox: {
          select: 'id,device_id,fixture_id,provider_event_id,source_checksum,subscription_fingerprint,enrollment_generation,delivery_kind,lease_until,expires_at',
          filters: { id: 'eq.' + claim.id, lease_token: 'eq.' + claim.leaseToken, state: 'eq.claimed' },
          sql: 'select id,device_id,fixture_id,provider_event_id,source_checksum,subscription_fingerprint,enrollment_generation,delivery_kind,lease_until,expires_at from public.touchline_match_push_outbox where id=$1 and lease_token=$2 and state=$3',
          values: [claim.id, claim.leaseToken, 'claimed'],
        },
        touchline_match_push_enrollments: {
          select: 'generation,needs_baseline,subscription_fingerprint',
          filters: { device_id: 'eq.' + deviceId, fixture_id: 'eq.' + fixtureId },
          sql: 'select generation,needs_baseline,subscription_fingerprint from public.touchline_match_push_enrollments where device_id=$1 and fixture_id=$2',
          values: [deviceId, fixtureId],
        },
        football_fixtures: { select: 'provider_fixture_id', filters: { id: 'eq.' + fixtureId, provider: 'eq.sportmonks' },
          sql: 'select provider_fixture_id from public.football_fixtures where id=$1 and provider=$2', values: [fixtureId, 'sportmonks'] },
        notification_devices: { select: 'user_id,installation_id,permission,push_subscription', filters: { id: 'eq.' + deviceId },
          sql: 'select user_id,installation_id,permission,push_subscription from public.notification_devices where id=$1', values: [deviceId] },
        notification_preferences: { select: 'channels,settings,frequency,explicit_consent_at,quiet_hours,game_locale', filters: { user_id: 'eq.' + ownerId },
          sql: 'select channels,settings,frequency,explicit_consent_at,quiet_hours,game_locale from public.notification_preferences where user_id=$1', values: [ownerId] },
        touchline_fixture_alert_subscriptions: { select: 'fixture_id', filters: { fixture_id: 'eq.' + fixtureId, user_id: 'eq.' + ownerId },
          sql: 'select fixture_id from public.touchline_fixture_alert_subscriptions where fixture_id=$1 and user_id=$2', values: [fixtureId, ownerId] },
      };
      const bridgeErrors: unknown[] = [];
      const queries: Array<{ table: string; parameters: Record<string, string> }> = [];
      const preferenceLocales: unknown[] = [];
      const rpcs: Array<{ name: string; args: Record<string, unknown>; result: unknown }> = [];
      const sourceCalls: unknown[] = [];
      const checkpointCalls: unknown[] = [];
      const pushRequests: Array<{ url: string; method: unknown; redirect: unknown; headers: Headers; body: Buffer; signal: AbortSignal | null | undefined }> = [];
      const transportInputs: Array<Parameters<typeof transport.sendMatchWebPush>[0]> = [];
      const admin = createClient(sqlOrigin, 'synthetic-test-key', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: async (input, init) => {
          let response: unknown;
          let loseReceipt = false;
          try {
            const url = new URL(String(input));
            assert.equal(url.origin, sqlOrigin);
            assert.ok(init?.signal instanceof AbortSignal);
            if (init?.method === 'GET') {
              const table = url.pathname.slice('/rest/v1/'.length);
              assert.equal(url.pathname, '/rest/v1/' + table);
              const contract = queryContracts[table];
              assert.ok(contract, 'Unexpected table: ' + table);
              const parameters = Object.fromEntries(url.searchParams);
              assert.equal([...url.searchParams].length, Object.keys(parameters).length, 'Duplicate query keys');
              queries.push({ table, parameters });
              assert.deepEqual(parameters, { select: contract.select, ...contract.filters });
              // SQL identifiers/projections are fixed above, never interpolated
              // from a URL. Only a whitelisted exact request reaches this SQL.
              const rows = (await db.query(contract.sql, contract.values)).rows;
              response = rows;
              if (table === 'notification_preferences') preferenceLocales.push(rows[0]?.game_locale);
            } else {
              assert.equal(init?.method, 'POST');
              assert.equal(url.search, '');
              const name = url.pathname.slice('/rest/v1/rpc/'.length);
              assert.equal(url.pathname, '/rest/v1/rpc/' + name);
              const args = JSON.parse(String(init?.body)) as Record<string, unknown>;
              let sql: string;
              let names: string[];
              if (name === 'touchline_reserve_match_push_attempt') {
                sql = 'select public.touchline_reserve_match_push_attempt($1,$2,$3) as ok';
                names = ['p_id', 'p_lease_token', 'p_attempt_id'];
              } else if (name === 'touchline_finish_match_push_attempt') {
                sql = 'select public.touchline_finish_match_push_attempt($1,$2,$3,$4) as ok';
                names = ['p_id', 'p_lease_token', 'p_attempt_id', 'p_state'];
              } else if (name === 'touchline_finish_match_push') {
                sql = 'select public.touchline_finish_match_push($1,$2,$3) as ok';
                names = ['p_id', 'p_lease_token', 'p_state'];
              } else throw new Error('Unexpected RPC: ' + name);
              assert.deepEqual(Object.keys(args).sort(), [...names].sort());
              response = (await db.query(sql, names.map(name => args[name]))).rows[0].ok;
              rpcs.push({ name, args, result: response });
              if (name === 'touchline_reserve_match_push_attempt' && response === true) {
                if (scenario === 'accepted-second-locale') await chooseLocale('pt-BR');
                if (scenario === 'opt-out-after-reserve') await db.query(`update public.notification_preferences set channels='{"push":false}' where user_id=$1`, [ownerId]);
                if (scenario === 'opt-out-in-after-reserve') {
                  const before = (await db.query('select to_jsonb(s) row from public.touchline_fixture_alert_subscriptions s where user_id=$1 and fixture_id=$2', [ownerId, fixtureId])).rows[0].row;
                  await db.query('delete from public.touchline_fixture_alert_subscriptions where user_id=$1 and fixture_id=$2', [ownerId, fixtureId]);
                  await db.query('insert into public.touchline_fixture_alert_subscriptions(user_id,fixture_id,created_at) values($1,$2,$3)', [ownerId, fixtureId, before.created_at]);
                  const after = (await db.query('select to_jsonb(s) row from public.touchline_fixture_alert_subscriptions s where user_id=$1 and fixture_id=$2', [ownerId, fixtureId])).rows[0].row;
                  assert.deepEqual(after, before, 'same subscription timestamp must not hide an opt-out/in epoch');
                }
                loseReceipt = scenario === 'reservation-response-lost';
              }
            }
          } catch (error) { bridgeErrors.push(error); throw error; }
          // Intentional loss occurs AFTER SQL commit, and is not a bridge error.
          if (loseReceipt) throw new Error('Synthetic post-commit reservation response loss');
          // JSON consistently normalizes PGlite timestamps for both claim reads.
          return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
        } },
      });
      const attempt = loadServerModule<typeof import('../lib/touchlineArena/match-push-attempt-server')>('match-push-attempt-server.ts', {
        'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => admin },
      });
      const reader = loadServerModule<typeof import('../lib/touchlineArena/match-push-claimed-source-server')>('match-push-claimed-source-server.ts', {
        'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => admin },
        './social-confirmed-event-draft-server': { readTouchlineConfirmedEventPushSource: async (...args: unknown[]) => { sourceCalls.push(args); return editorialSource; } },
        './social-source-revision-server': { readTouchlineSocialSourceRevisionCheckpoint: async (keys: string[]) => {
          checkpointCalls.push(Array.from(keys)); return { clockRevision: 1, checksum: revisionChecksum, manifest: revisionManifest };
        } },
        './match-push-source-freshness': freshness, './push-device-contract': registration,
        './push-subscription-fingerprint': fingerprint, './match-push-delivery-policy': policy, './match-event-notification': notification,
      });
      const syntheticPushFetch: typeof fetch = async (input, init) => {
        pushRequests.push({ url: String(input), method: init?.method, redirect: init?.redirect,
          headers: new Headers(init?.headers), body: Buffer.from(init?.body as Uint8Array), signal: init?.signal });
        return new Response(null, { status: scenario === 'provider-503' ? 503 : 201 });
      };
      const composer = loadServerModule<typeof import('../lib/touchlineArena/match-push-single-claim-server')>('match-push-single-claim-server.ts', {
        'server-only': {}, 'node:crypto': { randomUUID: (await import('node:crypto')).randomUUID },
        './match-push-dispatch': dispatch, './match-push-claimed-source-server': reader, './match-push-attempt-server': attempt,
        './match-push-source-freshness': freshness, './match-push-delivery-policy': policy, './match-push-vapid-config': vapidConfig,
        './match-push-transport': { isSupportedMatchPushEndpoint: transport.isSupportedMatchPushEndpoint,
          sendMatchWebPush: (input: Parameters<typeof transport.sendMatchWebPush>[0]) => {
            transportInputs.push(input); return transport.sendMatchWebPush(input, syntheticPushFetch);
          } },
      });
      const result = await composer.dispatchClaimedMatchPush(claim, { enabled: true, locale: 'en-GB',
        maximumAgeMs: { eventSyncedAt: 60_000, settlementSyncedAt: 70_000, fixtureUpdatedAt: 80_000, lastObservedAt: 90_000 }, vapid });
      // All contract assertions below are outside application catches. Bridge
      // failures cannot masquerade as the expected cancellation/uncertainty.
      assert.deepEqual(bridgeErrors, []);
      const lost = scenario === 'reservation-response-lost';
      const stopped = scenario === 'opt-out-after-reserve' || scenario === 'opt-out-in-after-reserve';
      const expectedState = scenario === 'accepted' || scenario === 'accepted-second-locale' ? 'provider_accepted' : stopped ? 'cancelled' : 'uncertain';
      assert.equal(result, lost ? 'reservation-unconfirmed' : expectedState);
      const reads = lost || stopped ? 1 : 2;
      assert.deepEqual(sourceCalls, Array.from({ length: reads }, () => ['8', '9']));
      assert.deepEqual(checkpointCalls, Array.from({ length: reads }, () => ['fixture-provider:8']));
      for (const [table, contract] of Object.entries(queryContracts)) {
        const observed = queries.filter(query => query.table === table);
        const epochRead = table === 'touchline_match_push_outbox' || table === 'touchline_match_push_enrollments';
        assert.equal(observed.length, reads * (epochRead ? 2 : 1) + (stopped && epochRead ? 1 : 0), table);
        for (const query of observed) assert.deepEqual(query.parameters, { select: contract.select, ...contract.filters });
      }
      assert.equal(queries.length, reads * 8 + (stopped ? 2 : 0));
      assert.deepEqual(preferenceLocales, scenario === 'accepted-second-locale' ? ['en-GB', 'pt-BR'] : Array(reads).fill('en-GB'));
      const epoch = (await db.query('select generation,needs_baseline from touchline_match_push_enrollments where device_id=$1 and fixture_id=$2', [deviceId, fixtureId])).rows[0];
      assert.equal(Number(epoch.generation), scenario === 'opt-out-in-after-reserve' ? 3 : stopped ? 2 : 1);
      assert.equal(epoch.needs_baseline, stopped);
      assert.equal(Number((await db.query('select enrollment_generation from touchline_match_push_outbox where id=$1', [claim.id])).rows[0].enrollment_generation), 1);
      assert.equal(rpcs.length, lost ? 1 : 2);
      assert.equal(rpcs[0].name, 'touchline_reserve_match_push_attempt');
      assert.equal(rpcs[0].result, true);
      const attemptId = rpcs[0].args.p_attempt_id;
      assert.match(String(attemptId), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.deepEqual(rpcs[0].args, { p_id: claim.id, p_lease_token: claim.leaseToken, p_attempt_id: attemptId });
      if (!lost) assert.deepEqual(rpcs[1], { name: 'touchline_finish_match_push_attempt', result: true,
        args: { p_id: claim.id, p_lease_token: claim.leaseToken, p_attempt_id: attemptId, p_state: expectedState } });
      const final = (await db.query('select state,attempt_id,attempt_started_at,lease_token,lease_until,completed_at from public.touchline_match_push_outbox where id=$1', [claim.id])).rows[0];
      assert.equal(final.state, lost ? 'claimed' : expectedState);
      assert.equal(final.attempt_id, attemptId);
      assert.ok(Number.isFinite(new Date(final.attempt_started_at).getTime()));
      assert.equal(final.lease_token, lost ? claim.leaseToken : null);
      if (lost) { assert.ok(final.lease_until); assert.equal(final.completed_at, null); }
      else { assert.equal(final.lease_until, null); assert.ok(final.completed_at); }
      const sends = lost || stopped ? 0 : 1;
      assert.equal(transportInputs.length, sends);
      assert.equal(pushRequests.length, sends);
      if (sends) {
        const input = transportInputs[0];
        const expectedCopy = scenario === 'accepted-second-locale'
          ? { ...expectedPayload, body: 'Gol · 23′ · 1 - 0 · Saka', href: '/live?fixture=8&lang=pt-BR' } : expectedPayload;
        assert.deepEqual(JSON.parse(input.payload), expectedCopy);
        if (scenario === 'accepted-second-locale') {
          assert.equal((await db.query('select game_locale from notification_preferences where user_id=$1', [ownerId])).rows[0].game_locale, 'pt-BR');
          assert.equal((await db.query('select payload from touchline_match_push_outbox where id=$1', [claim.id])).rows[0].payload.locale, 'en-GB', 'queued locale remains stale and non-authoritative');
        }
        assert.equal(input.expiresAt.getTime(), Math.min(Date.parse(claim.leaseUntil), Date.parse(claim.expiresAt), Date.parse(sourceTime) + 60_000));
        const request = pushRequests[0];
        assert.equal(request.url, endpoint); assert.equal(request.method, 'POST'); assert.equal(request.redirect, 'error');
        assert.equal(request.headers.get('content-encoding'), 'aes128gcm');
        assert.match(request.headers.get('authorization') ?? '', /^vapid /);
        assert.ok(Number(request.headers.get('ttl')) > 0 && Number(request.headers.get('ttl')) <= 40);
        assert.ok(request.body.length > 0);
        assert.equal(request.body.includes(Buffer.from(input.payload)), false);
        assert.equal(request.signal?.aborted, false);
        // Ciphertext absence of plaintext is limited evidence, not decryption,
        // proof of provider acceptance, or notification displayed on a device.
      }
    } finally { await db.close(); }
  });
}
