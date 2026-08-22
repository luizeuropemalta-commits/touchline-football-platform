import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { TouchlinePublicSeasonPlayerPoints } from "./matchday-player-points";

type Row = Readonly<{ football_player_id?: unknown; summary_payload?: unknown }>;
const TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID = "8";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/**
 * Public, allowlisted season-total projection for cards already present in a
 * public club roster. It reads no contracts, owner data or editorial fields.
 */
export async function readPublicSeasonPlayerPoints(
  canonicalPlayerIds: readonly string[],
): Promise<TouchlinePublicSeasonPlayerPoints[]> {
  const ids = [...new Set(canonicalPlayerIds.map((id) => id.trim()).filter(Boolean))];
  const admin = createAdminClient();
  if (!ids.length || !admin) return [];
  const { data: competition, error: competitionError } = await admin
    .from("football_competitions")
    .select("id")
    .eq("provider", "sportmonks")
    .eq("provider_competition_id", TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID)
    .maybeSingle();
  const competitionId = String(competition?.id ?? "").trim();
  if (competitionError || !competitionId) return [];
  const { data: seasons, error: seasonsError } = await admin
    .from("football_seasons")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("is_current", true);
  const seasonIds = Array.isArray(seasons)
    ? seasons.map((season) => String(season.id ?? "").trim()).filter(Boolean)
    : [];
  if (seasonsError || seasonIds.length !== 1) return [];
  const { data, error } = await admin
    .from("football_player_season_statistics")
    .select("football_player_id,summary_payload")
    .eq("competition_id", competitionId)
    .eq("season_id", seasonIds[0])
    .in("football_player_id", ids);
  if (error || !Array.isArray(data)) return [];
  return (data as Row[]).flatMap((row) => {
    const canonicalPlayerId = String(row.football_player_id ?? "").trim();
    const summary = record(row.summary_payload);
    const touchlinePoints = finiteNumber(summary?.touchlinePoints);
    return canonicalPlayerId ? [{ canonicalPlayerId, touchlinePoints }] : [];
  });
}
