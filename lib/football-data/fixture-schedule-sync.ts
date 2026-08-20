import type { SupabaseClient } from "@supabase/supabase-js";

import { persistCompetitionFixtureSchedule } from "@/lib/football-data/fixture-schedule-store";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type { FootballDataProvider, TouchlineFixture } from "@/lib/football-data/types";

const DEFAULT_COMPETITION_ID = "8";
const DEFAULT_TIMEZONE = "Europe/London";
const MAX_SYNC_DAYS = 90;

export type FixtureScheduleSyncResult = {
  ok: boolean;
  status: "success" | "partial" | "error" | "not_configured";
  provider: "sportmonks";
  competitionProviderId: string;
  fromDate: string;
  throughDate: string;
  fixturesFetched: number;
  fixturesStored: number;
  daysChecked: number;
  errors: string[];
  syncRunId?: string;
};

type FixtureScheduleSyncDependencies = {
  /** Test seam; production always creates the approved Sportmonks provider. */
  provider?: FootballDataProvider;
  /** Test seam; production always persists through the canonical schedule store. */
  persistSchedule?: typeof persistCompetitionFixtureSchedule;
};

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeDay(value: string | undefined, fallback: Date) {
  const parsed = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : fallback;
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function fixtureKey(fixture: TouchlineFixture) {
  return `${fixture.provider}:${fixture.providerId}`;
}

async function createRun(admin: SupabaseClient, result: FixtureScheduleSyncResult) {
  const { data, error } = await admin
    .from("football_data_sync_runs")
    .insert({
      provider: result.provider,
      sync_type: "fixture_schedule",
      status: "running",
      source_payload: {
        competitionProviderId: result.competitionProviderId,
        fromDate: result.fromDate,
        throughDate: result.throughDate,
        timezone: DEFAULT_TIMEZONE,
      },
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create fixture schedule sync run: ${error.message}`);
  return typeof data?.id === "string" ? data.id : undefined;
}

async function completeRun(admin: SupabaseClient, result: FixtureScheduleSyncResult) {
  if (!result.syncRunId) return;
  await admin
    .from("football_data_sync_runs")
    .update({
      status: result.status,
      completed_at: new Date().toISOString(),
      records_updated: result.fixturesStored,
      records_skipped: Math.max(0, result.fixturesFetched - result.fixturesStored),
      error_message: result.errors.join("\n") || null,
      source_payload: {
        competitionProviderId: result.competitionProviderId,
        fromDate: result.fromDate,
        throughDate: result.throughDate,
        timezone: DEFAULT_TIMEZONE,
        daysChecked: result.daysChecked,
        fixturesFetched: result.fixturesFetched,
        fixturesStored: result.fixturesStored,
      },
    })
    .eq("id", result.syncRunId);
}

/**
 * Imports one bounded schedule window. The job is idempotent and never deletes
 * a prior fixture, so a transient provider gap cannot erase public data.
 */
export async function syncSportmonksFixtureSchedule(
  admin: SupabaseClient,
  options: { competitionId?: string; fromDate?: string; throughDate?: string } = {},
  dependencies: FixtureScheduleSyncDependencies = {},
): Promise<FixtureScheduleSyncResult> {
  const today = normalizeDay(options.fromDate, new Date());
  const requestedThrough = normalizeDay(options.throughDate, new Date(today.getTime() + 35 * 86_400_000));
  const maxThrough = new Date(today.getTime() + (MAX_SYNC_DAYS - 1) * 86_400_000);
  const through = requestedThrough > maxThrough ? maxThrough : requestedThrough;
  const result: FixtureScheduleSyncResult = {
    ok: false,
    status: "error",
    provider: "sportmonks",
    competitionProviderId: options.competitionId ?? DEFAULT_COMPETITION_ID,
    fromDate: isoDate(today),
    throughDate: isoDate(through),
    fixturesFetched: 0,
    fixturesStored: 0,
    daysChecked: 0,
    errors: [],
  };

  try {
    result.syncRunId = await createRun(admin, result);
    if (!dependencies.provider && !process.env.SPORTMONKS_API_TOKEN) {
      result.status = "not_configured";
      result.errors.push("SPORTMONKS_API_TOKEN is not configured.");
      return result;
    }

    const provider = dependencies.provider ?? createFootballDataProvider("sportmonks");
    const competitionResponse = await provider.getCompetitionById(result.competitionProviderId);
    if (!competitionResponse.ok || !competitionResponse.data) {
      result.status = competitionResponse.ok ? "error" : competitionResponse.error.code === "not_configured" ? "not_configured" : "error";
      result.errors.push(competitionResponse.ok ? "Competition was not found." : competitionResponse.error.message);
      return result;
    }

    result.daysChecked = Math.floor((through.getTime() - today.getTime()) / 86_400_000) + 1;
    const fixtureResponse = await provider.getFixturesBetween({
      fromDate: result.fromDate,
      throughDate: result.throughDate,
      competitionId: result.competitionProviderId,
      timezone: DEFAULT_TIMEZONE,
    });
    if (!fixtureResponse.ok) {
      result.errors.push(`${result.fromDate}..${result.throughDate}: ${fixtureResponse.error.message}`);
      return result;
    }

    // Keep a defensive identity/competition check after provider scoping, but
    // do not page a global response before reaching this point.
    const fixtures = new Map<string, TouchlineFixture>();
    for (const fixture of fixtureResponse.data) {
      if (fixture.competitionId === result.competitionProviderId) fixtures.set(fixtureKey(fixture), fixture);
    }

    const fixtureList = [...fixtures.values()];
    result.fixturesFetched = fixtureList.length;
    const seasonIds = [...new Set(fixtureList.map((fixture) => fixture.seasonId).filter((id): id is string => Boolean(id)))];
    const seasonResults = await Promise.all(seasonIds.map((seasonId) => provider.getSeasonById(seasonId)));
    const seasons = seasonResults.flatMap((seasonResult, index) => {
      if (seasonResult.ok && seasonResult.data) return [seasonResult.data];
      result.errors.push(`Season ${seasonIds[index]}: ${seasonResult.ok ? "not found" : seasonResult.error.message}`);
      return [];
    });
    const persisted = await (dependencies.persistSchedule ?? persistCompetitionFixtureSchedule)(admin, {
      competition: competitionResponse.data,
      seasons,
      fixtures: fixtureList,
      syncedAt: new Date().toISOString(),
    });
    result.fixturesStored = persisted.fixturesStored;
    if (!persisted.stored) result.errors.push(persisted.reason ?? "Could not persist fixture schedule.");
    result.ok = persisted.stored && result.errors.length === 0;
    result.status = result.ok ? "success" : persisted.stored ? "partial" : "error";
    return result;
  } finally {
    await completeRun(admin, result);
  }
}
