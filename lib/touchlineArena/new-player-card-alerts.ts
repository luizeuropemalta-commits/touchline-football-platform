/**
 * Protected Admin-only detection of canonical football players who do not
 * yet have a publishable TouchLine game card. This module has no database or
 * provider dependency: callers must supply a canonical, already-read roster.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TouchlineNewPlayerCardAlertCandidate = Readonly<{
  playerId: string;
  playerName: string;
  clubId: string;
  clubName: string;
  position: string | null;
  detectedAt: string | null;
  providerPlayerId: string | null;
  currentClubId: string | null;
  activeSportmonksMemberships: readonly Readonly<{
    clubId: string;
    competitionId: string;
  }>[];
  publicationStatus: string | null;
  /**
   * Derived from the protected editorial value record. This is deliberately
   * separate from publication: a player can have a verified value while
   * another real card field still needs review.
   */
  hasVerifiedMarketValue: boolean;
}>;

export type TouchlineNewPlayerCardAlert = Readonly<{
  playerId: string;
  playerName: string;
  clubName: string;
  position: string | null;
  detectedAt: string | null;
  providerPlayerId: string | null;
  state: "market_value_required";
  label: "NEW PLAYER · MARKET VALUE REQUIRED";
}>;

/** A confirmed zero is a real value; an absent or fractional value is not. */
export function hasTouchlineVerifiedMarketValue(value: Readonly<{
  status: string | null | undefined;
  confidence: string | null | undefined;
  marketValueEur: number | null | undefined;
}>) {
  return value.status === "verified"
    && value.confidence === "verified"
    && Number.isSafeInteger(value.marketValueEur)
    && (value.marketValueEur ?? -1) >= 0;
}

function canonicalUuid(value: string | null | undefined) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim().toLowerCase());
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function optionalIsoDate(value: string | null | undefined) {
  const trimmed = optionalText(value);
  return trimmed && Number.isFinite(Date.parse(trimmed)) ? trimmed : null;
}

/**
 * A football player is not a game card. We create an Admin alert only when
 * identity is unambiguous in the canonical Premier League roster and no
 * reviewed/published publication lifecycle exists yet.
 */
export function findTouchlineNewPlayerCardAlerts(input: Readonly<{
  competitionId: string;
  candidates: readonly TouchlineNewPlayerCardAlertCandidate[];
}>) {
  if (!canonicalUuid(input.competitionId)) return [] as TouchlineNewPlayerCardAlert[];

  const seen = new Set<string>();
  const alerts: TouchlineNewPlayerCardAlert[] = [];
  for (const candidate of input.candidates) {
    const playerId = candidate.playerId.trim().toLowerCase();
    const currentClubId = candidate.currentClubId?.trim().toLowerCase() ?? null;
    const clubId = candidate.clubId.trim().toLowerCase();
    const publicationStatus = candidate.publicationStatus?.trim().toLowerCase() ?? null;
    const memberships = candidate.activeSportmonksMemberships.filter((membership) => (
      canonicalUuid(membership.clubId)
      && canonicalUuid(membership.competitionId)
      && membership.clubId.trim().toLowerCase() === clubId
      && membership.competitionId.trim().toLowerCase() === input.competitionId.trim().toLowerCase()
    ));

    if (
      seen.has(playerId)
      || !canonicalUuid(playerId)
      || !canonicalUuid(clubId)
      || currentClubId !== clubId
      || !candidate.playerName.trim()
      || !candidate.clubName.trim()
      || candidate.hasVerifiedMarketValue
      || candidate.activeSportmonksMemberships.length !== 1
      || memberships.length !== 1
      || (publicationStatus !== null && publicationStatus !== "detected" && publicationStatus !== "market_value_required")
    ) continue;

    seen.add(playerId);
    alerts.push(Object.freeze({
      playerId,
      playerName: candidate.playerName.trim(),
      clubName: candidate.clubName.trim(),
      position: optionalText(candidate.position),
      detectedAt: optionalIsoDate(candidate.detectedAt),
      providerPlayerId: optionalText(candidate.providerPlayerId),
      state: "market_value_required",
      label: "NEW PLAYER · MARKET VALUE REQUIRED",
    }));
  }

  return Object.freeze(alerts.sort((left, right) => (
    left.clubName.localeCompare(right.clubName) || left.playerName.localeCompare(right.playerName)
  )));
}
