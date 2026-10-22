/** Club collection is distinct from the immutable XI used to score a match. */
export const CLUB_ROSTER_CAPACITY = Object.freeze({ starters: 11, reserves: 9, outside: 15, total: 35 });
/** Keep four of the fifteen outside-match players out of the showcase. */
export const CLUB_ROSTER_SHOWCASE_LIMIT = 11;

export type ClubRosterArea = "starters" | "reserves" | "outside";
export type ClubRosterEntry = Readonly<{ playerId: string; area: ClubRosterArea; slot: number }>;

export function validateClubRoster(entries: readonly ClubRosterEntry[]): readonly string[] {
  const errors = new Set<string>();
  const players = new Set<string>();
  const slots = new Set<string>();
  if (entries.length > CLUB_ROSTER_CAPACITY.total) errors.add("ROSTER_FULL");
  for (const entry of entries) {
    if (!entry.playerId || players.has(entry.playerId)) errors.add("DUPLICATE_OR_MISSING_PLAYER");
    players.add(entry.playerId);
    const validArea = entry.area === "starters" || entry.area === "reserves" || entry.area === "outside";
    const capacity = validArea ? CLUB_ROSTER_CAPACITY[entry.area] : 0;
    if (!validArea || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot >= capacity) errors.add("INVALID_SLOT");
    const key = `${entry.area}:${entry.slot}`;
    if (slots.has(key)) errors.add("DUPLICATE_SLOT");
    slots.add(key);
  }
  return [...errors];
}

/** Outside players are candidates, not automatic public listings. Related twenty never qualify. */
export function negotiableClubPlayers(entries: readonly ClubRosterEntry[]): readonly string[] {
  if (validateClubRoster(entries).length) return [];
  return entries.filter(entry => entry.area === "outside").sort((a, b) => a.slot - b.slot).map(entry => entry.playerId);
}

/** Publish only an owner's explicit subset of outside players, never the entire collection. */
export function listedNegotiableClubPlayers(entries: readonly ClubRosterEntry[], listedIds: readonly string[]): readonly string[] {
  if (validateClubRoster(entries).length || listedIds.length > CLUB_ROSTER_SHOWCASE_LIMIT
    || new Set(listedIds).size !== listedIds.length) return [];
  const eligible = new Set(negotiableClubPlayers(entries));
  if (listedIds.some(id => !eligible.has(id))) return [];
  return [...listedIds];
}

/** Atomic relocation: an occupied destination exchanges players, preserving ownership. */
export function relocateClubPlayer(
  entries: readonly ClubRosterEntry[], playerId: string, area: ClubRosterArea, slot: number,
): readonly ClubRosterEntry[] | null {
  if (validateClubRoster(entries).length) return null;
  const source = entries.find(entry => entry.playerId === playerId);
  if (!source) return null;
  const destination = entries.find(entry => entry.area === area && entry.slot === slot);
  const next = entries.map(entry => entry.playerId === playerId ? { ...entry, area, slot }
    : destination && entry.playerId === destination.playerId ? { ...entry, area: source.area, slot: source.slot } : entry);
  return validateClubRoster(next).length ? null : next;
}
