export type TouchlinePlayerIdentity = {
  providerId?: string | number | null;
  name?: string | null;
  shortName?: string | null;
  clubName?: string | null;
};

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
