import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RosterCommand, RosterStatus } from './roster-reconciliation-contract.ts';
export type RosterReceipt = {
    status: string;
    requestId: string;
    capture?: boolean;
    seasonId?: string;
    snapshotId?: string;
    revision?: number;
    error?: string;
};
export type RosterRepository = {
    action(actor: string, command: RosterCommand, phase: 'lookup' | 'begin' | 'finish' | 'fail' | 'command', source?: unknown): Promise<RosterReceipt | null>;
    status(): Promise<RosterStatus>;
};
const publicCodes = ['ROSTER_PAUSED', 'ROSTER_APPLICATION_PAUSED', 'ROSTER_REQUEST_CONFLICT', 'ROSTER_REVISION_CONFLICT', 'ROSTER_SOURCE_EXPIRED', 'ROSTER_CAPTURE_BUSY', 'ROSTER_BASELINE_CHANGED', 'ROSTER_NO_APPROVED_CHANGES', 'ROSTER_OPERATION_NOT_ACTIONABLE', 'ROSTER_QA_EXECUTOR_UNAVAILABLE', 'ROSTER_CAPTURE_LEASE_LOST'];
export function rosterRepository(admin: SupabaseClient): RosterRepository {
    return {
        async action(actor, command, phase, source = null) {
            const result = await admin.rpc('touchline_roster_action', { p_actor: actor, p_command: command, p_phase: phase, p_source: source });
            if (result.error) {
                const code = publicCodes.find(code => result.error.message?.includes(code));
                throw new Error(code ?? 'ROSTER_NOT_CONFIRMED');
            }
            if (result.data === null && phase === 'lookup')
                return null;
            if (!result.data || typeof result.data.status !== 'string' || result.data.requestId !== command.requestId)
                throw new Error('ROSTER_NOT_CONFIRMED');
            return result.data as RosterReceipt;
        },
        async status() { const { data, error } = await admin.rpc('touchline_roster_status'); if (error || !data || !Array.isArray(data.snapshots) || !Array.isArray(data.jobs) || typeof data.enabled !== 'boolean' || typeof data.applyEnabled !== 'boolean')
            throw new Error('ROSTER_UNAVAILABLE'); return data as RosterStatus; },
    };
}
