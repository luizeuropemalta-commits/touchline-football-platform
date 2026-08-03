import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveTouchlineSeasonPhase,
  type TouchlineSeasonLifecycleSchedule,
  type TouchlineSeasonPhase,
} from "./season-lifecycle.ts";
import type { TouchlineSeasonHonour, TouchlinePostSeasonSummaryState } from "./post-season-summary.ts";

type DatabaseRecord = Record<string, unknown>;

export type TouchlinePostSeasonHistoryReadError =
  | "TL_POSTSEASON_HISTORY_USER_INVALID"
  | "TL_POSTSEASON_HISTORY_SUMMARIES_UNAVAILABLE"
  | "TL_POSTSEASON_HISTORY_HONOURS_UNAVAILABLE"
  | "TL_POSTSEASON_HISTORY_LIFECYCLE_UNAVAILABLE"
  | "TL_POSTSEASON_HISTORY_SEASONS_UNAVAILABLE";

export type TouchlinePostSeasonHistoryItem = {
  summaryId: string;
  seasonId: string;
  seasonName: string;
  phase: TouchlineSeasonPhase;
  summaryState: Exclude<TouchlinePostSeasonSummaryState, "DRAFT">;
  validatedAt: string;
  frozenAt: string | null;
  finalRank: number | null;
  totalTouchlinePoints: number | null;
  bestWeeklyRank: number | null;
  honours: TouchlineSeasonHonour[];
  updatedAt: string;
};

export type TouchlinePostSeasonHistoryReadResult =
  | { ok: true; items: TouchlinePostSeasonHistoryItem[] }
  | { ok: false; error: TouchlinePostSeasonHistoryReadError };

function record(value: unknown): DatabaseRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as DatabaseRecord
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableInteger(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveInteger(value: unknown) {
  const parsed = nullableInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function isPublicHistoryPhase(phase: TouchlineSeasonPhase) {
  return phase === "POST_SEASON"
    || phase === "RENEWAL_WINDOW"
    || phase === "NEXT_SEASON_LIVE";
}

function summaryState(row: DatabaseRecord): Exclude<TouchlinePostSeasonSummaryState, "DRAFT"> | null {
  const status = text(row.summary_status)?.toUpperCase();
  return status === "VALIDATED" || status === "FROZEN" ? status : null;
}

function lifecycleSchedule(row: DatabaseRecord): TouchlineSeasonLifecycleSchedule | null {
  const competitionEndsAt = text(row.competition_ends_at);
  const dataValidationEndsAt = text(row.data_validation_ends_at);
  const renewalWindowOpensAt = text(row.renewal_window_opens_at);
  const nextSeasonStartsAt = text(row.next_season_starts_at);
  if (!competitionEndsAt || !dataValidationEndsAt || !renewalWindowOpensAt || !nextSeasonStartsAt) return null;
  return { competitionEndsAt, dataValidationEndsAt, renewalWindowOpensAt, nextSeasonStartsAt };
}

/**
 * Server-only read model for the authenticated ClubOwner's official seasonal
 * history. It uses the service client after the caller has authenticated the
 * session, selects by user_id, exposes no write capability and fails closed if
 * the local lifecycle/history schema has not yet been applied remotely.
 */
export async function readTouchlinePostSeasonHistory(
  admin: SupabaseClient,
  authenticatedUserId: string,
  now: string,
): Promise<TouchlinePostSeasonHistoryReadResult> {
  const userId = text(authenticatedUserId);
  if (!userId) return { ok: false, error: "TL_POSTSEASON_HISTORY_USER_INVALID" };

  const summariesResult = await admin
    .from("touchline_season_owner_summaries")
    .select("id,user_id,season_id,summary_status,validated_at,frozen_at,final_rank,total_touchline_points,best_weekly_rank,updated_at")
    .eq("user_id", userId);
  if (summariesResult.error) return { ok: false, error: "TL_POSTSEASON_HISTORY_SUMMARIES_UNAVAILABLE" };

  const summaries: DatabaseRecord[] = (summariesResult.data ?? []).flatMap((row) => {
    const value = record(row);
    const id = value ? text(value.id) : null;
    const seasonId = value ? text(value.season_id) : null;
    return value && id && seasonId ? [{ ...value, id, season_id: seasonId } as DatabaseRecord] : [];
  });
  if (summaries.length === 0) return { ok: true, items: [] };

  const summaryIds = summaries.map((summary) => summary.id as string);
  const seasonIds = [...new Set(summaries.map((summary) => summary.season_id as string))];
  const [honoursResult, lifecycleResult, seasonsResult] = await Promise.all([
    admin
      .from("touchline_season_owner_honours")
      .select("season_owner_summary_id,honour_type,title,detail")
      .in("season_owner_summary_id", summaryIds),
    admin
      .from("touchline_season_lifecycles")
      .select("season_id,competition_ends_at,data_validation_ends_at,renewal_window_opens_at,next_season_starts_at")
      .in("season_id", seasonIds),
    admin
      .from("football_seasons")
      .select("id,name")
      .in("id", seasonIds),
  ]);
  if (honoursResult.error) return { ok: false, error: "TL_POSTSEASON_HISTORY_HONOURS_UNAVAILABLE" };
  if (lifecycleResult.error) return { ok: false, error: "TL_POSTSEASON_HISTORY_LIFECYCLE_UNAVAILABLE" };
  if (seasonsResult.error) return { ok: false, error: "TL_POSTSEASON_HISTORY_SEASONS_UNAVAILABLE" };

  const honoursBySummaryId = new Map<string, TouchlineSeasonHonour[]>();
  for (const source of honoursResult.data ?? []) {
    const row = record(source);
    const summaryId = row ? text(row.season_owner_summary_id) : null;
    const type = row ? text(row.honour_type) : null;
    const title = row ? text(row.title) : null;
    if (!summaryId || !title || !type || !["champion", "top_11", "record", "achievement"].includes(type)) continue;
    const entries = honoursBySummaryId.get(summaryId) ?? [];
    entries.push({ type: type as TouchlineSeasonHonour["type"], title, detail: text(row?.detail) });
    honoursBySummaryId.set(summaryId, entries);
  }

  const lifecycleBySeasonId = new Map(
    (lifecycleResult.data ?? []).flatMap((source) => {
      const row = record(source);
      const seasonId = row ? text(row.season_id) : null;
      const schedule = row ? lifecycleSchedule(row) : null;
      return seasonId && schedule ? [[seasonId, schedule] as const] : [];
    }),
  );
  const seasonNameById = new Map(
    (seasonsResult.data ?? []).flatMap((source) => {
      const row = record(source);
      const id = row ? text(row.id) : null;
      const name = row ? text(row.name) : null;
      return id && name ? [[id, name] as const] : [];
    }),
  );

  const items: TouchlinePostSeasonHistoryItem[] = [];
  for (const summary of summaries) {
    const seasonId = summary.season_id as string;
    const schedule = lifecycleBySeasonId.get(seasonId);
    const state = summaryState(summary);
    const validatedAt = text(summary.validated_at);
    const frozenAt = text(summary.frozen_at);
    const updatedAt = text(summary.updated_at);
    const seasonName = seasonNameById.get(seasonId);
    if (!schedule || !state || !validatedAt || !updatedAt || !seasonName) continue;
    if (state === "FROZEN" && !frozenAt) continue;
    const phase = resolveTouchlineSeasonPhase(schedule, now);
    if (!isPublicHistoryPhase(phase)) continue;

    items.push({
      summaryId: summary.id as string,
      seasonId,
      seasonName,
      phase,
      summaryState: state,
      validatedAt,
      frozenAt,
      finalRank: positiveInteger(summary.final_rank),
      totalTouchlinePoints: nullableInteger(summary.total_touchline_points),
      bestWeeklyRank: positiveInteger(summary.best_weekly_rank),
      honours: honoursBySummaryId.get(summary.id as string) ?? [],
      updatedAt,
    });
  }

  return { ok: true, items };
}
