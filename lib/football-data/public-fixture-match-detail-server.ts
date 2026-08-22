import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  toPublicFantasyFixtureFeed,
  type TouchlinePublicFantasyFixtureFeed,
  type TouchlinePublicFantasyFixtureMatchDetail,
  type TouchlinePublicFixturePlayerStatistics,
  type TouchlinePublicPlayerPointContribution,
} from "@/lib/football-data/public-fantasy-fixture";
import { readPersistedFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-snapshot";
import { createAdminClient } from "@/lib/supabase/admin";

type FixtureRow = { id?: unknown };
type FixtureStatisticRow = {
  appearance_status?: unknown;
  minutes_played?: unknown;
  rating?: unknown;
  touchline_points?: unknown;
  touchline_points_breakdown?: unknown;
  settlement_status?: unknown;
  football_players?: { provider_player_id?: unknown } | Array<{ provider_player_id?: unknown }> | null;
};

const APPEARANCE_STATUSES = new Set(["started", "substitute", "unused", "absent", "unavailable"]);
const SETTLEMENT_STATUSES = new Set(["provisional", "final", "unavailable"]);

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

function relatedPlayer(row: FixtureStatisticRow) {
  const relation = Array.isArray(row.football_players) ? row.football_players[0] : row.football_players;
  const providerPlayerId = String(relation?.provider_player_id ?? "").trim();
  return /^\d+$/.test(providerPlayerId) ? providerPlayerId : null;
}

function pointContributions(value: unknown): TouchlinePublicPlayerPointContribution[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const candidate = record(item);
    const providerEventId = String(candidate?.providerEventId ?? "").trim();
    const eventType = String(candidate?.eventType ?? "").trim();
    const role = candidate?.role;
    const points = finiteNumber(candidate?.points);
    const minute = finiteNumber(candidate?.minute);
    if (!providerEventId || !eventType || points === null || (role !== "primary" && role !== "assist")) return [];
    return [{ providerEventId, eventType, role, points, minute }];
  });
}

async function readFixtureStatistics(
  admin: SupabaseClient,
  fixtureId: string,
  playerNames: ReadonlyMap<string, { name: string; teamId?: string }>,
) {
  const { data: fixture, error: fixtureError } = await admin
    .from("football_fixtures")
    .select("id")
    .eq("provider", "sportmonks")
    .eq("provider_fixture_id", fixtureId)
    .maybeSingle();
  const canonicalFixtureId = String((fixture as FixtureRow | null)?.id ?? "").trim();
  if (fixtureError || !canonicalFixtureId) return [] as TouchlinePublicFixturePlayerStatistics[];

  const { data, error } = await admin
    .from("football_player_fixture_statistics")
    .select("appearance_status,minutes_played,rating,touchline_points,touchline_points_breakdown,settlement_status,football_players!inner(provider_player_id)")
    .eq("fixture_id", canonicalFixtureId);
  if (error || !Array.isArray(data)) return [] as TouchlinePublicFixturePlayerStatistics[];

  return (data as FixtureStatisticRow[]).flatMap((row) => {
    const playerId = relatedPlayer(row);
    const identity = playerId ? playerNames.get(playerId) : null;
    if (!playerId || !identity) return [];
    const appearanceStatus = String(row.appearance_status ?? "unavailable");
    const settlementStatus = String(row.settlement_status ?? "unavailable");
    return [{
      playerId,
      playerName: identity.name,
      teamId: identity.teamId,
      appearanceStatus: APPEARANCE_STATUSES.has(appearanceStatus)
        ? appearanceStatus as TouchlinePublicFixturePlayerStatistics["appearanceStatus"]
        : "unavailable",
      minutes: finiteNumber(row.minutes_played),
      rating: finiteNumber(row.rating),
      touchlinePoints: finiteNumber(row.touchline_points),
      settlementStatus: SETTLEMENT_STATUSES.has(settlementStatus)
        ? settlementStatus as TouchlinePublicFixturePlayerStatistics["settlementStatus"]
        : "unavailable",
      contributions: pointContributions(row.touchline_points_breakdown),
    }];
  }).sort((first, second) => {
    const rank = { started: 0, substitute: 1, unused: 2, absent: 3, unavailable: 4 } as const;
    return rank[first.appearanceStatus] - rank[second.appearanceStatus]
      || first.playerName.localeCompare(second.playerName);
  });
}

async function readLineupAvailableAt(admin: SupabaseClient, fixtureId: string) {
  const { data, error } = await admin
    .from("football_fixture_lifecycle_events")
    .select("first_observed_at,football_fixtures!inner(provider_fixture_id)")
    .eq("event_type", "LINEUP_AVAILABLE")
    .eq("football_fixtures.provider_fixture_id", fixtureId)
    .maybeSingle();
  const value = String((data as { first_observed_at?: unknown } | null)?.first_observed_at ?? "").trim();
  return error || !Number.isFinite(Date.parse(value)) ? null : value;
}

/**
 * Server-owned, allowlisted Live read model. It combines only already
 * persisted canonical facts and never calls a provider during a page read.
 */
export async function readPublicFantasyFixtureMatchDetail(
  fixtureId: string,
  providedFeed?: TouchlinePublicFantasyFixtureFeed | null,
): Promise<TouchlinePublicFantasyFixtureMatchDetail | null> {
  const snapshot = providedFeed ? null : await readPersistedFantasyFixtureFeed(fixtureId);
  const feed = providedFeed ?? (snapshot ? toPublicFantasyFixtureFeed(snapshot.feed) : null);
  const admin = createAdminClient();
  if (!feed || !admin) return null;
  const playerNames = new Map(feed.lineups.flatMap((member) => member.playerId ? [[member.playerId, {
    name: member.playerName,
    teamId: member.teamId,
  }] as const] : []));
  const [playerStatistics, lineupAvailableAt] = await Promise.all([
    readFixtureStatistics(admin, fixtureId, playerNames),
    readLineupAvailableAt(admin, fixtureId),
  ]);
  return { ...feed, playerStatistics, lineupAvailableAt };
}
