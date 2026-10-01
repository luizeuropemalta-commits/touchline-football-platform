/** Compact persisted-award contract. This module never derives goals or grants
 * authority from player names, ratings, or the private diagnostic reader. */
export type GoldenBootPublicAuthority = Readonly<{
  status: "ready" | "unavailable";
  snapshotId: string | null;
  revision: string;
  competitionId: string;
  seasonId: string;
  playerIds: readonly string[];
  expiresAt: string | null;
  freshnessAuthority: "fetch-age-only";
}>;

export type GoldenBootAuthorityState = Readonly<{
  competitionId: string;
  seasonId: string;
  watermark: GoldenBootPublicAuthority | null;
  current: GoldenBootPublicAuthority | null;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

function utcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|\+00:00)$/.exec(value);
  if (!parts) return false;
  const [, y, m, d, h, min, sec] = parts.map(Number);
  if (y! < 1000 || m! < 1 || m! > 12 || d! < 1 || h! > 23 || min! > 59 || sec! > 59) return false;
  return d! <= new Date(Date.UTC(y!, m!, 0)).getUTCDate() && Number.isFinite(Date.parse(value));
}

export function parseGoldenBootPublicAuthority(value: unknown): GoldenBootPublicAuthority | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  // Revision is a decimal string: database bigint arithmetic may exceed the
  // JavaScript integer range. Decimal comparison also works on older TV engines.
  if (!uuid(row.competitionId) || !uuid(row.seasonId)
    || typeof row.revision !== "string" || !/^(0|[1-9][0-9]{0,39})$/.test(row.revision)
    || row.freshnessAuthority !== "fetch-age-only" || !Array.isArray(row.playerIds)) return null;
  const playerIds = row.playerIds;
  if (row.status === "unavailable") {
    if (row.snapshotId !== null || row.expiresAt !== null || playerIds.length !== 0) return null;
  } else if (row.status === "ready") {
    if (!uuid(row.snapshotId) || !utcTimestamp(row.expiresAt)
      || playerIds.length < 1 || playerIds.length > 500
      || !playerIds.every(uuid) || new Set(playerIds.map(id => id.toLowerCase())).size !== playerIds.length) return null;
  } else return null;
  return Object.freeze({
    status: row.status, snapshotId: row.snapshotId as string | null, revision: row.revision,
    competitionId: row.competitionId.toLowerCase(), seasonId: row.seasonId.toLowerCase(),
    playerIds: Object.freeze((playerIds as string[]).map(id => id.toLowerCase()).sort()),
    expiresAt: row.expiresAt as string | null, freshnessAuthority: "fetch-age-only",
  });
}

export function createGoldenBootAuthorityState(competitionId: string, seasonId: string): GoldenBootAuthorityState {
  return { competitionId: competitionId.toLowerCase(), seasonId: seasonId.toLowerCase(), watermark: null, current: null };
}

function validNow(value: number) { return Number.isSafeInteger(value) && value >= 0; }

/** Must be called by an expiry timer and visibility recovery independently of
 * network success. The watermark survives: rewinding the clock cannot revive
 * an expired publication at the same revision. */
export function expireGoldenBootAuthority(state: GoldenBootAuthorityState, nowMs: number): GoldenBootAuthorityState {
  if (!state.current) return state;
  if (!validNow(nowMs) || Date.parse(state.current.expiresAt ?? "") <= nowMs) return { ...state, current: null };
  return state;
}

/** Transport failure/malformed payload revokes display but retains ordering.
 * Only a strictly newer valid revision may restore it. A changed league/season
 * needs a fresh scope state, never a cross-scope comparison. */
export function advanceGoldenBootAuthority(state: GoldenBootAuthorityState, payload: unknown, nowMs: number): GoldenBootAuthorityState {
  const current = expireGoldenBootAuthority(state, nowMs);
  const incoming = parseGoldenBootPublicAuthority(payload);
  if (!incoming || !validNow(nowMs)) return { ...current, current: null };
  if (incoming.competitionId !== state.competitionId || incoming.seasonId !== state.seasonId) return current;
  if (current.watermark) {
    const previousRevision = current.watermark.revision;
    const order = incoming.revision.length - previousRevision.length
      || (incoming.revision < previousRevision ? -1 : incoming.revision > previousRevision ? 1 : 0);
    if (order < 0) return current;
    if (order === 0) {
      // Same revision must describe the same immutable decision. Neither a
      // replay nor a delayed server seed restores previously revoked display.
      return JSON.stringify(incoming) === JSON.stringify(current.watermark)
        ? current : { ...current, current: null };
    }
  }
  return {
    ...current, watermark: incoming,
    current: incoming.status === "ready" && Date.parse(incoming.expiresAt!) > nowMs ? incoming : null,
  };
}

export function hasGoldenBoot(state: GoldenBootAuthorityState, playerId: string, nowMs: number): boolean {
  const current = expireGoldenBootAuthority(state, nowMs).current;
  return Boolean(uuid(playerId) && current?.playerIds.includes(playerId.toLowerCase()));
}
