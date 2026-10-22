import { CLUB_ROSTER_CAPACITY } from "./club-roster.ts";

export type ClubOwnershipReadiness = Readonly<{
  status: "READY" | "LINEUP_IMPORT_REQUIRED" | "OWNERSHIP_CONFLICT" | "INVALID_OWNERSHIP" | "UNAVAILABLE";
  ownedCount: number | null;
  selectedCount: number | null;
  overlapCount: number | null;
  /** Null means not safe to offer an acquisition, not an empty collection. */
  vacantCount: number | null;
}>;

/**
 * Reconcile two independent authoritative reads. Never turn a selected or
 * catalogued player into a contract, and never subtract XI size from 35.
 * READY concerns identity/count only, not budget, market clock or integration.
 */
export function inspectClubOwnership(input: {
  activeContractPlayerIds: readonly (string | null)[] | null;
  selectedPlayerIds: readonly (string | null)[] | null;
}): ClubOwnershipReadiness {
  const { activeContractPlayerIds: owned, selectedPlayerIds: selected } = input;
  if (owned === null || selected === null) return {
    status: "UNAVAILABLE", ownedCount: null, selectedCount: null, overlapCount: null, vacantCount: null,
  };
  const validIds = (ids: readonly (string | null)[]) => ids.every(id => typeof id === "string" && id.trim().length > 0)
    && new Set(ids).size === ids.length;
  const counts = { ownedCount: owned.length, selectedCount: selected.length };
  if (!validIds(owned) || !validIds(selected) || owned.length > CLUB_ROSTER_CAPACITY.total || selected.length > CLUB_ROSTER_CAPACITY.starters) {
    return { ...counts, status: "INVALID_OWNERSHIP", overlapCount: null, vacantCount: null };
  }
  const byId = new Set(owned);
  const overlapCount = selected.filter(id => byId.has(id)).length;
  if (selected.length > 0 && owned.length === 0) return {
    ...counts, overlapCount, status: "LINEUP_IMPORT_REQUIRED", vacantCount: null,
  };
  if (overlapCount !== selected.length) return {
    ...counts, overlapCount, status: "OWNERSHIP_CONFLICT", vacantCount: null,
  };
  return { ...counts, overlapCount, status: "READY", vacantCount: CLUB_ROSTER_CAPACITY.total - owned.length };
}
