import "server-only";

import { unstable_noStore } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseTouchlinePublicEditorialCardPresentation,
  type TouchlinePublicEditorialCardPresentation,
} from "./editorial-card-profile.ts";
import {
  TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR,
  TOUCHLINE_PROVISIONAL_MISSING_MARKET_VALUE,
  TOUCHLINE_PROVISIONAL_MISSING_SHIRT,
} from "./card-engine-provisional-policy.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PLAYER_IDS = 750;
const PLAYER_ID_QUERY_CHUNK_SIZE = 150;

type Row = Record<string, unknown>;
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Row => Boolean(entry && typeof entry === "object"))
    : [];
}

function jsonInteger(value: unknown) {
  const candidate = typeof value === "number"
    ? value
    : value && typeof value === "object" && !Array.isArray(value)
      ? (value as Row).value
      : null;
  return safeInteger(candidate);
}

function normalizePlayerIds(values: readonly (string | null | undefined)[]) {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (UUID_PATTERN.test(normalized)) unique.add(normalized);
  }
  return [...unique];
}

function isPublicationRowValid(
  publication: Row,
  value: Row | undefined,
  player: Row | undefined,
  membership: Row | undefined,
  overrides: ReadonlyMap<string, Row>,
) {
  const playerId = text(publication.player_id)?.toLowerCase();
  const publicationState = text(publication.publication_status);
  const tierKey = text(publication.calculated_tier);
  const price = safeInteger(publication.calculated_nominal_price_gbp);
  const reviewedAt = text(publication.last_reviewed_at);
  const season = text(publication.effective_season);
  const playerCurrentClub = text(player?.current_club_id);

  if (
    !playerId || publicationState !== "published" || !tierKey || price === null || price < 0
    || !reviewedAt || !season || !value || !player || !membership
    || text(value.player_id)?.toLowerCase() !== playerId
    || safeInteger(value.market_value_eur) === null || text(value.verified_season) !== season
    || text(membership.id) !== text(publication.current_membership_id)
    || text(membership.status) !== "active" || text(membership.club_id) !== playerCurrentClub
    || text(membership.competition_id) !== text(publication.competition_id)
  ) return null;

  const marketValue = safeInteger(value.market_value_eur);
  const marketOverride = overrides.get("marketValueEur");
  const verifiedMarketValue = text(value.status) === "verified"
    && text(value.confidence) === "verified";
  const provisionalMarketValue = text(value.status) === "provisional"
    && text(value.confidence) === "provisional"
    && text(value.source) === "touchline_card_engine_provisional"
    && marketValue === TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR
    && text(publication.internal_source) === "touchline_card_engine_provisional_defaults"
    && text(marketOverride?.status) === "provisional"
    && text(marketOverride?.provenance_status) === TOUCHLINE_PROVISIONAL_MISSING_MARKET_VALUE
    && jsonInteger(marketOverride?.effective_value) === TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR
    && Boolean(text(marketOverride?.last_verification_at))
    && Boolean(text(marketOverride?.next_verification_at));
  if (!verifiedMarketValue && !provisionalMarketValue) return null;

  const approvedShirt = overrides.get("shirtNumber");
  const approvedShirtNumber = text(approvedShirt?.status) === "approved"
    ? jsonInteger(approvedShirt?.effective_value)
    : null;
  const membershipShirtNumber = safeInteger(membership.jersey_number);
  const provisionalShirt = text(approvedShirt?.status) === "provisional"
    && text(approvedShirt?.provenance_status) === TOUCHLINE_PROVISIONAL_MISSING_SHIRT
    && jsonInteger(approvedShirt?.effective_value) === 0
    && Boolean(text(approvedShirt?.last_verification_at))
    && Boolean(text(approvedShirt?.next_verification_at));
  const shirtNumber = approvedShirtNumber !== null && approvedShirtNumber > 0
    ? approvedShirtNumber
    : membershipShirtNumber !== null && membershipShirtNumber > 0
      ? membershipShirtNumber
      : provisionalShirt
        ? 0
        : undefined;
  const shirtNumberState = shirtNumber === undefined
    ? undefined
    : shirtNumber === 0
      ? "provisional" as const
      : "verified" as const;

  return parseTouchlinePublicEditorialCardPresentation({
    tierKey,
    cardPrice: { amountMinor: price * 100, currency: "GBP" },
    marketValueEur: marketValue,
    marketValueState: provisionalMarketValue ? "provisional" : "verified",
    ...(shirtNumber === undefined ? {} : { shirtNumber, shirtNumberState }),
    lastReviewedAt: reviewedAt,
  });
}

async function readPublishedTouchlineCardsChunk(playerIds: readonly string[], admin: Admin) {
  const publicationsResponse = await admin
    .from("touchline_card_publications")
    .select("player_id,current_membership_id,competition_id,effective_season,publication_status,calculated_tier,calculated_nominal_price_gbp,last_reviewed_at,internal_source")
    .eq("publication_status", "published")
    .in("player_id", playerIds);
  if (publicationsResponse.error) return null;
  const publications = rows(publicationsResponse.data);
  if (!publications.length) return new Map<string, TouchlinePublicEditorialCardPresentation>();

  const publishedPlayerIds = publications.map((row) => text(row.player_id)).filter((value): value is string => Boolean(value));
  const [valuesResponse, playersResponse, membershipsResponse, overridesResponse] = await Promise.all([
    admin.from("football_player_market_values").select("player_id,market_value_eur,verified_season,status,confidence,source").in("player_id", publishedPlayerIds),
    admin.from("football_players").select("id,current_club_id").in("id", publishedPlayerIds),
    admin.from("football_squad_members").select("id,player_id,club_id,competition_id,status,jersey_number").in("player_id", publishedPlayerIds),
    admin.from("touchline_card_editorial_overrides")
      .select("player_id,field_key,effective_value,status,provenance_status,last_verification_at,next_verification_at")
      .in("player_id", publishedPlayerIds)
      .in("field_key", ["shirtNumber", "marketValueEur"]),
  ]);
  if (valuesResponse.error || playersResponse.error || membershipsResponse.error || overridesResponse.error) return null;

  const valuesByPlayer = new Map(rows(valuesResponse.data).flatMap((row) => {
    const playerId = text(row.player_id)?.toLowerCase();
    return playerId ? [[playerId, row] as const] : [];
  }));
  const playersById = new Map(rows(playersResponse.data).flatMap((row) => {
    const playerId = text(row.id)?.toLowerCase();
    return playerId ? [[playerId, row] as const] : [];
  }));
  const membershipsById = new Map(rows(membershipsResponse.data).flatMap((row) => {
    const membershipId = text(row.id);
    return membershipId ? [[membershipId, row] as const] : [];
  }));
  const overridesByPlayer = new Map<string, Map<string, Row>>();
  for (const row of rows(overridesResponse.data)) {
    const playerId = text(row.player_id)?.toLowerCase();
    const fieldKey = text(row.field_key);
    if (!playerId || !fieldKey) continue;
    const playerOverrides = overridesByPlayer.get(playerId) ?? new Map<string, Row>();
    playerOverrides.set(fieldKey, row);
    overridesByPlayer.set(playerId, playerOverrides);
  }

  const result = new Map<string, TouchlinePublicEditorialCardPresentation>();
  for (const publication of publications) {
    const playerId = text(publication.player_id)?.toLowerCase();
    if (!playerId || result.has(playerId)) continue;
    const presentation = isPublicationRowValid(
      publication,
      valuesByPlayer.get(playerId),
      playersById.get(playerId),
      membershipsById.get(text(publication.current_membership_id) ?? ""),
      overridesByPlayer.get(playerId) ?? new Map(),
    );
    if (presentation) result.set(playerId, presentation);
  }
  return result;
}

async function readPublishedTouchlineCards(playerIds: readonly string[], admin: Admin | null) {
  if (!admin || !playerIds.length || playerIds.length > MAX_PLAYER_IDS) return new Map<string, TouchlinePublicEditorialCardPresentation>();

  const chunks = Array.from(
    { length: Math.ceil(playerIds.length / PLAYER_ID_QUERY_CHUNK_SIZE) },
    (_, index) => playerIds.slice(index * PLAYER_ID_QUERY_CHUNK_SIZE, (index + 1) * PLAYER_ID_QUERY_CHUNK_SIZE),
  );
  const chunkResults = await Promise.all(chunks.map((chunk) => readPublishedTouchlineCardsChunk(chunk, admin)));
  if (chunkResults.some((result) => result === null)) return new Map<string, TouchlinePublicEditorialCardPresentation>();

  const result = new Map<string, TouchlinePublicEditorialCardPresentation>();
  for (const chunk of chunkResults) {
    if (!chunk) continue;
    for (const [playerId, presentation] of chunk) result.set(playerId, presentation);
  }
  return result;
}

/**
 * Sole server-owned publication policy for game-card consumers. It returns a
 * card only if the database lifecycle is PUBLISHED and the stored value,
 * classification and active canonical membership still agree.
 *
 * This deliberately performs a fresh server read. Publication is an
 * editorial command that must be visible immediately after the transaction
 * commits; a post-commit cache invalidation must never be another source of
 * partial or stale publication state.
 */
export async function loadTouchlinePublishedCardPresentations(input: Readonly<{
  playerIds: readonly (string | null | undefined)[];
  /** Test-only injection bypasses the cache. */
  providedAdmin?: Admin | null;
}>) {
  const playerIds = normalizePlayerIds(input.playerIds);
  if (!playerIds.length || playerIds.length > MAX_PLAYER_IDS) return new Map<string, TouchlinePublicEditorialCardPresentation>();
  if (input.providedAdmin !== undefined) return readPublishedTouchlineCards(playerIds, input.providedAdmin);
  unstable_noStore();
  return readPublishedTouchlineCards(playerIds, createAdminClient());
}

/** Public summary count; it never expands the publication DTO or exposes rows. */
export async function countTouchlinePublishedPlayerCards() {
  unstable_noStore();
  const admin = createAdminClient();
  if (!admin) return null;
  const { count, error } = await admin
    .from("touchline_card_publications")
    .select("player_id", { count: "exact", head: true })
    .eq("publication_status", "published");
  return error || count === null ? null : count;
}
