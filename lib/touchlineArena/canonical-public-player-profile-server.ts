import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadTouchlinePublishedCardPresentations } from "./card-publication-read-model.ts";
import { loadTouchlinePublicPlayerProjections } from "./market-value-read-model.ts";

const TOUCHLINE_CANONICAL_PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalPlayerId(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return TOUCHLINE_CANONICAL_PLAYER_ID.test(normalized) ? normalized : null;
}

/**
 * Resolves the opaque public card selector through the canonical UUID only.
 * Every stage is fail-closed: a UUID must have one Sportmonks-backed public
 * projection with verified competition/membership facts and a current,
 * published editorial presentation before a profile can render from it.
 */
export async function resolveTouchlineCanonicalPublicPlayerProfile(input: {
  canonicalPlayerId: string | null | undefined;
}) {
  const playerId = canonicalPlayerId(input.canonicalPlayerId);
  const admin = createAdminClient();
  if (!playerId || !admin) return null;

  const playerResponse = await admin
    .from("football_players")
    .select("id,provider_player_id")
    .eq("id", playerId)
    .eq("provider", "sportmonks")
    .maybeSingle();
  const row = playerResponse.data as { id?: unknown; provider_player_id?: unknown } | null;
  const providerPlayerId = typeof row?.provider_player_id === "string" && /^\d{1,20}$/.test(row.provider_player_id)
    ? row.provider_player_id
    : null;
  if (playerResponse.error || String(row?.id ?? "").trim().toLowerCase() !== playerId || !providerPlayerId) return null;

  const [projectionBatch, publishedCards] = await Promise.all([
    loadTouchlinePublicPlayerProjections({
      providerPlayerIds: [providerPlayerId],
      includeMarketValues: false,
    }),
    loadTouchlinePublishedCardPresentations({ playerIds: [playerId] }),
  ]);
  const projection = projectionBatch.projections.find((candidate) => candidate.providerPlayerId === providerPlayerId);
  if (!projection) return null;
  const identity = projection.identity;
  const identityValue = identity.value;
  if (
    projectionBatch.status === "error"
    || identity.status !== "verified"
    || !identityValue
    || identityValue.playerId.trim().toLowerCase() !== playerId
    || projection.currentClub.status !== "verified"
    || !projection.currentClub.value
    || projection.membership.status !== "verified"
    || !projection.membership.value
  ) return null;

  const editorialCard = publishedCards.get(playerId);
  if (!editorialCard) return null;
  return { canonicalPlayerId: playerId, providerPlayerId, projection, editorialCard } as const;
}
