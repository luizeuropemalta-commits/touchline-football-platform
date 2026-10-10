import type { SupabaseClient } from "@supabase/supabase-js";
import type { TouchlineFantasySidelinedPlayer } from "../football-data/types.ts";
import { confirmedAvailabilityFromSidelined, resolvePlayerAvailabilityBadge, type PlayerAvailabilityBadge } from "./player-availability-badge.ts";

type Row = Record<string, unknown>;
type Identity = Readonly<{ id: string; canonicalPlayerId?: string | null; providerPlayerId?: string | null }>;
export type GameweekPlayerAvailabilityIndicator = Readonly<{ playerId: string; fixtureId: string; badge: PlayerAvailabilityBadge }>;
const object = (v: unknown): v is Row => Boolean(v && typeof v === "object" && !Array.isArray(v));
const id = (v: unknown): string | null => typeof v === "string" && /^[1-9]\d*$/.test(v) ? v : null;
const uuid = (v: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
// Positive states only: unknown, cancelled, postponed and completed cannot
// turn an old fixture's sidelined record into a current absence.
const current = (v: unknown) => typeof v === "string" && /^(?:NS|not started|not_started|live|inplay|in play|1st half|2nd half|half time|HT|extra time|ET|break)$/i.test(v.trim());

/** Read-only enrichment of the caller's already-authorized XI. No provider calls. */
export async function readGameweekPlayerAvailability(
  admin: SupabaseClient, seasonId: string, gameweekId: string,
  selectedPlayerIds: readonly string[], catalogue: readonly Identity[],
): Promise<readonly GameweekPlayerAvailabilityIndicator[] | null> {
  if (!seasonId || !gameweekId || !selectedPlayerIds.length) return [];
  try {
    const week = await admin.from("touchline_fantasy_gameweeks").select("id,season_id,round_id")
      .eq("id", gameweekId).eq("season_id", seasonId).maybeSingle();
    if (week.error || !week.data || week.data.id !== gameweekId || week.data.season_id !== seasonId) return null;
    const round = week.data.round_id;
    if (typeof round !== "string" || !round) return [];
    const fixtures = await admin.from("football_fixtures").select("provider,season_id,round_id,provider_fixture_id,status")
      .eq("provider", "sportmonks").eq("season_id", seasonId).eq("round_id", round);
    if (fixtures.error || !Array.isArray(fixtures.data)) return null;
    const scoped = fixtures.data.filter((f: unknown): f is Row => object(f) && f.provider === "sportmonks"
      && f.season_id === seasonId && f.round_id === round && Boolean(id(f.provider_fixture_id)));
    const fixtureIds = scoped.filter((f: Row) => current(f.status)
      && scoped.filter((other: Row) => other.provider_fixture_id === f.provider_fixture_id).length === 1)
      .map((f: Row) => f.provider_fixture_id as string);
    if (!fixtureIds.length) return [];
    const feeds = await admin.from("football_fantasy_fixture_feeds")
      .select("provider,provider_fixture_id,fixture_payload,sidelined_payload").eq("provider", "sportmonks").in("provider_fixture_id", fixtureIds);
    if (feeds.error || !Array.isArray(feeds.data)) return null;
    const result: GameweekPlayerAvailabilityIndicator[] = [];
    for (const playerId of new Set(selectedPlayerIds)) {
      const matches = catalogue.filter(c => c.id === playerId);
      const card = matches[0];
      if (!uuid(playerId) || matches.length !== 1 || card.canonicalPlayerId !== playerId || !id(card.providerPlayerId)
        || catalogue.filter(c => c.providerPlayerId === card.providerPlayerId).length !== 1) continue;
      for (const fixtureId of fixtureIds) {
        const matches = feeds.data.filter((f: unknown): f is Row => object(f)
          && f.provider === "sportmonks" && f.provider_fixture_id === fixtureId);
        if (matches.length !== 1) continue;
        const feed = matches[0];
        const fixture = feed.fixture_payload;
        if (!object(fixture) || fixture.provider !== "sportmonks" || fixture.providerId !== fixtureId
          || !current(fixture.status) || !Array.isArray(feed.sidelined_payload)
          || !feed.sidelined_payload.every(object)) continue;
        // Any duplicate, completion contradiction or malformed record for this
        // exact player is uncertainty, not permission to pick the first badge.
        const records = feed.sidelined_payload.filter((r: unknown): r is Row => object(r) && r.playerId === card.providerPlayerId);
        if (records.length !== 1) continue;
        const item = records[0];
        if (!["category", "typeName", "reason"].every(key => item[key] === undefined || typeof item[key] === "string")) continue;
        const evidence = confirmedAvailabilityFromSidelined(item as TouchlineFantasySidelinedPlayer, fixtureId, card.providerPlayerId!);
        const badge = resolvePlayerAvailabilityBadge(evidence, fixtureId, card.providerPlayerId!);
        if (badge) result.push({ playerId, fixtureId, badge });
      }
    }
    // Multiple current fixtures for one selected player have no UI priority
    // contract. Do not silently choose one or conflate conflicting absences.
    return result.filter(item => result.filter(other => other.playerId === item.playerId).length === 1);
  } catch { return null; }
}
