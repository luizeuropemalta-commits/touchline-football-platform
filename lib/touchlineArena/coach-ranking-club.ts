import { findTouchLineClub, TOUCHLINE_ENGLAND_CLUBS } from "./demo-data.ts";
import { touchlineLiveCoachForProviderId } from "./live-coaches.ts";

/** Approved aliases may confirm a club, but never override coach identity. */
export function touchlineCoachRankingClubLogo(coachProviderId: string, snapshotClubName: string) {
  const identity = touchlineLiveCoachForProviderId(coachProviderId);
  const club = identity
    ? TOUCHLINE_ENGLAND_CLUBS.find((candidate) => candidate.teamId === identity.coach.teamId)
    : null;
  const snapshotClub = findTouchLineClub(snapshotClubName);
  return club && snapshotClub?.teamId === club.teamId ? club.logoUrl ?? null : null;
}
