import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { touchlineLiveCoachForProviderId } from "./live-coaches";

export type TouchLineCoachRankingRow = Readonly<{
  rank: number;
  coachProviderId: string;
  coachName: string;
  clubName: string;
  touchlinePoints: number;
  wins: number;
  draws: number;
  losses: number;
  awayWins: number;
}>;

export type TouchLineCoachRankingState = Readonly<{
  phase: "unavailable" | "ranked";
  snapshotId: string | null;
  seasonId: string | null;
  scoringVersion: "coach_scoring_v2" | null;
  fixtureIds: readonly string[];
  generatedAt: string | null;
  rows: readonly TouchLineCoachRankingRow[];
}>;

const EMPTY: TouchLineCoachRankingState = Object.freeze({
  phase: "unavailable", snapshotId: null, seasonId: null, scoringVersion: null,
  fixtureIds: Object.freeze([]), generatedAt: null, rows: Object.freeze([]),
});

function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function integer(value: unknown) { return typeof value === "number" && Number.isInteger(value) ? value : null; }

/** Server-only projection; contract/user identities never enter the browser DTO. */
export async function loadTouchLineCoachRanking(): Promise<TouchLineCoachRankingState> {
  const admin = createAdminClient();
  if (!admin) return EMPTY;
  const { data: active, error: activeError } = await admin.from("touchline_coach_ranking_active_snapshots")
    .select("snapshot_id").eq("league_key", "touchline-england").maybeSingle();
  if (activeError || !text(active?.snapshot_id)) return EMPTY;
  const { data: snapshot, error } = await admin.from("touchline_coach_ranking_snapshots")
    .select("snapshot_id,season_id,scoring_version,fixture_ids,generated_at,ranking_payload")
    .eq("snapshot_id", active!.snapshot_id).eq("league_key", "touchline-england").maybeSingle();
  if (error || !snapshot || snapshot.scoring_version !== "coach_scoring_v2" || !Array.isArray(snapshot.ranking_payload) || !Array.isArray(snapshot.fixture_ids)) return EMPTY;
  const parsed = snapshot.ranking_payload.flatMap((value): TouchLineCoachRankingRow[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const rank = integer(row.rank);
    const coachProviderId = text(row.coachProviderId);
    const clubName = text(row.clubName);
    const touchlinePoints = integer(row.touchlinePoints);
    const wins = integer(row.wins); const draws = integer(row.draws); const losses = integer(row.losses); const awayWins = integer(row.awayWins);
    const coach = coachProviderId ? touchlineLiveCoachForProviderId(coachProviderId) : null;
    if (!rank || !coachProviderId || !clubName || touchlinePoints === null || wins === null || draws === null || losses === null || awayWins === null || !coach) return [];
    return [{ rank, coachProviderId, coachName: coach.coach.displayName ?? coach.coach.name, clubName, touchlinePoints, wins, draws, losses, awayWins }];
  });
  const coachIds = parsed.map((row) => row.coachProviderId);
  if (
    parsed.length !== snapshot.ranking_payload.length
    || parsed.some((row, index) => row.rank !== index + 1)
    || new Set(coachIds).size !== coachIds.length
  ) return EMPTY;
  return {
    phase: "ranked",
    snapshotId: text(snapshot.snapshot_id),
    seasonId: text(snapshot.season_id),
    scoringVersion: "coach_scoring_v2",
    fixtureIds: snapshot.fixture_ids.map(text).filter((id): id is string => Boolean(id)),
    generatedAt: text(snapshot.generated_at),
    rows: parsed,
  };
}
