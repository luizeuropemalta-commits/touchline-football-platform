import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createECDH } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as freshness from '../lib/touchlineArena/match-push-source-freshness.ts';
import * as fingerprint from '../lib/touchlineArena/push-subscription-fingerprint.ts';
import * as registration from '../lib/touchlineArena/push-device-contract.ts';
import * as quiet from '../lib/touchlineArena/notification-quiet-hours.ts';
import * as notification from '../lib/touchlineArena/match-event-notification.ts';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
test('real producer and SQL preserve unknown-history refusal, revision identity and bound expiry', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  const device = '22222222-2222-4222-8222-222222222222';
  const fixture = '33333333-3333-4333-8333-333333333333';
  const owner = '44444444-4444-4444-8444-444444444444';
  const installation = '55555555-5555-4555-8555-555555555555';
  const hash = 'sha256:' + 'a'.repeat(64);
  const key = createECDH('prime256v1'); key.setPrivateKey(Buffer.alloc(32, 1));
  const subscription = { endpoint: 'https://push.example.test/synthetic', keys: { p256dh: key.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') } };
  const binding = fingerprint.touchlinePushSubscriptionFingerprint({ installationId: installation, permission: 'granted', subscription });
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table notification_devices(id uuid primary key);
      create table football_fixtures(id uuid primary key);
      insert into notification_devices values('${device}'); insert into football_fixtures values('${fixture}');
      grant usage on schema public to service_role; grant select,update on notification_devices to service_role;`);
    for (const name of ['20260924222644_touchline_match_push_outbox.sql', '20260927005940_touchline_match_push_subscription_binding.sql', '20260927023959_touchline_match_push_delivery_kind.sql']) {
      await db.exec(`begin;${readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')}commit;`);
    }
    await db.exec('set role service_role;');
    const instant = new Date();
    const deadline = new Date(instant.getTime() + 60_000).toISOString();
    let calls = 0;
    const sqlErrors: string[] = [];
    const readQueries: Array<{ table: string; filters: Record<string, unknown> }> = [];
    const admin = {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        readQueries.push({ table, filters });
        const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; }, abortSignal: () => query, maybeSingle: async () => ({ error: null, data:
          table === 'notification_devices' ? { user_id: owner, installation_id: installation, permission: 'granted', push_subscription: subscription }
          : table === 'notification_preferences' ? { channels: { push: true }, settings: { goalsAndEvents: true }, frequency: 'realtime', explicit_consent_at: new Date(instant.getTime() - 1000).toISOString(), quiet_hours: { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC' } }
          : { fixture_id: fixture } }) }; return query;
      },
      rpc(name: string, args: Record<string, unknown>) {
        assert.equal(name, 'touchline_enqueue_match_push');
        calls++;
        return { abortSignal: async () => {
          try {
            const result = await db.query('select public.touchline_enqueue_match_push($1,$2,$3,$4,$5,$6,$7,$8,$9) as id',
              [args.p_device_id, args.p_fixture_id, args.p_event_id, args.p_checksum, args.p_snapshot_at, JSON.stringify(args.p_payload), args.p_expires_at, args.p_fingerprint, args.p_history_complete]);
            return { data: result.rows[0].id, error: null };
          } catch (error) { sqlErrors.push(String(error)); return { data: null, error: { message: 'synthetic SQL refusal' } }; }
        } };
      },
    };
    const source = { ok: true, data: { sourceProvenance: 'PERSISTED_VERIFIED_CONFIRMED_EVENT', fixtureId: '8', eventId: '9', home: { name: 'Arsenal' }, away: { name: 'Chelsea' }, score: { home: 1, away: 0 }, event: { kind: 'goal', playerName: 'Saka', minute: 23, extraMinute: null }, matchRating: 8.2, touchlinePoints: 5, sourceChecksum: hash, sourceSnapshotAt: instant.toISOString(), contentType: 'GOAL_CONFIRMED', sourceRevisionManifest: { 'fixture-provider:8': 1 }, sourceRevisionChecksum: hash }, evidence: { canonicalFixtureId: fixture, fixtureProviderId: '8', eventProviderId: '9', eventSyncedAt: instant.toISOString(), settlementSyncedAt: instant.toISOString(), fixtureUpdatedAt: instant.toISOString(), lastObservedAt: instant.toISOString(), clockRevision: 1 } };
    const deps: Record<string, unknown> = { 'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => admin }, './match-push-source-freshness': freshness, './push-subscription-fingerprint': fingerprint, './push-device-contract': registration, './notification-quiet-hours': quiet, './match-event-notification': notification,
      './social-confirmed-event-draft-server': { readTouchlineConfirmedEventPushSource: async () => source },
      './social-source-revision-server': { readTouchlineSocialSourceRevisionCheckpoint: async () => ({ clockRevision: 1, checksum: hash }) } };
    const exports = {};
    const js = ts.transpileModule(readFileSync(new URL('../lib/touchlineArena/match-push-enqueue-server.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(js, { exports, Buffer, AbortController, setTimeout, clearTimeout, require: (name: string) => { assert.ok(name in deps); return deps[name]; } });
    const producer = exports as Pick<typeof import('../lib/touchlineArena/match-push-enqueue-server'), 'enqueueVerifiedMatchPush'>;
    const invoke = () => producer.enqueueVerifiedMatchPush({ deviceId: device, fixtureProviderId: '8', eventProviderId: '9' }, { enabled: true, historyComplete: false, locale: 'en-GB', maximumAgeMs: Object.fromEntries(freshness.MATCH_PUSH_SOURCE_TIMES.map(key => [key, 60000])), expiresAt: new Date(instant.getTime() + 300000).toISOString(), now: () => instant, signal: new AbortController().signal });
    assert.equal((await invoke()).status, 'unknown');
    assert.match(sqlErrors[0], /PUSH_HISTORY_UNVERIFIED/);
    assert.equal((await db.query('select count(*)::int as n from touchline_match_push_outbox')).rows[0].n, 0);
    // Explicit synthetic legacy evidence, not fabricated production coverage.
    await db.query(`insert into touchline_match_push_outbox(device_id,fixture_id,provider_event_id,source_checksum,source_snapshot_at,payload,expires_at)
      values($1,$2,'9','sha256:'||repeat('b',64),now(),'{}',now()+interval '5 minutes')`, [device, fixture]);
    const first = await invoke();
    assert.equal(first.status, 'stored-or-existing');
    assert.ok('id' in first);
    const second = await invoke();
    assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)));
    const row = (await db.query('select device_id,fixture_id,delivery_kind,subscription_fingerprint,payload,expires_at from touchline_match_push_outbox where id=$1', [first.id])).rows[0];
    assert.equal(row.device_id, device); assert.equal(row.fixture_id, fixture);
    assert.equal(row.delivery_kind, 'revision'); assert.equal(row.subscription_fingerprint, binding);
    assert.deepEqual(row.payload, { schemaVersion: 1, locale: 'en-GB' });
    assert.equal(new Date(row.expires_at).toISOString(), deadline);
    assert.equal(calls, 3); assert.equal(sqlErrors.length, 1);
    assert.equal(readQueries.length, 9);
    for (let offset = 0; offset < readQueries.length; offset += 3) {
      assert.deepEqual(readQueries.slice(offset, offset + 3), [
        { table: 'notification_devices', filters: { id: device } },
        { table: 'notification_preferences', filters: { user_id: owner } },
        { table: 'touchline_fixture_alert_subscriptions', filters: { fixture_id: fixture, user_id: owner } },
      ]);
    }
    assert.equal((await db.query('select count(*)::int as n from touchline_match_push_outbox')).rows[0].n, 2);
  } finally { await db.close(); }
});
