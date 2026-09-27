import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as freshness from '../lib/touchlineArena/match-push-source-freshness.ts';
import { createECDH } from 'node:crypto';
import * as fingerprint from '../lib/touchlineArena/push-subscription-fingerprint.ts';
import * as registrationContract from '../lib/touchlineArena/push-device-contract.ts';
import * as deliveryPolicy from '../lib/touchlineArena/match-push-delivery-policy.ts';
import * as notification from '../lib/touchlineArena/match-event-notification.ts';

const id = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const fixtureId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const installationId = '55555555-5555-4555-8555-555555555555';
const leaseToken = '66666666-6666-4666-8666-666666666666';
const hash = 'sha256:' + 'a'.repeat(64);
const now = new Date('2026-09-27T02:00:00Z');
const key = createECDH('prime256v1'); key.setPrivateKey(Buffer.alloc(32, 1));
const registration = { installationId, permission: 'granted', subscription: { endpoint: 'https://push.example.test/test', keys: { p256dh: key.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') } } };
const binding = fingerprint.touchlinePushSubscriptionFingerprint(registration)!;
const claim = { id, leaseToken, leaseUntil: '2026-09-27T02:01:00Z', expiresAt: '2026-09-27T02:02:00Z' };
const js = ts.transpileModule(readFileSync(new URL('../lib/touchlineArena/match-push-claimed-source-server.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

test('claimed-source adapter binds private queue facts and refuses changed or late results', async () => {
  const payloadModes = ['valid-revision', 'kind-null', 'kind-unknown', 'kind-changed', 'valid-pt', 'invalid-locale', 'missing-locale', 'formatter-null', 'payload-exact', 'payload-oversize'];
  // Padding is computed against the independent public message expectation.
  const expectedEnglish = { title: 'GOAL — Arsenal 1 × 0 Chelsea', body: 'Saka · 23′ · TouchLine Points (match): +5', tag: 'fixture:8:event:9', href: '/live?fixture=8&lang=en-GB', update: false, eventIcon: 'goal' };
  const paddingBytes = 3072 - Buffer.byteLength(JSON.stringify(expectedEnglish), 'utf8');
  const boundaryName = 'Saka' + 'é'.repeat(Math.floor(paddingBytes / 2)) + 'x'.repeat(paddingBytes % 2);
  for (const mode of [...payloadModes, 'valid', 'missing-binding', 'wrong-fixture', 'changed-checksum', 'revoked', 'rotated-binding', 'aborted', 'unconfigured', 'expired', 'hat-trick', 'aged-during-final-read', 'revision-changed', 'revision-unavailable', 'revision-checksum-changed', 'aged-during-revision', 'aborted-during-revision', 'device-missing', 'device-changed', 'push-off', 'fixture-optout', 'no-consent', 'denied', 'malformed-registration', 'quiet-hours', 'expired-during-revision', 'error-notification_devices', 'error-notification_preferences', 'error-touchline_fixture_alert_subscriptions', 'error-football_fixtures', 'error-touchline_match_push_outbox', 'error-final-claim']) {
    const controller = new AbortController();
    let reads = 0;
    let late = false;
    const row = { id, device_id: deviceId, fixture_id: fixtureId, provider_event_id: '9', source_checksum: hash,
      delivery_kind: mode === 'kind-null' ? null : mode === 'kind-unknown' ? 'unknown' : mode === 'valid-revision' ? 'revision' : 'initial',
      subscription_fingerprint: mode === 'missing-binding' ? null : binding, lease_until: claim.leaseUntil, expires_at: claim.expiresAt };
    const admin = { from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; }, abortSignal: (signal: AbortSignal) => { assert.equal(signal, controller.signal); return query; },
        maybeSingle: async () => {
          if (mode === `error-${table}` || (mode === 'error-final-claim' && table === 'touchline_match_push_outbox' && reads === 1)) return { data: null, error: { message: 'synthetic read failure' } };
          if (table === 'notification_devices') {
            assert.deepEqual(filters, { id: deviceId });
            return { data: mode === 'device-missing' ? null : { user_id: userId, installation_id: mode === 'malformed-registration' ? 'invalid' : installationId, permission: mode === 'denied' ? 'denied' : 'granted', push_subscription: mode === 'denied' ? null : { ...registration.subscription, endpoint: mode === 'device-changed' ? 'https://push.example.test/changed' : registration.subscription.endpoint } }, error: null };
          }
          if (table === 'notification_preferences') {
            assert.deepEqual(filters, { user_id: userId });
            return { data: { channels: { push: mode !== 'push-off' }, settings: { goalsAndEvents: true }, frequency: 'realtime', explicit_consent_at: mode === 'no-consent' ? null : '2026-09-26T00:00:00Z', quiet_hours: { enabled: mode === 'quiet-hours', start: '22:00', end: '07:00', timezone: 'UTC' } }, error: null };
          }
          if (table === 'touchline_fixture_alert_subscriptions') {
            assert.deepEqual(filters, { fixture_id: fixtureId, user_id: userId });
            return { data: mode === 'fixture-optout' ? null : { fixture_id: fixtureId }, error: null };
          }
          if (table === 'football_fixtures') { assert.deepEqual(filters, { id: fixtureId, provider: 'sportmonks' }); return { data: { provider_fixture_id: '8' }, error: null }; }
          assert.equal(table, 'touchline_match_push_outbox');
          assert.deepEqual(filters, { id, lease_token: leaseToken, state: 'claimed' });
          reads++;
          if (reads === 2 && mode === 'aged-during-final-read') late = true;
          if (reads === 2 && mode === 'kind-changed') return { data: { ...row, delivery_kind: 'revision' }, error: null };
          return { data: reads === 2 && mode === 'revoked' ? null : reads === 2 && mode === 'rotated-binding' ? { ...row, subscription_fingerprint: 'sha256:' + 'b'.repeat(64) } : row, error: null };
        } };
      return query;
    } };
    const deps: Record<string, unknown> = {
      'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => admin }, './match-push-source-freshness': freshness,
      './match-event-notification': notification,
      './push-subscription-fingerprint': fingerprint, './push-device-contract': registrationContract, './match-push-delivery-policy': deliveryPolicy,
      './social-source-revision-server': { readTouchlineSocialSourceRevisionCheckpoint: async (keys: string[]) => {
        assert.deepEqual(Array.from(keys), ['fixture-provider:8']);
        if (mode === 'aged-during-revision' || mode === 'expired-during-revision') late = true;
        if (mode === 'aborted-during-revision') controller.abort();
        return mode === 'revision-unavailable' ? null : { clockRevision: mode === 'revision-changed' ? 2 : 1, checksum: mode === 'revision-checksum-changed' ? 'sha256:' + 'c'.repeat(64) : hash, manifest: { 'fixture-provider:8': 1 } };
      } },
      './social-confirmed-event-draft-server': { readTouchlineConfirmedEventPushSource: async (fixture: string, event: string) => {
        assert.equal(fixture, '8'); assert.equal(event, '9');
        if (mode === 'aborted') controller.abort();
        if (mode === 'expired') late = true;
        const playerName = mode.startsWith('payload-') ? boundaryName + (mode === 'payload-oversize' ? 'x' : '') : 'Saka';
        return { ok: true, data: { sourceProvenance: 'PERSISTED_VERIFIED_CONFIRMED_EVENT', fixtureId: '8', eventId: '9', home: { name: 'Arsenal' }, away: { name: 'Chelsea' }, score: { home: 1, away: 0 }, event: { kind: 'goal', playerName, minute: 23, extraMinute: null }, matchRating: 8.2, touchlinePoints: mode === 'formatter-null' ? 999 : 5, sourceChecksum: mode === 'changed-checksum' ? 'wrong' : hash, contentType: mode === 'hat-trick' ? 'HAT_TRICK_HERO' : 'GOAL_CONFIRMED', sourceRevisionManifest: { 'fixture-provider:8': 1 }, sourceRevisionChecksum: hash },
          evidence: { canonicalFixtureId: mode === 'wrong-fixture' ? deviceId : fixtureId, fixtureProviderId: '8', eventProviderId: '9',
            eventSyncedAt: now.toISOString(), settlementSyncedAt: now.toISOString(), fixtureUpdatedAt: now.toISOString(), lastObservedAt: now.toISOString(), clockRevision: 1 } };
      } },
    };
    const exports = {};
    vm.runInNewContext(js, { exports, Buffer, require: (name: string) => { assert.ok(name in deps); return deps[name]; } });
    const reader = exports as Pick<typeof import('../lib/touchlineArena/match-push-claimed-source-server'), 'readClaimedMatchPushSource'>;
    const locale = mode === 'valid-pt' ? 'pt-BR' : mode === 'invalid-locale' ? 'en-US' : mode === 'missing-locale' ? undefined : 'en-GB';
    const result = await reader.readClaimedMatchPushSource(claim, { signal: controller.signal, locale: locale as 'en-GB' | 'pt-BR',
      now: () => late ? new Date(mode.startsWith('aged-during-') ? now.getTime() + 1001 : claim.leaseUntil) : now,
      maximumAgeMs: mode === 'unconfigured' ? null : { eventSyncedAt: 1000, settlementSyncedAt: 1000, fixtureUpdatedAt: 1000, lastObservedAt: 1000 } });
    assert.equal(result !== null, ['valid', 'valid-revision', 'valid-pt', 'payload-exact'].includes(mode), mode);
    if (mode === 'invalid-locale' || mode === 'missing-locale') assert.equal(reads, 0);
    if (result) {
      assert.equal(result.deviceId, deviceId); assert.equal(result.registration.installationId, installationId); assert.equal(result.queuedSubscriptionFingerprint, binding); assert.equal(reads, 2);
      const expected = mode === 'valid-pt' ? { ...expectedEnglish, title: 'GOL — Arsenal 1 × 0 Chelsea', body: 'Saka · 23′ · TouchLine Points (na partida): +5', href: '/live?fixture=8&lang=pt-BR' }
        : mode === 'payload-exact' ? { ...expectedEnglish, body: boundaryName + ' · 23′ · TouchLine Points (match): +5' }
        : mode === 'valid-revision' ? { ...expectedEnglish, update: true } : expectedEnglish;
      assert.deepEqual(JSON.parse(JSON.stringify(result.payload)), expected);
      if (mode === 'payload-exact') assert.equal(Buffer.byteLength(JSON.stringify(result.payload), 'utf8'), 3072);
    }
  }
});
