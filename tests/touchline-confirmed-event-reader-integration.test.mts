import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as contract from '../lib/touchlineArena/social-confirmed-event-contract.ts';
import * as caption from '../lib/touchlineArena/social-confirmed-event-caption.ts';
import * as checksum from '../lib/touchlineArena/social-confirmed-event-render-source.ts';
import { MATCH_PUSH_SOURCE_TIMES, matchPushSourceFreshness } from '../lib/touchlineArena/match-push-source-freshness.ts';
import { buildMatchEventNotification } from '../lib/touchlineArena/match-event-notification.ts';

const uuid = '11111111-1111-4111-8111-111111111111';
const at = '2026-09-27T00:00:00Z';
const source = readFileSync(new URL('../lib/touchlineArena/social-confirmed-event-draft-server.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(options: { legacyBand?: boolean; missingRating?: boolean; duplicateContribution?: boolean; eventTime?: string | null; changedRevision?: boolean; badFact?: boolean; duplicate?: boolean; hatTrick?: boolean; removeConstituent?: string; eventKind?: 'penalty' | 'own-goal' | 'red-card'; feedError?: boolean; extraFeedOrder?: 'unknown' | 'only-sort' | 'later'; feedCase?: 'missing' | 'duplicate' | 'rescinded' | 'drift' | 'wrong-fixture' | 'predecessor-missing' | 'canonical-predecessor-missing' | 'irrelevant-later' } = {}) {
  const event = { provider_event_id: '9', provider_team_id: '1', provider_player_id: '3', football_player_id: uuid,
    player_name: 'Test Player', minute: 12, extra_minute: null, event_type: 'goal', event_status: 'recorded', result: '1-0',
    source_synced_at: options.eventTime === undefined ? at : options.eventTime };
  if (options.feedCase === 'predecessor-missing') event.result = '2-0';
  if (options.hatTrick) event.result = '3-0';
  if (options.eventKind) event.event_type = options.eventKind;
  if (options.eventKind === 'own-goal') event.result = '0-1';
  if (options.eventKind === 'red-card') event.result = '0-0';
  const fact = checksum.checksumTouchlineConfirmedEventFact({ fixtureId: '8', eventId: '9', eventKind: options.eventKind ?? 'goal', result: event.result, teamId: '1', playerId: '3', minute: 12, extraMinute: null });
  const currentEvent = { provider: 'sportmonks', fixtureId: '8', providerId: '9', teamId: '1', playerId: '3', minute: 12, extraMinute: null, type: event.event_type, status: options.feedCase === 'rescinded' ? 'rescinded' : 'recorded', result: event.result, ...(options.feedCase === 'drift' ? { playerId: '4' } : {}) };
  const hatEvents = [{ ...event,provider_event_id:'7',minute:4,result:'1-0' },{ ...event,provider_event_id:'8',minute:8,result:'2-0' },event];
  const rows: Record<string, unknown> = {
    football_fixtures: { id: uuid, competition_id: uuid, season_id: uuid, round_id: uuid, home_club_id: uuid, away_club_id: uuid, source_updated_at: '2026-09-27T00:02:00Z' },
    football_fixture_events: options.duplicate ? [event, event] : options.feedCase === 'predecessor-missing' ? [{ ...event, provider_event_id: '7', minute: 5, result: '1-0' }, event] : options.feedCase === 'irrelevant-later' ? [event,{ ...event,provider_event_id: '10',minute: 80 }] : [event],
    football_fantasy_fixture_feeds: { provider: 'sportmonks', provider_fixture_id: options.feedCase === 'wrong-fixture' ? '88' : '8', last_synced_at: at, events_payload: options.feedCase === 'missing' ? [] : options.feedCase === 'duplicate' ? [currentEvent,currentEvent] : options.feedCase === 'canonical-predecessor-missing' ? [{ ...currentEvent,providerId: '7',minute: 5 },currentEvent] : [currentEvent] },
    touchline_social_confirmed_event_observations: { first_observed_at: at, last_observed_at: '2026-09-27T00:03:00Z', confirmed_at: at,
      event_fact_checksum: options.badFact ? 'wrong' : fact, stable_observation_count: 2, confirmation_state: 'CONFIRMED' },
    touchline_player_fixture_score_settlements: { rating: 8.09, touchline_points: 8.09, settlement_status: 'provisional', source_synced_at: '2026-09-27T00:01:00Z',
      touchline_points_breakdown: [{ providerEventId: 'rating:8.09', ruleCode: 'sportmonks-rating', factValue: 8.09, points: 8.09 }] },
  };
  const settlement = rows.touchline_player_fixture_score_settlements as { rating: number | null; touchline_points: number; touchline_points_breakdown: Array<{ points: number }> };
  if (options.legacyBand) { settlement.touchline_points = 5; settlement.touchline_points_breakdown[0].points = 5; }
  if (options.missingRating) settlement.rating = null;
  if (options.duplicateContribution) settlement.touchline_points_breakdown.push(settlement.touchline_points_breakdown[0]);
  if (options.hatTrick) {
    rows.football_fixture_events = hatEvents;
    (rows.football_fantasy_fixture_feeds as { events_payload: unknown }).events_payload = hatEvents
      .filter(item => item.provider_event_id !== options.removeConstituent)
      .map(item => ({ ...currentEvent,providerId:item.provider_event_id,minute:item.minute,result:item.result }));
  }
  if (options.extraFeedOrder) {
    (rows.football_fantasy_fixture_feeds as { events_payload: unknown[] }).events_payload.push({ ...currentEvent,providerId:'10',minute: options.extraFeedOrder === 'later' ? 80 : null,sortOrder:options.extraFeedOrder === 'only-sort' ? 80 : null });
  }
  let revisionReads = 0;
  const admin = { from(table: string) {
    assert.ok(table in rows, table);
    const query = { select: () => query, eq: () => query,
      in: () => Promise.resolve({ data: hatEvents.map(item => ({ event_provider_id:item.provider_event_id,confirmation_state:'CONFIRMED',stable_observation_count:2,event_fact_checksum:checksum.checksumTouchlineConfirmedEventFact({ fixtureId:'8',eventId:item.provider_event_id,eventKind:'goal',result:item.result,teamId:'1',playerId:'3',minute:item.minute,extraMinute:null }) })),error:null }),
      order: () => Promise.resolve({ data: rows[table], error: null }), maybeSingle: () => Promise.resolve({ data: rows[table], error: table === 'football_fantasy_fixture_feeds' && options.feedError ? { message:'synthetic failure' } : null }) };
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

test('V4 shared readers reject legacy 8.09-to-5 band points, missing rating and extra contribution', async () => {
  for (const options of [{legacyBand:true},{missingRating:true},{duplicateContribution:true}]) {
    for (const name of ['readTouchlineConfirmedEventPushSource','readTouchlineSocialConfirmedEventDraft'] as const) {
      const result = await harness(options)[name]('8','9');
      assert.equal(result.ok,false);
      assert.equal('evidence' in result,false);
    }
  }
});

test('current feed membership is mandatory for both shared consumers including score predecessor', async () => {
  for (const feedCase of ['missing','duplicate','rescinded','drift','wrong-fixture','predecessor-missing','canonical-predecessor-missing'] as const) {
    for (const name of ['readTouchlineConfirmedEventPushSource','readTouchlineSocialConfirmedEventDraft'] as const) {
      const result = await harness({ feedCase })[name]('8','9');
      assert.equal(result.ok,false, `${name}:${feedCase} must fail closed`);
    }
  }
});

test('hat-trick constituent absent from feed fails before approval; unrelated later history does not block', async () => {
  const rejected = await harness({ feedCase: 'predecessor-missing' }).readTouchlineConfirmedEventPushSource('8','9','HAT_TRICK_HERO');
  assert.equal(rejected.ok,false);
  if (!rejected.ok) assert.equal(rejected.reason,'current-event-feed-identity-conflict');
  assert.equal((await harness({ feedCase: 'irrelevant-later' }).readTouchlineConfirmedEventPushSource('8','9')).ok,true);
});

test('three confirmed current goals admit hat-trick, removal of each constituent rejects', async () => {
  const valid = await harness({ hatTrick:true }).readTouchlineConfirmedEventPushSource('8','9','HAT_TRICK_HERO');
  assert.equal(valid.ok,true,JSON.stringify(valid));
  for (const removeConstituent of ['7','8','9']) {
    const result = await harness({ hatTrick:true,removeConstituent }).readTouchlineConfirmedEventPushSource('8','9','HAT_TRICK_HERO');
    assert.equal(result.ok,false,removeConstituent);
    if (!result.ok) assert.equal(result.reason,'current-event-feed-identity-conflict');
  }
});
test('current penalty, own goal and red card remain admitted; feed read errors fail closed', async () => {
  for (const eventKind of ['penalty','own-goal','red-card'] as const) {
    const result = await harness({ eventKind }).readTouchlineConfirmedEventPushSource('8','9');
    assert.equal(result.ok,true,JSON.stringify(result));
  }
  const failed = await harness({ feedError:true }).readTouchlineConfirmedEventPushSource('8','9');
  assert.equal(failed.ok,false);
  if (!failed.ok) assert.equal(failed.reason,'current-event-feed-unavailable');
});
test('verified own-goal and penalty reader output reaches notification copy with unchanged rating', async () => {
  for (const eventKind of ['own-goal', 'penalty'] as const) {
    const result = await harness({ eventKind }).readTouchlineConfirmedEventPushSource('8', '9');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.contentType, 'GOAL_CONFIRMED');
    assert.equal(result.data.event.kind, eventKind);
    assert.equal(result.data.event.playerTeamId, '1');
    assert.equal(result.data.event.scoringTeamId, eventKind === 'own-goal' ? '2' : '1');
    assert.equal(result.data.touchlinePoints, 8.09);
    for (const locale of ['pt-BR', 'en-GB'] as const) {
      const payload = buildMatchEventNotification(result, locale);
      assert.ok(payload, `${eventKind}:${locale}`);
      const heading = eventKind === 'own-goal'
        ? (locale === 'pt-BR' ? 'Gol contra' : 'Own goal')
        : (locale === 'pt-BR' ? 'Gol de pênalti' : 'Penalty scored');
      assert.equal(payload.title, 'Home - Away');
      assert.equal(payload.body, `${heading} · 12′ · ${eventKind === 'own-goal' ? '0 - 1' : '1 - 0'} · Test Player`);
      assert.equal(payload.tag, 'fixture:8:event:9');
    }
    for (const feedCase of ['rescinded', 'drift', 'missing'] as const) {
      const rejected = await harness({ eventKind, feedCase }).readTouchlineConfirmedEventPushSource('8', '9');
      assert.equal(buildMatchEventNotification(rejected, 'en-GB'), null);
    }
  }
});

test('feed-only score with unknown relative order rejects, but known later event does not', async () => {
  for (const name of ['readTouchlineConfirmedEventPushSource','readTouchlineSocialConfirmedEventDraft'] as const) {
    for (const extraFeedOrder of ['unknown','only-sort'] as const) {
      const result = await harness({extraFeedOrder})[name]('8','9');
      assert.equal(result.ok,false);
      if (!result.ok) assert.equal(result.reason,'current-event-feed-score-context-conflict');
    }
    assert.equal((await harness({extraFeedOrder:'later'})[name]('8','9')).ok,true);
  }
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
