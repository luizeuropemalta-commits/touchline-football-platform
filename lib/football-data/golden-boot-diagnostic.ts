import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FootballDataProvider } from "./types";
import { strictSportmonksId } from "./sportmonks-season-topscorers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const contract = {
  scope: "golden-boot-read-only",
  provider: "sportmonks",
  competitionProviderId: "8",
  stageAuthority: "unavailable",
  publicAwardEligible: false,
  freshnessAuthority: "fetch-age-only",
} as const;

function diagnosticId(value: unknown) {
  const id = strictSportmonksId(value);
  return id && id.length <= 20 ? id : null;
}

/** Called only after owner + dedicated QA admission. SELECT/GET only; never
 * creates a stage authority from the provider's leaderboard observations. */
export async function readGoldenBootDiagnostic(
  admin: SupabaseClient | null,
  createProvider: () => Pick<FootballDataProvider, "getSeasonTopScorers">,
) {
  const unavailable = (reason: string) => ({ ...contract, ok: false as const, reason });
  if (!admin) return unavailable("canonical-client-unavailable");
  try {
    const competition = await admin.from("football_competitions")
      .select("id,provider_competition_id")
      .eq("provider", "sportmonks").eq("provider_competition_id", "8").limit(2);
    if (competition.error || !Array.isArray(competition.data) || competition.data.length !== 1
      || !UUID.test(String(competition.data[0].id)) || String(competition.data[0].provider_competition_id) !== "8") {
      return unavailable("canonical-competition-unavailable-or-ambiguous");
    }
    const competitionId = String(competition.data[0].id);
    const seasons = await admin.from("football_seasons")
      .select("id,provider_season_id,competition_id,is_current")
      .eq("provider", "sportmonks").eq("competition_id", competitionId).eq("is_current", true).limit(2);
    if (seasons.error || !Array.isArray(seasons.data) || seasons.data.length !== 1
      || !UUID.test(String(seasons.data[0].id)) || seasons.data[0].competition_id !== competitionId
      || seasons.data[0].is_current !== true) return unavailable("canonical-season-unavailable-or-ambiguous");
    const seasonId = diagnosticId(seasons.data[0].provider_season_id);
    if (!seasonId) return unavailable("canonical-season-unavailable-or-ambiguous");
    const result = await createProvider().getSeasonTopScorers({ seasonId, totalBudgetMs: 12_000, maxPages: 10 });
    if (!result.ok) {
      const reason = result.error.code === "not_configured" ? "provider-not-configured"
        : result.error.code === "rate_limited" ? "provider-rate-limited" : "provider-unavailable";
      return unavailable(reason);
    }
    const data = result.data;
    if (data.requestedSeasonId !== seasonId || data.coverage !== "complete" || !Array.isArray(data.rows)
      || data.rows.length > 500 || !Number.isSafeInteger(data.pagesRead) || data.pagesRead < 1 || data.pagesRead > 10) {
      return unavailable("provider-evidence-invalid");
    }
    const fetchedAt = Date.parse(data.fetchedAt);
    if (!Number.isFinite(fetchedAt) || fetchedAt > Date.now() || Date.parse(result.fetchedAt) !== fetchedAt) {
      return unavailable("provider-fetch-time-invalid");
    }
    const rows = data.rows.map(row => ({
      providerPlayerId: diagnosticId(row.providerPlayerId),
      providerTeamId: diagnosticId(row.providerTeamId),
      leagueId: diagnosticId(row.leagueId),
      seasonId: diagnosticId(row.seasonId),
      stageId: diagnosticId(row.stageId),
      goals: row.goals !== null && Number.isSafeInteger(row.goals) && row.goals >= 0 ? row.goals : null,
    }));
    const stageIds = [...new Set(rows.flatMap(row => row.stageId ? [row.stageId] : []))].sort();
    return {
      ...contract, ok: true as const, seasonProviderId: seasonId,
      coverage: "complete" as const,
      scopeStatus: data.scopeStatus === "complete" || data.scopeStatus === "ambiguous" ? data.scopeStatus : "unavailable",
      pagesRead: data.pagesRead, rowCount: rows.length, cached: result.cached === true,
      fetchedAt: new Date(fetchedAt).toISOString(), fetchAgeMs: Date.now() - fetchedAt,
      missingAssociationCount: rows.filter(row => !row.providerPlayerId || !row.providerTeamId || !row.leagueId || !row.seasonId || !row.stageId).length,
      mismatchedScopeCount: rows.filter(row => row.leagueId !== null && row.leagueId !== "8" || row.seasonId !== null && row.seasonId !== seasonId).length,
      observedStageCount: stageIds.length, observedStageIds: stageIds.slice(0, 10),
      sample: rows.slice(0, 5),
    };
  } catch {
    // Never serialize thrown database/provider messages, URLs or raw bodies.
    return unavailable("diagnostic-read-failed");
  }
}
