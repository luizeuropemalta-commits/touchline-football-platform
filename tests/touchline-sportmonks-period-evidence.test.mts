import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import { clearFootballDataCache } from '../lib/football-data/cache.ts';
import { sanitizeProviderPayloadForPersistence } from '../lib/football-data/provider-payload-sanitize.ts';
import { matchPushLiveEventWindow } from '../lib/touchlineArena/match-push-live-event-window.ts';

const root = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { SportmonksFootballProvider } = await import('../lib/football-data/providers/sportmonks.ts');
const period = { id: 77, fixture_id: 8, type_id: 1, started: 1782765014, ended: null,
  counts_from: 0, ticking: true, sort_order: 1, minutes: 23, seconds: 42, has_timer: true,
  description: '1st-half', image_path: 'https://sportmonks.com/private.png', api_token: 'synthetic-secret' };

async function mapped(periods: unknown, events: unknown = [{ id: 9, fixture_id: 8, period_id: 77, type: { name: 'Goal' }, minute: 23 }], sanitize = true) {
  const original = globalThis.fetch;
  clearFootballDataCache();
  const provider = new SportmonksFootballProvider();
  Object.assign(provider, { token: () => 'synthetic-token', baseUrl: () => 'https://sportmonks.invalid/v3/football' });
  let calls = 0;
  globalThis.fetch = async input => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.pathname, '/v3/football/fixtures/8');
    assert.ok(url.searchParams.get('include')?.split(';').includes('periods'));
    return new Response(JSON.stringify({ data: { id: 8, periods, events, api_token: 'synthetic-secret' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await provider.getFixtureFantasyFeed('8');
    assert.equal(result.ok, true);
    assert.ok(result.data);
    assert.equal(calls, 1);
    return sanitize ? sanitizeProviderPayloadForPersistence(result.data) : result.data;
  } finally { globalThis.fetch = original; clearFootballDataCache(); }
}

test('real feed mapping preserves allowlisted period facts through persistence sanitizer', async () => {
  const feed = await mapped([period]);
  assert.deepEqual(JSON.parse(JSON.stringify(feed.fixture.periods)), [{ providerId: '77', fixtureId: '8', typeId: '1',
    started: 1782765014, countsFrom: 0, ticking: true, sortOrder: 1, minutes: 23, seconds: 42, hasTimer: true }]);
  assert.equal(feed.events[0].periodId, '77');
  assert.equal(feed.fixture.liveMinute, 23);
  assert.equal(feed.fixture.liveSecond, 42);
  assert.equal(feed.fixture.livePeriod, '1st-half');
  assert.doesNotMatch(JSON.stringify(feed), /"raw"|image_path|api_token|synthetic-secret|sportmonks\.com/);
});

test('mapped persisted provider clocks admit recent events with zero extra time, not baseline or future events', async () => {
  const baselineFeed = await mapped([{ ...period, minutes: 20, seconds: 30 }]);
  const feed = await mapped([period], [
    { id: 9, fixture_id: 8, period_id: 77, type: { name: 'Goal' }, minute: 22, extra_minute: 0 },
    { id: 10, fixture_id: 8, period_id: 77, type: { name: 'Goal' }, minute: 20, extra_minute: 0 },
    { id: 11, fixture_id: 8, period_id: 77, type: { name: 'Goal' }, minute: 24, extra_minute: 0 },
  ]);
  assert.ok(baselineFeed.fixture.periods?.[0]);
  assert.ok(feed.fixture.periods?.[0]);
  const evaluate = (event: typeof feed.events[number]) => matchPushLiveEventWindow({
    fixtureId: feed.fixture.providerId, live: true, confirmed: true,
    baseline: baselineFeed.fixture.periods![0], current: feed.fixture.periods![0],
    periods: feed.fixture.periods!, event, maximumEventLagSeconds: 120,
  });
  assert.equal(feed.events[0].extraMinute, 0);
  assert.equal(evaluate(feed.events[0]).status, 'eligible');
  assert.equal(evaluate(feed.events[1]).reason, 'at-or-before-baseline-minute');
  assert.equal(evaluate(feed.events[2]).reason, 'minute-not-fully-observed');
  // Confirmation and fixture freshness are deliberately not inferred from this
  // clock-only composition; the runtime admission boundary still owns them.
});

test('actual feed persistence writes typed period evidence but never raw provider data', async () => {
  const feed = await mapped([period], undefined, false);
  assert.match(JSON.stringify(feed), /synthetic-secret/);
  const writes: Array<{ table: string; row: Record<string, unknown>; options: unknown }> = [];
  let reconciled = 0;
  const dependencies: Record<string, unknown> = {
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: (table: string) => ({
      upsert: async (row: Record<string, unknown>, options: unknown) => { writes.push({ table, row, options }); return { error: null }; },
    }) }) },
    '@/lib/football-data/provider-payload-sanitize': { sanitizeProviderPayloadForPersistence },
    '@/lib/football-data/card-engine-provisional-lineup-sync': {
      reconcileTouchlineProvisionalShirtsFromOfficialLineup: async ({ feed: saved }: { feed: unknown }) => {
        reconciled++;
        assert.doesNotMatch(JSON.stringify(saved), /"raw"|synthetic-secret|image_path|api_token/);
        return { reconciled: true };
      },
    },
  };
  const exports = {};
  const source = readFileSync(new URL('../lib/football-data/fantasy-store.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Date, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const store = exports as typeof import('../lib/football-data/fantasy-store');
  assert.equal((await store.persistFantasyFixtureFeed(feed)).persisted, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, 'football_fantasy_fixture_feeds');
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].options)), { onConflict: 'provider,provider_fixture_id' });
  const row = JSON.parse(JSON.stringify(writes[0].row));
  assert.equal(row.fixture_payload.periods[0].providerId, '77');
  assert.equal(row.fixture_payload.periods[0].minutes, 23);
  assert.equal(row.events_payload[0].periodId, '77');
  assert.doesNotMatch(JSON.stringify(row), /"raw"|synthetic-secret|image_path|api_token/);
  assert.equal(reconciled, 1);
});

test('invalid optional facts are absent without coercion or description inference', async () => {
  const feed = await mapped([{ ...period, started: '1782765014', ended: -1, counts_from: 0.5,
    ticking: 'true', sort_order: 0, minutes: Number.MAX_SAFE_INTEGER + 1, seconds: 60, has_timer: 1 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(feed.fixture.periods)), [{ providerId: '77', fixtureId: '8', typeId: '1' }]);
  // Existing permissive display mapping remains independent of evidence.
  assert.equal(feed.fixture.liveSecond, 60);
});

test('missing, duplicate and foreign period identities cannot become event evidence', async () => {
  for (const periods of [undefined, [], [null], [false], [period, null], [period, period], [{ ...period, fixture_id: 99 }],
    [{ ...period, fixture_id: undefined }], [{ ...period, id: 0 }], [{ ...period, type_id: true }]]) {
    const feed = await mapped(periods);
    assert.equal(feed.fixture.periods, undefined);
    assert.equal(feed.events[0].periodId, undefined);
  }
  const feed = await mapped([period], [
    { id: 9, fixture_id: 99, period_id: 77 }, { id: 10, fixture_id: 8, period_id: 999 },
    { id: 11, fixture_id: 8, period_id: '077' }, { period_id: 77 }, { id: 12, fixture_id: null, period_id: 77 },
  ]);
  assert.ok(feed.events.every(event => event.periodId === undefined));
});
