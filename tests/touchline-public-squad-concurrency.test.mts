import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';
import { setAdmin } from './fixtures/position-read-admin.mts';

// Use the same real reader/dependency graph and projected-query fake as the
// position-read integration tests. Only the database/cache/network boundaries
// are replaced; neither publication nor editorial composition is mocked.
const root = new URL('../', import.meta.url);
const hooks = registerHooks({ resolve(name, context, next) {
  if (name === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  if (name === 'next/cache') return next(new URL('tests/fixtures/position-read-cache.mts', root).href, context);
  if (name === '@/lib/supabase/admin') return next(new URL('tests/fixtures/position-read-admin.mts', root).href, context);
  if (name.startsWith('@/')) return next(new URL(`${name.slice(2)}.ts`, root).href, context);
  return next(name, context);
} });
const originalFetch = globalThis.fetch;
const originalGate = process.env.TOUCHLINE_CARD_PUBLICATION_GATE;
globalThis.fetch = async () => { throw new Error('Network forbidden'); };
after(() => {
  globalThis.fetch = originalFetch;
  if (originalGate === undefined) delete process.env.TOUCHLINE_CARD_PUBLICATION_GATE;
  else process.env.TOUCHLINE_CARD_PUBLICATION_GATE = originalGate;
  setAdmin(undefined);
  hooks.deregister();
});
const { readPublicPremierSquad } = await import('../lib/football-data/public-premier-squad-server.ts');

type Row = Record<string, unknown>;
type Branch = 'publication' | 'editorial';
type Failure = 'response' | Error;
const stamp = new Date().toISOString();
const playerId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

function fixture(failures: Partial<Record<Branch, Failure>> = {}, published = true) {
  const gates = { publication: latch(), editorial: latch() };
  const starts = { publication: 0, editorial: 0 };
  const tables: Record<string, Row[]> = {
    football_clubs: [{ id: 'club', provider: 'sportmonks', provider_team_id: '8', name: 'Liverpool FC', competition_id: 'competition' }],
    football_competitions: [{ id: 'competition', provider_competition_id: '8' }],
    football_players: [], football_squad_members: [], football_player_market_values: [], touchline_card_publications: [],
    touchline_card_editorial_overrides: [{ player_id: playerId(1), field_key: 'position', touchline_override: { value: 'Right Back' }, status: 'approved' }],
  };
  // The real persisted-squad reader requires a coherent XI, not a one-row stub.
  for (let n = 1; n <= 11; n++) {
    const id = playerId(n);
    tables.football_players!.push({ id, provider: 'sportmonks', provider_player_id: String(n), current_club_id: 'club', name: `Synthetic ${n}`, nationality: 'England', position: 'Defender', source_updated_at: stamp });
    tables.football_squad_members!.push({ id: `membership-${n}`, player_id: id, provider: 'sportmonks', club_id: 'club', competition_id: 'competition', position: 'Defender', detailed_position: 'Left-Back', jersey_number: n, status: 'active', source_updated_at: stamp });
    tables.football_player_market_values!.push({ player_id: id, market_value_eur: 10000000, verified_season: '2026-27', status: 'verified', confidence: 'verified', last_verified: stamp });
    if (published) tables.touchline_card_publications!.push({ player_id: id, current_membership_id: `membership-${n}`, competition_id: 'competition', effective_season: '2026-27', publication_status: 'published', calculated_tier: 'ruby-red', calculated_nominal_price_gbp: 0, last_reviewed_at: stamp });
  }
  const reads: Array<{ table: string; columns: string }> = [];
  const admin = { from(table: string) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
    let columns = '';
    let single = false;
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
      select(value: string) { columns = value; return query; },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query; },
      returns() { return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (value: { data: Row[] | Row | null; error: null | { message: string } }) => unknown, reject?: (reason: unknown) => unknown) {
        assert.ok(columns && columns !== '*', 'Explicit select required');
        reads.push({ table, columns });
        // Publication also reads effective/provenance overrides. Do not hold
        // that different query or substitute it for identity overrides.
        const branch: Branch | null = table === 'touchline_card_publications' ? 'publication'
          : table === 'touchline_card_editorial_overrides' && columns.split(',').includes('touchline_override') ? 'editorial' : null;
        if (branch) starts[branch]++;
        return (branch ? gates[branch].promise : Promise.resolve()).then(() => {
          const failure = branch ? failures[branch] : undefined;
          if (failure instanceof Error) throw failure;
          if (failure === 'response') return { data: null, error: { message: 'Synthetic query failure' } };
          const data = tables[table]!.filter(row => filters.every(filter => filter(row)))
            .map(row => Object.fromEntries(columns.split(',').map(key => [key.trim(), row[key.trim()]])));
          return { data: single ? data[0] ?? null : data, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { admin, gates, starts, reads, releaseAll() { gates.publication.release(); gates.editorial.release(); } };
}

function begin(f: ReturnType<typeof fixture>, gate = true) {
  process.env.TOUCHLINE_CARD_PUBLICATION_GATE = gate ? 'enabled' : 'disabled';
  setAdmin(f.admin);
  let settled = false;
  const result = readPublicPremierSquad('8', { providedAdmin: f.admin as never });
  // Observe rejection immediately, including tests where its sibling is held.
  const outcome = result.then(value => { settled = true; return { ok: true as const, value }; },
    error => { settled = true; return { ok: false as const, error }; });
  return { result, outcome, settled: () => settled };
}

function assertRoster(result: Awaited<ReturnType<typeof readPublicPremierSquad>>, position = 'Right Back', publication = true) {
  assert.equal(result.status, 200);
  assert.deepEqual(result.headers, { 'Cache-Control': 'private, no-store' });
  assert.ok(result.body.ok);
  assert.equal(result.body.rosterPlayers.length, 11);
  assert.equal(new Set(result.body.rosterPlayers.map(player => player.canonicalPlayerId)).size, 11);
  const first = result.body.rosterPlayers.find(player => player.providerId === '1');
  assert.equal(first?.canonicalPlayerId, playerId(1));
  assert.equal(first?.position, position);
  for (const player of result.body.rosterPlayers) assert.equal(Boolean(player.editorialCard), publication);
}

for (const first of ['editorial', 'publication'] as const) {
  test(`public squad starts both reads and waits for both: ${first} finishes first`, { timeout: 5000 }, async () => {
    const reference = fixture(); reference.releaseAll();
    const expected = await begin(reference).result;
    assertRoster(expected);
    const f = fixture(); const read = begin(f);
    try {
      await turn();
      assert.equal(f.starts.publication, 1);
      assert.equal(f.starts.editorial, 1, 'Editorial read must start while publication is still pending');
      assert.equal(read.settled(), false);
      f.gates[first].release();
      await turn();
      assert.equal(read.settled(), false, 'A completed sibling must not expose a partial roster');
      f.releaseAll();
      const actual = await read.result;
      assertRoster(actual);
      assert.deepEqual(actual, expected, 'Scheduling must not change the complete public DTO');
      const readKeys = (reads: typeof f.reads) => reads.map(({ table, columns }) => `${table}:${columns}`).sort();
      assert.deepEqual(readKeys(f.reads), readKeys(reference.reads), 'Same queries, no duplicate read');
    } finally { f.releaseAll(); await read.outcome; }
  });
}

test('publication gate OFF issues no publication query and still waits for approved identity overrides', { timeout: 5000 }, async () => {
  const f = fixture(); const read = begin(f, false);
  try {
    await turn();
    assert.equal(f.starts.publication, 0);
    assert.equal(f.starts.editorial, 1);
    assert.equal(read.settled(), false);
    f.gates.editorial.release();
    const result = await read.result;
    assertRoster(result);
    assert.ok(result.body.ok);
    assert.ok(result.body.rosterPlayers.every(player => player.source === 'touchline_legacy_verified'));
    assert.equal(f.starts.publication, 0);
  } finally { f.releaseAll(); await read.outcome; }
});

test('missing publications preserve roster identity but never invent published cards', { timeout: 5000 }, async () => {
  const f = fixture({}, false); f.releaseAll();
  assertRoster(await begin(f).result, 'Right Back', false);
});

for (const branch of ['publication', 'editorial'] as const) {
  test(`${branch} response error preserves the existing fail-closed fallback`, { timeout: 5000 }, async () => {
    const f = fixture({ [branch]: 'response' }); f.releaseAll();
    assertRoster(await begin(f).result, branch === 'editorial' ? 'Left Back' : 'Right Back', branch !== 'publication');
  });

  test(`${branch} early rejection is propagated while the sibling is pending; late sibling rejection is observed`, { timeout: 5000 }, async () => {
    const other: Branch = branch === 'publication' ? 'editorial' : 'publication';
    const early = new Error(`Synthetic early ${branch} rejection`);
    const late = new Error(`Synthetic late ${other} rejection`);
    const f = fixture({ [branch]: early, [other]: late }); const read = begin(f);
    try {
      await turn();
      assert.deepEqual(f.starts, { publication: 1, editorial: 1 });
      f.gates[branch].release();
      await turn();
      assert.equal(read.settled(), true, 'Do not defer a real rejection behind a pending sibling');
      const outcome = await read.outcome;
      assert.equal(outcome.ok, false);
      if (outcome.ok) assert.fail('Expected reader rejection');
      assert.equal(outcome.error, early);
      f.gates[other].release();
      // Node's test runner rejects unhandled asynchronous rejections. The fake
      // does not independently catch this late error on behalf of production.
      await turn();
    } finally { f.releaseAll(); await read.outcome; await turn(); }
  });
}
