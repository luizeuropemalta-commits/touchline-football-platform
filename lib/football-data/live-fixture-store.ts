import type { SupabaseClient } from "@supabase/supabase-js";

import type { TouchlineFixture } from "@/lib/football-data/types";
import { touchlineFixtureState } from "@/lib/touchlineArena/match-centre";

type LiveFixtureAdminClient = SupabaseClient;

function shouldAccept(current: TouchlineFixture, incoming: TouchlineFixture, now: number) {
  const currentState = touchlineFixtureState(current, now);
  const incomingState = touchlineFixtureState(incoming, now);
  if (currentState === "finished" && incomingState !== "finished") return false;
  if (currentState === "live" && incomingState === "upcoming") return false;
  return true;
}
export function mergeCanonicalLiveFixture(
  current: TouchlineFixture,
  incoming: TouchlineFixture,
  syncedAt: string,
  now = Date.now(),
) {
  if (!shouldAccept(current, incoming, now)) return current;
  return {
    ...current,
    status: incoming.status ?? current.status,
    homeScore: incoming.homeScore ?? current.homeScore,
    awayScore: incoming.awayScore ?? current.awayScore,
    providerStateId: incoming.providerStateId ?? current.providerStateId,
    liveMinute: incoming.liveMinute ?? current.liveMinute,
    liveSecond: incoming.liveSecond ?? current.liveSecond,
    livePeriod: incoming.livePeriod ?? current.livePeriod,
    eventsCount: incoming.eventsCount ?? current.eventsCount,
    providerUpdatedAt: incoming.providerUpdatedAt ?? current.providerUpdatedAt,
    source: {
      provider: current.provider,
      providerId: current.providerId,
      lastSyncedAt: syncedAt,
    },
  } satisfies TouchlineFixture;
}

/** Updates only existing canonical fixtures. Unknown provider IDs never create partial rows. */
export async function persistLiveFixtureStates(
  admin: LiveFixtureAdminClient,
  currentFixtures: TouchlineFixture[],
  incomingFixtures: TouchlineFixture[],
  syncedAt: string,
) {
  const currentById = new Map(currentFixtures.map((fixture) => [fixture.providerId, fixture]));
  const merged: TouchlineFixture[] = [];
  const errors: string[] = [];

  for (const incoming of incomingFixtures) {
    const current = currentById.get(incoming.providerId);
    if (!current) continue;
    const next = mergeCanonicalLiveFixture(current, incoming, syncedAt);
    const { data, error } = await admin
      .from("football_fixtures")
      .update({
        status: next.status ?? null,
        home_score: next.homeScore ?? null,
        away_score: next.awayScore ?? null,
        provider_state_id: next.providerStateId ?? null,
        live_minute: next.liveMinute ?? null,
        live_second: next.liveSecond ?? null,
        live_period: next.livePeriod ?? null,
        events_count: next.eventsCount ?? 0,
        provider_updated_at: next.providerUpdatedAt ?? null,
        source_updated_at: syncedAt,
      })
      .eq("provider", "sportmonks")
      .eq("provider_fixture_id", incoming.providerId)
      .select("provider_fixture_id");
    if (error) {
      errors.push(`${incoming.providerId}:${error.message}`);
      continue;
    }
    if (Array.isArray(data) && data.length === 1) merged.push(next);
  }

  return { updated: merged.length, errors, merged };
}
