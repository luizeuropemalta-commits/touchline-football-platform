import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createECDH } from 'node:crypto';
import { parseMatchPushVapidConfig } from '../lib/touchlineArena/match-push-vapid-config.ts';
import { dispatchMatchPush } from '../lib/touchlineArena/match-push-dispatch.ts';
import { matchPushDeliveryDecision } from '../lib/touchlineArena/match-push-delivery-policy.ts';
import { matchPushSourceDeadline, MATCH_PUSH_SOURCE_TIMES } from '../lib/touchlineArena/match-push-source-freshness.ts';
import { isSupportedMatchPushEndpoint } from '../lib/touchlineArena/match-push-transport.ts';

const js = ts.transpileModule(readFileSync(new URL('../lib/touchlineArena/match-push-single-claim-server.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const nonce = '33333333-3333-4333-8333-333333333333';
const syntheticCurve = createECDH('prime256v1');
syntheticCurve.setPrivateKey(Buffer.alloc(32, 1));
const vapid = { subject: 'mailto:test@example.test', privateKey: Buffer.alloc(32, 1).toString('base64url'), publicKey: syntheticCurve.getPublicKey().toString('base64url') };
type TransportInput = Parameters<typeof import('../lib/touchlineArena/match-push-transport.ts').sendMatchWebPush>[0];

test('single-claim composition uses second source, bounded expiry and fenced receipt without retries', async () => {
  for (const mode of ['success', 'disabled', 'endpoint', 'missing', 'lost', 'refused', 'opt-out', 'transport-lost', 'receipt-lost', 'lease', 'queue', ...MATCH_PUSH_SOURCE_TIMES]) {
    const started = Date.now();
    const iso = (offset: number) => new Date(started + offset).toISOString();
    const claim = { id: '11111111-1111-4111-8111-111111111111', leaseToken: '22222222-2222-4222-8222-222222222222',
      leaseUntil: iso(mode === 'lease' ? 10000 : 60000), expiresAt: iso(mode === 'queue' ? 10000 : 90000) };
    const ages = Object.fromEntries(MATCH_PUSH_SOURCE_TIMES.map(key => [key, key === mode ? 10000 : 120000]));
    const evidence = Object.fromEntries(MATCH_PUSH_SOURCE_TIMES.map(key => [key, iso(-1000)]));
    let reads = 0, reserves = 0, nonces = 0;
    const sends: TransportInput[] = [];
    const finishes: Array<{ state: string; reference: unknown; signal: AbortSignal }> = [];
    const readClaims: unknown[] = [];
    const readSignals: AbortSignal[] = [];
    const hash = 'sha256:' + 'a'.repeat(64);
    const policy = { sourceChecksum: hash, currentSourceChecksum: hash, sourceVerified: true, fixtureOptedIn: true,
      permission: 'granted', subscriptionUnchanged: true, queuedSubscriptionFingerprint: hash, currentSubscriptionFingerprint: hash,
      channels: { push: true }, settings: { goalsAndEvents: true }, frequency: 'realtime', explicitConsentAt: iso(-60000),
      quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC' } };
    const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
    vm.runInNewContext(js, { exports, Date, Error, AbortController, setTimeout, clearTimeout, require: (name: string) => {
      if (name === 'server-only') return {};
      if (name === './match-push-vapid-config') return { parseMatchPushVapidConfig };
      if (name === 'node:crypto') return { randomUUID: () => { nonces++; return nonce; } };
      if (name === './match-push-dispatch') return { dispatchMatchPush };
      if (name === './match-push-source-freshness') return { matchPushSourceDeadline };
      if (name === './match-push-delivery-policy') return { matchPushDeliveryDecision };
      if (name === './match-push-claimed-source-server') return { readClaimedMatchPushSource: async (current: unknown, options: { signal: AbortSignal }) => {
        reads++; readClaims.push(current); readSignals.push(options.signal);
        if (mode === 'missing') return null;
        return { source: { evidence }, registration: { subscription: { endpoint: mode === 'endpoint' ? 'https://arbitrary.example/test' : 'https://fcm.googleapis.com/test', keys: {} } },
          policy: { ...policy, fixtureOptedIn: mode !== 'opt-out' || reads === 1 }, payload: { read: reads } };
      } };
      if (name === './match-push-attempt-server') return {
        reserveMatchPushAttempt: async () => { reserves++; if (mode === 'lost') throw new Error('lost'); return mode !== 'refused'; },
        finishMatchPushAttempt: async (_: unknown, state: string, reference: unknown, options: { signal: AbortSignal }) => {
          finishes.push({ state, reference, signal: options.signal }); return mode !== 'receipt-lost';
        },
      };
      if (name === './match-push-transport') return { isSupportedMatchPushEndpoint, sendMatchWebPush: async (input: TransportInput) => {
        sends.push(input); if (mode === 'transport-lost') throw new Error('lost'); return 'provider_accepted';
      } };
      throw new Error('Unexpected import ' + name);
    } });
    const result = await exports.dispatchClaimedMatchPush(claim, { enabled: mode !== 'disabled', locale: 'en-GB', maximumAgeMs: ages,
      vapid });
    const early = ['disabled', 'endpoint', 'missing'].includes(mode);
    const lost = ['lost', 'refused'].includes(mode);
    assert.equal(nonces, mode === 'disabled' ? 0 : 1, mode);
    assert.equal(reserves, early ? 0 : 1, mode);
    assert.equal(sends.length, early || lost || mode === 'opt-out' ? 0 : 1, mode);
    assert.equal(finishes.length, mode === 'disabled' || lost ? 0 : 1, mode);
    const expected = mode === 'disabled' ? 'disabled' : mode === 'lost' ? 'reservation-unconfirmed' : mode === 'refused' ? 'reservation-not-granted'
      : ['endpoint', 'missing', 'opt-out'].includes(mode) ? 'cancelled' : mode === 'transport-lost' ? 'uncertain' : mode === 'receipt-lost' ? 'receipt-unconfirmed' : 'provider_accepted';
    assert.equal(result, expected, mode);
    for (const current of readClaims) assert.equal(current, claim);
    if (sends.length) {
      assert.equal(sends[0].payload, JSON.stringify({ read: 2 }));
      assert.equal(sends[0].expiresAt.getTime(), Math.min(Date.parse(claim.leaseUntil), Date.parse(claim.expiresAt), ...MATCH_PUSH_SOURCE_TIMES.map(key => Date.parse(evidence[key]) + ages[key])));
      assert.equal(sends[0].signal, readSignals[1]);
    }
    if (finishes.length) {
      assert.equal(finishes[0].signal.aborted, false);
      assert.notEqual(finishes[0].signal, readSignals[0]);
      assert.deepEqual(JSON.parse(JSON.stringify(finishes[0].reference)), early ? { kind: 'unreserved' } : { kind: 'reserved', attemptId: nonce });
    }
  }
});

test('composition rejects late reads and aborts pending completion independently without resending', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const mode of ['first-read', 'second-read', 'transport']) {
    const instant = Date.now();
    const iso = (offset: number) => new Date(instant + offset).toISOString();
    const claim = { id: '11111111-1111-4111-8111-111111111111', leaseToken: '22222222-2222-4222-8222-222222222222', leaseUntil: iso(60000), expiresAt: iso(90000) };
    const hash = 'sha256:' + 'a'.repeat(64);
    const fresh = { source: { evidence: Object.fromEntries(MATCH_PUSH_SOURCE_TIMES.map(key => [key, iso(-1000)])) },
      registration: { subscription: { endpoint: 'https://fcm.googleapis.com/test', keys: {} } }, payload: { test: true },
      policy: { sourceChecksum: hash, currentSourceChecksum: hash, sourceVerified: true, fixtureOptedIn: true,
        permission: 'granted', subscriptionUnchanged: true, queuedSubscriptionFingerprint: hash, currentSubscriptionFingerprint: hash,
        channels: { push: true }, settings: { goalsAndEvents: true }, frequency: 'realtime', explicitConsentAt: iso(-60000),
        quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC' } } };
    let reads = 0, reserves = 0, sends = 0;
    let releaseRead: ((value: typeof fresh) => void) | undefined;
    let releaseTransport: ((value: string) => void) | undefined;
    const preparationSignals: AbortSignal[] = [];
    const finishes: Array<{ state: string; reference: unknown; signal: AbortSignal }> = [];
    const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
    vm.runInNewContext(js, { exports, Date, Error, AbortController, setTimeout, clearTimeout, require: (name: string) => {
      if (name === 'server-only') return {};
      if (name === './match-push-vapid-config') return { parseMatchPushVapidConfig };
      if (name === 'node:crypto') return { randomUUID: () => nonce };
      if (name === './match-push-dispatch') return { dispatchMatchPush };
      if (name === './match-push-source-freshness') return { matchPushSourceDeadline };
      if (name === './match-push-delivery-policy') return { matchPushDeliveryDecision };
      if (name === './match-push-claimed-source-server') return { readClaimedMatchPushSource: async (_: unknown, options: { signal: AbortSignal }) => {
        reads++; preparationSignals.push(options.signal);
        if ((mode === 'first-read' && reads === 1) || (mode === 'second-read' && reads === 2)) {
          return new Promise<typeof fresh>(resolve => { releaseRead = resolve; });
        }
        return fresh;
      } };
      if (name === './match-push-attempt-server') return {
        reserveMatchPushAttempt: async () => { reserves++; return true; },
        finishMatchPushAttempt: async (_: unknown, state: string, reference: unknown, options: { signal: AbortSignal }) => {
          finishes.push({ state, reference, signal: options.signal });
          // Deliberately ignore abort: outer receipt deadline must still release.
          return new Promise<boolean>(() => {});
        },
      };
      if (name === './match-push-transport') return { isSupportedMatchPushEndpoint, sendMatchWebPush: async () => {
        sends++; return new Promise<string>(resolve => { releaseTransport = resolve; });
      } };
      throw new Error('Unexpected import ' + name);
    } });
    const result = exports.dispatchClaimedMatchPush(claim, { enabled: true, locale: 'en-GB',
      maximumAgeMs: Object.fromEntries(MATCH_PUSH_SOURCE_TIMES.map(key => [key, 120000])),
      vapid });
    await new Promise<void>(resolve => setImmediate(resolve));
    t.mock.timers.tick(15000);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(finishes.length, 1, mode);
    assert.equal(preparationSignals[0].aborted, true);
    assert.notEqual(finishes[0].signal, preparationSignals[0]);
    assert.equal(finishes[0].signal.aborted, false);
    assert.equal(finishes[0].state, mode === 'transport' ? 'uncertain' : 'cancelled');
    assert.deepEqual(JSON.parse(JSON.stringify(finishes[0].reference)), mode === 'first-read' ? { kind: 'unreserved' } : { kind: 'reserved', attemptId: nonce });
    t.mock.timers.tick(5000);
    assert.equal(await result, 'receipt-unconfirmed');
    assert.equal(finishes[0].signal.aborted, true);
    releaseRead?.(fresh);
    releaseTransport?.('provider_accepted');
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(reserves, mode === 'first-read' ? 0 : 1);
    assert.equal(sends, mode === 'transport' ? 1 : 0);
    assert.equal(finishes.length, 1);
  }
});

test('invalid VAPID configuration has zero nonce, reads, reservation, completion or transport effects', async () => {
  const other = createECDH('prime256v1'); other.setPrivateKey(Buffer.alloc(32, 2));
  const invalid = [null, {}, [], { ...vapid, privateKey: Buffer.alloc(32).toString('base64url') },
    { ...vapid, privateKey: Buffer.alloc(32, 255).toString('base64url') },
    { ...vapid, publicKey: other.getPublicKey().toString('base64url') },
    { ...vapid, publicKey: Buffer.alloc(65, 4).toString('base64url') },
    { ...vapid, publicKey: Buffer.alloc(65, 2).toString('base64url') },
    { ...vapid, privateKey: vapid.privateKey + '=' }, { ...vapid, publicKey: vapid.publicKey.slice(1) },
    ...['http://example.test', 'https:///example.test', 'https://localhost.', 'https://user:pass@example.test', 'mailto:', 'mailto:?subject=empty', ' https://example.test', 'https://example.test/\n'].map(subject => ({ ...vapid, subject }))];
  let effects = 0;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  vm.runInNewContext(js, { exports, Date, Error, AbortController, setTimeout, clearTimeout, require: (name: string) => {
    if (name === 'server-only') return {};
    if (name === './match-push-vapid-config') return { parseMatchPushVapidConfig };
    if (name === 'node:crypto') return { randomUUID: () => { effects++; return nonce; } };
    return new Proxy({}, { get: () => () => { effects++; throw new Error('Unexpected effect'); } });
  } });
  for (const config of invalid) {
    assert.equal(parseMatchPushVapidConfig(config), null);
    assert.equal(await exports.dispatchClaimedMatchPush({}, { enabled: true, vapid: config }), 'unconfigured');
  }
  assert.equal(effects, 0);
  const original = { ...vapid };
  const validated = parseMatchPushVapidConfig(original);
  assert.deepEqual(validated, original);
  assert.notEqual(validated, original);
  original.privateKey = 'mutated';
  assert.equal(validated?.privateKey, vapid.privateKey);
  assert.equal(Object.isFrozen(validated), true);
  assert.ok(parseMatchPushVapidConfig({ ...vapid, subject: 'https://example.test/contact' }));
});
