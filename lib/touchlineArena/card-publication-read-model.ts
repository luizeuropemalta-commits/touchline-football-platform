import "server-only";

import { unstable_noStore } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseTouchlinePublicEditorialCardPresentation,
  type TouchlinePublicEditorialCardPresentation,
} from "./editorial-card-profile.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PLAYER_IDS = 750;

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
    || text(value.status) !== "verified" || text(value.confidence) !== "verified"
    || safeInteger(value.market_value_eur) === null || text(value.verified_season) !== season
    || text(membership.id) !== text(publication.current_membership_id)
    || text(membership.status) !== "active" || text(membership.club_id) !== playerCurrentClub
    || text(membership.competition_id) !== text(publication.competition_id)
  ) return null;

  return parseTouchlinePublicEditorialCardPresentation({
    tierKey,
    cardPrice: { amountMinor: price * 100, currency: "GBP" },
    marketValueEur: safeInteger(value.market_value_eur),
    lastReviewedAt: reviewedAt,
  });
}

async function readPublishedTouchlineCards(playerIds: readonly string[], admin: Admin | null) {
  if (!admin || !playerIds.length || playerIds.length > MAX_PLAYER_IDS) return new Map<string, TouchlinePublicEditorialCardPresentation>();

  const publicationsResponse = await admin
    .from("touchline_card_publications")
    .select("player_id,current_membership_id,competition_id,effective_season,publication_status,calculated_tier,calculated_nominal_price_gbp,last_reviewed_at")
    .eq("publication_status", "published")
    .in("player_id", playerIds);
  if (publicationsResponse.error) return new Map<string, TouchlinePublicEditorialCardPresentation>();
  const publications = rows(publicationsResponse.data);
  if (!publications.length) return new Map<string, TouchlinePublicEditorialCardPresentation>();

  const publishedPlayerIds = publications.map((row) => text(row.player_id)).filter((value): value is string => Boolean(value));
  const [valuesResponse, playersResponse, membershipsResponse] = await Promise.all([
    admin.from("football_player_market_values").select("player_id,market_value_eur,verified_season,status,confidence").in("player_id", publishedPlayerIds),
    admin.from("football_players").select("id,current_club_id").in("id", publishedPlayerIds),
    admin.from("football_squad_members").select("id,player_id,club_id,competition_id,status").in("player_id", publishedPlayerIds),
  ]);
  if (valuesResponse.error || playersResponse.error || membershipsResponse.error) return new Map<string, TouchlinePublicEditorialCardPresentation>();

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

  const result = new Map<string, TouchlinePublicEditorialCardPresentation>();
  for (const publication of publications) {
    const playerId = text(publication.player_id)?.toLowerCase();
    if (!playerId || result.has(playerId)) continue;
    const presentation = isPublicationRowValid(
      publication,
      valuesByPlayer.get(playerId),
      playersById.get(playerId),
      membershipsById.get(text(publication.current_membership_id) ?? ""),
    );
    if (presentation) result.set(playerId, presentation);
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
