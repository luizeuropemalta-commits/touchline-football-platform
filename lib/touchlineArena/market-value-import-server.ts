import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decideTouchlineMarketValueImport,
  type TouchlineMarketValueImportRow,
} from "./market-value-import";
import type { TouchlineMarketValueJobKey } from "./market-value-schedule";

type CurrentMarketValueRow = {
  player_id: string;
  market_value: number | null;
  currency: string | null;
  market_value_eur: number | null;
  verified_season: string | null;
};

export type TouchlineMarketValueImportRequest = Readonly<{
  scope: "player" | "club" | "competition" | "league";
  verifiedSeason: string;
  source: "licensed_import" | "manual_approval";
  actorUserId: string;
  rows: readonly TouchlineMarketValueImportRow[];
  jobKey: TouchlineMarketValueJobKey;
  competitionId?: string | null;
  clubId?: string | null;
  sourceImportFile?: string | null;
}>;

export type TouchlineMarketValueImportSummary = Readonly<{
  importRunId: string;
  jobRunId: string;
  imported: number;
  unchanged: number;
  pending: number;
  rejected: number;
}>;

function asCurrentRows(value: unknown): CurrentMarketValueRow[] {
  return Array.isArray(value) ? value.filter((row): row is CurrentMarketValueRow => Boolean(row && typeof row === "object")) : [];
}

function failureCode(status: "ready" | "unchanged" | "pending" | "rejected", code?: string) {
  if (status === "pending") return "market-value-pending";
  if (status === "rejected") return code ?? "invalid-import-row";
  return null;
}

/**
 * Applies an already-approved, server-owned snapshot. There is intentionally
 * no HTTP client here: licensed source retrieval happens outside the product
 * runtime and is handed to this function as reviewed rows.
 */
export async function applyTouchlineMarketValueImport(
  admin: SupabaseClient,
  request: TouchlineMarketValueImportRequest,
): Promise<TouchlineMarketValueImportSummary> {
  if (!request.rows.length) throw new Error("At least one market-value row is required.");
  if (!request.verifiedSeason.trim()) throw new Error("A verified season is required.");

  const { data: importRun, error: importRunError } = await admin
    .from("football_market_value_import_runs")
    .insert({
      scope: request.scope,
      competition_id: request.competitionId ?? null,
      club_id: request.clubId ?? null,
      verified_season: request.verifiedSeason,
      source: request.source,
      status: "running",
      total_rows: request.rows.length,
      requested_by: request.actorUserId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (importRunError || !importRun?.id) throw new Error(importRunError?.message ?? "Could not create market-value import run.");

  const { data: jobRun, error: jobRunError } = await admin
    .from("football_market_value_job_runs")
    .insert({
      job_key: request.jobKey,
      import_run_id: importRun.id,
      competition_id: request.competitionId ?? null,
      verified_season: request.verifiedSeason,
      source_import_file: request.sourceImportFile ?? null,
      triggered_by: request.actorUserId,
      status: "running",
      players_scanned: request.rows.length,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (jobRunError || !jobRun?.id) throw new Error(jobRunError?.message ?? "Could not create market-value job run.");

  const playerIds = [...new Set(request.rows.map((row) => row.playerId.trim()).filter(Boolean))];
  const { data: existingData, error: existingError } = await admin
    .from("football_player_market_values")
    .select("player_id,market_value,currency,market_value_eur,verified_season")
    .in("player_id", playerIds);
  if (existingError) throw new Error(existingError.message);
  const existingByPlayerId = new Map(asCurrentRows(existingData).map((row) => [row.player_id, row]));

  let imported = 0;
  let unchanged = 0;
  let pending = 0;
  let rejected = 0;
  const itemRows: Array<Record<string, unknown>> = [];

  for (const row of request.rows) {
    const decision = decideTouchlineMarketValueImport({
      row,
      verifiedSeason: request.verifiedSeason,
      existing: existingByPlayerId.get(row.playerId) ? {
        marketValue: existingByPlayerId.get(row.playerId)!.market_value,
        currency: existingByPlayerId.get(row.playerId)!.currency,
        marketValueEur: existingByPlayerId.get(row.playerId)!.market_value_eur,
        verifiedSeason: existingByPlayerId.get(row.playerId)!.verified_season,
      } : null,
    });

    itemRows.push({
      import_run_id: importRun.id,
      player_id: row.playerId || null,
      external_player_id: row.externalPlayerId ?? null,
      source_url: row.sourceUrl ?? null,
      market_value: row.marketValue,
      currency: row.currency,
      market_value_eur: row.marketValueEur,
      status: decision.status,
      failure_code: failureCode(decision.status, decision.failureCode),
    });

    if (decision.status === "unchanged") {
      unchanged += 1;
      continue;
    }
    if (decision.status === "rejected") {
      rejected += 1;
      continue;
    }
    if (decision.status === "pending") {
      pending += 1;
      const { error } = await admin.from("football_player_market_values").upsert({
        player_id: row.playerId,
        transfermarkt_player_id: row.externalPlayerId ?? null,
        transfermarkt_url: row.sourceUrl ?? null,
        market_value: null,
        currency: null,
        market_value_eur: null,
        verified_season: request.verifiedSeason,
        source: request.source,
        confidence: "pending",
        updated_by: request.actorUserId,
        status: "pending",
      }, { onConflict: "player_id" });
      if (error) throw new Error(error.message);
      continue;
    }

    const verifiedAt = new Date().toISOString();
    const { error: valueError } = await admin.from("football_player_market_values").upsert({
      player_id: row.playerId,
      transfermarkt_player_id: row.externalPlayerId ?? null,
      transfermarkt_url: row.sourceUrl ?? null,
      market_value: row.marketValue,
      currency: row.currency,
      market_value_eur: row.marketValueEur,
      last_verified: verifiedAt,
      verified_season: request.verifiedSeason,
      source: request.source,
      confidence: "verified",
      updated_by: request.actorUserId,
      status: "verified",
    }, { onConflict: "player_id" });
    if (valueError) throw new Error(valueError.message);

    const { error: historyError } = await admin.from("football_player_market_value_history").insert({
      player_id: row.playerId,
      market_value: row.marketValue,
      currency: row.currency,
      market_value_eur: row.marketValueEur,
      verified_season: request.verifiedSeason,
      verified_date: verifiedAt,
      source: request.source,
      confidence: "verified",
      created_by: request.actorUserId,
    });
    if (historyError) throw new Error(historyError.message);
    imported += 1;
  }

  const itemResult = await admin.from("football_market_value_import_items").insert(itemRows);
  if (itemResult.error) throw new Error(itemResult.error.message);

  const completedAt = new Date().toISOString();
  const finalStatus = rejected > 0 ? "partial" : "completed";
  const importUpdate = await admin.from("football_market_value_import_runs").update({
    status: finalStatus,
    inserted_rows: imported,
    unchanged_rows: unchanged,
    pending_rows: pending,
    failed_rows: rejected,
    completed_at: completedAt,
  }).eq("id", importRun.id);
  if (importUpdate.error) throw new Error(importUpdate.error.message);

  const jobUpdate = await admin.from("football_market_value_job_runs").update({
    status: finalStatus,
    changed_values: imported,
    unchanged_values: unchanged,
    pending_records: pending,
    failures: rejected,
    approved_records: imported,
    completed_at: completedAt,
  }).eq("id", jobRun.id);
  if (jobUpdate.error) throw new Error(jobUpdate.error.message);

  return { importRunId: importRun.id, jobRunId: jobRun.id, imported, unchanged, pending, rejected };
}
