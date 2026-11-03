/** Read-only diagnosis; never chooses a replacement membership. */
export function publicationBindingIssue(input: {
  publicationMembershipId: string | null;
  currentClubId: string | null;
  activeMemberships: readonly { id: string; club_id: string }[];
}): "NO_ACTIVE_MEMBERSHIP" | "AMBIGUOUS_MEMBERSHIP" | "CLUB_MISMATCH" | "STALE_PUBLICATION" | null {
  if (!input.activeMemberships.length) return "NO_ACTIVE_MEMBERSHIP";
  if (input.activeMemberships.length !== 1) return "AMBIGUOUS_MEMBERSHIP";
  const active = input.activeMemberships[0]!;
  if (!input.currentClubId || active.club_id !== input.currentClubId) return "CLUB_MISMATCH";
  return active.id === input.publicationMembershipId ? null : "STALE_PUBLICATION";
}
