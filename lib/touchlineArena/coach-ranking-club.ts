import { findTouchLineClub, TOUCHLINE_ENGLAND_CLUBS } from "./demo-data.ts";
import { catalogueCoachForTeamHistory, legacyCoachCatalogue, type CoachCatalogue } from "./coach-catalogue-contract.ts";

/** Approved aliases may confirm a club, but never override coach identity. */
export function touchlineCoachRankingClubLogo(coachProviderId: string, snapshotClubName: string, catalogue: CoachCatalogue = legacyCoachCatalogue()) {
  const snapshotClub = findTouchLineClub(snapshotClubName);
  const identity = snapshotClub ? catalogueCoachForTeamHistory(catalogue, coachProviderId, snapshotClub.teamId) : null;
  const club = identity ? TOUCHLINE_ENGLAND_CLUBS.find(candidate => candidate.teamId === identity.coach.teamId) : null;
  return club && snapshotClub?.teamId === club.teamId ? club.logoUrl ?? null : null;
}
