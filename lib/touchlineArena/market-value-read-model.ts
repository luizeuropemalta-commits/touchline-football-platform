import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type TouchlineVerifiedMarketValue = Readonly<{
  status: "verified" | "pending" | "unavailable";
  marketValueEur: number | null;
  lastVerified: string | null;
}>;

/** Public products read only this TouchLine-owned approved snapshot. */
export async function loadTouchlineVerifiedMarketValueByProviderPlayerId(
  providerPlayerId: string | null | undefined,
): Promise<TouchlineVerifiedMarketValue> {
  if (!providerPlayerId?.trim()) return { status: "unavailable", marketValueEur: null, lastVerified: null };
  const admin = createAdminClient();
  if (!admin) return { status: "unavailable", marketValueEur: null, lastVerified: null };
  const { data: player, error: playerError } = await admin
    .from("football_players")
    .select("id")
    .eq("provider_player_id", providerPlayerId.trim())
    .maybeSingle();
  if (playerError || !player?.id) return { status: "unavailable", marketValueEur: null, lastVerified: null };
  const { data, error } = await admin
    .from("football_player_market_values")
    .select("market_value_eur,last_verified,status,confidence")
    .eq("player_id", player.id)
    .maybeSingle();
  if (error || !data) return { status: "unavailable", marketValueEur: null, lastVerified: null };
  if (data.status === "pending") return { status: "pending", marketValueEur: null, lastVerified: null };
  const value = typeof data.market_value_eur === "number" && Number.isSafeInteger(data.market_value_eur) && data.market_value_eur >= 0
    ? data.market_value_eur
    : null;
  return value !== null && data.status === "verified" && data.confidence === "verified"
    ? { status: "verified", marketValueEur: value, lastVerified: data.last_verified ?? null }
    : { status: "unavailable", marketValueEur: null, lastVerified: null };
}
