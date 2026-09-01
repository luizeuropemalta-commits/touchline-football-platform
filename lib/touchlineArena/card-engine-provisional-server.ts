import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SOURCES = 8;
const MAX_SOURCE_TEXT = 240;

export type TouchlineProvisionalVerificationSource = Readonly<{
  kind: "CANONICAL_ROSTER" | "OFFICIAL_LINEUP" | "OWNER_REVIEW" | "LICENSED_MARKET_VALUE";
  reference: string;
  observedAt: string;
}>;

type ProvisionalRpc = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

function isoTimestamp(value: string) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function normalizedSources(sources: readonly TouchlineProvisionalVerificationSource[]) {
  if (!sources.length || sources.length > MAX_SOURCES) {
    throw new Error(`Provisional Card Engine checks require between 1 and ${MAX_SOURCES} bounded sources.`);
  }
  return sources.map((source) => {
    const reference = source.reference.trim();
    const observedAt = isoTimestamp(source.observedAt);
    if (!reference || reference.length > MAX_SOURCE_TEXT || !observedAt) {
      throw new Error("A provisional Card Engine verification source is invalid.");
    }
    return { kind: source.kind, reference, observedAt };
  });
}

/**
 * Creates or refreshes only the two permanent monitored fallbacks. The SQL
 * command owns the canonical identity, membership and approved-value fences.
 */
export async function ensureTouchlineCardProvisionalDefaults(admin: SupabaseClient, input: Readonly<{
  canonicalPlayerId: string;
  effectiveSeason: string;
  checkedAt: string;
  nextVerificationAt: string;
  sources: readonly TouchlineProvisionalVerificationSource[];
}>) {
  const playerId = input.canonicalPlayerId.trim().toLowerCase();
  const effectiveSeason = input.effectiveSeason.trim();
  const checkedAt = isoTimestamp(input.checkedAt);
  const nextVerificationAt = isoTimestamp(input.nextVerificationAt);
  if (
    !UUID_PATTERN.test(playerId)
    || !/^\d{4}[-/]\d{2,4}$/.test(effectiveSeason)
    || !checkedAt
    || !nextVerificationAt
    || Date.parse(nextVerificationAt) <= Date.parse(checkedAt)
  ) {
    throw new Error("A canonical player, season and forward verification window are required.");
  }
  const { data, error } = await (admin as unknown as ProvisionalRpc).rpc(
    "touchline_card_engine_ensure_provisional_defaults",
    {
      p_player_id: playerId,
      p_effective_season: effectiveSeason,
      p_checked_at: checkedAt,
      p_next_verification_at: nextVerificationAt,
      p_sources_consulted: normalizedSources(input.sources),
    },
  );
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Replaces EUR 1m only when the database still holds the exact provisional
 * fence. Approved/manual values are rejected by the SQL transaction.
 */
export async function resolveTouchlineProvisionalMarketValue(admin: SupabaseClient, input: Readonly<{
  canonicalPlayerId: string;
  effectiveSeason: string;
  marketValueEur: number;
  verifiedAt: string;
  licensedSourceReference: string;
}>) {
  const playerId = input.canonicalPlayerId.trim().toLowerCase();
  const verifiedAt = isoTimestamp(input.verifiedAt);
  const sourceReference = input.licensedSourceReference.trim();
  if (
    !UUID_PATTERN.test(playerId)
    || !/^\d{4}[-/]\d{2,4}$/.test(input.effectiveSeason.trim())
    || !Number.isSafeInteger(input.marketValueEur)
    || input.marketValueEur < 0
    || !verifiedAt
    || !sourceReference
    || sourceReference.length > MAX_SOURCE_TEXT
  ) {
    throw new Error("A trusted provisional-value resolution is invalid.");
  }
  const { data, error } = await (admin as unknown as ProvisionalRpc).rpc(
    "touchline_card_engine_resolve_provisional_market_value",
    {
      p_player_id: playerId,
      p_effective_season: input.effectiveSeason.trim(),
      p_market_value_eur: input.marketValueEur,
      p_verified_at: verifiedAt,
      p_source_reference: sourceReference,
    },
  );
  if (error) throw new Error(error.message);
  return data;
}
