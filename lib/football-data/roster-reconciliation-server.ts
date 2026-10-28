import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FootballDataProvider } from './types.ts';
import { createGuardedFixtureProvider } from './fixture-provider-server.ts';
import { assertQaRuntime, buildQaTwentyClubRosterSyncPlan, playerInput } from './qa-twenty-club-roster-sync.ts';
import { parseRosterCommand, ROSTER_TEAM_IDS, rosterSourceFresh, type RosterCommand } from './roster-reconciliation-contract.ts';
import { rosterRepository, type RosterRepository } from './roster-reconciliation-repository.ts';
export type RosterDependencies = {
    repository: RosterRepository;
    enabled: () => boolean;
    assertRuntime: () => void;
    provider: () => Pick<FootballDataProvider, 'getSquad'>;
    now: () => number;
};
/** Actual orchestration seam: durable receipt/claim precedes source creation.
 * Capture failures persist a bounded diagnostic. Retrying that request never
 * repeats provider HTTP; a deliberate new capture has a new request identity. */
export async function runRosterReconciliation(actor: string, raw: unknown, deps: RosterDependencies) {
    const command = parseRosterCommand(raw);
    if (!/^owner:[0-9a-f-]{36}$/.test(actor) && actor !== 'cron:roster-v1')
        throw new Error('FORBIDDEN');
    if (actor === 'cron:roster-v1' && command.action !== 'capture')
        throw new Error('FORBIDDEN');
    const previous = await deps.repository.action(actor, command, 'lookup');
    if (previous)
        return previous;
    if (!deps.enabled())
        throw new Error('ROSTER_PAUSED');
    deps.assertRuntime();
    if (command.action !== 'capture')
        return deps.repository.action(actor, command, 'command');
    const claim = await deps.repository.action(actor, command, 'begin');
    if (!claim?.capture)
        return claim;
    try {
        const provider = deps.provider();
        const squads = [];
        let fetchedAt = Infinity;
        for (const teamId of ROSTER_TEAM_IDS) {
            const result = await provider.getSquad(teamId);
            if (!result.ok)
                throw new Error('ROSTER_SOURCE_UNAVAILABLE');
            const coverage = (result.raw as {
                rosterCoverage?: {
                    protocol?: string;
                    complete?: boolean;
                    baseCount?: number;
                };
            } | null)?.rosterCoverage;
            if (coverage?.protocol !== 'documented-unpaginated-v1' || coverage.complete !== true || coverage.baseCount !== result.data.length || !rosterSourceFresh(result.fetchedAt, deps.now()))
                throw new Error('ROSTER_SOURCE_INCOMPLETE');
            fetchedAt = Math.min(fetchedAt, Date.parse(result.fetchedAt));
            squads.push({ teamId, members: result.data, fetchedAt:result.fetchedAt, cached:result.cached===true });
        }
        if (!buildQaTwentyClubRosterSyncPlan(squads).ok)
            throw new Error('ROSTER_SOURCE_INCOMPLETE');
        return await deps.repository.action(actor, command, 'finish', { schemaVersion: 'roster-observation-v1', provider:'sportmonks', sourceRevision:'sportmonks-current-squads-v1', competitionId: '8', seasonId: claim.seasonId, protocol: 'documented-unpaginated-v1', fetchedAt: new Date(fetchedAt).toISOString(), squads: squads.map(s => ({ teamId: s.teamId, fetchedAt:s.fetchedAt, cached:s.cached, members: s.members.map(playerInput) })) });
    }
    catch {
        // Finish may have committed before its response was lost. The fail RPC must
        // recover that receipt first, never overwrite it or retry the provider.
        const result = await deps.repository.action(actor, command, 'fail');
        if (result?.status === 'review')
            return result;
        throw new Error('ROSTER_CAPTURE_NOT_CONFIRMED');
    }
}
export function runRosterCommand(admin: SupabaseClient, actor: string, command: RosterCommand) {
    return runRosterReconciliation(actor, command, { repository: rosterRepository(admin), enabled: () => process.env.TOUCHLINE_ROSTER_RECONCILIATION_ENABLED === 'true', assertRuntime: assertQaRuntime, provider: () => createGuardedFixtureProvider(admin, process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE), now: Date.now });
}
export async function readRosterStatus(admin: SupabaseClient) {
    const status = await rosterRepository(admin).status();
    return { ...status, enabled: status.enabled && process.env.TOUCHLINE_ROSTER_RECONCILIATION_ENABLED === 'true', applyEnabled: status.applyEnabled && status.enabled && process.env.TOUCHLINE_ROSTER_RECONCILIATION_ENABLED === 'true' };
}
/** One capture per UTC six-hour slot, including failed/cancelled claims. */
export function rosterCronCommand(now = Date.now()): RosterCommand {
    const hash = createHash('sha256').update(`roster-cron-v1:${Math.floor(now / (6 * 60 * 60 * 1000))}`).digest('hex');
    return { action: 'capture', requestId: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}` };
}
