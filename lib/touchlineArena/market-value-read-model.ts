import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  TOUCHLINE_ENGLAND_EFFECTIVE_SEASON,
  TOUCHLINE_PUBLIC_PLAYER_PROJECTION_MAX_IDS,
  normalizeTouchlineEffectiveSeason,
  normalizeTouchlinePublicProjectionContext,
  normalizeTouchlinePublicProjectionProviderIds,
  projectTouchlinePublicPlayers,
  type TouchlinePublicProjectionBatch,
  type TouchlinePublicProjectionContext,
} from "./public-player-projection.ts";

export type TouchlineVerifiedMarketValue = Readonly<{
  status: "verified" | "pending" | "unavailable";
  marketValueEur: number | null;
  lastVerified: string | null;
}>;

export type TouchlinePublicPlayerProjectionRequest = Readonly<{
  providerPlayerIds: readonly (string | number | null | undefined)[];
  context?: TouchlinePublicProjectionContext;
  /**
   * Identity/membership-only public reads must opt out of the legacy
   * valuation table. Editorial card surfaces use this mode.
   */
  includeMarketValues?: boolean;
  /** Test-only dependency injection: bypasses the Next cache. */
  providedAdmin?: ReturnType<typeof createAdminClient>;
}>;

type DatabaseRow = Record<string, unknown>;
type QueryResult = Readonly<{ data: DatabaseRow[]; error: unknown | null }>;

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asSafeInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function asRows(value: unknown): DatabaseRow[] {
  return Array.isArray(value)
    ? value.filter((row): row is DatabaseRow => Boolean(row && typeof row === "object"))
    : [];
}

function readFailureBatch(providerPlayerIds: readonly string[]): TouchlinePublicProjectionBatch {
  return {
    status: "error",
    projections: [],
    missingProviderPlayerIds: providerPlayerIds,
  };
}

function projectionCacheTags(
  providerPlayerIds: readonly string[],
  context: ReturnType<typeof normalizeTouchlinePublicProjectionContext>,
) {
  const contextTag = `touchline-public-projection:${context.competitionProviderId}:${context.effectiveSeason}`;
  return [
    contextTag,
    ...providerPlayerIds.map((providerPlayerId) => `${contextTag}:player:${providerPlayerId}`),
    ...(context.expectedClubProviderTeamId
      ? [`${contextTag}:club:${context.expectedClubProviderTeamId}`]
      : []),
  ];
}

async function queryRows(query: PromiseLike<{ data: unknown; error: unknown | null }>): Promise<QueryResult> {
  const result = await query;
  return { data: asRows(result.data), error: result.error };
}

/**
 * Reads a bounded public projection. Each query is independently accounted
 * for: a temporary club/membership error cannot erase an otherwise verified
 * market value, and a value query failure is visible to consumers as `error`.
 */
async function readTouchlinePublicPlayerProjections(
  providerPlayerIds: readonly string[],
  inputContext: TouchlinePublicProjectionContext,
  includeMarketValues: boolean,
  providedAdmin?: ReturnType<typeof createAdminClient>,
): Promise<TouchlinePublicProjectionBatch> {
  const context = normalizeTouchlinePublicProjectionContext(inputContext);
  const admin = providedAdmin ?? createAdminClient();
  if (!admin) return readFailureBatch(providerPlayerIds);

  const playersResult = await queryRows(admin
    .from("football_players")
    .select("id,provider_player_id,current_club_id,name,display_name,nationality")
    .eq("provider", context.provider)
    .in("provider_player_id", providerPlayerIds));
  if (playersResult.error) return readFailureBatch(providerPlayerIds);
  if (!playersResult.data.length) {
    return { status: "ready", projections: [], missingProviderPlayerIds: providerPlayerIds };
  }

  const playerIds = playersResult.data
    .map((row) => asTrimmedString(row.id))
    .filter((value): value is string => Boolean(value));
  const clubIds = [...new Set(playersResult.data
    .map((row) => asTrimmedString(row.current_club_id))
    .filter((value): value is string => Boolean(value)))];

  const clubsPromise = clubIds.length
    ? queryRows(admin
      .from("football_clubs")
      .select("id,name,provider_team_id,competition_id")
      .in("id", clubIds))
    : Promise.resolve({ data: [], error: null } as QueryResult);
  const membershipsPromise = playerIds.length
    ? queryRows(admin
      .from("football_squad_members")
      .select("player_id,club_id,competition_id,jersey_number,position,status,source_updated_at")
      .eq("provider", context.provider)
      .eq("status", "active")
      .in("player_id", playerIds)
      .in("club_id", clubIds.length ? clubIds : ["__none__"]))
    : Promise.resolve({ data: [], error: null } as QueryResult);
  const marketValuesPromise = includeMarketValues && playerIds.length
    ? queryRows(admin
      .from("football_player_market_values")
      .select("player_id,market_value_eur,verified_season,status,confidence,last_verified")
      .in("player_id", playerIds))
    : Promise.resolve({ data: [], error: null } as QueryResult);

  const [clubsResult, membershipsResult, marketValuesResult] = await Promise.all([
    clubsPromise,
    membershipsPromise,
    marketValuesPromise,
  ]);
  const competitionIds = [...new Set(clubsResult.data
    .map((row) => asTrimmedString(row.competition_id))
    .filter((value): value is string => Boolean(value)))];
  const competitionsResult = competitionIds.length
    ? await queryRows(admin
      .from("football_competitions")
      .select("id,provider_competition_id")
      .in("id", competitionIds))
    : { data: [], error: null } as QueryResult;

  return projectTouchlinePublicPlayers(providerPlayerIds, {
    players: playersResult.data,
    clubs: clubsResult.data,
    competitions: competitionsResult.data,
    memberships: membershipsResult.data,
    marketValues: marketValuesResult.data,
    queryStates: {
      clubs: clubsResult.error ? "error" : "ready",
      competitions: competitionsResult.error ? "error" : "ready",
      memberships: membershipsResult.error ? "error" : "ready",
      marketValues: includeMarketValues && marketValuesResult.error ? "error" : "ready",
    },
  }, context);
}

/**
 * Server-owned public read model. This hard-caps a request to a roster-sized
 * batch, caches only football/public data, and never caches user inventory.
 */
export async function loadTouchlinePublicPlayerProjections(
  request: TouchlinePublicPlayerProjectionRequest,
): Promise<TouchlinePublicProjectionBatch> {
  const providerPlayerIds = normalizeTouchlinePublicProjectionProviderIds(request.providerPlayerIds);
  if (!providerPlayerIds.length) return { status: "ready", projections: [], missingProviderPlayerIds: [] };
  if (providerPlayerIds.length > TOUCHLINE_PUBLIC_PLAYER_PROJECTION_MAX_IDS) {
    return readFailureBatch(providerPlayerIds);
  }

  const context = normalizeTouchlinePublicProjectionContext(request.context);
  const includeMarketValues = request.includeMarketValues !== false;
  if (request.providedAdmin) {
    return readTouchlinePublicPlayerProjections(providerPlayerIds, context, includeMarketValues, request.providedAdmin);
  }

  const cacheKey = [
    "touchline-public-player-projection-v1",
    context.competitionProviderId,
    context.effectiveSeason,
    context.expectedClubProviderTeamId ?? "any-club",
    includeMarketValues ? "with-market-values" : "identity-membership-only",
    providerPlayerIds.join(","),
  ];
  const cached = unstable_cache(
    () => readTouchlinePublicPlayerProjections(providerPlayerIds, context, includeMarketValues),
    cacheKey,
    { revalidate: 300, tags: projectionCacheTags(providerPlayerIds, context) },
  );
  return cached();
}

/**
 * Compatibility adapter for the previous limited public identity reader.
 * New consumers should use `loadTouchlinePublicPlayerProjections` so that
 * Pending, unavailable and technical-error states remain distinguishable.
 */
export async function loadTouchlineCanonicalPublicPlayersByProviderIds(
  providerPlayerIds: readonly (string | number | null | undefined)[],
) {
  const batch = await loadTouchlinePublicPlayerProjections({ providerPlayerIds });
  return new Map(batch.projections.flatMap((projection) => {
    const identity = projection.identity.value;
    if (projection.identity.status !== "verified" || !identity) return [];
    const club = projection.currentClub.status === "verified" ? projection.currentClub.value : null;
    const membership = projection.membership.status === "verified" ? projection.membership.value : null;
    return [[projection.providerPlayerId, {
      playerId: identity.playerId,
      providerPlayerId: projection.providerPlayerId,
      name: identity.name,
      displayName: identity.displayName,
      currentClub: club ? {
        id: club.id,
        name: club.name,
        providerTeamId: club.providerTeamId,
      } : null,
      position: membership?.position ?? null,
      nationality: identity.nationality,
      jerseyNumber: membership?.jerseyNumber ?? null,
      marketValue: projection.marketValue.status === "verified" && projection.marketValue.value
        ? { status: "verified" as const, marketValueEur: projection.marketValue.value.eur, lastVerified: projection.marketValue.value.lastVerified }
        : projection.marketValue.status === "pending"
        ? { status: "pending" as const, marketValueEur: null, lastVerified: null }
        : { status: "unavailable" as const, marketValueEur: null, lastVerified: null },
    }] as const];
  }));
}

/**
 * Lightweight value-only reader retained for value consumers that do not need
 * club/membership identity. It intentionally avoids the four-query projection.
 */
export async function loadTouchlineVerifiedMarketValueByProviderPlayerId(
  providerPlayerId: string | null | undefined,
): Promise<TouchlineVerifiedMarketValue> {
  const normalizedProviderPlayerId = String(providerPlayerId ?? "").trim();
  if (!/^\d{1,20}$/.test(normalizedProviderPlayerId)) {
    return { status: "unavailable", marketValueEur: null, lastVerified: null };
  }
  const admin = createAdminClient();
  if (!admin) return { status: "unavailable", marketValueEur: null, lastVerified: null };

  const playerResult = await admin
    .from("football_players")
    .select("id")
    .eq("provider", "sportmonks")
    .eq("provider_player_id", normalizedProviderPlayerId)
    .maybeSingle();
  const playerId = asTrimmedString((playerResult.data as DatabaseRow | null)?.id);
  if (playerResult.error || !playerId) {
    return { status: "unavailable", marketValueEur: null, lastVerified: null };
  }
  const valueResult = await admin
    .from("football_player_market_values")
    .select("market_value_eur,verified_season,status,confidence,last_verified")
    .eq("player_id", playerId)
    .maybeSingle();
  const row = valueResult.data as DatabaseRow | null;
  if (valueResult.error || !row) return { status: "unavailable", marketValueEur: null, lastVerified: null };
  if (row.status === "pending" || row.confidence === "pending") {
    return { status: "pending", marketValueEur: null, lastVerified: null };
  }
  const marketValueEur = asSafeInteger(row.market_value_eur);
  const verifiedSeason = normalizeTouchlineEffectiveSeason(asTrimmedString(row.verified_season));
  if (
    row.status !== "verified"
    || row.confidence !== "verified"
    || marketValueEur === null
    || marketValueEur < 0
    || verifiedSeason !== TOUCHLINE_ENGLAND_EFFECTIVE_SEASON
  ) {
    return { status: "unavailable", marketValueEur: null, lastVerified: null };
  }
  return {
    status: "verified",
    marketValueEur,
    lastVerified: asTrimmedString(row.last_verified),
  };
}

/** Selective invalidation for a reviewed market-value or membership import. */
export function revalidateTouchlinePublicPlayerProjectionCache(input: {
  providerPlayerIds: readonly (string | number | null | undefined)[];
  context?: TouchlinePublicProjectionContext;
}) {
  const providerPlayerIds = normalizeTouchlinePublicProjectionProviderIds(input.providerPlayerIds);
  if (!providerPlayerIds.length || providerPlayerIds.length > TOUCHLINE_PUBLIC_PLAYER_PROJECTION_MAX_IDS) return;
  const context = normalizeTouchlinePublicProjectionContext(input.context);
  for (const tag of projectionCacheTags(providerPlayerIds, context)) {
    revalidateTag(tag, "max");
  }
}

export {
  TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID,
  TOUCHLINE_ENGLAND_EFFECTIVE_SEASON,
  TOUCHLINE_PUBLIC_PLAYER_PROJECTION_MAX_IDS,
  type TouchlinePublicPlayerProjection,
  type TouchlinePublicProjectionBatch,
  type TouchlinePublicProjectionContext,
  type TouchlinePublicProjectionStatus,
} from "./public-player-projection.ts";
