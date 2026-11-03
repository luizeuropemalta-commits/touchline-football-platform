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
/** Validate the durable SQL command result, not merely an echoed request ID. */
function confirmedRosterReceipt(value: unknown, command: RosterCommand): value is RosterReceipt {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const row = value as Record<string, unknown>;
    if (row.requestId !== command.requestId.toLowerCase()) return false;
    if (command.action === 'capture') {
        if (row.status === 'failed') return typeof row.error === 'string' && row.error.length > 0;
        if (row.status === 'collecting') return row.capture === undefined
            || row.capture === true && typeof row.seasonId === 'string' && /^[1-9][0-9]{0,19}$/.test(row.seasonId);
        return row.status === 'review' && row.snapshotId === command.requestId.toLowerCase() && row.revision === 0;
    }
    return row.status === (command.action === 'apply' ? 'applied' : 'decided')
        && row.snapshotId === command.snapshotId.toLowerCase()
        && Number.isSafeInteger(row.revision) && row.revision === command.revision + 1;
}
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
            if (!confirmedRosterReceipt(result.data, command))
                throw new Error('ROSTER_NOT_CONFIRMED');
            return result.data as RosterReceipt;
        },
        async status() { const { data, error } = await admin.rpc('touchline_roster_status'); if (error || !data || !Array.isArray(data.snapshots) || !Array.isArray(data.jobs) || typeof data.enabled !== 'boolean' || typeof data.applyEnabled !== 'boolean')
            throw new Error('ROSTER_UNAVAILABLE'); return data as RosterStatus; },
    };
}
