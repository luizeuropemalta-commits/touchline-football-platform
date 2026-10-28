import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { clearFootballDataCache } from '../lib/football-data/cache.ts';
import { parseRosterCommand, ROSTER_TEAM_IDS, rosterSourceFresh } from '../lib/football-data/roster-reconciliation-contract.ts';
const root = new URL('../', import.meta.url);
registerHooks({ resolve(s, c, n) { if (s === 'server-only')
        return { url: 'data:text/javascript,export {}', shortCircuit: true }; return n(s.startsWith('@/') ? new URL(`${s.slice(2)}.ts`, root).href : s, c); } });
const { runRosterReconciliation, rosterCronCommand } = await import('../lib/football-data/roster-reconciliation-server.ts');
const { SportmonksFootballProvider } = await import('../lib/football-data/providers/sportmonks.ts');
const actor = 'owner:00000000-0000-4000-8000-000000000001', command = { action: 'capture' as const, requestId: '00000000-0000-4000-8000-000000000002' };
test('command whitelist and snapshot date validation reject overrides and invalid dates', () => {
    for (const data of [{ ...command, provider: 'anything' }, { ...command, action: 'apply' }, { ...command, requestId: 'wrong' }])
        assert.throws(() => parseRosterCommand(data), /INVALID_COMMAND/);
    assert.equal(rosterSourceFresh('nonsense'), false);
    assert.equal(rosterSourceFresh(new Date(Date.now() - 7 * 3600000).toISOString()), false);
    assert.deepEqual(rosterCronCommand(1), rosterCronCommand(2000));
    assert.notDeepEqual(rosterCronCommand(1), rosterCronCommand(6 * 3600000));
});
test('actual guarded HTTP collector persists 20 complete snapshots; response loss and replay produce no extra HTTP', async () => {
    const original = globalThis.fetch, token = process.env.SPORTMONKS_API_TOKEN;
    let calls = 0, admitted = 0, completed = 0, finish = 0;
    let receipt: unknown = null;
    let persisted: Record<string, unknown> | null = null;
    process.env.SPORTMONKS_API_TOKEN = 'synthetic-only';
    clearFootballDataCache();
    globalThis.fetch = async (input) => {
        calls++;
        const url = new URL(String(input));
        const teamId = url.pathname.match(/teams\/(\d+)/)![1];
        const idx = ROSTER_TEAM_IDS.indexOf(teamId);
        const players = Array.from({ length: 11 }, (_, i) => ({ id: idx * 11 + i + 1, display_name: `Synthetic ${idx}-${i}`, market_value: 5 }));
        return new Response(JSON.stringify({ data: url.pathname.endsWith('/extended') ? players : players.map(player => ({ player_id: player.id, team_id: Number(teamId), player })) }), { headers: { 'content-type': 'application/json' } });
    };
    try {
        const repository = { async action(who: string, cmd: unknown, phase: string, source?: unknown) { assert.equal(who, actor); assert.deepEqual(cmd, command); if (receipt)
                return receipt as never; if (phase === 'lookup')
                return null; if (phase === 'begin')
                return { status: 'collecting', requestId: command.requestId, capture: true, seasonId: '25583' }; if (phase === 'finish') {
                finish++;
                persisted = source as Record<string, unknown>;
                receipt = { status: 'review', requestId: command.requestId };
                throw new Error('Lost response after commit');
            } throw new Error('unexpected'); }, async status() { throw new Error('unused'); } };
        const deps = { repository, enabled: () => true, assertRuntime: () => { }, now: Date.now, provider: () => new SportmonksFootballProvider({ fixtureGuard: { accountScope: 'qa-roster', createPort: () => ({ beforeAttempt: () => { admitted++; return { allowed: true, token: 'synthetic' }; }, afterAttempt: () => { completed++; return { persisted: true }; } }) } }) };
        assert.equal((await runRosterReconciliation(actor, command, deps))?.status, 'review');
        assert.equal(finish, 1);
        assert.equal(calls, 40);
        assert.equal(admitted, 40);
        assert.equal(completed, 40);
        assert.ok(persisted);
        assert.equal(JSON.stringify(persisted).includes('market_value'), false);
        assert.equal(JSON.stringify(persisted).includes('marketValue'), false);
        assert.equal((await runRosterReconciliation(actor, command, { ...deps, enabled: () => false, assertRuntime: () => { throw new Error('must not revalidate'); }, provider: () => { throw new Error('must not instantiate'); } }))?.status, 'review');
        assert.equal(calls, 40);
    }
    finally {
        globalThis.fetch = original;
        if (token === undefined)
            delete process.env.SPORTMONKS_API_TOKEN;
        else
            process.env.SPORTMONKS_API_TOKEN = token;
        clearFootballDataCache();
    }
});
test('OFF and cron owner-decision guard have zero provider work; failed partial batch never finishes', async () => {
    let providerCalls = 0, failures = 0, finishes = 0;
    const repository = { async action(_a: string, c: typeof command, phase: string) { if (phase === 'lookup')
            return null; if (phase === 'begin')
            return { status: 'collecting', requestId: c.requestId, capture: true, seasonId: '25583' }; if (phase === 'finish')
            finishes++; if (phase === 'fail') {
            failures++;
            return { status: 'failed', requestId: c.requestId };
        } return null; }, async status() { throw new Error('unused'); } };
    const deps = { repository, enabled: () => false, assertRuntime: () => { }, now: Date.now, provider: () => { providerCalls++; return { getSquad: async () => ({ ok: false as const, error: { code: 'provider_error' as const, provider: 'sportmonks' as const, message: 'Synthetic partial' } }) }; } };
    await assert.rejects(() => runRosterReconciliation(actor, command, deps), /ROSTER_PAUSED/);
    assert.equal(providerCalls, 0);
    await assert.rejects(() => runRosterReconciliation('cron:roster-v1', { action: 'apply', requestId: command.requestId, snapshotId: command.requestId, revision: 0 }, deps), /FORBIDDEN/);
    await assert.rejects(() => runRosterReconciliation(actor, command, { ...deps, enabled: () => true }), /ROSTER_CAPTURE_NOT_CONFIRMED/);
    assert.equal(providerCalls, 1);
    assert.equal(failures, 1);
    assert.equal(finishes, 0);
});
