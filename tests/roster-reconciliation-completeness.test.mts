import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { clearFootballDataCache } from '../lib/football-data/cache.ts';
const root = new URL('../', import.meta.url);
registerHooks({ resolve(s, c, n) { return n(s.startsWith('@/') ? new URL(`${s.slice(2)}.ts`, root).href : s, c); } });
const { SportmonksFootballProvider } = await import('../lib/football-data/providers/sportmonks.ts');
const players = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, display_name: `Synthetic ${i + 1}` }));
const base = () => ({ data: players.map(player => ({ player_id: player.id, team_id: 9, player })) });
async function run(basic: unknown, extended: unknown, check: (result: Awaited<ReturnType<InstanceType<typeof SportmonksFootballProvider>['getSquad']>>, calls: string[], receipts: number) => void) {
    const oldFetch = globalThis.fetch, oldToken = process.env.SPORTMONKS_API_TOKEN;
    clearFootballDataCache();
    process.env.SPORTMONKS_API_TOKEN = 'synthetic-only';
    const calls: string[] = [];
    let receipts = 0;
    globalThis.fetch = async (input) => { const url = new URL(String(input)); calls.push(url.pathname); assert.equal(url.searchParams.has('page'), false); return new Response(JSON.stringify(url.pathname.endsWith('/extended') ? extended : basic), { headers: { 'content-type': 'application/json' } }); };
    try {
        const provider = new SportmonksFootballProvider({ fixtureGuard: { accountScope: 'qa-roster-test', createPort: () => ({ beforeAttempt: () => ({ allowed: true, token: 'local' }), afterAttempt: () => { receipts++; return { persisted: true }; } }) } });
        check(await provider.getSquad('9'), calls, receipts);
    }
    finally {
        globalThis.fetch = oldFetch;
        if (oldToken === undefined)
            delete process.env.SPORTMONKS_API_TOKEN;
        else
            process.env.SPORTMONKS_API_TOKEN = oldToken;
        clearFootballDataCache();
    }
}
test('documented unpaginated base covers 30 active players, extended former players never create membership', async () => {
    await run(base(), { data: [...players, { id: 900, in_squad: false, display_name: 'Former synthetic' }] }, (r, c, n) => { assert.equal(r.ok, true); if (!r.ok)
        return; assert.equal(r.data.length, 30); assert.deepEqual((r.raw as {
        rosterCoverage: unknown;
    }).rosterCoverage, { protocol: 'documented-unpaginated-v1', complete: true, baseCount: 30, extendedCount: 31 }); assert.equal(c.length, 2); assert.equal(n, 2); });
});
for (const [name, b] of Object.entries({ missing: {}, continuation: { ...base(), pagination: { has_more: true, next_page: 'https://unsafe.invalid' } }, cursor: { ...base(), next_cursor: 'next' }, duplicate: { data: [...base().data, base().data[0]] }, mismatch: { data: [{ player_id: 8, team_id: 9, player: players[0] }] }, wrongTeam: { data: [{ player_id: 1, team_id: 8, player: players[0] }] }, invalid: { data: [null] }, oversize: { data: Array.from({ length: 101 }, (_, i) => ({ player: { id: i + 1, name: 'Synthetic' } })) } })) {
    test(`base ${name} fails closed before enrichment`, async () => run(b, { data: players }, (r, c, n) => { assert.equal(r.ok, false); assert.equal(c.length, 1); assert.equal(n, 1); }));
}
for (const [name, e] of Object.entries({ missing: {}, partial: { data: players.slice(0, 29) }, duplicate: { data: [...players, players[0]] }, continued: { data: players, pagination: { has_more: true } }, wrongCount: { data: players, pagination: { has_more: false, count: 29 } } })) {
    test(`extended ${name} cannot seal complete snapshot`, async () => run(base(), e, (r, c, n) => { assert.equal(r.ok, false); assert.equal(c.length, 2); assert.equal(n, 2); }));
}
