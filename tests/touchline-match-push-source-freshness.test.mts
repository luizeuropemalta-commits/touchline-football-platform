import assert from 'node:assert/strict';
import test from 'node:test';
import { MATCH_PUSH_SOURCE_TIMES, matchPushSourceFreshness, matchPushSourceDeadline } from '../lib/touchlineArena/match-push-source-freshness.ts';

const now = new Date('2026-09-27T01:00:00Z');
// Test windows only, not product configuration or approval to send.
const policy = Object.fromEntries(MATCH_PUSH_SOURCE_TIMES.map(key => [key, 60_000]));
const evidence = Object.fromEntries(MATCH_PUSH_SOURCE_TIMES.map(key => [key, '2026-09-27T00:59:00Z']));

test('queue deadline is bounded by every constituent, not the newest snapshot', () => {
  const fresh = Object.fromEntries(MATCH_PUSH_SOURCE_TIMES.map(key => [key, now.toISOString()]));
  const requested = '2026-09-27T01:05:00Z';
  for (const key of MATCH_PUSH_SOURCE_TIMES) {
    const staggered = { ...fresh, [key]: '2026-09-27T00:59:20Z', sourceSnapshotAt: requested };
    assert.equal(matchPushSourceDeadline(staggered, policy, requested, now), '2026-09-27T01:00:20.000Z', key);
  }
  assert.equal(matchPushSourceDeadline(fresh, policy, '2026-09-27T01:00:10Z', now), '2026-09-27T01:00:10.000Z');
  assert.equal(matchPushSourceDeadline(evidence, policy, requested, now), null, 'no future queue lifetime at source age boundary');
  for (const invalid of [null, '', 'invalid', now.toISOString(), 1]) assert.equal(matchPushSourceDeadline(fresh, policy, invalid, now), null);
  assert.equal(matchPushSourceDeadline(fresh, null, requested, now), null);
  assert.equal(matchPushSourceDeadline({ ...fresh, eventSyncedAt: null }, policy, requested, now), null);
  assert.equal(matchPushSourceDeadline(fresh, { ...policy, eventSyncedAt: Number.MAX_SAFE_INTEGER }, requested, now), null, 'unsafe deadline arithmetic');
  assert.equal(matchPushSourceDeadline(fresh, { ...policy, eventSyncedAt: 8_640_000_000_000_000 }, requested, now), null, 'finite safe sum outside Date range');
  assert.equal(matchPushSourceDeadline({ ...fresh, settlementSyncedAt: '2026-09-26T01:00:00Z' }, policy, requested, now), null, 'stale constituent blocks a new deadline');
});

test('source age needs complete explicit policy and includes the exact age boundary', () => {
  assert.equal(matchPushSourceFreshness(evidence, policy, now), 'current');
  for (const invalid of [null, {}, [], { ...policy, eventSyncedAt: '60000' }, { ...policy, eventSyncedAt: Infinity }, { ...policy, eventSyncedAt: 0 }]) {
    assert.equal(matchPushSourceFreshness(evidence, invalid, now), 'unconfigured');
  }
  for (const key of MATCH_PUSH_SOURCE_TIMES) {
    assert.equal(matchPushSourceFreshness({ ...evidence, [key]: '2026-09-27T00:58:59.999Z' }, policy, now), 'stale');
    for (const invalid of [null, undefined, '', 'invalid', 0, '2026-09-27T01:00:00.001Z']) {
      assert.equal(matchPushSourceFreshness({ ...evidence, [key]: invalid }, policy, now), 'invalid-evidence');
    }
  }
});

test('a recent maximum or observation cannot hide an old or missing constituent', () => {
  const latest = { ...evidence, lastObservedAt: now.toISOString(), sourceSnapshotAt: now.toISOString() };
  assert.equal(matchPushSourceFreshness({ ...latest, settlementSyncedAt: null }, policy, now), 'invalid-evidence');
  assert.equal(matchPushSourceFreshness({ ...latest, fixtureUpdatedAt: '2026-09-26T00:00:00Z' }, policy, now), 'stale');
  assert.equal(matchPushSourceFreshness(evidence, policy, new Date(NaN)), 'invalid-evidence');
  assert.equal(matchPushSourceFreshness(null, policy, now), 'invalid-evidence');
});

test('each source uses its own independently specified age limit', () => {
  const distinct = { eventSyncedAt: 11_000, settlementSyncedAt: 23_000, fixtureUpdatedAt: 37_000, lastObservedAt: 53_000 };
  const fresh = {
    eventSyncedAt: now.toISOString(), settlementSyncedAt: now.toISOString(),
    fixtureUpdatedAt: now.toISOString(), lastObservedAt: now.toISOString(),
  };
  for (const [key, limit] of Object.entries(distinct)) {
    const boundary = { ...fresh, [key]: new Date(now.getTime() - limit).toISOString() };
    assert.equal(matchPushSourceFreshness(boundary, distinct, now), 'current', key);
    assert.equal(matchPushSourceFreshness({ ...boundary, [key]: new Date(now.getTime() - limit - 1).toISOString() }, distinct, now), 'stale', key);
    const oneSecondRemaining = { ...fresh, [key]: new Date(now.getTime() - limit + 1_000).toISOString() };
    assert.equal(matchPushSourceDeadline(oneSecondRemaining, distinct, '2026-09-27T01:05:00Z', now), '2026-09-27T01:00:01.000Z', key);
  }
});
