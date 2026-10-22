import type { ClubAcquisitionState } from "./club-acquisition.ts";
import { allocateClubPlayers, type ClubAllocationCommand } from "./club-allocation.ts";
import type { TouchlineFormationGeometry } from "../touchlineArena/formation-geometry.ts";
import type { ClubPrimaryPositionIndex } from "./club-primary-position-index.ts";
import { collectionSlotPlan } from "./club-position-plan.ts";

export { CLUB_RESERVE_POSITIONS, collectionSlotPlan } from "./club-position-plan.ts";

/** Read-only preview, including displaced-player detail/bench/35-slot feasibility.
 * Actual allocation repeats this on the server and inside the atomic SQL writer. */
export function previewPlannedClubAllocation(state: ClubAcquisitionState, command: ClubAllocationCommand,
  geometry: TouchlineFormationGeometry, primaryDetails?: ClubPrimaryPositionIndex) {
  try {
    const next = allocateClubPlayers(state, command, { marketOpen: true, geometry, reservedIds: [], primaryDetails });
    return collectionSlotPlan(geometry, next.players, primaryDetails) ? next : null;
  } catch { return null; }
}
