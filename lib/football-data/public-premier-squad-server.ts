import "server-only";

import { inferArenaRole, makeArenaShortName, normalizeOfficialShirtNumber } from "@/lib/football-data/arena-lineup";
import { readPersistedSquadSnapshot, type PersistedSquadPlayer } from "@/lib/football-data/squad-snapshot-store";
import { resolveOfficialShirtNumber } from "@/lib/football-data/official-shirt-numbers";
import type { TouchlineCardTierKey } from "@/lib/touchlineArena/card-rules";
import { isTouchlineCardPublicationGateEnabled } from "@/lib/touchlineArena/card-publication-gate";
import { loadTouchlinePublishedCardPresentations } from "@/lib/touchlineArena/card-publication-read-model";
import {
  formatTouchlineMarketValueEur,
  parseTouchlinePublicEditorialCardPresentation,
  type TouchlinePublicEditorialCardPresentation,
} from "@/lib/touchlineArena/editorial-card-profile";
import {
  loadTouchlinePublicPlayerProjections,
  type TouchlinePublicPlayerProjection,
  type TouchlinePublicPlayerProjectionRequest,
  type TouchlinePublicProjectionStatus,
} from "@/lib/touchlineArena/market-value-read-model";
import {
  hasTouchlineCountryFlag,
  normalizeTouchlineCountryCode3,
  touchlineCountryCode3FromName,
  touchlineCountryFlagUrl,
} from "@/lib/touchlineArena/country-flags";
import { TOUCHLINE_ENGLAND_CLUBS, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { resolveTouchlineMarketCataloguePosition } from "@/lib/touchlineArena/market-position-catalogue";
import { evaluateTouchlineCardCompleteness } from "@/lib/touchlineArena/card-review-state";
import { loadTouchlineCardEditorialOverrides } from "@/lib/touchlineArena/card-editorial-overrides";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function countryCode3(name?: string | null, code?: string | null) {
  const normalizedCode = normalizeTouchlineCountryCode3(code);
  if (hasTouchlineCountryFlag(normalizedCode)) return normalizedCode;
  const codeFromName = touchlineCountryCode3FromName(name);
  if (codeFromName) return codeFromName;
  return normalizedCode !== "N/A" ? normalizedCode : "N/A";
}

function mapPersistedSquadPlayer(
  player: PersistedSquadPlayer,
  clubTeamId: string,
  clubName: string,
  clubShortCode: string,
  clubLogoUrl: string | null,
) {
  const officialShirtNumber = resolveOfficialShirtNumber({
    providerId: player.providerId,
    clubTeamId,
    cachedValues: [player.jerseyNumber],
    cachedVerifiedAt: player.sourceUpdatedAt,
  });
  const role = inferArenaRole(player.position ?? undefined);
  const countryCode = countryCode3(player.nationality, null);
  const flagUrl = touchlineCountryFlagUrl(countryCode);
  return {
    id: player.providerId,
    providerId: player.providerId,
    name: player.displayName || player.name,
    shortName: makeArenaShortName(player.displayName || player.name),
    role,
    position: player.position,
    shirtNumber: officialShirtNumber.shirtNumber,
    shirtNumberSource: officialShirtNumber.source,
    shirtNumberVerifiedAt: officialShirtNumber.verifiedAt,
    shirtNumberSourceUrl: officialShirtNumber.sourceUrl,
    cardEligibility: officialShirtNumber.shirtNumber ? "eligible" : "awaiting-shirt-number",
    clubTeamId,
    clubName,
    clubShortCode,
    clubLogoUrl,
    // Keep roster identity/membership data only. Public card presentation is
    // editorial and never reads a player valuation from this snapshot.
    marketValue: null,
    marketValueSource: "unavailable" as const,
    marketValueState: "unavailable" as TouchlinePublicProjectionStatus,
    classificationState: "unavailable" as TouchlinePublicProjectionStatus,
    cardTier: null as TouchlineCardTierKey | null,
    cardPriceVersion: null,
    canonicalPlayerId: null as string | null,
    editorialCard: null as TouchlinePublicEditorialCardPresentation | null,
    cardReview: evaluateTouchlineCardCompleteness({
      displayName: player.displayName || player.name,
      shirtNumber: officialShirtNumber.shirtNumber,
      countryCode3: countryCode,
      position: player.position,
      hasVerifiedMarketValue: false,
      hasClubAsset: Boolean(clubLogoUrl),
    }),
    countryCode3: countryCode,
    flagUrl,
    nationality: player.nationality,
    source: "touchline_database" as const,
  };
}

type SquadCandidate = ReturnType<typeof mapPersistedSquadPlayer>;

export type PublicPremierSquadPlayer = Omit<
  SquadCandidate,
  | "marketValue"
  | "marketValueSource"
  | "marketValueState"
  | "classificationState"
  | "cardTier"
  | "cardPriceVersion"
  | "canonicalPlayerId"
  | "editorialCard"
  | "source"
> & Readonly<{
  marketValue: string | null;
  marketValueSource: "verified-cache" | "unavailable";
  marketValueState: TouchlinePublicProjectionStatus;
  classificationState: TouchlinePublicProjectionStatus;
  cardTier: TouchlineCardTierKey | null;
  cardPriceVersion: string | null;
  marketValueEur: number | null;
  marketValueUpdatedAt: string | null;
  authoritativeMarketValueSource: "verified-cache" | null;
  canonicalPlayerId: string;
  editorialCard: TouchlinePublicEditorialCardPresentation | null;
  cardReview: ReturnType<typeof evaluateTouchlineCardCompleteness>;
  source: "touchline_database" | "touchline_editorial" | "touchline_legacy_verified";
  publicProjectionState: "ready" | "partial";
}>;

/**
 * Canonical public-roster adapter shared by ClubHub and presentation-only
 * surfaces. Keeping one adapter prevents a social draft from silently
 * changing the identity, tier or shirt number of the card shown on the site.
 */
export function publicPremierSquadPlayerToCard(
  player: PublicPremierSquadPlayer,
  clubName: string,
): ClubOwnerSquadCard {
  return {
    id: player.providerId || player.id,
    canonicalPlayerId: player.canonicalPlayerId ?? null,
    name: player.name,
    shortName: player.shortName || player.name,
    role: player.role || "midfielder",
    position: player.position || player.role || "MID",
    clubName,
    shirtNumber: normalizeOfficialShirtNumber(player.shirtNumber),
    countryCode3: player.countryCode3 || "N/A",
    marketValue: player.marketValue ?? "",
    marketValueSource: player.marketValueSource || "unavailable",
    marketValueState: player.marketValueState,
    classificationState: player.classificationState,
    cardTier: player.cardTier ?? undefined,
    cardPriceVersion: player.cardPriceVersion || undefined,
    editorialCard: player.editorialCard ?? null,
    cardReview: player.cardReview,
    touchlinePoints: 0,
  };
}

export type PendingPublicPremierSquadPlayer = Readonly<{
  id: string;
  providerId: string;
  name: string;
  position: string | null;
  reason: string;
}>;

function publicProjectionOmission(
  candidate: SquadCandidate,
  projection: TouchlinePublicPlayerProjection | undefined,
): PendingPublicPremierSquadPlayer {
  const identity = projection?.identity.status === "verified" ? projection.identity.value : null;
  const membership = projection?.membership;
  return {
    id: candidate.id,
    providerId: candidate.providerId,
    name: identity?.displayName ?? "TouchLine player",
    position: membership?.value?.position ?? null,
    reason: membership?.reason ?? projection?.identity.reason ?? "canonical-player-unavailable",
  };
}

function legacyVerifiedCardPresentation(projection: TouchlinePublicPlayerProjection | undefined) {
  const classification = projection?.classification.status === "verified" ? projection.classification.value : null;
  const lastReviewedAt = projection?.marketValue.status === "verified" ? projection.marketValue.value?.lastVerified : null;
  if (!classification || !lastReviewedAt) return null;
  return parseTouchlinePublicEditorialCardPresentation({
    tierKey: classification.tierKey,
    cardPrice: { amountMinor: classification.nominalPrice * 100, currency: "GBP" },
    marketValueEur: projection?.marketValue.value?.eur ?? undefined,
    lastReviewedAt,
  });
}

async function projectSquadForPublic(
  candidates: SquadCandidate[],
  expectedClubProviderTeamId: string,
  providedAdmin?: TouchlinePublicPlayerProjectionRequest["providedAdmin"],
): Promise<{
  state: "ready" | "partial" | "error";
  players: PublicPremierSquadPlayer[];
  omitted: PendingPublicPremierSquadPlayer[];
}> {
  const publicationGateEnabled = isTouchlineCardPublicationGateEnabled();
  const batch = await loadTouchlinePublicPlayerProjections({
    providerPlayerIds: candidates.map((candidate) => candidate.providerId),
    context: { expectedClubProviderTeamId },
    // Only the verified canonical value is eligible for the public card and
    // Fantasy budget projection; provider/raw valuation data never crosses.
    includeMarketValues: true,
    providedAdmin,
  });
  if (batch.status === "error") return { state: "error", players: [], omitted: [] };

  const projections = new Map(batch.projections.map((projection) => [projection.providerPlayerId, projection] as const));
  const publishedCards = publicationGateEnabled
    ? await loadTouchlinePublishedCardPresentations({
      playerIds: batch.projections.flatMap((projection) => projection.identity.status === "verified" && projection.identity.value
        ? [projection.identity.value.playerId]
        : []),
      providedAdmin,
    })
    : new Map<string, TouchlinePublicEditorialCardPresentation>();
  const editorialOverrides = await loadTouchlineCardEditorialOverrides(
    batch.projections.flatMap((projection) => projection.identity.status === "verified" && projection.identity.value
      ? [projection.identity.value.playerId]
      : []),
  );
  const players: PublicPremierSquadPlayer[] = [];
  const omitted: PendingPublicPremierSquadPlayer[] = [];

  for (const candidate of candidates) {
    const projection = projections.get(candidate.providerId);
    const identity = projection?.identity.status === "verified" ? projection.identity.value : null;
    const club = projection?.currentClub.status === "verified" ? projection.currentClub.value : null;
    const membership = projection?.membership.status === "verified" ? projection.membership.value : null;
    if (!projection || !identity || !club || !membership || club.providerTeamId !== expectedClubProviderTeamId) {
      omitted.push(publicProjectionOmission(candidate, projection));
      continue;
    }

    const editorialCard = publicationGateEnabled
      ? publishedCards.get(identity.playerId) ?? null
      : legacyVerifiedCardPresentation(projection);
    const verifiedMarketValueEur = editorialCard?.marketValueEur
      ?? (projection.marketValue.status === "verified" ? projection.marketValue.value?.eur : null);
    const override = editorialOverrides.get(identity.playerId.toLowerCase());
    const effectiveName = override?.displayName ?? identity.displayName;
    const effectiveShirtNumber = override?.shirtNumber ?? membership.jerseyNumber;
    const effectivePosition = override?.position ?? membership.position;
    const effectiveCountryCode3 = countryCode3(identity.nationality, override?.countryCode3 ?? identity.countryCode3);
    players.push({
      ...candidate,
      id: projection.providerPlayerId,
      providerId: projection.providerPlayerId,
      name: effectiveName,
      shortName: makeArenaShortName(effectiveName),
      role: inferArenaRole(effectivePosition ?? undefined),
      position: resolveTouchlineMarketCataloguePosition(projection.providerPlayerId, effectivePosition),
      shirtNumber: effectiveShirtNumber,
      shirtNumberSource: "verified-cache",
      shirtNumberVerifiedAt: null,
      shirtNumberSourceUrl: null,
      cardEligibility: effectiveShirtNumber ? "eligible" : "awaiting-shirt-number",
      clubTeamId: club.providerTeamId,
      clubName: club.name,
      countryCode3: effectiveCountryCode3,
      flagUrl: touchlineCountryFlagUrl(effectiveCountryCode3),
      nationality: identity.nationality,
      marketValue: verifiedMarketValueEur === null || verifiedMarketValueEur === undefined
        ? null
        : formatTouchlineMarketValueEur(verifiedMarketValueEur, "en-GB"),
      marketValueSource: verifiedMarketValueEur === null || verifiedMarketValueEur === undefined ? "unavailable" : "verified-cache",
      marketValueState: verifiedMarketValueEur === null || verifiedMarketValueEur === undefined ? "unavailable" : "verified",
      classificationState: "unavailable",
      cardTier: editorialCard?.tierKey ?? null,
      cardPriceVersion: null,
      marketValueEur: verifiedMarketValueEur ?? null,
      marketValueUpdatedAt: projection.marketValue.value?.lastVerified ?? null,
      authoritativeMarketValueSource: verifiedMarketValueEur === null || verifiedMarketValueEur === undefined ? null : "verified-cache",
      canonicalPlayerId: identity.playerId,
      editorialCard,
      cardReview: evaluateTouchlineCardCompleteness({
        displayName: effectiveName,
        shirtNumber: effectiveShirtNumber,
        countryCode3: effectiveCountryCode3,
        position: effectivePosition,
        hasVerifiedMarketValue: projection.marketValue.status === "verified",
        hasClubAsset: Boolean(TOUCHLINE_ENGLAND_CLUBS.find((knownClub) => knownClub.teamId === club.providerTeamId)?.logoUrl),
      }),
      source: publicationGateEnabled ? "touchline_editorial" : "touchline_legacy_verified",
      publicProjectionState: projection.readState === "partial" ? "partial" : "ready",
    });
  }

  return { state: batch.status, players, omitted };
}

function roleSortWeight(role: ReturnType<typeof inferArenaRole>) {
  if (role === "goalkeeper") return 0;
  if (role === "defender") return 1;
  if (role === "midfielder") return 2;
  return 3;
}

function squadPayload(
  mappedPlayers: PublicPremierSquadPlayer[],
  metadata: {
    teamId: string;
    clubName: string;
    clubShortCode: string;
    fetchedAt: string;
    cached: boolean;
    databaseSource: "fresh-snapshot" | "outage-fallback";
    degraded?: boolean;
  },
  projection: Pick<Awaited<ReturnType<typeof projectSquadForPublic>>, "state" | "omitted">,
) {
  const sortedPlayers = mappedPlayers
    .filter((player) => Boolean(player.name))
    .sort((a, b) => roleSortWeight(a.role) - roleSortWeight(b.role) || a.name.localeCompare(b.name));
  const players = sortedPlayers.filter((player) => player.cardEligibility === "eligible");
  const pendingPlayers = [
    ...sortedPlayers.filter((player) => player.cardEligibility === "awaiting-shirt-number").map((player) => ({
      id: player.id,
      providerId: player.providerId,
      name: player.name,
      position: player.position,
      reason: "awaiting-shirt-number" as const,
    })),
    ...projection.omitted,
  ];

  return {
    ok: true as const,
    teamId: metadata.teamId,
    team: { providerId: metadata.teamId, name: metadata.clubName, shortCode: metadata.clubShortCode },
    rosterPlayers: sortedPlayers,
    players,
    pendingPlayers,
    dataQuality: {
      totalPlayers: sortedPlayers.length,
      cardEligiblePlayers: players.length,
      awaitingShirtNumberPlayers: pendingPlayers.length,
      canonicalProjectionState: projection.state,
    },
    status: pendingPlayers.length
      ? `${players.length} TouchLine England players · ${pendingPlayers.length} awaiting official shirt number`
      : `${players.length} TouchLine England players`,
    fetchedAt: metadata.fetchedAt,
    cached: metadata.cached,
    databaseSource: metadata.databaseSource,
    databaseStored: true as const,
    degraded: metadata.degraded ?? false,
  };
}

export type PublicPremierSquadPayload = ReturnType<typeof squadPayload>;
export type PublicPremierSquadFailure = { ok: false; error: string; status?: string };
export type PublicPremierSquadReadResult = {
  status: number;
  headers?: Readonly<Record<string, string>>;
  body: PublicPremierSquadPayload | PublicPremierSquadFailure;
};

/**
 * Persisted-only reader shared by the ClubHub Server Component and public
 * Route Handler. It owns no Request/Response/cookie concerns and never makes
 * an internal HTTP or provider request.
 */
export async function readPublicPremierSquad(
  teamIdInput: string | null | undefined,
  options: Readonly<{
    /** Internal verified-render reads bypass the five-minute public cache. */
    providedAdmin?: TouchlinePublicPlayerProjectionRequest["providedAdmin"];
  }> = {},
): Promise<PublicPremierSquadReadResult> {
  const teamId = teamIdInput?.trim();
  if (!teamId || !/^[0-9]{1,20}$/.test(teamId)) {
    return { status: 400, body: { ok: false, error: "A valid numeric teamId is required." } };
  }

  const registeredClub = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === teamId);
  if (!registeredClub) {
    return { status: 404, body: { ok: false, error: "teamId is not registered in TouchLine England." } };
  }

  let persistedSnapshot;
  try {
    persistedSnapshot = options.providedAdmin
      ? await readPersistedSquadSnapshot(teamId, options.providedAdmin)
      : await readPersistedSquadSnapshot(teamId);
  } catch {
    persistedSnapshot = null;
  }

  if (!persistedSnapshot?.players.length) {
    return {
      status: 503,
      headers: NO_STORE_HEADERS,
      body: {
        ok: false,
        error: "No coherent persisted squad snapshot is available.",
        status: "canonical-squad-unavailable",
      },
    };
  }

  const candidates = persistedSnapshot.players.map((player) => mapPersistedSquadPlayer(
    player,
    teamId,
    registeredClub.name,
    registeredClub.shortCode,
    registeredClub.logoUrl ?? null,
  ));
  const projected = await projectSquadForPublic(candidates, teamId, options.providedAdmin);
  if (projected.state === "error") {
    return {
      status: 503,
      headers: NO_STORE_HEADERS,
      body: {
        ok: false,
        error: "TouchLine verified player data is temporarily unavailable.",
        status: "canonical-player-data-unavailable",
      },
    };
  }

  return {
    status: 200,
    headers: NO_STORE_HEADERS,
    body: squadPayload(projected.players, {
      teamId,
      clubName: registeredClub.name,
      clubShortCode: registeredClub.shortCode,
      fetchedAt: persistedSnapshot.capturedAt,
      cached: true,
      databaseSource: persistedSnapshot.fresh ? "fresh-snapshot" : "outage-fallback",
      degraded: !persistedSnapshot.fresh,
    }, projected),
  };
}
