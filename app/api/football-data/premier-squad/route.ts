import { NextResponse } from "next/server";
import {
  inferArenaRole,
  makeArenaShortName,
} from "@/lib/football-data/arena-lineup";
import {
  readPersistedSquadSnapshot,
  type PersistedSquadPlayer,
} from "@/lib/football-data/squad-snapshot-store";
import { resolveOfficialShirtNumber } from "@/lib/football-data/official-shirt-numbers";
import type { TouchlineCardTierKey } from "@/lib/touchlineArena/card-rules";
import { isTouchlineCardPublicationGateEnabled } from "@/lib/touchlineArena/card-publication-gate";
import { loadTouchlinePublishedCardPresentations } from "@/lib/touchlineArena/card-publication-read-model";
import {
  parseTouchlinePublicEditorialCardPresentation,
  type TouchlinePublicEditorialCardPresentation,
} from "@/lib/touchlineArena/editorial-card-profile";
import {
  loadTouchlinePublicPlayerProjections,
  type TouchlinePublicPlayerProjection,
  type TouchlinePublicProjectionStatus,
} from "@/lib/touchlineArena/market-value-read-model";
import {
  hasTouchlineCountryFlag,
  normalizeTouchlineCountryCode3,
  touchlineCountryCode3FromName,
  touchlineCountryFlagUrl,
} from "@/lib/touchlineArena/country-flags";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import { resolveTouchlineMarketCataloguePosition } from "@/lib/touchlineArena/market-position-catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    countryCode3: countryCode,
    flagUrl,
    nationality: player.nationality,
    source: "touchline_database",
  };
}

type SquadCandidate = ReturnType<typeof mapPersistedSquadPlayer>;

type PublicSquadPlayer = Omit<
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
  source: "touchline_database" | "touchline_editorial" | "touchline_legacy_verified";
  publicProjectionState: "ready" | "partial";
}>;

type PendingPublicSquadPlayer = Readonly<{
  id: string;
  providerId: string;
  name: string;
  position: string | null;
  reason: string;
}>;

function publicProjectionOmission(
  candidate: SquadCandidate,
  projection: TouchlinePublicPlayerProjection | undefined,
): PendingPublicSquadPlayer {
  const identity = projection?.identity.status === "verified" ? projection.identity.value : null;
  const membership = projection?.membership;
  return {
    id: candidate.id,
    providerId: candidate.providerId,
    // Provider identity is a lookup candidate only. If it cannot be resolved
    // locally, do not publish its name as a verified TouchLine card.
    name: identity?.displayName ?? "TouchLine player",
    position: membership?.value?.position ?? null,
    reason: membership?.reason
      ?? projection?.identity.reason
      ?? "canonical-player-unavailable",
  };
}

/**
 * Transitional display only. While the publication gate is OFF, an already
 * verified canonical value/classification may keep its existing game card.
 * It never exposes the EUR value and disappears as soon as the explicit
 * publication gate is enabled after backfill/cutover proof.
 */
function legacyVerifiedCardPresentation(
  projection: TouchlinePublicPlayerProjection | undefined,
) {
  const classification = projection?.classification.status === "verified"
    ? projection.classification.value
    : null;
  const lastReviewedAt = projection?.marketValue.status === "verified"
    ? projection.marketValue.value?.lastVerified
    : null;
  if (!classification || !lastReviewedAt) return null;
  return parseTouchlinePublicEditorialCardPresentation({
    tierKey: classification.tierKey,
    cardPrice: { amountMinor: classification.nominalPrice * 100, currency: "GBP" },
    lastReviewedAt,
  });
}

/**
 * One public adapter for coherent persisted snapshots.
 * It replaces provider identity/value/tier fallbacks with the bounded
 * server-owned projection and omits a player if the current club does not
 * match the requested roster. No inventory, offer or contract is queried.
 */
async function projectSquadForPublic(
  candidates: SquadCandidate[],
  expectedClubProviderTeamId: string,
): Promise<{
  state: "ready" | "partial" | "error";
  players: PublicSquadPlayer[];
  omitted: PendingPublicSquadPlayer[];
}> {
  const publicationGateEnabled = isTouchlineCardPublicationGateEnabled();
  const batch = await loadTouchlinePublicPlayerProjections({
    providerPlayerIds: candidates.map((candidate) => candidate.providerId),
    context: { expectedClubProviderTeamId },
    includeMarketValues: !publicationGateEnabled,
  });
  if (batch.status === "error") return { state: "error", players: [], omitted: [] };

  const projections = new Map(batch.projections.map((projection) => [projection.providerPlayerId, projection] as const));
  const publishedCards = publicationGateEnabled
    ? await loadTouchlinePublishedCardPresentations({
      playerIds: batch.projections.flatMap((projection) => projection.identity.status === "verified" && projection.identity.value
        ? [projection.identity.value.playerId]
        : []),
    })
    : new Map<string, TouchlinePublicEditorialCardPresentation>();
  const players: PublicSquadPlayer[] = [];
  const omitted: PendingPublicSquadPlayer[] = [];

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
    const publicCandidate = candidate;
    players.push({
      ...publicCandidate,
      id: projection.providerPlayerId,
      providerId: projection.providerPlayerId,
      name: identity.displayName,
      shortName: makeArenaShortName(identity.displayName),
      role: inferArenaRole(membership.position ?? undefined),
      position: resolveTouchlineMarketCataloguePosition(projection.providerPlayerId, membership.position),
      shirtNumber: membership.jerseyNumber,
      shirtNumberSource: "verified-cache",
      shirtNumberVerifiedAt: null,
      shirtNumberSourceUrl: null,
      cardEligibility: membership.jerseyNumber ? "eligible" : "awaiting-shirt-number",
      clubTeamId: club.providerTeamId,
      clubName: club.name,
      countryCode3: identity.countryCode3 ?? "N/A",
      flagUrl: touchlineCountryFlagUrl(identity.countryCode3 ?? "N/A"),
      nationality: identity.nationality,
      marketValue: null,
      marketValueSource: "unavailable",
      marketValueState: "unavailable",
      classificationState: "unavailable",
      cardTier: editorialCard?.tierKey ?? null,
      cardPriceVersion: null,
      marketValueEur: null,
      marketValueUpdatedAt: null,
      authoritativeMarketValueSource: null,
      canonicalPlayerId: identity.playerId,
      editorialCard,
      source: publicationGateEnabled ? "touchline_editorial" : "touchline_legacy_verified",
      publicProjectionState: projection.readState === "partial" ? "partial" : "ready",
    });
  }

  return { state: batch.status, players, omitted };
}

async function publicSquadResponse(
  candidates: SquadCandidate[],
  metadata: {
    teamId: string;
    clubName: string;
    clubShortCode: string;
    fetchedAt: string;
    cached: boolean;
    databaseSource: "fresh-snapshot" | "outage-fallback";
    degraded?: boolean;
  },
  options: { headers?: HeadersInit } = {},
) {
  const projected = await projectSquadForPublic(candidates, metadata.teamId);
  if (projected.state === "error") {
    return NextResponse.json({
      ok: false,
      error: "TouchLine verified player data is temporarily unavailable.",
      status: "canonical-player-data-unavailable",
    }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store", ...options.headers },
    });
  }
  return NextResponse.json(squadPayload(projected.players, metadata, projected), options);
}

function roleSortWeight(role: ReturnType<typeof inferArenaRole>) {
  if (role === "goalkeeper") return 0;
  if (role === "defender") return 1;
  if (role === "midfielder") return 2;
  return 3;
}

function squadPayload(
  mappedPlayers: PublicSquadPlayer[],
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
    ...sortedPlayers
    .filter((player) => player.cardEligibility === "awaiting-shirt-number")
    .map((player) => ({
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
    team: {
      providerId: metadata.teamId,
      name: metadata.clubName,
      shortCode: metadata.clubShortCode,
    },
    // Football identity is distinct from the eligibility to print a game card.
    // Consumers that show a squad/line-up must retain every real player and
    // disclose pending data rather than making the player disappear.
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
    databaseStored: true,
    degraded: metadata.degraded ?? false,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const teamId = url.searchParams.get("teamId")?.trim();

  if (!teamId || !/^[0-9]{1,20}$/.test(teamId)) {
    return NextResponse.json({ ok: false, error: "A valid numeric teamId is required." }, { status: 400 });
  }

  const registeredClub = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === teamId);
  if (!registeredClub) {
    return NextResponse.json({ ok: false, error: "teamId is not registered in TouchLine England." }, { status: 404 });
  }

  const clubName = registeredClub.name;
  const clubShortCode = registeredClub.shortCode;
  const clubLogoUrl = registeredClub.logoUrl ?? null;

  let persistedSnapshot;
  try {
    persistedSnapshot = await readPersistedSquadSnapshot(teamId);
  } catch {
    persistedSnapshot = null;
  }

  if (!persistedSnapshot?.players.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "No coherent persisted squad snapshot is available.",
        status: "canonical-squad-unavailable",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const candidates = persistedSnapshot.players.map((player) => mapPersistedSquadPlayer(
    player,
    teamId,
    clubName,
    clubShortCode,
    clubLogoUrl,
  ));

  return publicSquadResponse(candidates, {
    teamId,
    clubName,
    clubShortCode,
    fetchedAt: persistedSnapshot.capturedAt,
    cached: true,
    databaseSource: persistedSnapshot.fresh ? "fresh-snapshot" : "outage-fallback",
    degraded: !persistedSnapshot.fresh,
  }, {
    // Query flags never upgrade this public reader into a live fetch or write.
    headers: { "Cache-Control": "private, no-store" },
  });
}
