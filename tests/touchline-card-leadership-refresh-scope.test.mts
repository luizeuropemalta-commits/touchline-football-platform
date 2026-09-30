import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../components/touchline/cards/TouchlineCardLeadershipProvider.tsx', import.meta.url), 'utf8');

test('root presentation refresh is limited to live allowed game consumers including Market', () => {
  const expression = source.match(/const refreshRootSeed = ([^;]+);/)?.[1];
  assert.ok(expression, 'actual provider must define its root refresh admission');
  for (const pathname of ['/arena', '/my-club', '/market-transfer', '/market-transfer/other', '/fantasy', '/arena/other', '/my-club/history', '/touchline-tables', '/touchline-player-card-rankings', '/touchline-players/42', '/touchline-coaches/43', '/touchline-clubs', '/admin', '/visual-qa', null]) {
    for (const livePlayerUpdates of [true, false]) {
      for (const allowed of [true, false]) {
        const actual = vm.runInNewContext(expression, { pathname, livePlayerUpdates, allowed });
        assert.equal(actual, livePlayerUpdates && allowed && ['/arena', '/my-club', '/market-transfer'].includes(pathname ?? ''), String(pathname));
      }
    }
  }
});

test('refresh hints are seeded only from original server authority with stable child placement', () => {
  assert.match(source, /initialPlayerRankingSnapshotId=\{value\.playerRanking\?\.snapshotId \?\? null\}/);
  assert.match(source, /initialCoachRankingSnapshotId=\{value\.coachLeader\?\.snapshotId \?\? null\}/);
  assert.match(source, /<AuthorityContext\.Provider value=\{resolved\}>\s*\{refreshRootSeed \? <TouchlineLivePresentationRefresh[\s\S]*?\/> : null\}\s*\{children\}\s*<\/AuthorityContext\.Provider>/);
  assert.doesNotMatch(source, /<[^>]+\bkey=/);
  assert.doesNotMatch(source, /fetch\(|setInterval/);
});
