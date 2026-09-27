import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as contract from '../lib/touchlineArena/social-confirmed-event-contract.ts';
import * as caption from '../lib/touchlineArena/social-confirmed-event-caption.ts';
import * as checksum from '../lib/touchlineArena/social-confirmed-event-render-source.ts';
import { MATCH_PUSH_SOURCE_TIMES, matchPushSourceFreshness } from '../lib/touchlineArena/match-push-source-freshness.ts';

const uuid = '11111111-1111-4111-8111-111111111111';
const at = '2026-09-27T00:00:00Z';
const source = readFileSync(new URL('../lib/touchlineArena/social-confirmed-event-draft-server.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(options: { eventTime?: string | null; changedRevision?: boolean; badFact?: boolean; duplicate?: boolean } = {}) {
  const event = { provider_event_id: '9', provider_team_id: '1', provider_player_id: '3', football_player_id: uuid,
    player_name: 'Test Player', minute: 12, extra_minute: null, event_type: 'goal', event_status: 'recorded', result: '1-0',
    source_synced_at: options.eventTime === undefined ? at : options.eventTime };
  const fact = checksum.checksumTouchlineConfirmedEventFact({ fixtureId: '8', eventId: '9', eventKind: 'goal', result: '1-0', teamId: '1', playerId: '3', minute: 12, extraMinute: null });
  const rows: Record<string, unknown> = {
    football_fixtures: { id: uuid, competition_id: uuid, season_id: uuid, round_id: uuid, home_club_id: uuid, away_club_id: uuid, source_updated_at: '2026-09-27T00:02:00Z' },
    football_fixture_events: options.duplicate ? [event, event] : [event],
    touchline_social_confirmed_event_observations: { first_observed_at: at, last_observed_at: '2026-09-27T00:03:00Z', confirmed_at: at,
      event_fact_checksum: options.badFact ? 'wrong' : fact, stable_observation_count: 2, confirmation_state: 'CONFIRMED' },
    touchline_player_fixture_score_settlements: { rating: 7, touchline_points: 10, settlement_status: 'provisional', source_synced_at: '2026-09-27T00:01:00Z',
      touchline_points_breakdown: [{ providerEventId: 'rating:7', ruleCode: 'sportmonks-rating', factValue: 7, points: 10 }] },
  };
  let revisionReads = 0;
  const admin = { from(table: string) {
    assert.ok(table in rows, table);
    const query = { select: () => query, eq: () => query, order: () => Promise.resolve({ data: rows[table], error: null }), maybeSingle: () => Promise.resolve({ data: rows[table], error: null }) };
    return query;
  } };
  const dependencies: Record<string, unknown> = {
    'server-only': {},
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/football-data/fixture-schedule-store': { readPublicCompetitionFixtureByProviderId: async () => ({ competitionId: '8', startsAt: at, homeTeam: { providerId: '1' }, awayTeam: { providerId: '2' }, roundName: '1', status: 'LIVE', seasonId: '7' }) },
    '@/lib/football-data/public-premier-squad-server': { readPublicPremierSquad: async () => ({ status: 200, body: { players: [{ providerId: '3', canonicalPlayerId: uuid }] } }), publicPremierSquadPlayerToCard: () => ({ editorialCard: true, cardTier: 'ruby', seasonTotalRating: 7 }) },
    '@/lib/touchlineArena/demo-data': { TOUCHLINE_ENGLAND_CLUBS: [{ teamId: '1', name: 'Home', logoUrl: '/home.png' }, { teamId: '2', name: 'Away', logoUrl: '/away.png' }] },
    '@/lib/touchlineArena/matchday-player-points': { applyTouchlineSeasonPoints: (cards: unknown) => cards },
    '@/lib/touchlineArena/public-season-player-points-server': { readPublicSeasonPlayerPoints: async () => ({}) },
    '@/lib/touchlineArena/stadium-catalog': { resolveTouchlineFixtureVenue: () => ({ name: 'Test venue', interiorImageUrl: '/venue.png' }) },
    '@/lib/touchlineArena/match-centre': { touchlineFixtureState: () => 'live' },
    '@/lib/touchlineArena/social-confirmed-event-caption': caption,
    '@/lib/touchlineArena/social-confirmed-event-contract': contract,
    '@/lib/touchlineArena/social-confirmed-event-render-source': checksum,
    '@/lib/touchlineArena/social-source-revision-server': { readTouchlineSocialSourceRevisionCheckpoint: async () => ({ clockRevision: options.changedRevision ? ++revisionReads : 1, manifest: {}, checksum: 'sha256:' + 'b'.repeat(64) }) },
  };
  const exports = {};
  vm.runInNewContext(javascript, { exports, require: (name: string) => {
    assert.ok(name in dependencies, `unexpected dependency ${name}`); return dependencies[name];
  } });
  return exports as Pick<typeof import('../lib/touchlineArena/social-confirmed-event-draft-server'), 'readTouchlineConfirmedEventPushSource' | 'readTouchlineSocialConfirmedEventDraft'>;
}

test('executed reader preserves social DTO while private evidence retains individual source times', async () => {
  const reader = harness();
  const privateResult = await reader.readTouchlineConfirmedEventPushSource('8', '9');
  const social = await reader.readTouchlineSocialConfirmedEventDraft('8', '9');
  assert.equal(privateResult.ok, true, JSON.stringify(privateResult));
  assert.equal(social.ok, true);
  if (!privateResult.ok || !social.ok) return;
  assert.equal(JSON.stringify(privateResult.data), JSON.stringify(social.data));
  assert.deepEqual(Object.keys(social).sort(), ['data', 'ok']);
  assert.equal(privateResult.evidence.eventSyncedAt, at);
  assert.equal(privateResult.evidence.settlementSyncedAt, '2026-09-27T00:01:00Z');
  assert.equal(privateResult.evidence.fixtureUpdatedAt, '2026-09-27T00:02:00Z');
  assert.equal(privateResult.evidence.canonicalFixtureId, uuid);
  const testNow = new Date('2026-09-27T00:03:00Z');
  const testPolicy = Object.fromEntries(MATCH_PUSH_SOURCE_TIMES.map(key => [key, 180_000]));
  assert.equal(matchPushSourceFreshness(privateResult.evidence, null, testNow), 'unconfigured');
  assert.equal(matchPushSourceFreshness(privateResult.evidence, testPolicy, testNow), 'current');
  const missing = await harness({ eventTime: null }).readTouchlineConfirmedEventPushSource('8', '9');
  assert.equal(missing.ok, true);
  if (!missing.ok) return;
  assert.equal(missing.evidence.eventSyncedAt, null);
  assert.equal(matchPushSourceFreshness(missing.evidence, testPolicy, testNow), 'invalid-evidence');
  assert.equal(missing.data.sourceChecksum, privateResult.data.sourceChecksum);
});

test('executed shared reader rejects revision changes, conflicting events and bad observation facts on both paths', async () => {
  for (const [options, reason] of [
    [{ changedRevision: true }, 'source-revision-changed-during-read'],
    [{ duplicate: true }, 'canonical-event-identity-conflict'],
    [{ badFact: true }, 'event-fact-not-stable'],
  ] as const) {
    for (const name of ['readTouchlineConfirmedEventPushSource', 'readTouchlineSocialConfirmedEventDraft'] as const) {
      const result = await harness(options)[name]('8', '9');
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, reason);
      assert.equal('evidence' in result, false);
    }
  }
});
