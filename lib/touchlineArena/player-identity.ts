export type TouchlinePlayerIdentity = {
  providerId?: string | number | null;
  name?: string | null;
  shortName?: string | null;
  clubName?: string | null;
};

/** Refresh presentation spelling only with a positive, non-conflicting ID match. */
export function resolveTouchlineRefreshedPlayerNames(
  saved: { canonicalPlayerId?: string | null; providerId?: string | null; name: string; shortName: string; playerName: string },
  current: { canonicalPlayerId?: string | null; providerId?: string | null; name: string; shortName: string },
) {
  const pairs = [
    [saved.canonicalPlayerId, current.canonicalPlayerId],
    [saved.providerId, current.providerId],
  ].filter(([a, b]) => Boolean(a?.trim() && b?.trim()));
  const matched = pairs.length > 0 && pairs.every(([a, b]) => a!.trim() === b!.trim());
  const name = current.name.trim();
  if (!matched || !name) return { name: saved.name, shortName: saved.shortName, playerName: saved.playerName };
  return { name, shortName: current.shortName.trim() || name, playerName: name };
}

export function normalizeTouchlinePlayerIdentityText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeTouchlineClubIdentity(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/\b(?:afc|fc|football club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identityNames(identity: TouchlinePlayerIdentity) {
  return new Set(
    [identity.name, identity.shortName]
      .map(normalizeTouchlinePlayerIdentityText)
      .filter(Boolean),
  );
}

export function touchlinePlayerIdentityMatches(
  first: TouchlinePlayerIdentity,
  second: TouchlinePlayerIdentity,
) {
  const firstProviderId = String(first.providerId || "").trim();
  const secondProviderId = String(second.providerId || "").trim();

  if (firstProviderId && secondProviderId) {
    return firstProviderId === secondProviderId;
  }

  const firstNames = identityNames(first);
  const secondNames = identityNames(second);
  const namesMatch = [...firstNames].some((name) => secondNames.has(name));
  if (!namesMatch) return false;

  const firstClub = normalizeTouchlineClubIdentity(first.clubName);
  const secondClub = normalizeTouchlineClubIdentity(second.clubName);
  return !firstClub || !secondClub || firstClub === secondClub;
}
