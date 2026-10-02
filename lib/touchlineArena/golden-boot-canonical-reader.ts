import "server-only";

import type { FootballDataResult, TouchlineSeasonStages, TouchlineSeasonTopScorers } from "../football-data/types.ts";
import { strictSportmonksId } from "../football-data/sportmonks-season-topscorers.ts";
import { loadTouchlinePublishedCardPresentations } from "./card-publication-read-model.ts";
import type { TouchlinePublicEditorialCardPresentation } from "./editorial-card-profile.ts";
import { resolveGoldenBootEligibility, type GoldenBootStageScope } from "./golden-boot-eligibility.ts";
import { resolveGoldenBootPremierStageScope } from "./golden-boot-stage-scope.ts";
import { canonicalEditorialSeason } from "./editorial-season.ts";

type Admin = NonNullable<Parameters<typeof loadTouchlinePublishedCardPresentations>[0]["providedAdmin"]>;
type Row = Record<string, unknown>;
type CanonicalLeader = Readonly<{
  playerId: string; providerPlayerId: string; clubId: string; providerTeamId: string;
  membershipId: string; goals: number; presentation: TouchlinePublicEditorialCardPresentation;
}>;
export type GoldenBootCanonicalRead = Readonly<{
  phase: "unique" | "shared" | "unavailable";
  reason: string | null;
  leaders: readonly CanonicalLeader[];
  scope: GoldenBootStageScope | null;
  canonicalScope: Readonly<{ competitionId: string; seasonId: string; effectiveSeason: string }> | null;
  fetchedAt: string | null;
  expiresAt: string | null;
  freshnessAuthority: "fetch-age-only";
  publicAwardEligible: false;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function providerId(value: unknown): value is string {
  return typeof value === "string" && strictSportmonksId(value) === value;
}

function completeRows(response: { data: unknown; error: unknown; count: number | null }): Row[] | null {
  if (response.error || !Array.isArray(response.data) || response.count !== response.data.length
    || response.data.some(row => !row || typeof row !== "object" || Array.isArray(row))) return null;
  return response.data as Row[];
}

/** Internal evidence reader only. SELECTs are not a transactional award
 * producer: a later publication/membership revocation must be checked again
 * at any future write boundary. No provider calls, cache or public consumer. */
export async function readGoldenBootCanonicalLeaders(input: {
  admin: Admin | null;
  stages: FootballDataResult<TouchlineSeasonStages> | null;
  topScorers: FootballDataResult<TouchlineSeasonTopScorers> | null;
  maxAgeMs: number;
  /** Clock seam, sampled again after all asynchronous reads. */
  now?: () => number;
}): Promise<GoldenBootCanonicalRead> {
  const unavailable = (reason: string): GoldenBootCanonicalRead => ({
    phase: "unavailable", reason, leaders: [], scope: null, canonicalScope: null,
    fetchedAt: null, expiresAt: null, freshnessAuthority: "fetch-age-only", publicAwardEligible: false,
  });
  try {
    const now = input.now ?? Date.now;
    const maxAgeMs = input.maxAgeMs;
    // Provider DTOs and policy are captured before asynchronous database work.
    const stages = structuredClone(input.stages);
    const topScorers = structuredClone(input.topScorers);
    const initialNow = now();
    if (!input.admin || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0
      || !Number.isSafeInteger(initialNow) || initialNow < 0) return unavailable("invalid-client-or-policy");
    const admin = input.admin;
    const competitions = completeRows(await admin.from("football_competitions")
      .select("id,provider,provider_competition_id", { count: "exact" })
      .eq("provider", "sportmonks").eq("provider_competition_id", "8").limit(2));
    const competition = competitions?.length === 1 ? competitions[0] : null;
    if (!competition || !uuid(competition.id) || competition.provider !== "sportmonks"
      || competition.provider_competition_id !== "8") return unavailable("canonical-competition-unavailable");
    const competitionId = competition.id;
    const seasons = completeRows(await admin.from("football_seasons")
      .select("id,provider,provider_season_id,competition_id,is_current,name", { count: "exact" })
      .eq("provider", "sportmonks").eq("competition_id", competitionId).eq("is_current", true).limit(2));
    const season = seasons?.length === 1 ? seasons[0] : null;
    const effectiveSeason = canonicalEditorialSeason(season?.name);
    if (!season || !uuid(season.id) || !providerId(season.provider_season_id)
      || season.provider !== "sportmonks" || season.competition_id !== competitionId
      || season.is_current !== true || !effectiveSeason) return unavailable("canonical-season-unavailable");
    const canonicalStage = { leagueId: "8", seasonId: season.provider_season_id };
    const scope = resolveGoldenBootPremierStageScope({
      evidence: stages, canonicalScope: canonicalStage, maxAgeMs, nowMs: initialNow,
    });
    const eligibility = resolveGoldenBootEligibility({
      evidence: topScorers, scope, maxAgeMs, nowMs: initialNow,
    });
    if (!scope || eligibility.phase === "unavailable" || !stages?.ok || !topScorers?.ok
      || !eligibility.leaders.length || eligibility.leaders.length > 750) return unavailable("provider-evidence-unavailable");
    const providerIds = eligibility.leaders.map(leader => leader.providerPlayerId);
    if (!providerIds.every(providerId) || !eligibility.leaders.every(leader => providerId(leader.providerTeamId))) {
      return unavailable("provider-identity-invalid");
    }
    const players = completeRows(await admin.from("football_players")
      .select("id,provider,provider_player_id,current_club_id", { count: "exact" })
      .eq("provider", "sportmonks").in("provider_player_id", providerIds));
    if (!players || players.length !== providerIds.length
      || new Set(players.map(row => row.provider_player_id)).size !== providerIds.length
      || new Set(players.map(row => row.id)).size !== players.length
      || players.some(row => !uuid(row.id) || !uuid(row.current_club_id) || row.provider !== "sportmonks"
        || !providerId(row.provider_player_id) || !providerIds.includes(row.provider_player_id))) {
      return unavailable("canonical-players-unavailable");
    }
    const playerIds = players.map(row => row.id as string);
    const clubIds = [...new Set(players.map(row => row.current_club_id as string))];
    const [clubResponse, membershipResponse] = await Promise.all([
      admin.from("football_clubs").select("id,provider,provider_team_id,competition_id", { count: "exact" })
        .eq("provider", "sportmonks").in("id", clubIds),
      admin.from("football_squad_members").select("id,provider,player_id,club_id,competition_id,status", { count: "exact" })
        .eq("provider", "sportmonks").eq("competition_id", competitionId).eq("status", "active").in("player_id", playerIds),
    ]);
    const clubs = completeRows(clubResponse);
    const memberships = completeRows(membershipResponse);
    if (!clubs || clubs.length !== clubIds.length || new Set(clubs.map(row => row.id)).size !== clubIds.length
      || clubs.some(row => !uuid(row.id) || !clubIds.includes(row.id) || row.provider !== "sportmonks"
        || !providerId(row.provider_team_id) || row.competition_id !== competitionId)
      || !memberships || memberships.length !== playerIds.length
      || new Set(memberships.map(row => row.player_id)).size !== playerIds.length
      || new Set(memberships.map(row => row.id)).size !== memberships.length) {
      return unavailable("canonical-clubs-or-memberships-unavailable");
    }
    const bindings = new Map<string, Readonly<{ clubId: string; membershipId: string }>>();
    const mapped: Array<Omit<CanonicalLeader, "presentation">> = [];
    for (const leader of eligibility.leaders) {
      const player = players.find(row => row.provider_player_id === leader.providerPlayerId)!;
      const club = clubs.find(row => row.id === player.current_club_id);
      const member = memberships.find(row => row.player_id === player.id);
      if (!club || club.provider_team_id !== leader.providerTeamId || !member || !uuid(member.id)
        || member.provider !== "sportmonks" || member.status !== "active"
        || member.competition_id !== competitionId || member.club_id !== club.id) {
        return unavailable("canonical-leader-binding-mismatch");
      }
      const playerId = player.id as string;
      bindings.set(playerId, { clubId: club.id as string, membershipId: member.id });
      mapped.push({ ...leader, playerId, clubId: club.id as string, membershipId: member.id });
    }
    const presentations = await loadTouchlinePublishedCardPresentations({
      playerIds, providedAdmin: admin, requiredScope: { competitionId, effectiveSeason }, requiredBindings: bindings,
    });
    if (presentations.size !== mapped.length || mapped.some(leader => !presentations.has(leader.playerId))) {
      return unavailable("canonical-publications-unavailable");
    }
    const finalNow = now();
    if (!Number.isSafeInteger(finalNow) || finalNow < initialNow
      || !resolveGoldenBootPremierStageScope({ evidence: stages, canonicalScope: canonicalStage,
        maxAgeMs, nowMs: finalNow })
      || resolveGoldenBootEligibility({ evidence: topScorers, scope, maxAgeMs,
        nowMs: finalNow }).phase === "unavailable") return unavailable("provider-evidence-expired-during-read");
    const oldest = Math.min(Date.parse(stages.data.fetchedAt), Date.parse(topScorers.data.fetchedAt));
    const expiry = oldest + maxAgeMs;
    if (!Number.isSafeInteger(expiry) || expiry > 8_640_000_000_000_000) return unavailable("invalid-expiry");
    return {
      phase: eligibility.phase, reason: null, scope,
      canonicalScope: { competitionId, seasonId: season.id, effectiveSeason },
      leaders: mapped.map(leader => ({ ...leader, presentation: presentations.get(leader.playerId)! })),
      fetchedAt: new Date(oldest).toISOString(), expiresAt: new Date(expiry).toISOString(),
      freshnessAuthority: "fetch-age-only", publicAwardEligible: false,
    };
  } catch {
    // Never return database/provider messages or partially mapped ties.
    return unavailable("canonical-read-failed");
  }
}
