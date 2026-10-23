import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { readPublishedTouchlineLivePresentationInput } from "./live-presentation-read-model";
import { readTouchlinePlayerRankingSnapshot } from "./card-ranking-server";
import { readTouchlineCoachRankingSnapshot } from "./coach-ranking-server";
import { parseLiveScoreSnapshot } from "../football-data/live-score-snapshot-contract";
import { toPublicTouchlineFixtures } from "../football-data/public-fixture";
import { parseTouchlineSportsPublication, type TouchlineSportsPublication } from "./sports-publication";

function sameIds(left: readonly string[], right: readonly string[]) {
  const sortedRight = [...right].sort();
  return new Set(left).size === left.length && new Set(right).size === right.length
    && left.length === right.length && [...left].sort().every((id, index) => id === sortedRight[index]);
}

/** Five bounded ID reads maximum. No mutable fallback, provider request or database write. */
export async function readTouchlineSportsPublication(admin: SupabaseClient): Promise<TouchlineSportsPublication | null> {
  const input = await readPublishedTouchlineLivePresentationInput(admin);
  if (!input) return null;
  const [playerRanking, coachRanking] = await Promise.all([
    input.playerRankingSnapshotId ? readTouchlinePlayerRankingSnapshot(admin, input.playerRankingSnapshotId) : null,
    input.coachRankingSnapshotId ? readTouchlineCoachRankingSnapshot(admin, input.coachRankingSnapshotId) : null,
  ]);
  if (!sameIds(playerRanking?.fixtureIds ?? [], input.playerRankingFixtureIds)
    || !sameIds(coachRanking?.fixtureIds ?? [], input.coachRankingFixtureIds)) {
    throw new Error("TOUCHLINE_SPORTS_PUBLICATION_COVERAGE_MISMATCH");
  }
  const snapshot = parseLiveScoreSnapshot(input.liveScorePayload);
  if (!snapshot) throw new Error("TOUCHLINE_SPORTS_PUBLICATION_LIVE_INVALID");
  const parsed = parseTouchlineSportsPublication({
    version: 1, scopeKey: "touchline-england",
    publication: { snapshotId: input.snapshotId, contentDigest: input.contentDigest,
      publishedAt: input.publishedAt, playerRankingSnapshotId: input.playerRankingSnapshotId,
      coachRankingSnapshotId: input.coachRankingSnapshotId, liveScoreSnapshotDigest: input.liveScoreSnapshotDigest },
    playerRanking, coachRanking,
    live: { fetchedAt: snapshot.fetchedAt, fixtures: toPublicTouchlineFixtures(snapshot.fixtures) },
  });
  if (!parsed) throw new Error("TOUCHLINE_SPORTS_PUBLICATION_INVALID");
  return parsed;
}

export async function loadTouchlineSportsPublication() {
  const admin = createAdminClient();
  if (!admin) throw new Error("TOUCHLINE_SPORTS_PUBLICATION_UNAVAILABLE");
  return readTouchlineSportsPublication(admin);
}
