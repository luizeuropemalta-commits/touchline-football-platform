import type { SupabaseClient } from "@supabase/supabase-js";
import type { TouchlineFantasyEvent } from "../football-data/types.ts";
import { cardShownForCanonicalPlayer, type MatchCardIndicator } from "./match-card-indicator.ts";

type Row = Record<string, unknown>;
type CardIdentity = Readonly<{ id: string; canonicalPlayerId?: string | null; providerPlayerId?: string | null }>;
export type GameweekMatchCardIndicator = MatchCardIndicator & Readonly<{ fixtureId: string; playerId: string }>;

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const rows = (value: unknown): Row[] => Array.isArray(value)
  ? value.filter((row): row is Row => Boolean(row && typeof row === "object" && !Array.isArray(row))) : [];
const positiveId = (value: unknown) => {
  const id = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : text(value);
  return id && /^[1-9][0-9]*$/.test(id) ? id : null;
};

/** Reads only persisted fixtures in the exact active season/round; no provider HTTP. */
export async function readGameweekMatchCardIndicators(
  admin: SupabaseClient,
  seasonId: string,
  gameweekId: string,
  selectedPlayerIds: readonly string[],
  catalogue: readonly CardIdentity[],
): Promise<readonly GameweekMatchCardIndicator[] | null> {
  if (!seasonId || !gameweekId || !selectedPlayerIds.length) return [];
  const { data: gameweek, error: gameweekError } = await admin.from("touchline_fantasy_gameweeks")
    .select("id,season_id,round_id").eq("id", gameweekId).eq("season_id", seasonId).maybeSingle();
  if (gameweekError || !gameweek || gameweek.id !== gameweekId || gameweek.season_id !== seasonId) return null;
  const roundId = text(gameweek.round_id);
  if (!roundId) return [];

  const { data: fixtureData, error: fixtureError } = await admin.from("football_fixtures")
    .select("id,provider,season_id,round_id,provider_fixture_id").eq("provider", "sportmonks").eq("season_id", seasonId).eq("round_id", roundId);
  if (fixtureError || !Array.isArray(fixtureData)) return null;
  const fixtureIds = [...new Set(rows(fixtureData)
    .filter((row) => row.provider === "sportmonks" && row.season_id === seasonId && row.round_id === roundId)
    .map((row) => positiveId(row.provider_fixture_id)).filter((id): id is string => id !== null))];
  if (!fixtureIds.length) return [];

  const { data: feedData, error: feedError } = await admin.from("football_fantasy_fixture_feeds")
    .select("provider,provider_fixture_id,events_payload")
    .eq("provider", "sportmonks").in("provider_fixture_id", fixtureIds);
  if (feedError || !Array.isArray(feedData)) return null;
  const validFixtureIds = new Set(fixtureIds);
  const feeds = rows(feedData).filter((row) => row.provider === "sportmonks"
    && validFixtureIds.has(positiveId(row.provider_fixture_id) ?? "") && Array.isArray(row.events_payload));
  const counts = new Map<string, number>();
  for (const feed of feeds) {
    const id = positiveId(feed.provider_fixture_id)!;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const cardsById = new Map(catalogue.map((card) => [card.id, card]));
  const result: GameweekMatchCardIndicator[] = [];
  for (const feed of feeds) {
    const fixtureId = positiveId(feed.provider_fixture_id)!;
    if (counts.get(fixtureId) !== 1) continue;
    const events = rows(feed.events_payload) as TouchlineFantasyEvent[];
    for (const playerId of new Set(selectedPlayerIds)) {
      const indicator = cardShownForCanonicalPlayer({ provider: "sportmonks", providerFixtureId: fixtureId, events },
        playerId, cardsById.get(playerId) ?? null);
      if (indicator) result.push({ fixtureId, playerId, ...indicator });
    }
  }
  return result;
}
