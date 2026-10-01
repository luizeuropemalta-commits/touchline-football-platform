import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FootballDataProvider } from "./types";
import { parseSportmonksStatisticValue } from "./sportmonks-statistics";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (value: unknown): value is string => typeof value === "string" && /^\d{1,20}$/.test(value);
const contract = { scope: "fixture-read-only", provider: "sportmonks", publicScoringAuthority: false, freshnessAuthority: "fetch-age-only", providerCoverage: "unverified" } as const;
const cleanText = (value: unknown) => typeof value === "string" && value.length <= 100 ? value : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

/** Owner + dedicated QA admission belongs to the route. No ingestion callers. */
export async function readFixtureDiagnostic(admin: SupabaseClient | null, fixtureUuid: string, createProvider: () => Pick<FootballDataProvider, "getFixtureFantasyFeed">) {
  const fail = (reason: string) => ({ ...contract, ok: false as const, reason });
  if (!admin || !UUID.test(fixtureUuid)) return fail("invalid-canonical-fixture");
  try {
    const competitions = await admin.from("football_competitions").select("id,provider,provider_competition_id")
      .eq("provider", "sportmonks").eq("provider_competition_id", "8").limit(2);
    if (competitions.error || competitions.data?.length !== 1) return fail("canonical-competition-unavailable-or-ambiguous");
    const competition = competitions.data[0];
    if (!UUID.test(competition.id) || competition.provider !== "sportmonks" || competition.provider_competition_id !== "8") return fail("canonical-competition-invalid");
    const seasons = await admin.from("football_seasons").select("id,provider,provider_season_id,competition_id,is_current")
      .eq("provider", "sportmonks").eq("competition_id", competition.id).eq("is_current", true).limit(2);
    if (seasons.error || seasons.data?.length !== 1) return fail("canonical-season-unavailable-or-ambiguous");
    const season = seasons.data[0];
    if (!UUID.test(season.id) || season.provider !== "sportmonks" || !id(season.provider_season_id) || season.competition_id !== competition.id || season.is_current !== true) return fail("canonical-season-invalid");
    const fixtures = await admin.from("football_fixtures").select("id,provider,provider_fixture_id,competition_id,season_id")
      .eq("provider", "sportmonks").eq("id", fixtureUuid).eq("competition_id", competition.id).eq("season_id", season.id).limit(2);
    if (fixtures.error || fixtures.data?.length !== 1) return fail("canonical-fixture-unavailable-or-ambiguous");
    const fixture = fixtures.data[0];
    if (fixture.id !== fixtureUuid || fixture.provider !== "sportmonks" || !id(fixture.provider_fixture_id) || fixture.competition_id !== competition.id || fixture.season_id !== season.id) return fail("canonical-fixture-scope-invalid");
    const started = Date.now();
    const result = await createProvider().getFixtureFantasyFeed(fixture.provider_fixture_id, { totalBudgetMs: 5000 });
    if (Date.now() - started > 5000) return fail("provider-budget-exhausted");
    if (!result.ok || !result.data) return fail("provider-unavailable");
    const feed = result.data;
    if (result.provider !== "sportmonks" || feed.fixture.provider !== "sportmonks" || feed.fixture.providerId !== fixture.provider_fixture_id
      || feed.fixture.competitionId !== "8" || feed.fixture.seasonId !== season.provider_season_id) return fail("provider-fixture-scope-invalid");
    const age = Date.now() - Date.parse(result.fetchedAt);
    if (!Number.isFinite(age) || age < 0 || age > 30000 || feed.fetchedAt !== result.fetchedAt) return fail("provider-fetch-time-invalid");
    if (!Array.isArray(feed.events) || !Array.isArray(feed.lineups) || feed.events.length > 500 || feed.lineups.length > 100) return fail("provider-evidence-limit-exceeded");
    for (const rows of [feed.events, feed.lineups]) {
      if (rows.some(row => row.provider !== "sportmonks" || row.fixtureId !== fixture.provider_fixture_id || !id(row.providerId))
        || new Set(rows.map(row => row.providerId)).size !== rows.length) return fail("provider-evidence-identity-invalid");
    }
    if (feed.lineups.some(row => !id(row.playerId) || !id(row.teamId) || !Array.isArray(row.statistics) || row.statistics.length > 100)
      || new Set(feed.lineups.map(row => row.playerId)).size !== feed.lineups.length) return fail("provider-lineup-identity-invalid");
    for (const row of feed.lineups) {
      const relevant = row.statistics.filter(stat => ["rating", "minutes-played", "minutes"].includes(stat.code ?? ""));
      const kinds = relevant.map(stat => stat.code === "rating" ? "rating" : "minutes");
      if (new Set(kinds).size !== kinds.length) return fail("provider-statistics-ambiguous");
    }
    return { ...contract, ok: true as const, canonicalFixtureId: fixture.id, providerFixtureId: fixture.provider_fixture_id,
      canonicalCompetitionId: competition.id, competitionProviderId: "8", canonicalSeasonId: season.id, seasonProviderId: season.provider_season_id,
      status: cleanText(feed.fixture.status), fetchedAt: result.fetchedAt, fetchAgeMs: age, cached: result.cached === true,
      limits: { events: 500, lineups: 100, statisticsPerLineup: 100 }, listTruncated: false, normalizedListsComplete: true, statisticalCompleteness: "unverified",
      // Complete normalized lists do not prove the upstream response contained all facts.
      events: feed.events.map(row => ({ providerEventId: row.providerId, providerPlayerId: id(row.playerId) ? row.playerId : null,
        providerRelatedPlayerId: id(row.relatedPlayerId) ? row.relatedPlayerId : null, providerTeamId: id(row.teamId) ? row.teamId : null,
        type: cleanText(row.type), status: row.status === "rescinded" ? "rescinded" : row.status === "recorded" ? "recorded" : null,
        minute: number(row.minute), extraMinute: number(row.extraMinute), sortOrder: number(row.sortOrder), result: cleanText(row.result) })),
      lineups: feed.lineups.map(row => ({ providerLineupId: row.providerId, providerPlayerId: row.playerId, providerTeamId: row.teamId,
        isStarter: typeof row.isStarter === "boolean" ? row.isStarter : null, isSubstitute: typeof row.isSubstitute === "boolean" ? row.isSubstitute : null,
        statistics: row.statistics.filter(stat => ["rating", "minutes-played", "minutes"].includes(stat.code ?? ""))
          .map(stat => ({ typeId: id(stat.typeId) ? stat.typeId : null, code: stat.code, value: number(parseSportmonksStatisticValue(stat.value)) })) })),
    };
  } catch { return fail("diagnostic-read-failed"); }
}
