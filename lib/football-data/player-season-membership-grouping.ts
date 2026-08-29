export type TouchLinePlayerSeasonMembershipIdentity = {
  football_player_id: string;
  competition_id: string;
  season_id: string;
  club_id: string;
  source_synced_at?: string | null;
};

export type TouchLinePlayerSeasonMembershipGroup<T extends TouchLinePlayerSeasonMembershipIdentity> = {
  key: string;
  canonicalMembership: T;
  historicalMemberships: T[];
};

function sourceTimestamp(value: string | null | undefined) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function membershipOrder<T extends TouchLinePlayerSeasonMembershipIdentity>(left: T, right: T) {
  const leftSource = sourceTimestamp(left.source_synced_at);
  const rightSource = sourceTimestamp(right.source_synced_at);
  if (leftSource !== rightSource) return rightSource > leftSource ? 1 : -1;
  return left.club_id.localeCompare(right.club_id);
}

/**
 * A player may move clubs inside one competition season. The public season
 * aggregate has one database key for that entire season, while fixture rows
 * retain the club that owned each verified team sheet. Grouping here prevents
 * one upsert batch from containing duplicate aggregate keys without deleting
 * or rewriting any historical membership.
 */
export function groupTouchLinePlayerSeasonMemberships<
  T extends TouchLinePlayerSeasonMembershipIdentity,
>(memberships: readonly T[]): TouchLinePlayerSeasonMembershipGroup<T>[] {
  const grouped = new Map<string, T[]>();
  for (const membership of memberships) {
    const key = [
      membership.football_player_id,
      membership.competition_id,
      membership.season_id,
    ].join(":");
    const values = grouped.get(key) ?? [];
    values.push(membership);
    grouped.set(key, values);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => {
      const historicalMemberships = [...values].sort(membershipOrder);
      return {
        key,
        canonicalMembership: historicalMemberships[0],
        historicalMemberships,
      };
    });
}
