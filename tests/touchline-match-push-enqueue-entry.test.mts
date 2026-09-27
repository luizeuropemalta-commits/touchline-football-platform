import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as freshness from '../lib/touchlineArena/match-push-source-freshness.ts';

// Synthetic windows only, not an approved operational policy.
const policy = { eventSyncedAt: 11_000, settlementSyncedAt: 23_000, fixtureUpdatedAt: 37_000, lastObservedAt: 53_000 };
const input = { deviceId: '22222222-2222-4222-8222-222222222222', fixtureProviderId: '8', eventProviderId: '9' };
const js = ts.transpileModule(readFileSync(new URL('../lib/touchlineArena/match-push-enqueue-entry-server.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type ObservedOptions = { enabled: boolean; historyComplete: boolean; maximumAgeMs: typeof policy; expiresAt: string; locale: string; signal: AbortSignal; now: () => Date };
type Outcome = { status: string; id?: string };
function harness(outcome: Outcome) {
  const calls: Array<{ input: typeof input; options: ObservedOptions }> = [];
  const mod = { exports: {} as { enqueueMatchPushFromServer: (input: unknown, options?: unknown) => Promise<Outcome> } };
  vm.runInNewContext(js, { module: mod, exports: mod.exports, Date, require: (name: string) => {
    if (name === 'server-only') return {};
    if (name === './match-push-source-freshness') return freshness;
    assert.equal(name, './match-push-enqueue-server');
    return { enqueueVerifiedMatchPush: async (value: typeof input, options: ObservedOptions) => { calls.push({ input: value, options }); return outcome; } };
  } });
  return { calls, run: mod.exports.enqueueMatchPushFromServer };
}

test('normalization and age calculations read each limit once, preserving the captured value', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  const evidence = Object.fromEntries(freshness.MATCH_PUSH_SOURCE_TIMES.map(key => [key, now.toISOString()]));
  for (const operation of ['normalize', 'freshness', 'deadline']) {
    const reads: Record<string, number> = {};
    const changing = Object.fromEntries(freshness.MATCH_PUSH_SOURCE_TIMES.map(key => [key, 0]));
    for (const key of freshness.MATCH_PUSH_SOURCE_TIMES) {
      Object.defineProperty(changing, key, { get() { reads[key] = (reads[key] ?? 0) + 1; return reads[key] === 1 ? policy[key] : -1; } });
    }
    if (operation === 'normalize') assert.deepEqual(freshness.normalizeMatchPushSourceAgePolicy(changing), policy);
    if (operation === 'freshness') assert.equal(freshness.matchPushSourceFreshness(evidence, changing, now), 'current');
    if (operation === 'deadline') assert.equal(freshness.matchPushSourceDeadline(evidence, changing, '2026-09-27T12:05:00Z', now), '2026-09-27T12:00:11.000Z');
    assert.deepEqual(reads, { eventSyncedAt: 1, settlementSyncedAt: 1, fixtureUpdatedAt: 1, lastObservedAt: 1 });
  }
});

test('entry rejects disabled or incomplete age configuration without delegating', async () => {
  const h = harness({ status: 'unknown' });
  assert.equal((await h.run(input)).status, 'not-enqueued');
  for (const enabled of [undefined, false, 'true', 1]) {
    assert.equal((await h.run(input, { enabled, maximumAgeMs: policy })).status, 'not-enqueued');
  }
  for (const key of freshness.MATCH_PUSH_SOURCE_TIMES) {
    for (const value of [undefined, null, '11000', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal((await h.run(input, { enabled: true, maximumAgeMs: { ...policy, [key]: value } })).status, 'not-enqueued');
    }
  }
  for (const value of [undefined, null, {}, [], 'policy']) {
    assert.equal((await h.run(input, { enabled: true, maximumAgeMs: value })).status, 'not-enqueued');
  }
  assert.equal(h.calls.length, 0);
});

test('entry explicitly projects trusted policy, real clock and literal false history without receipt reinterpretation', async () => {
  for (const outcome of [{ status: 'not-enqueued' }, { status: 'unknown' }, { status: 'stored-or-existing', id: 'synthetic-receipt' }]) {
    const h = harness(outcome);
    const signal = new AbortController().signal;
    const supplied = { ...policy, extra: 999 };
    const before = Date.now();
    const result = await h.run({ ...input, checksum: 'untrusted', historyComplete: true }, {
      enabled: true, maximumAgeMs: supplied, expiresAt: '2026-09-27T12:00:00Z', locale: 'pt-BR', signal,
      historyComplete: true, now: () => new Date(0), checksum: 'untrusted', sourceVerified: true,
    });
    assert.equal(result, outcome);
    assert.equal(h.calls.length, 1);
    const observed = h.calls[0];
    assert.deepEqual(JSON.parse(JSON.stringify(observed.input)), input);
    assert.deepEqual(Object.keys(observed.options).sort(), ['enabled', 'expiresAt', 'historyComplete', 'locale', 'maximumAgeMs', 'now', 'signal'].sort());
    assert.equal(observed.options.enabled, true);
    assert.equal(observed.options.historyComplete, false);
    assert.equal(observed.options.locale, 'pt-BR');
    assert.equal(observed.options.expiresAt, '2026-09-27T12:00:00Z');
    assert.equal(observed.options.signal, signal);
    assert.ok(observed.options.now().getTime() >= before);
    assert.ok(observed.options.now().getTime() <= Date.now());
    assert.deepEqual(observed.options.maximumAgeMs, policy);
    assert.notEqual(observed.options.maximumAgeMs, supplied);
    assert.equal(Object.isFrozen(observed.options.maximumAgeMs), true);
    supplied.eventSyncedAt = 1;
    assert.equal(observed.options.maximumAgeMs.eventSyncedAt, 11_000);
    assert.throws(() => { observed.options.maximumAgeMs.eventSyncedAt = 2; }, TypeError);
  }
});
