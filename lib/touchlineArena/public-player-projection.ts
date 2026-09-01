import { resolveTouchlineCardClassification } from "./card-engine.ts";
import type { TouchlineCardTierKey } from "./card-rules.ts";
import { touchlineCountryCode3FromName } from "./country-flags.ts";
import { PLAYER_MARKET_TIER_POLICY_VERSION } from "./player-market-tiers.ts";

/**
 * Public football/card projection
 *
 * This module deliberately contains no database client and no provider call.
 * It turns bounded, server-owned rows into a stable public representation that
 * all public player surfaces can consume.  It is not a contract or inventory
 * read model: owner contracts and the Market inventory remain separate
 * authorities for ownership, availability and a frozen active-season price.
 */

export const TOUCHLINE_PUBLIC_PLAYER_PROJECTION_MAX_IDS = 60;
export const TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID = "8";
export const TOUCHLINE_ENGLAND_EFFECTIVE_SEASON = "2026-27";

export type TouchlinePublicProjectionStatus =
  | "verified"
  | "provisional"
  | "pending"
  | "unavailable"
  | "error";

export type TouchlinePublicProjectionReadState = "ready" | "partial" | "error";

export type TouchlinePublicProjectionContext = Readonly<{
  provider?: "sportmonks";
  competitionProviderId?: string;
  effectiveSeason?: string;
  expectedClubProviderTeamId?: string | null;
}>;

export type TouchlinePublicProjectionQueryState = "ready" | "error";

export type TouchlinePublicProjectionQueryStates = Readonly<{
  clubs: TouchlinePublicProjectionQueryState;
  competitions: TouchlinePublicProjectionQueryState;
  memberships: TouchlinePublicProjectionQueryState;
  marketValues: TouchlinePublicProjectionQueryState;
}>;

export type TouchlinePublicField<T> = Readonly<{
  status: TouchlinePublicProjectionStatus;
  value: T | null;
  reason: string | null;
}>;

export type TouchlinePublicPlayerProjection = Readonly<{
  providerPlayerId: string;
  identity: TouchlinePublicField<{
    playerId: string;
    name: string;
    displayName: string;
    nationality: string | null;
    countryCode3: string | null;
  }>;
  currentClub: TouchlinePublicField<{
    id: string;
    name: string;
    providerTeamId: string | null;
    competitionProviderId: string | null;
  }>;
  membership: TouchlinePublicField<{
    clubId: string;
    providerTeamId: string | null;
    position: string | null;
    jerseyNumber: number | null;
  }>;
  marketValue: TouchlinePublicField<{
    eur: number;
    verifiedSeason: string;
    lastVerified: string | null;
  }>;
  classification: TouchlinePublicField<{
    tierKey: TouchlineCardTierKey;
    nominalPrice: number;
    effectiveSeason: string;
    policyVersion: string;
    reason: "seasonal-classification" | "new-player-approved";
  }>;
  readState: TouchlinePublicProjectionReadState;
}>;

export type TouchlinePublicProjectionBatch = Readonly<{
  status: TouchlinePublicProjectionReadState;
  projections: readonly TouchlinePublicPlayerProjection[];
  missingProviderPlayerIds: readonly string[];
}>;

export type TouchlinePublicProjectionSourceRows = Readonly<{
  players: readonly Record<string, unknown>[];
  clubs: readonly Record<string, unknown>[];
  competitions: readonly Record<string, unknown>[];
  memberships: readonly Record<string, unknown>[];
  marketValues: readonly Record<string, unknown>[];
  queryStates?: Partial<TouchlinePublicProjectionQueryStates>;
}>;

type NormalizedContext = Readonly<{
  provider: "sportmonks";
  competitionProviderId: string;
  effectiveSeason: string;
  expectedClubProviderTeamId: string | null;
}>;

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asSafeInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function status<T>(
  fieldStatus: TouchlinePublicProjectionStatus,
  value: T | null,
  reason: string | null,
): TouchlinePublicField<T> {
  return { status: fieldStatus, value, reason };
}

function queryState(
  states: Partial<TouchlinePublicProjectionQueryStates> | undefined,
  key: keyof TouchlinePublicProjectionQueryStates,
) {
  return states?.[key] ?? "ready";
}

export function normalizeTouchlineEffectiveSeason(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})\s*[-/.]\s*(\d{2}|\d{4})$/);
  if (!match) return raw;
  const first = match[1];
  const second = match[2].length === 2 ? `${first.slice(0, 2)}${match[2]}` : match[2];
  return `${first}-${second}`;
}

export function normalizeTouchlinePublicProjectionContext(
  input: TouchlinePublicProjectionContext = {},
): NormalizedContext {
  return {
    provider: "sportmonks",
    competitionProviderId: String(input.competitionProviderId ?? TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID).trim(),
    effectiveSeason: normalizeTouchlineEffectiveSeason(input.effectiveSeason ?? TOUCHLINE_ENGLAND_EFFECTIVE_SEASON),
    expectedClubProviderTeamId: asTrimmedString(input.expectedClubProviderTeamId),
  };
}

export function normalizeTouchlinePublicProjectionProviderIds(
  providerPlayerIds: readonly (string | number | null | undefined)[],
) {
  return [...new Set(providerPlayerIds
    .map((value) => String(value ?? "").trim())
    .filter((value) => /^\d{1,20}$/.test(value)))];
}

function newestActiveMembershipByPlayerId(
  rows: readonly Record<string, unknown>[],
  playersById: Map<string, Record<string, unknown>>,
  clubsById: Map<string, Record<string, unknown>>,
  context: NormalizedContext,
) {
  const memberships = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const playerId = asTrimmedString(row.player_id);
    const player = playerId ? playersById.get(playerId) : null;
    const clubId = asTrimmedString(row.club_id);
    const club = clubId ? clubsById.get(clubId) : null;
    if (!playerId || !player || !clubId || !club || row.status !== "active") continue;
    if (clubId !== asTrimmedString(player.current_club_id)) continue;
    if (asTrimmedString(row.competition_id) !== asTrimmedString(club.competition_id)) continue;
    if (asTrimmedString(club.provider_competition_id) !== context.competitionProviderId) continue;

    const previous = memberships.get(playerId);
    const previousUpdatedAt = Date.parse(asTrimmedString(previous?.source_updated_at) ?? "");
    const candidateUpdatedAt = Date.parse(asTrimmedString(row.source_updated_at) ?? "");
    if (!previous || (Number.isFinite(candidateUpdatedAt) && (!Number.isFinite(previousUpdatedAt) || candidateUpdatedAt >= previousUpdatedAt))) {
      memberships.set(playerId, row);
    }
  }

  return memberships;
}

function marketValueForPlayer(
  row: Record<string, unknown> | undefined,
  context: NormalizedContext,
  valuesQueryState: TouchlinePublicProjectionQueryState,
): TouchlinePublicField<{ eur: number; verifiedSeason: string; lastVerified: string | null }> {
  if (valuesQueryState === "error") return status("error", null, "market-value-read-failed");
  if (!row) return status("pending", null, "market-value-pending");
  if (row.status === "pending" || row.confidence === "pending") {
    return status("pending", null, "market-value-pending");
  }
  if (row.status !== "verified" || row.confidence !== "verified") {
    return status("unavailable", null, "market-value-not-approved");
  }
  const marketValueEur = asSafeInteger(row.market_value_eur);
  if (marketValueEur === null || marketValueEur < 0) {
    return status("unavailable", null, "market-value-invalid");
  }
  const verifiedSeason = normalizeTouchlineEffectiveSeason(asTrimmedString(row.verified_season));
  if (!verifiedSeason || verifiedSeason !== context.effectiveSeason) {
    return status("pending", null, "market-value-season-not-verified");
  }
  return status("verified", {
    eur: marketValueEur,
    verifiedSeason,
    lastVerified: asTrimmedString(row.last_verified),
  }, null);
}

function publicReadState(fields: readonly TouchlinePublicField<unknown>[]): TouchlinePublicProjectionReadState {
  if (fields.some((field) => field.status === "error")) return "partial";
  return "ready";
}

/**
 * Pure mapping layer for tests and server callers. Inputs must already be
 * bounded by provider player ID; raw provider valuation is never read here.
 */
export function projectTouchlinePublicPlayers(
  providerPlayerIds: readonly (string | number | null | undefined)[],
  source: TouchlinePublicProjectionSourceRows,
  inputContext: TouchlinePublicProjectionContext = {},
): TouchlinePublicProjectionBatch {
  const normalizedProviderIds = normalizeTouchlinePublicProjectionProviderIds(providerPlayerIds);
  const context = normalizeTouchlinePublicProjectionContext(inputContext);
  if (normalizedProviderIds.length > TOUCHLINE_PUBLIC_PLAYER_PROJECTION_MAX_IDS) {
    return { status: "error", projections: [], missingProviderPlayerIds: normalizedProviderIds };
  }

  const states = source.queryStates ?? {};
  const playersByProviderId = new Map(
    source.players.flatMap((row) => {
      const providerPlayerId = asTrimmedString(row.provider_player_id);
      const playerId = asTrimmedString(row.id);
      const name = asTrimmedString(row.name);
      return providerPlayerId && playerId && name ? [[providerPlayerId, row] as const] : [];
    }),
  );
  const playersById = new Map(
    source.players.flatMap((row) => {
      const id = asTrimmedString(row.id);
      return id ? [[id, row] as const] : [];
    }),
  );
  const clubsById = new Map(
    source.clubs.flatMap((row) => {
      const id = asTrimmedString(row.id);
      const name = asTrimmedString(row.name);
      return id && name ? [[id, row] as const] : [];
    }),
  );
  const competitionsById = new Map(
    source.competitions.flatMap((row) => {
      const id = asTrimmedString(row.id);
      return id ? [[id, row] as const] : [];
    }),
  );
  const clubsWithCompetition = new Map(
    [...clubsById].map(([clubId, club]) => {
      const competition = competitionsById.get(asTrimmedString(club.competition_id) ?? "");
      const clubWithCompetition: Record<string, unknown> = {
        ...club,
        provider_competition_id: asTrimmedString(competition?.provider_competition_id),
      };
      return [clubId, clubWithCompetition] as const;
    }),
  );
  const membershipByPlayerId = queryState(states, "memberships") === "ready" && queryState(states, "clubs") === "ready" && queryState(states, "competitions") === "ready"
    ? newestActiveMembershipByPlayerId(source.memberships, playersById, clubsWithCompetition, context)
    : new Map<string, Record<string, unknown>>();
  const valuesByPlayerId = new Map(
    source.marketValues.flatMap((row) => {
      const playerId = asTrimmedString(row.player_id);
      return playerId ? [[playerId, row] as const] : [];
    }),
  );

  const projections: TouchlinePublicPlayerProjection[] = [];
  const missingProviderPlayerIds: string[] = [];

  for (const providerPlayerId of normalizedProviderIds) {
    const player = playersByProviderId.get(providerPlayerId);
    if (!player) {
      missingProviderPlayerIds.push(providerPlayerId);
      continue;
    }
    const playerId = asTrimmedString(player.id)!;
    const name = asTrimmedString(player.name)!;
    const currentClubId = asTrimmedString(player.current_club_id);
    const club = currentClubId ? clubsWithCompetition.get(currentClubId) : null;
    const nationality = asTrimmedString(player.nationality);
    const identity = status("verified", {
      playerId,
      name,
      displayName: asTrimmedString(player.display_name) ?? name,
      nationality,
      countryCode3: touchlineCountryCode3FromName(nationality),
    }, null);

    const currentClub = queryState(states, "clubs") === "error" || queryState(states, "competitions") === "error"
      ? status("error", null, "club-read-failed")
      : !currentClubId
      ? status("unavailable", null, "no-current-club")
      : !club
      ? status("unavailable", null, "current-club-not-found")
      : status("verified", {
        id: currentClubId,
        name: asTrimmedString(club.name)!,
        providerTeamId: asTrimmedString(club.provider_team_id),
        competitionProviderId: asTrimmedString(club.provider_competition_id),
      }, null);

    const membership = queryState(states, "memberships") === "error"
      ? status("error", null, "membership-read-failed")
      : currentClub.status !== "verified" || !currentClub.value
      ? status("unavailable", null, "no-current-club-membership")
      : currentClub.value.competitionProviderId !== context.competitionProviderId
      ? status("unavailable", null, "competition-mismatch")
      : context.expectedClubProviderTeamId && currentClub.value.providerTeamId !== context.expectedClubProviderTeamId
      ? status("unavailable", null, "club-mismatch")
      : !membershipByPlayerId.get(playerId)
      ? status("unavailable", null, "no-active-membership")
      : status("verified", {
        clubId: asTrimmedString(membershipByPlayerId.get(playerId)?.club_id)!,
        providerTeamId: currentClub.value.providerTeamId,
        position: asTrimmedString(membershipByPlayerId.get(playerId)?.position),
        jerseyNumber: asSafeInteger(membershipByPlayerId.get(playerId)?.jersey_number),
      }, null);

    const marketValue = marketValueForPlayer(
      valuesByPlayerId.get(playerId),
      context,
      queryState(states, "marketValues"),
    );
    const classification = marketValue.status === "verified" && membership.status === "verified"
      ? (() => {
        const resolved = resolveTouchlineCardClassification({
          approvedMarketValueEur: marketValue.value!.eur,
          effectiveSeason: context.effectiveSeason,
          policyVersion: PLAYER_MARKET_TIER_POLICY_VERSION,
        });
        return resolved
          ? status("verified", {
            tierKey: resolved.tierKey,
            nominalPrice: resolved.nominalPrice,
            effectiveSeason: resolved.effectiveSeason,
            policyVersion: resolved.policyVersion,
            reason: "seasonal-classification" as const,
          }, null)
          : status("unavailable", null, "classification-unavailable");
      })()
      : marketValue.status === "error" || membership.status === "error"
      ? status("error", null, "classification-read-failed")
      : marketValue.status === "pending"
      ? status("pending", null, marketValue.reason)
      : status("unavailable", null, membership.reason ?? marketValue.reason ?? "classification-unavailable");

    projections.push({
      providerPlayerId,
      identity,
      currentClub,
      membership,
      marketValue,
      classification,
      readState: publicReadState([identity, currentClub, membership, marketValue, classification]),
    });
  }

  return {
    status: projections.some((projection) => projection.readState === "partial")
      ? "partial"
      : "ready",
    projections,
    missingProviderPlayerIds,
  };
}
