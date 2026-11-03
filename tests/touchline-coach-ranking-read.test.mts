import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as catalogueContract from '../lib/touchlineArena/coach-catalogue-contract.ts';
import type { TouchLineCoachRankingState } from '../lib/touchlineArena/coach-ranking-server.ts';

const source = readFileSync(new URL('../lib/touchlineArena/coach-ranking-snapshot-server.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const SNAPSHOTS = 'touchline_coach_ranking_snapshots';
const LEAGUE = 'touchline-england';
const SNAPSHOT_ID = 'coach-v2:synthetic-published-snapshot';
const SEASON_ID = '10000000-0000-4000-8000-000000000001';
const GENERATED_AT = '2026-10-01T10:00:00.000Z';
type Row = Record<string, unknown>;
type Read = { table: string; columns: string; filters: Array<[string, unknown]> };

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

function harness(options: { snapshot?: unknown; error?: unknown; catalogue?: catalogueContract.CoachCatalogue } = {}) {
  const row = Object.hasOwn(options, 'snapshot') ? options.snapshot : snapshot();
  const reads: Read[] = [];
  const admin = { from(table: string) {
    assert.equal(table, SNAPSHOTS, 'No independently active pointer or fallback table');
    const read: Read = { table, columns: '', filters: [] };
    const query = {
      select(columns: string) { read.columns = columns; return query; },
      eq(key: string, value: unknown) { read.filters.push([key, value]); return query; },
      async maybeSingle() {
        reads.push(read);
        assert.equal(read.columns.includes('*'), false);
        assert.deepEqual(read.filters, [['snapshot_id', SNAPSHOT_ID], ['league_key', LEAGUE]]);
        const projected = row && typeof row === 'object' && !Array.isArray(row)
          ? Object.fromEntries(read.columns.split(',').map(key => [key, (row as Row)[key]])) : row;
        return { data: projected, error: options.error ?? null };
      },
    };
    return query;
  } };
  const exports: { readTouchlineCoachRankingSnapshot?: (admin: unknown, id: string) => Promise<TouchLineCoachRankingState> } = {};
  vm.runInNewContext(javascript, {
    exports,
    require(name: string) {
      if (name === 'server-only' || name === '@/lib/supabase/admin') return {};
      if (name === './coach-catalogue-contract') return catalogueContract;
      if (name === './coach-catalogue-server') return { loadCoachCatalogue: async () => options.catalogue ?? catalogueContract.legacyCoachCatalogue() };
      throw new Error(`Unexpected dependency ${name}`);
    },
    fetch() { throw new Error('Network forbidden'); },
  });
  return { reads, async load() {
    return JSON.parse(JSON.stringify(await exports.readTouchlineCoachRankingSnapshot!(admin, SNAPSHOT_ID))) as TouchLineCoachRankingState;
  } };
}

test('coach ranking reads the immutable publication ID once and preserves its complete public V2 composition', async () => {
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
  assert.equal(h.reads.length, 1);
  assert.deepEqual(h.reads[0]!.columns.split(',').sort(), [
    'snapshot_id', 'league_key', 'season_id', 'scoring_version', 'fixture_ids', 'generated_at', 'ranking_payload',
  ].sort());
  assert.doesNotMatch(JSON.stringify(result), /private-contract|private-user|private-checksum|Untrusted persisted/);
});

for (const [label, row] of [
  ['missing', null], ['array', []], ['scalar', 'not-a-row'],
  ['wrong identity', { ...snapshot(), snapshot_id: 'newer-active-pointer' }],
  ['wrong league', { ...snapshot(), league_key: 'other-league' }],
  ['invalid timestamp', { ...snapshot(), generated_at: 'not-a-date' }],
  ['duplicate coverage', { ...snapshot(), fixture_ids: ['fixture', 'fixture'] }],
  ['blank coverage', { ...snapshot(), fixture_ids: [' '] }],
] as Array<[string, unknown]>) test(`pinned coach snapshot fails closed: ${label}`, async () => {
  const h = harness({ snapshot: row });
  await assert.rejects(h.load(), /TOUCHLINE_PINNED_COACH_RANKING_INVALID/);
  assert.equal(h.reads.length, 1);
});

test('database error never becomes a successful unavailable ranking', async () => {
  await assert.rejects(harness({ error: { message: 'private' } }).load(), /TOUCHLINE_PINNED_COACH_RANKING_UNAVAILABLE/);
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
    const h = harness({ snapshot: value });
    await assert.rejects(h.load(), /TOUCHLINE_PINNED_COACH_RANKING_INVALID/, 'Do not silently retain only valid rows from an inconsistent ranking');
    assert.equal(h.reads.length, 1);
  });
}

test('a valid published empty ranking preserves existing empty-snapshot semantics', async () => {
  const h = harness({ snapshot: { ...snapshot(), ranking_payload: [], fixture_ids: [] } });
  assert.deepEqual(await h.load(), {
    phase: 'ranked', snapshotId: SNAPSHOT_ID, seasonId: SEASON_ID, scoringVersion: 'coach_scoring_v2',
    fixtureIds: [], generatedAt: GENERATED_AT, rows: [],
  });
  assert.equal(h.reads.length, 1);
});


test('enabled catalogue outage cannot silently fall back to static identity', async () => {
  await assert.rejects(harness({ catalogue: catalogueContract.UNAVAILABLE_COACH_CATALOGUE }).load(), /TOUCHLINE_PINNED_COACH_RANKING_INVALID/);
});
test('published dynamic identity is admitted to the exact ranking without changing its fixture totals', async () => {
  const original = catalogueContract.legacyCoachCatalogue();
  const entry = original.current[0];
  const replacement = { ...entry, coach: { ...entry.coach, id: 'sportmonks:99991', providerId: '99991', name: 'Synthetic coach', displayName: 'Synthetic coach' }, classification: { ...entry.classification, coachProviderId: '99991' } };
  const catalogue = { ...original, phase: 'ready' as const, revision: 4, current: [replacement, ...original.current.slice(1)], history: [...original.history, replacement] };
  const value = snapshot();
  (value.ranking_payload as Row[])[0].coachProviderId = '99991';
  const result = await harness({ snapshot: value, catalogue }).load();
  assert.equal(result.phase, 'ranked'); assert.equal(result.rows[0].coachName, 'Synthetic coach');
  assert.equal(result.rows[0].touchlinePoints, 9); assert.equal(result.rows[0].wins, 2);
  assert.equal(result.catalogue?.revision, 4);
});
