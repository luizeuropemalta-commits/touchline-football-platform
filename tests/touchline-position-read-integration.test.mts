import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { setAdmin } from './fixtures/position-read-admin.mts';

const root = new URL('../', import.meta.url);
registerHooks({ resolve(name, context, next) {
  if (name === 'server-only') return next(new URL('tests/fixtures/server-only.mts', root).href, context);
  if (name === 'next/cache') return next(new URL('tests/fixtures/position-read-cache.mts', root).href, context);
  if (name === '@/lib/supabase/admin') return next(new URL('tests/fixtures/position-read-admin.mts', root).href, context);
  if (name.startsWith('@/')) return next(new URL(`${name.slice(2)}.ts`, root).href, context);
  return next(name, context);
}});
globalThis.fetch = async () => { throw new Error('Network forbidden'); };
process.env.TOUCHLINE_CARD_PUBLICATION_GATE = 'enabled';
const { loadTouchlinePublicPlayerProjections } = await import('../lib/touchlineArena/market-value-read-model.ts');
const { readPublicPremierSquad } = await import('../lib/football-data/public-premier-squad-server.ts');
type Row = Record<string, unknown>;
const playerId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fixture(overrideStatus: string) {
  const stamp = new Date().toISOString();
  const tables: Record<string, Row[]> = {
    football_clubs: [{ id: 'club', provider: 'sportmonks', provider_team_id: '8', name: 'Liverpool FC', competition_id: 'competition' }],
    football_competitions: [{ id: 'competition', provider_competition_id: '8' }],
    football_players: [], football_squad_members: [], football_player_market_values: [], touchline_card_publications: [],
    touchline_card_editorial_overrides: [{ player_id: playerId(1), field_key: 'position', touchline_override: { value: 'Right Back' }, status: overrideStatus }],
  };
  for (let n = 1; n <= 11; n++) {
    const id = playerId(n);
    tables.football_players!.push({ id, provider: 'sportmonks', provider_player_id: String(n), current_club_id: 'club', name: `Synthetic ${n}`, nationality: 'England', position: 'Defender', source_updated_at: stamp });
    tables.football_squad_members!.push({ id: `membership-${n}`, player_id: id, provider: 'sportmonks', club_id: 'club', competition_id: 'competition', position: 'Defender', detailed_position: 'Left-Back', jersey_number: n, status: 'active', source_updated_at: stamp });
    tables.football_player_market_values!.push({ player_id: id, market_value_eur: 10000000, verified_season: '2026-27', status: 'verified', confidence: 'verified', last_verified: stamp });
    tables.touchline_card_publications!.push({ player_id: id, current_membership_id: `membership-${n}`, competition_id: 'competition', effective_season: '2026-27', publication_status: 'published', calculated_tier: 'ruby-red', calculated_nominal_price_gbp: 0, last_reviewed_at: stamp });
  }
  const reads: Array<{ table: string; columns: string }> = [];
  const admin = { from(table: string) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
    let columns = ''; let single = false;
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
      select(value: string) { columns = value; reads.push({ table, columns }); return query; },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query; },
      returns() { return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (value: { data: Row[] | Row | null; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
        assert.ok(columns && columns !== '*', 'Explicit select required');
        const data = tables[table]!.filter(row => filters.every(filter => filter(row))).map(row => Object.fromEntries(columns.split(',').map(key => [key.trim(), row[key.trim()]])));
        return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve, reject);
      },
    };
    return query;
  }};
  return { admin, reads };
}

test('real reader transports selected detail and refuses another club', async () => {
  const { admin, reads } = fixture('pending'); setAdmin(admin);
  const request = { providerPlayerIds: ['1'], providedAdmin: admin as never, context: { expectedClubProviderTeamId: '8' } };
  const result = await loadTouchlinePublicPlayerProjections(request);
  assert.equal(result.projections[0]?.membership.value?.position, 'Left Back');
  assert.ok(reads.some(read => read.table === 'football_squad_members' && read.columns.split(',').includes('detailed_position')));
  const refused = await loadTouchlinePublicPlayerProjections({ ...request, context: { expectedClubProviderTeamId: '9' } });
  assert.notEqual(refused.projections[0]?.membership.status, 'verified');
});

test('published public squad preserves approved override precedence only', async () => {
  for (const [status, expected] of [['approved', 'Right Back'], ['pending', 'Left Back']]) {
    const { admin } = fixture(status!); setAdmin(admin);
    const result = await readPublicPremierSquad('8', { providedAdmin: admin as never });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    if (!result.body.ok) throw new Error(result.body.error);
    assert.equal(result.body.players.length, 11);
    const player = result.body.players.find(row => row.providerId === '1');
    assert.equal(player?.position, expected);
    assert.ok(player?.editorialCard, 'Real ON publication reader must accept the fixture');
  }
});
