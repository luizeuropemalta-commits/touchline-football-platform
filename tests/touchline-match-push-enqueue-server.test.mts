import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createECDH } from 'node:crypto';
import { getEventListeners } from 'node:events';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import * as freshness from '../lib/touchlineArena/match-push-source-freshness.ts';
import * as fingerprint from '../lib/touchlineArena/push-subscription-fingerprint.ts';
import * as registrationContract from '../lib/touchlineArena/push-device-contract.ts';
import * as quiet from '../lib/touchlineArena/notification-quiet-hours.ts';
import * as notification from '../lib/touchlineArena/match-event-notification.ts';

const deviceId = '22222222-2222-4222-8222-222222222222';
const fixtureId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const installationId = '55555555-5555-4555-8555-555555555555';
const rowId = '66666666-6666-4666-8666-666666666666';
const hash = 'sha256:' + 'a'.repeat(64);
const now = new Date('2026-09-27T02:00:00Z');
const key = createECDH('prime256v1'); key.setPrivateKey(Buffer.alloc(32, 1));
const registration = { installationId, permission: 'granted', subscription: { endpoint: 'https://push.example.test/test', keys: { p256dh: key.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') } } };
const binding = fingerprint.touchlinePushSubscriptionFingerprint(registration);
const js = ts.transpileModule(readFileSync(new URL('../lib/touchlineArena/match-push-enqueue-server.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

test('server producer derives canonical enqueue arguments and never retries an uncertain write', async () => {
  for (const mode of ['timeout-checkpoint', 'preaborted', 'abort-device', 'timeout-rpc-reject', 'timeout-reader', 'timeout-rpc', 'timeout-rpc-receipt', 'sdk-success', 'sdk-lost', 'sdk-520', 'rpc-abort-lost', 'rpc-abort-receipt', 'revision-missing', 'revision-checksum', 'source-failed', 'source-throws', 'error-notification_devices', 'error-notification_preferences', 'error-touchline_fixture_alert_subscriptions', 'initial-oversize', 'valid', 'history-unknown', 'disabled', 'bad-device', 'bad-locale', 'wrong-source', 'stale', 'unconfigured', 'device-denied', 'push-off', 'opted-out', 'no-consent', 'quiet', 'revision-changed', 'aged-during-revision', 'aborted-during-revision', 'rpc-throws', 'rpc-error', 'rpc-invalid']) {
    const controller = new AbortController();
    if (mode === 'preaborted') controller.abort();
    let late = false;
    let reads = 0;
    let calls = 0;
    let fetchCalls = 0;
    const httpObservations: Array<{ url: string; method: unknown; signal: unknown; body: unknown; args: unknown }> = [];
    const rpcObservations: Array<{ name: string; args: unknown }> = [];
    const sourceObservations: Array<{ fixture: string; event: string }> = [];
    let sourceBoundaryFailure: unknown = null;
    let timerCallback: (() => void) | undefined;
    let cleared = false;
    let releaseReader: (() => void) | undefined;
    let querySignal: AbortSignal | undefined;
    let rejectRpc: ((error: Error) => void) | undefined;
    let timerCount = 0;
    const admin = {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; }, abortSignal: (signal: AbortSignal) => { querySignal = signal; return query; }, maybeSingle: async () => {
          reads++;
          if (mode === `error-${table}`) return { data: null, error: { message: 'synthetic unavailable query' } };
          if (table === 'notification_devices') {
            assert.deepEqual(filters, { id: deviceId });
            if (mode === 'abort-device') controller.abort();
            return { data: { user_id: userId, installation_id: installationId, permission: mode === 'device-denied' ? 'denied' : 'granted', push_subscription: registration.subscription }, error: null };
          }
          if (table === 'notification_preferences') {
            assert.deepEqual(filters, { user_id: userId });
            return { data: { channels: { push: mode !== 'push-off' }, settings: { goalsAndEvents: true }, frequency: 'realtime', explicit_consent_at: mode === 'no-consent' ? null : '2026-09-26T00:00:00Z', quiet_hours: { enabled: mode === 'quiet', start: '22:00', end: '07:00', timezone: 'UTC' } }, error: null };
          }
          assert.equal(table, 'touchline_fixture_alert_subscriptions');
          assert.deepEqual(filters, { fixture_id: fixtureId, user_id: userId });
          return { data: mode === 'opted-out' ? null : { fixture_id: fixtureId }, error: null };
        } }; return query;
      },
      rpc(name: string, args: unknown) {
        calls++;
        rpcObservations.push({ name, args });
        assert.equal(name, 'touchline_enqueue_match_push');
        assert.deepEqual(JSON.parse(JSON.stringify(args)), { p_device_id: deviceId, p_fixture_id: fixtureId, p_event_id: '9', p_checksum: hash, p_snapshot_at: now.toISOString(), p_payload: { schemaVersion: 1, locale: 'en-GB' }, p_expires_at: '2026-09-27T02:00:30.000Z', p_fingerprint: binding, p_history_complete: mode !== 'history-unknown' });
        if (mode.startsWith('sdk-')) {
          // Real installed SDK, synthetic fetch boundary only; no network or credentials.
          const client = createClient('https://qa.example.test', 'synthetic-test-key', {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { fetch: async (url, init) => {
              fetchCalls++;
              httpObservations.push({ url: String(url), method: init?.method, signal: init?.signal, body: init?.body, args });
              assert.equal(String(url), 'https://qa.example.test/rest/v1/rpc/touchline_enqueue_match_push');
              assert.equal(init?.method, 'POST');
              assert.equal(init?.signal, querySignal);
              assert.deepEqual(JSON.parse(String(init?.body)), JSON.parse(JSON.stringify(args)));
              if (mode === 'sdk-lost') throw new Error('synthetic lost HTTP response');
              return new Response(JSON.stringify(mode === 'sdk-520' ? { message: 'synthetic HTTP failure' } : rowId), {
                status: mode === 'sdk-520' ? 520 : 200, headers: { 'Content-Type': 'application/json' },
              });
            } },
          });
          return client.rpc(name, args as Record<string, unknown>);
        }
        return { abortSignal: async (signal: AbortSignal) => {
          assert.equal(signal, querySignal);
          if (mode === 'timeout-rpc-reject') return await new Promise<never>((_, reject) => { rejectRpc = reject; });
          if (mode === 'timeout-rpc') return await new Promise<never>(() => {});
          if (mode === 'timeout-rpc-receipt') return await new Promise<{ data: string; error: null }>(resolve => signal.addEventListener('abort', () => resolve({ data: rowId, error: null }), { once: true }));
          if (mode.startsWith('rpc-abort-')) controller.abort();
          if (mode === 'rpc-throws' || mode === 'rpc-abort-lost') throw new Error('synthetic lost response');
          return { data: mode === 'rpc-invalid' ? 'invalid' : rowId, error: mode === 'rpc-error' ? { message: 'synthetic failure' } : null };
        } };
      },
    };
    const deps: Record<string, unknown> = {
      'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => admin },
      './match-push-source-freshness': freshness, './push-subscription-fingerprint': fingerprint,
      './push-device-contract': registrationContract, './notification-quiet-hours': quiet,
      './match-event-notification': notification,
      './social-source-revision-server': { readTouchlineSocialSourceRevisionCheckpoint: async () => {
        if (mode === 'timeout-checkpoint') await new Promise<void>(resolve => { releaseReader = resolve; });
        if (mode === 'aged-during-revision') late = true;
        if (mode === 'aborted-during-revision') controller.abort();
        if (mode === 'revision-missing') return null;
        return { clockRevision: mode === 'revision-changed' ? 2 : 1, checksum: mode === 'revision-checksum' ? 'sha256:' + 'b'.repeat(64) : hash };
      } },
      './social-confirmed-event-draft-server': { readTouchlineConfirmedEventPushSource: async (fixture: string, event: string) => {
        sourceObservations.push({ fixture, event });
        assert.equal(fixture, '8'); assert.equal(event, '9');
        if (mode === 'timeout-reader') await new Promise<void>(resolve => { releaseReader = resolve; });
        if (mode === 'source-failed') return { ok: false, reason: 'synthetic unverified source' };
        if (mode === 'source-throws') throw new Error('synthetic unavailable source');
        if (mode === 'initial-oversize') {
          const base = { ok: true, data: { sourceProvenance: 'PERSISTED_VERIFIED_CONFIRMED_EVENT', fixtureId: '8', eventId: '9', home: { name: 'Arsenal' }, away: { name: 'Chelsea' }, score: { home: 1, away: 0 }, event: { kind: 'goal', playerName: 'Saka', minute: 23, extraMinute: null }, matchRating: 8.2, touchlinePoints: 8.2, sourceChecksum: hash, sourceSnapshotAt: now.toISOString(), contentType: 'GOAL_CONFIRMED', sourceRevisionManifest: { 'fixture-provider:8': 1 }, sourceRevisionChecksum: hash }, evidence: { canonicalFixtureId: fixtureId, fixtureProviderId: '8', eventProviderId: '9', eventSyncedAt: now.toISOString(), settlementSyncedAt: now.toISOString(), fixtureUpdatedAt: now.toISOString(), lastObservedAt: now.toISOString(), clockRevision: 1 } };
          const bytes = 3072 - Buffer.byteLength(JSON.stringify(notification.buildMatchEventNotification(base as never, 'en-GB', true)), 'utf8');
          base.data.event.playerName += 'é'.repeat(Math.floor(bytes / 2)) + 'x'.repeat(bytes % 2);
          try {
            assert.equal(Buffer.byteLength(JSON.stringify(notification.buildMatchEventNotification(base as never, 'en-GB', true)), 'utf8'), 3072);
            assert.equal(Buffer.byteLength(JSON.stringify(notification.buildMatchEventNotification(base as never, 'en-GB', false)), 'utf8'), 3073);
          } catch (error) { sourceBoundaryFailure = error; throw error; }
          return base;
        }
        return { ok: true, data: { sourceProvenance: 'PERSISTED_VERIFIED_CONFIRMED_EVENT', fixtureId: '8', eventId: '9', home: { name: 'Arsenal' }, away: { name: 'Chelsea' }, score: { home: 1, away: 0 }, event: { kind: 'goal', playerName: 'Saka', minute: 23, extraMinute: null }, matchRating: 8.2, touchlinePoints: 8.2, sourceChecksum: hash, sourceSnapshotAt: now.toISOString(), contentType: 'GOAL_CONFIRMED', sourceRevisionManifest: { 'fixture-provider:8': 1 }, sourceRevisionChecksum: hash }, evidence: { canonicalFixtureId: fixtureId, fixtureProviderId: mode === 'wrong-source' ? '7' : '8', eventProviderId: '9', eventSyncedAt: mode === 'stale' ? '2026-09-26T00:00:00Z' : now.toISOString(), settlementSyncedAt: '2026-09-27T01:59:30Z', fixtureUpdatedAt: now.toISOString(), lastObservedAt: now.toISOString(), clockRevision: 1 } };
      } },
    };
    const exports = {};
    vm.runInNewContext(js, { exports, Buffer, AbortController,
      setTimeout: (callback: () => void, ms: number) => { assert.equal(ms, 15000); timerCount++; timerCallback = callback; return 1; },
      clearTimeout: () => { cleared = true; },
      require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
    const producer = exports as Pick<typeof import('../lib/touchlineArena/match-push-enqueue-server'), 'enqueueVerifiedMatchPush'>;
    const pending = producer.enqueueVerifiedMatchPush({ deviceId: mode === 'bad-device' ? 'bad' : deviceId, fixtureProviderId: '8', eventProviderId: '9' }, { enabled: mode !== 'disabled', historyComplete: mode !== 'history-unknown', locale: (mode === 'bad-locale' ? 'en-US' : 'en-GB') as 'en-GB', maximumAgeMs: mode === 'unconfigured' ? null : Object.fromEntries(freshness.MATCH_PUSH_SOURCE_TIMES.map(key => [key, 60000])), expiresAt: '2026-09-27T02:05:00Z', now: () => late ? new Date('2026-09-27T02:01:01Z') : now, signal: controller.signal });
    if (mode.startsWith('timeout-')) {
      for (let tick = 0; tick < 30; tick++) await Promise.resolve();
      assert.ok(timerCallback, 'entry deadline installed');
      timerCallback();
    }
    const result = await pending;
    releaseReader?.();
    rejectRpc?.(new Error('synthetic late rejection after deadline'));
    for (let tick = 0; tick < 30; tick++) await Promise.resolve();
    if (timerCallback) assert.equal(cleared, true, mode);
    assert.equal(timerCount, ['disabled', 'preaborted'].includes(mode) ? 0 : 1, 'single deadline never renewed across awaits');
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0, 'parent listener removed');
    const attempted = mode.startsWith('sdk-') || ['timeout-rpc', 'timeout-rpc-receipt', 'timeout-rpc-reject', 'valid', 'history-unknown', 'rpc-throws', 'rpc-error', 'rpc-invalid', 'rpc-abort-lost', 'rpc-abort-receipt'].includes(mode);
    assert.equal(calls, attempted ? 1 : 0, mode);
    assert.equal(result.status, mode.startsWith('rpc-') || ['sdk-lost', 'sdk-520', 'timeout-rpc', 'timeout-rpc-receipt', 'timeout-rpc-reject'].includes(mode) ? 'unknown' : attempted ? 'stored-or-existing' : 'not-enqueued', mode);
    assert.equal(fetchCalls, mode.startsWith('sdk-') ? 1 : 0, mode);
    // Assert outside the producer's catch: a swallowed mock assertion must not
    // look like a legitimate fail-closed/unknown result.
    assert.equal(sourceBoundaryFailure, null);
    for (const observed of sourceObservations) assert.deepEqual(observed, { fixture: '8', event: '9' });
    for (const observed of rpcObservations) {
      assert.equal(observed.name, 'touchline_enqueue_match_push');
      assert.deepEqual(JSON.parse(JSON.stringify(observed.args)), { p_device_id: deviceId, p_fixture_id: fixtureId, p_event_id: '9', p_checksum: hash, p_snapshot_at: now.toISOString(), p_payload: { schemaVersion: 1, locale: 'en-GB' }, p_expires_at: '2026-09-27T02:00:30.000Z', p_fingerprint: binding, p_history_complete: mode !== 'history-unknown' });
    }
    for (const observed of httpObservations) {
      assert.equal(observed.url, 'https://qa.example.test/rest/v1/rpc/touchline_enqueue_match_push');
      assert.equal(observed.method, 'POST');
      assert.equal(observed.signal, querySignal);
      assert.deepEqual(JSON.parse(String(observed.body)), JSON.parse(JSON.stringify(observed.args)));
    }
    if (result.status === 'stored-or-existing') assert.equal(result.id, rowId);
    if (['disabled', 'preaborted', 'bad-device', 'bad-locale'].includes(mode)) { assert.equal(reads, 0); assert.equal(sourceObservations.length, 0); }
    if (mode === 'abort-device') assert.equal(reads, 1, 'abort prevents subsequent recipient reads');
  }
});
