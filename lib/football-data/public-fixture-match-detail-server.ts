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
  statistics_payload?: unknown;
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
    if (!providerEventId || !eventType || points === null || (role !== "primary" && role !== "assist" && role !== "fact")) return [];
    const ruleCode = String(candidate?.ruleCode ?? "").trim() || undefined;
    const quantity = finiteNumber(candidate?.quantity) ?? undefined;
    const unitPoints = finiteNumber(candidate?.unitPoints) ?? undefined;
    const factValue = finiteNumber(candidate?.factValue) ?? undefined;
    const detail = String(candidate?.detail ?? "").trim() || undefined;
    return [{ providerEventId, eventType, role, points, minute, ruleCode, quantity, unitPoints, factValue, detail }];
  });
}

function cardStatistics(value: unknown) {
  const source = record(value);
  if (!source) return {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const number = finiteNumber(source[key]);
      if (number !== null) return number;
    }
    return undefined;
  };
  const goals = pick("goals");
  const assists = pick("assists");
  const yellowCards = pick("yellow-cards", "yellowcards");
  const redCards = pick("red-cards", "redcards");
  const cleanSheets = pick("clean-sheets", "cleansheets");
  const saves = pick("saves");
  const goalsConceded = pick("goalkeeper-goals-conceded", "goals-conceded");
  const shotsOnTarget = pick("shots-on-target");
  const shotsOffTarget = pick("shots-off-target");
  const defensiveActionsTotal = pick("defensive-actions-total");
  const defense = pick("def-score");
  const penaltySaves = pick("penalty-saves");
  const penaltiesMissed = pick("penalties-missed");
  const ownGoals = pick("own-goals");
  const tacklesWon = pick("tackles-won", "def-tackles-won");
  const interceptions = pick("interceptions", "def-interceptions");
  const clearances = pick("clearances", "def-clearances");
  const blockedShots = pick("blocked-shots", "shots-blocked", "def-blocked-shots");
  const aerialsWon = pick("aerials-won", "aeriels-won", "def-aerials-won");
  return {
    ...(goals === undefined ? {} : { goals }),
    ...(assists === undefined ? {} : { assists }),
    ...(yellowCards === undefined ? {} : { yellowCards }),
    ...(redCards === undefined ? {} : { redCards }),
    ...(cleanSheets === undefined ? {} : { cleanSheets }),
    ...(saves === undefined ? {} : { saves }),
    ...(goalsConceded === undefined ? {} : { goalsConceded }),
    ...(shotsOnTarget === undefined ? {} : { shotsOnTarget }),
    ...(shotsOffTarget === undefined ? {} : { shotsOffTarget }),
    ...(defensiveActionsTotal === undefined ? {} : { defensiveActionsTotal }),
    ...(defense === undefined ? {} : { defense }),
    ...(penaltySaves === undefined ? {} : { penaltySaves }),
    ...(penaltiesMissed === undefined ? {} : { penaltiesMissed }),
    ...(ownGoals === undefined ? {} : { ownGoals }),
    ...(tacklesWon === undefined ? {} : { tacklesWon }),
    ...(interceptions === undefined ? {} : { interceptions }),
    ...(clearances === undefined ? {} : { clearances }),
    ...(blockedShots === undefined ? {} : { blockedShots }),
    ...(aerialsWon === undefined ? {} : { aerialsWon }),
  };
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
    .select("appearance_status,minutes_played,rating,touchline_points,touchline_points_breakdown,statistics_payload,settlement_status,football_players!inner(provider_player_id)")
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
      statistics: cardStatistics(row.statistics_payload),
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
