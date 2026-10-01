import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { touchlineLiveCoachForProviderId } from '../lib/touchlineArena/live-coaches.ts';
import type { TouchLineCoachRankingState } from '../lib/touchlineArena/coach-ranking-server.ts';

const source = readFileSync(new URL('../lib/touchlineArena/coach-ranking-server.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const ACTIVE = 'touchline_coach_ranking_active_snapshots';
const SNAPSHOTS = 'touchline_coach_ranking_snapshots';
const LEAGUE = 'touchline-england';
const SNAPSHOT_ID = 'coach-v2:synthetic-published-snapshot';
const SEASON_ID = '10000000-0000-4000-8000-000000000001';
const GENERATED_AT = '2026-10-01T10:00:00.000Z';
type Row = Record<string, unknown>;
type Read = { table: string; columns: string; filters: Array<[string, unknown]> };

const EMPTY = {
  phase: 'unavailable', snapshotId: null, seasonId: null, scoringVersion: null,
  fixtureIds: [], generatedAt: null, rows: [],
};

function snapshot(): Row {
  return {
    snapshot_id: SNAPSHOT_ID, league_key: LEAGUE, season_id: SEASON_ID,
    scoring_version: 'coach_scoring_v2', fixture_ids: ['synthetic-fixture-1', 'synthetic-fixture-2'],
    generated_at: GENERATED_AT, checksum: 'private-checksum-not-for-the-DTO',
    ranking_payload: [
      {
        rank: 1, coachProviderId: '307', coachName: 'Untrusted persisted display name', clubName: 'Arsenal FC',
        touchlinePoints: 9, wins: 2, draws: 0, losses: 0, awayWins: 1,
        home: { wins: 1, draws: 0, losses: 0, touchlinePoints: 3 },
        away: { wins: 1, draws: 0, losses: 0, touchlinePoints: 6 },
        contractId: 'private-contract', userId: 'private-user',
      },
      {
        rank: 2, coachProviderId: '455907', clubName: 'Aston Villa',
        touchlinePoints: 2, wins: 1, draws: 0, losses: 1, awayWins: 0,
        home: { wins: 1, draws: 0, losses: 0, touchlinePoints: 3 },
        away: { wins: 0, draws: 0, losses: 1, touchlinePoints: -1 },
      },
    ],
  };
}

function active(): Row {
  return { league_key: LEAGUE, snapshot_id: SNAPSHOT_ID, snapshot: snapshot() };
}

// Projection is performed by the fake boundary, not ignored: an omitted
// embedded select cannot accidentally receive a complete snapshot. Support
// the old flat read as well so its positive RED is the extra round trip.
function project(row: Row, columns: string): Row {
  const compact = columns.replace(/\s/g, '');
  assert.ok(!compact.includes('*'), 'Reader must select an explicit public-field allowlist');
  const relation = compact.match(/snapshot:touchline_coach_ranking_snapshots(?:![\w]+)*\(([^()]*)\)/);
  const flat = relation ? compact.replace(relation[0], '') : compact;
  assert.ok(!/[():]/.test(flat), `Unexpected relational selection: ${columns}`);
  const result = Object.fromEntries(flat.split(',').filter(Boolean).map(key => [key, row[key]]));
  if (relation) {
    const embedded = row.snapshot;
    result.snapshot = embedded && typeof embedded === 'object' && !Array.isArray(embedded)
      ? project(embedded as Row, relation[1]!) : embedded;
  }
  return result;
}

function harness(options: { active?: unknown; error?: unknown; noAdmin?: boolean } = {}) {
  const activeValue = Object.hasOwn(options, 'active') ? options.active : active();
  const reads: Read[] = [];
  const admin = { from(table: string) {
    assert.ok(table === ACTIVE || table === SNAPSHOTS, `Unexpected table ${table}`);
    const read: Read = { table, columns: '', filters: [] };
    const query = {
      select(columns: string) { read.columns = columns; return query; },
      eq(key: string, value: unknown) { read.filters.push([key, value]); return query; },
      async maybeSingle() {
        reads.push(read);
        assert.ok(read.columns, 'Missing select');
        assert.ok(read.filters.some(([key, value]) => key === 'league_key' && value === LEAGUE), 'Every root read must be league scoped');
        // This fallback is deliberately available to the predecessor reader.
        // Malformed embedded relations must not be repaired by a second query.
        const raw = table === ACTIVE ? activeValue : snapshot();
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { data: raw, error: options.error ?? null };
        assert.ok(read.filters.every(([key]) => !key.includes('.')), 'Harness expects explicit embedded identity/league validation, not an ignored relation filter');
        const row = raw as Row;
        const matched = read.filters.every(([key, value]) => row[key] === value);
        return { data: matched ? project(row, read.columns) : null, error: options.error ?? null };
      },
    };
    return query;
  } };
  const exports: { loadTouchLineCoachRanking?: () => Promise<TouchLineCoachRankingState> } = {};
  vm.runInNewContext(javascript, {
    exports,
    require(name: string) {
      if (name === 'server-only') return {};
      // A fresh VM represents a fresh request. This identity cache fake does
      // not claim to test React's request deduplication implementation.
      if (name === 'react') return { cache: (fn: unknown) => fn };
      if (name === '@/lib/supabase/admin') return { createAdminClient: () => options.noAdmin ? null : admin };
      if (name === './live-coaches') return { touchlineLiveCoachForProviderId };
      throw new Error(`Unexpected dependency ${name}`);
    },
    fetch() { throw new Error('Network forbidden'); },
  });
  assert.equal(typeof exports.loadTouchLineCoachRanking, 'function');
  return {
    reads,
    async load() {
      // Normalize cross-realm prototypes only; preserve the entire public DTO.
      return JSON.parse(JSON.stringify(await exports.loadTouchLineCoachRanking!())) as TouchLineCoachRankingState;
    },
  };
}

test('coach ranking reads active -> snapshot once and preserves its complete public V2 composition', async () => {
  const h = harness();
  const result = await h.load();
  assert.deepEqual(result, {
    phase: 'ranked', snapshotId: SNAPSHOT_ID, seasonId: SEASON_ID, scoringVersion: 'coach_scoring_v2',
    fixtureIds: ['synthetic-fixture-1', 'synthetic-fixture-2'], generatedAt: GENERATED_AT,
    rows: [
      { rank: 1, coachProviderId: '307', coachName: 'Mikel Arteta', clubName: 'Arsenal FC', touchlinePoints: 9, wins: 2, draws: 0, losses: 0, awayWins: 1,
        home: { wins: 1, draws: 0, losses: 0, touchlinePoints: 3 }, away: { wins: 1, draws: 0, losses: 0, touchlinePoints: 6 } },
      { rank: 2, coachProviderId: '455907', coachName: 'Unai Emery', clubName: 'Aston Villa', touchlinePoints: 2, wins: 1, draws: 0, losses: 1, awayWins: 0,
        home: { wins: 1, draws: 0, losses: 0, touchlinePoints: 3 }, away: { wins: 0, draws: 0, losses: 1, touchlinePoints: -1 } },
    ],
  });
  assert.equal(h.reads.length, 1, 'The predecessor performs two serial reads; the relation must remove that round trip');
  assert.equal(h.reads[0]?.table, ACTIVE);
  const relation = h.reads[0]!.columns.replace(/\s/g, '').match(/snapshot:touchline_coach_ranking_snapshots(?:![\w]+)*\(([^()]*)\)/);
  assert.ok(relation, 'The active query must explicitly request the snapshot alias');
  assert.deepEqual(relation[1]!.split(',').sort(), [
    'snapshot_id', 'league_key', 'season_id', 'scoring_version', 'fixture_ids', 'generated_at', 'ranking_payload',
  ].sort());
  assert.doesNotMatch(JSON.stringify(result), /private-contract|private-user|private-checksum|Untrusted persisted/);
});

const invalidRelations: Array<[string, () => unknown]> = [
  ['no active pointer', () => null],
  ['blank active pointer', () => ({ ...active(), snapshot_id: ' ' })],
  ['missing embedded snapshot', () => ({ league_key: LEAGUE, snapshot_id: SNAPSHOT_ID })],
  ['null embedded snapshot', () => ({ ...active(), snapshot: null })],
  ['unexpected to-many array', () => ({ ...active(), snapshot: [snapshot()] })],
  ['empty relation array', () => ({ ...active(), snapshot: [] })],
  ['scalar relation', () => ({ ...active(), snapshot: SNAPSHOT_ID })],
  ['different embedded snapshot identity', () => ({ ...active(), snapshot: { ...snapshot(), snapshot_id: 'another-snapshot' } })],
  ['missing embedded snapshot identity', () => ({ ...active(), snapshot: { ...snapshot(), snapshot_id: null } })],
  ['different embedded league', () => ({ ...active(), snapshot: { ...snapshot(), league_key: 'another-league' } })],
  ['missing embedded league', () => ({ ...active(), snapshot: { ...snapshot(), league_key: undefined } })],
  ['different active league', () => ({ ...active(), league_key: 'another-league' })],
];
for (const [label, make] of invalidRelations) {
  test(`coach ranking fails closed: ${label}`, async () => {
    const h = harness({ active: make() });
    assert.deepEqual(await h.load(), EMPTY);
    assert.equal(h.reads.length, 1, 'No repair/fallback lookup may escape the active relation');
  });
}

test('a returned database error rejects even an otherwise populated relation', async () => {
  const h = harness({ error: { message: 'Synthetic read error' } });
  assert.deepEqual(await h.load(), EMPTY);
  assert.equal(h.reads.length, 1);
});

test('missing server admin remains unavailable without a query', async () => {
  const h = harness({ noAdmin: true });
  assert.deepEqual(await h.load(), EMPTY);
  assert.equal(h.reads.length, 0);
});

const invalidSnapshots: Array<[string, (value: Row) => void]> = [
  ['player V4 is not coach V2', value => { value.scoring_version = 'player_scoring_v4'; }],
  ['old coach V1 is not active V2', value => { value.scoring_version = 'coach_scoring_v1'; }],
  ['missing version', value => { delete value.scoring_version; }],
  ['non-array fixtures', value => { value.fixture_ids = null; }],
  ['non-array payload', value => { value.ranking_payload = {}; }],
  ['null ranking row', value => { (value.ranking_payload as unknown[])[0] = null; }],
  ['unknown coach identity', value => { (value.ranking_payload as Row[])[0]!.coachProviderId = 'not-a-canonical-coach'; }],
  ['duplicate coach identity', value => { (value.ranking_payload as Row[])[1]!.coachProviderId = '307'; }],
  ['non-contiguous rank', value => { (value.ranking_payload as Row[])[1]!.rank = 3; }],
  ['non-integral coach points', value => { (value.ranking_payload as Row[])[0]!.touchlinePoints = 9.1; }],
  ['missing home record', value => { delete (value.ranking_payload as Row[])[0]!.home; }],
  ['unexpected away array', value => { (value.ranking_payload as Row[])[0]!.away = []; }],
  ...['wins', 'draws', 'losses', 'touchlinePoints', 'awayWins'].map((field): [string, (value: Row) => void] => [
    `home/away aggregate disagrees on ${field}`,
    value => { const row = (value.ranking_payload as Row[])[0]!; row[field] = Number(row[field]) + 1; },
  ]),
];
for (const [label, mutate] of invalidSnapshots) {
  test(`the whole coach snapshot fails closed: ${label}`, async () => {
    const value = snapshot(); mutate(value);
    const h = harness({ active: { ...active(), snapshot: value } });
    assert.deepEqual(await h.load(), EMPTY, 'Do not silently retain only valid rows from an inconsistent ranking');
    assert.equal(h.reads.length, 1);
  });
}

test('a valid published empty ranking preserves existing empty-snapshot semantics', async () => {
  const h = harness({ active: { ...active(), snapshot: { ...snapshot(), ranking_payload: [], fixture_ids: [] } } });
  assert.deepEqual(await h.load(), {
    phase: 'ranked', snapshotId: SNAPSHOT_ID, seasonId: SEASON_ID, scoringVersion: 'coach_scoring_v2',
    fixtureIds: [], generatedAt: GENERATED_AT, rows: [],
  });
  assert.equal(h.reads.length, 1);
});
