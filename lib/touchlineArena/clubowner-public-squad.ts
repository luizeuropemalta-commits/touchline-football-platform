import type { ClubAcquisitionState } from "../touchlineFantasy/club-acquisition";
import { validateClubRoster } from "../touchlineFantasy/club-roster.ts";

/** Explicit visitor projection. Never serialize a collection or spread its contracts. */
export function publicSquadPlacement(state: ClubAcquisitionState | null) {
  if (state && validateClubRoster(state.players).length) throw new Error("INVALID_SQUAD");
  return {
    formationCode: state?.formationCode ?? "4-3-3",
    coachId: state?.coach?.id ?? null,
    players: (state?.players ?? []).map(({ playerId, area, slot }) => ({ playerId, area, slot })),
  };
}
