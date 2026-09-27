import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../lib/touchlineArena/social-confirmed-event-draft-server.ts', import.meta.url), 'utf8');

// Structural boundary guards; these are NOT a hosted/DB reader integration test.
test('social wrapper projects only the original result contract from private reader', () => {
  assert.ok(source.startsWith('import "server-only";'));
  const wrapper = source.slice(source.indexOf('export async function readTouchlineSocialConfirmedEventDraft('));
  assert.match(wrapper, /await readTouchlineConfirmedEventPushSource\(fixtureIdInput, eventIdInput, requestedContentType\)/);
  assert.match(wrapper, /return result\.ok \? \{ ok: true, data: result\.data \} : \{ ok: false, reason: result\.reason \}/);
  assert.doesNotMatch(wrapper, /\.\.\.result|evidence:/);
});

test('private timestamps retain their own rows outside semantic source and after revision fence', () => {
  const base = source.slice(source.indexOf('  const baseSource ='), source.indexOf('  const sourceChecksum ='));
  assert.doesNotMatch(base, /evidence|eventSyncedAt|settlementSyncedAt|fixtureUpdatedAt|clockRevision/);
  const evidence = source.slice(source.indexOf('}, evidence: {'), source.indexOf('/** Preserve the social contract:'));
  for (const mapping of [
    'eventSyncedAt: timestamp(row.source_synced_at)',
    'settlementSyncedAt: timestamp(settlement.source_synced_at)',
    'fixtureUpdatedAt: timestamp(canonical.source_updated_at)',
    'lastObservedAt: timestamp(observation.data.last_observed_at)',
  ]) assert.ok(evidence.includes(mapping), mapping);
  assert.doesNotMatch(evidence, /new Date|Date\.now|sourceSnapshotAt|Math\.max/);
  assert.ok(source.indexOf('sourceReadEnd.clockRevision !== sourceReadStart.clockRevision') < source.indexOf('}, evidence: {'));
});
