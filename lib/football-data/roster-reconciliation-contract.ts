import { TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE } from './twenty-club-roster-reconciliation.ts';
export const ROSTER_TEAM_IDS = TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE.map(club => club.providerTeamId);
export const ROSTER_CLUB_LABELS: Readonly<Record<string,string>> = Object.fromEntries(TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE.map(club => [club.providerTeamId,club.clubName]));
export const ROSTER_SOURCE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export type RosterCommand = {
    action: 'capture';
    requestId: string;
} | {
    action: 'decide';
    requestId: string;
    snapshotId: string;
    revision: number;
    providerId: string;
    decision: 'approve' | 'reject';
    reason: string;
} | {
    action: 'apply';
    requestId: string;
    snapshotId: string;
    revision: number;
};
export type RosterOperation = {
    providerId: string;
    canonicalPlayerId: string | null;
    name: string;
    fromTeamId: string | null;
    teamId: string | null;
    kind: 'ADD_REVIEW_REQUIRED' | 'TRANSFER_REVIEW_REQUIRED' | 'UPDATE_REVIEW_REQUIRED' | 'PRESERVE_UNSEEN_REVIEW_REQUIRED';
    decision?: 'approve' | 'reject' | null;
    reason?: string | null;
};
export type RosterStatus = {
    enabled: boolean;
    applyEnabled: boolean;
    snapshots: Array<{
        id: string;
        status: string;
        revision: number;
        fetchedAt: string;
        checksum: string;
        seasonId: string;
        operations: RosterOperation[];
    }>;
    jobs: Array<{
        id: string;
        status: string;
        createdAt: string;
        error: string | null;
    }>;
};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function parseRosterCommand(value: unknown): RosterCommand {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('INVALID_COMMAND');
    const r = value as Record<string, unknown>;
    if (!uuid(r.requestId))
        throw new Error('INVALID_COMMAND');
    const common = r.action === 'capture' ? ['action', 'requestId'] : r.action === 'decide' ? ['action', 'requestId', 'snapshotId', 'revision', 'providerId', 'decision', 'reason'] : r.action === 'apply' ? ['action', 'requestId', 'snapshotId', 'revision'] : [];
    if (!common.length || Object.keys(r).some(k => !common.includes(k)) || common.some(k => !(k in r)))
        throw new Error('INVALID_COMMAND');
    if (r.action === 'capture')
        return { action: 'capture', requestId: r.requestId };
    if (!uuid(r.snapshotId) || !Number.isSafeInteger(r.revision) || Number(r.revision) < 0)
        throw new Error('INVALID_COMMAND');
    if (r.action === 'apply')
        return { action: 'apply', requestId: r.requestId, snapshotId: r.snapshotId, revision: Number(r.revision) };
    if (typeof r.providerId !== 'string' || !/^[1-9]\d{0,19}$/.test(r.providerId) || (r.decision !== 'approve' && r.decision !== 'reject') || typeof r.reason !== 'string' || r.reason.trim().length < 3 || r.reason.length > 500)
        throw new Error('INVALID_COMMAND');
    return { action: 'decide', requestId: r.requestId, snapshotId: r.snapshotId, revision: Number(r.revision), providerId: r.providerId, decision: r.decision, reason: r.reason.trim() };
}
export function rosterSourceFresh(fetchedAt: string, now = Date.now()) {
    const at = Date.parse(fetchedAt);
    return Number.isFinite(at) && at <= now + 60000 && now - at <= ROSTER_SOURCE_MAX_AGE_MS;
}
