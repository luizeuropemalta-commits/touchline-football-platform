import { createFootballDataProvider, getConfiguredFootballDataProviderName } from "@/lib/football-data/provider-factory";
import type { FootballDataProvider, FootballDataProviderName } from "@/lib/football-data/types";

export type FootballDataValidationStatus = "ready" | "not_configured" | "skipped" | "error";

export type FootballDataValidationCheck = {
  name: string;
  status: FootballDataValidationStatus;
  message: string;
  provider: FootballDataProviderName;
  latencyMs?: number;
};

export type FootballDataValidationReport = {
  provider: FootballDataProviderName;
  generatedAt: string;
  checks: FootballDataValidationCheck[];
};

type ValidationRunner = (provider: FootballDataProvider) => Promise<{ ok: boolean; message: string; skipped?: boolean }>;

export class FootballDataSyncEngine {
  constructor(private readonly provider: FootballDataProvider = createFootballDataProvider()) {}

  async validateProviderConnection(): Promise<FootballDataValidationReport> {
    const checks: Array<[string, ValidationRunner]> = [
      ["Players", async (provider) => {
        const query = process.env.FOOTBALL_DATA_VALIDATION_PLAYER_QUERY ?? "Messi";
        const result = await provider.searchPlayers({ query, limit: 3 });
        if (!result.ok) return this.fromError(result.error.code, result.error.message);
        return { ok: true, message: `${result.data.length} player result(s) returned for "${query}".` };
      }],
      ["Teams", async (provider) => {
        const id = process.env.FOOTBALL_DATA_VALIDATION_TEAM_ID;
        if (!id) return { ok: true, skipped: true, message: "Set FOOTBALL_DATA_VALIDATION_TEAM_ID to validate team lookup." };
        const result = await provider.getTeamById(id);
        if (!result.ok) return this.fromError(result.error.code, result.error.message);
        return { ok: true, message: result.data ? `Team lookup returned ${result.data.name}.` : "Team lookup returned no record." };
      }],
      ["Competitions", async (provider) => {
        const result = await provider.getCompetitions();
        if (!result.ok) return this.fromError(result.error.code, result.error.message);
        return { ok: true, message: `${result.data.length} competition result(s) returned.` };
      }],
      ["Coaches", async (provider) => {
        const id = process.env.FOOTBALL_DATA_VALIDATION_COACH_ID;
        if (!id) return { ok: true, skipped: true, message: "Set FOOTBALL_DATA_VALIDATION_COACH_ID to validate coach lookup." };
        const result = await provider.getCoachById(id);
        if (!result.ok) return this.fromError(result.error.code, result.error.message);
        return { ok: true, message: result.data ? `Coach lookup returned ${result.data.name}.` : "Coach lookup returned no record." };
      }],
      ["Fixtures", async (provider) => {
        const date = process.env.FOOTBALL_DATA_VALIDATION_FIXTURE_DATE ?? new Date().toISOString().slice(0, 10);
        const result = await provider.getFixturesByDate({ date });
        if (!result.ok) return this.fromError(result.error.code, result.error.message);
        return { ok: true, message: `${result.data.length} fixture result(s) returned for ${date}.` };
      }],
      ["Standings", async (provider) => {
        const seasonId = process.env.FOOTBALL_DATA_VALIDATION_SEASON_ID;
        const competitionId = process.env.FOOTBALL_DATA_VALIDATION_COMPETITION_ID;
        if (!seasonId) return { ok: true, skipped: true, message: "Set FOOTBALL_DATA_VALIDATION_SEASON_ID to validate standings." };
        const result = await provider.getStandings({ seasonId, competitionId });
        if (!result.ok) return this.fromError(result.error.code, result.error.message);
        return { ok: true, message: `${result.data.length} standing row(s) returned.` };
      }],
      ["Rate limit", async (provider) => {
        const result = await provider.getRateLimitStatus();
        if (!result.ok) return this.fromError(result.error.code, result.error.message);
        return { ok: true, message: result.data.providerMessage ?? "Rate-limit endpoint returned successfully." };
      }],
    ];

    const results: FootballDataValidationCheck[] = [];
    for (const [name, runner] of checks) {
      const startedAt = Date.now();
      const result = await runner(this.provider);
      results.push({
        name,
        provider: this.provider.name,
        status: result.skipped ? "skipped" : result.ok ? "ready" : result.message.toLowerCase().includes("not configured") ? "not_configured" : "error",
        message: result.message,
        latencyMs: Date.now() - startedAt,
      });
    }

    return {
      provider: this.provider.name,
      generatedAt: new Date().toISOString(),
      checks: results,
    };
  }

  private fromError(code: string, message: string) {
    return {
      ok: false,
      message: code === "not_configured" ? `Not configured: ${message}` : message,
    };
  }
}

export function createFootballDataSyncEngine(providerName: FootballDataProviderName = getConfiguredFootballDataProviderName()) {
  return new FootballDataSyncEngine(createFootballDataProvider(providerName));
}
