import type { TouchlineCommercialCompetition, TouchlineCompetitionClubStatus } from "./commercial-activation.ts";

export type TouchlineCompetitionRoundEntryStatus = "SCHEDULED" | "OPEN" | "LOCKED" | "SETTLED";

export type TouchlineCompetitionEngineRound = Readonly<{
  id: string;
  competition: TouchlineCommercialCompetition;
  sequence: number;
  entryStatus: TouchlineCompetitionRoundEntryStatus;
}>;

export type TouchlineCompetitionRoundEligibility = Readonly<{
  allowed: boolean;
  reason: "already-locked" | "maintenance-inactive" | "round-not-open" | "eligible";
}>;

function hasActiveMaintenance(status: TouchlineCompetitionClubStatus) {
  return status === "ACTIVE" || status === "REACTIVATED";
}

/**
 * TouchLine competition-engine rule only. It intentionally receives neither
 * Premier League schedules nor real-football fixture data. A locked entry is
 * immutable: a later maintenance lapse affects only a later eligible round.
 */
export function resolveTouchlineCompetitionRoundEligibility(input: {
  clubCompetition: TouchlineCommercialCompetition;
  maintenanceStatus: TouchlineCompetitionClubStatus;
  round: TouchlineCompetitionEngineRound;
  alreadyLockedForRound: boolean;
}): TouchlineCompetitionRoundEligibility {
  if (input.round.competition !== input.clubCompetition) return { allowed: false, reason: "round-not-open" };
  if (input.alreadyLockedForRound) return { allowed: true, reason: "already-locked" };
  if (!hasActiveMaintenance(input.maintenanceStatus)) return { allowed: false, reason: "maintenance-inactive" };
  if (input.round.entryStatus !== "OPEN") {
    return { allowed: false, reason: "round-not-open" };
  }
  return { allowed: true, reason: "eligible" };
}

/** Finds the next eligible round inside the selected TouchLine competition engine. */
export function resolveNextTouchlineCompetitionRound(input: {
  competition: TouchlineCommercialCompetition;
  maintenanceStatus: TouchlineCompetitionClubStatus;
  rounds: readonly TouchlineCompetitionEngineRound[];
}): TouchlineCompetitionEngineRound | null {
  if (!hasActiveMaintenance(input.maintenanceStatus)) return null;
  return input.rounds
    .filter((round) => round.competition === input.competition && round.entryStatus === "OPEN")
    .sort((left, right) => left.sequence - right.sequence)[0] ?? null;
}
