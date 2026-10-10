import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { TouchlineFixture } from '../lib/football-data/types.ts';
const root = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { persistLiveFixtureStates } = await import('../lib/football-data/live-fixture-store.ts');
const at = '2026-10-10T12:30:00.000Z';
const fixture = (id: string, score = 0): TouchlineFixture => ({ id: `sportmonks:${id}`, provider: 'sportmonks',
  providerId: id, startsAt: at, status: 'Live', homeScore: score, awayScore: 0,
  source: { provider: 'sportmonks', providerId: id } });

test('real live store returns only acknowledged rows; error and missing acknowledgement stay visible', async () => {
  const calls: string[] = [];
  const admin = { from(table: string) {
    assert.equal(table, 'football_fixtures');
    const filters: Record<string, unknown> = {};
    const query = {
      update(row: { home_score: number; source_updated_at: string }) {
        assert.equal(row.home_score, 3); assert.equal(row.source_updated_at, at); return query;
      },
      eq(key: string, value: unknown) { filters[key] = value; return query; },
      async select(columns: string) {
        assert.equal(columns, 'provider_fixture_id'); assert.equal(filters.provider, 'sportmonks');
        const id = String(filters.provider_fixture_id); calls.push(id);
        return id === '1' ? { data: [{ provider_fixture_id: id }], error: null }
          : id === '2' ? { data: null, error: { message: 'write-failed' } }
          : id === '4' ? { data: [{ provider_fixture_id: 'wrong' }], error: null }
          : id === '5' ? { data: [{ provider_fixture_id: id }, { provider_fixture_id: id }], error: null }
          : { data: id === '6' ? null : [], error: null };
      },
    }; return query;
  } } as unknown as Parameters<typeof persistLiveFixtureStates>[0];
  const result = await persistLiveFixtureStates(admin, ['1', '2', '3', '4', '5', '6'].map(id => fixture(id)),
    ['1', '2', '3', '4', '5', '6', '7'].map(id => fixture(id, 3)), at);
  assert.deepEqual(calls, ['1', '2', '3', '4', '5', '6'], 'Unknown fixture must not create a partial row');
  assert.equal(result.updated, 1);
  assert.deepEqual(result.merged.map(f => f.providerId), ['1']);
  assert.equal(result.merged[0].homeScore, 3);
  assert.deepEqual(result.errors, ['2:write-failed', '3:write-unconfirmed', '4:write-unconfirmed', '5:write-unconfirmed', '6:write-unconfirmed']);
});
