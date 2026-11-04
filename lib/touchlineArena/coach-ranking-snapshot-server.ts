import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { TouchlineCoachRecord } from "./coach-scoring";
import { loadCoachCatalogue } from "./coach-catalogue-server";
import { catalogueCoachForId, legacyCoachCatalogue, type CoachCatalogue } from "./coach-catalogue-contract";

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
  home: TouchlineCoachRecord;
  away: TouchlineCoachRecord;
}>;

export type TouchLineCoachRankingState = Readonly<{
  phase: "unavailable" | "ranked" | "preseason";
  /** Explicit current view; absent on immutable historical publication. */
  currentProjection?: import("./current-coach-ranking").CurrentCoachProjection;
  currentRevision?: string;
  seasonRows?: readonly TouchLineCoachRankingRow[];
  catalogue?: CoachCatalogue;
  snapshotId: string | null;
  seasonId: string | null;
  scoringVersion: "coach_scoring_v2" | null;
  fixtureIds: readonly string[];
  generatedAt: string | null;
  rows: readonly TouchLineCoachRankingRow[];
}>;

export const EMPTY_COACH_RANKING: TouchLineCoachRankingState = Object.freeze({
  phase: "unavailable", snapshotId: null, seasonId: null, scoringVersion: null,
  fixtureIds: Object.freeze([]), generatedAt: null, rows: Object.freeze([]),
});

function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function integer(value: unknown) { return typeof value === "number" && Number.isInteger(value) ? value : null; }
function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function record(value: unknown): TouchlineCoachRecord | null {
  const candidate = object(value);
  if (!candidate) return null;
  const wins = integer(candidate.wins);
  const draws = integer(candidate.draws);
  const losses = integer(candidate.losses);
  const touchlinePoints = integer(candidate.touchlinePoints);
  if (wins === null || draws === null || losses === null || touchlinePoints === null) return null;
  return { wins, draws, losses, touchlinePoints };
}

/** A shared publication supplies the exact immutable ID. Missing is an error, not preseason. */
export async function readTouchlineCoachRankingSnapshot(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  snapshotId: string,
): Promise<TouchLineCoachRankingState> {
  const { data, error } = await admin.from("touchline_coach_ranking_snapshots")
    .select("snapshot_id,league_key,season_id,scoring_version,fixture_ids,generated_at,ranking_payload")
    .eq("snapshot_id", snapshotId).eq("league_key", "touchline-england").maybeSingle();
  if (error) throw new Error("TOUCHLINE_PINNED_COACH_RANKING_UNAVAILABLE");
  const snapshot = object(data);
  if (!snapshot || snapshot.snapshot_id !== snapshotId || snapshot.league_key !== "touchline-england") {
    throw new Error("TOUCHLINE_PINNED_COACH_RANKING_INVALID");
  }
  const state = parseTouchlineCoachRankingSnapshot(snapshot, await loadCoachCatalogue());
  if (state.phase !== "ranked" || !state.seasonId || !state.generatedAt
    || !Number.isFinite(Date.parse(state.generatedAt))
    || state.fixtureIds.length !== (snapshot.fixture_ids as unknown[]).length
    || new Set(state.fixtureIds).size !== state.fixtureIds.length) {
    throw new Error("TOUCHLINE_PINNED_COACH_RANKING_INVALID");
  }
  return state;
}

function parseTouchlineCoachRankingSnapshot(snapshot: Record<string, unknown>, catalogue: CoachCatalogue = legacyCoachCatalogue()): TouchLineCoachRankingState {
  const unavailable = catalogue.phase === "legacy" ? EMPTY_COACH_RANKING : { ...EMPTY_COACH_RANKING, catalogue };
  if (catalogue.phase === "unavailable") return unavailable;
  if (snapshot.scoring_version !== "coach_scoring_v2" || !Array.isArray(snapshot.ranking_payload) || !Array.isArray(snapshot.fixture_ids)) return unavailable;
  const parsed = snapshot.ranking_payload.flatMap((value): TouchLineCoachRankingRow[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const rank = integer(row.rank);
    const coachProviderId = text(row.coachProviderId);
    const clubName = text(row.clubName);
    const touchlinePoints = integer(row.touchlinePoints);
    const wins = integer(row.wins); const draws = integer(row.draws); const losses = integer(row.losses); const awayWins = integer(row.awayWins);
    const home = record(row.home); const away = record(row.away);
    const coach = coachProviderId ? catalogueCoachForId(catalogue, coachProviderId) : null;
    if (!rank || !coachProviderId || !clubName || touchlinePoints === null || wins === null || draws === null || losses === null || awayWins === null || !home || !away || !coach) return [];
    if (
      home.wins + away.wins !== wins
      || home.draws + away.draws !== draws
      || home.losses + away.losses !== losses
      || home.touchlinePoints + away.touchlinePoints !== touchlinePoints
      || away.wins !== awayWins
    ) return [];
    return [{ rank, coachProviderId, coachName: coach.coach.displayName ?? coach.coach.name, clubName, touchlinePoints, wins, draws, losses, awayWins, home, away }];
  });
  const coachIds = parsed.map((row) => row.coachProviderId);
  if (
    parsed.length !== snapshot.ranking_payload.length
    || parsed.some((row, index) => row.rank !== index + 1)
    || new Set(coachIds).size !== coachIds.length
  ) return unavailable;
  return {
    phase: "ranked",
    ...(catalogue.phase === "legacy" ? {} : { catalogue }),
    snapshotId: text(snapshot.snapshot_id),
    seasonId: text(snapshot.season_id),
    scoringVersion: "coach_scoring_v2",
    fixtureIds: snapshot.fixture_ids.map(text).filter((id): id is string => Boolean(id)),
    generatedAt: text(snapshot.generated_at),
    rows: parsed,
  };
}
