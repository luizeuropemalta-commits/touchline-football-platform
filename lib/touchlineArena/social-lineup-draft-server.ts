import "server-only";

import { toPublicFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-fixture";
import { createAdminClient } from "@/lib/supabase/admin";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { readPublicFantasyFixtureMatchDetail } from "@/lib/football-data/public-fixture-match-detail-server";
import { readPersistedFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-snapshot";
import {
  publicPremierSquadPlayerToCard,
  readPublicPremierSquad,
} from "@/lib/football-data/public-premier-squad-server";
import { buildTouchLineClubMatchdayPresentation } from "@/lib/touchlineArena/club-lineup";
import { createTouchlineArenaCoachSlot, type TouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import { TOUCHLINE_ENGLAND_CLUBS, type ClubOwnerSquadCard, type TouchLineClubVisual } from "@/lib/touchlineArena/demo-data";
import {
  touchlineCoachClassificationForProviderId,
  touchlineLiveCoachForTeam,
} from "@/lib/touchlineArena/live-coaches";
import {
  applyTouchlineMatchdayPoints,
  applyTouchlineSeasonPoints,
} from "@/lib/touchlineArena/matchday-player-points";
import { readPublicSeasonPlayerPoints } from "@/lib/touchlineArena/public-season-player-points-server";
import { readTouchlineFormationGeometryRegistry } from "@/lib/touchlineArena/formation-geometry-server";
import { loadTouchlinePublishedCardPresentations } from "@/lib/touchlineArena/card-publication-read-model";
import { validateTouchlineSocialLineupContract } from "@/lib/touchlineArena/social-lineup-contract";
import { touchlineFixtureState } from "@/lib/touchlineArena/match-centre";
import { resolveTouchlineFixtureVenue } from "@/lib/touchlineArena/stadium-catalog";
import { buildTouchlineOfficialLineupCaption } from "@/lib/touchlineArena/social-lineup-caption";
import { checksumTouchlineSocialLineupRenderSource } from "@/lib/touchlineArena/social-lineup-render-source";
import { TOUCHLINE_OFFICIAL_LINEUP_PROVENANCE } from "@/lib/touchlineArena/social-lineup-presentation-policy";
import { readTouchlineSocialSourceRevisionCheckpoint } from "@/lib/touchlineArena/social-source-revision-server";

const NUMERIC_ID = /^[0-9]{1,20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREMIER_LEAGUE_COMPETITION_ID = "8";

export type TouchlineSocialLineupDraft = Readonly<{
  sourceProvenance: typeof TOUCHLINE_OFFICIAL_LINEUP_PROVENANCE;
  fixtureId: string;
  capturedAt: string;
  lineupAvailableAt: string;
  startsAt: string;
  status: string;
  seasonId: string;
  gameweekNumber: number;
  venueName: string;
  caption: string;
  sourceVersion: string;
  sourceChecksum: string;
  sourceRevisionManifest: Readonly<Record<string, number>>;
  sourceRevisionChecksum: string;
  score: Readonly<{
    state: "finished";
    home: number;
    away: number;
  }> | null;
  side: "home" | "away";
  formation: string;
  club: TouchLineClubVisual;
  opponent: TouchLineClubVisual;
  home: TouchLineClubVisual;
  away: TouchLineClubVisual;
  coach: Readonly<{
    identity: NonNullable<ReturnType<typeof touchlineLiveCoachForTeam>>;
    slot: TouchlineArenaCoachSlot;
  }>;
  players: readonly Readonly<{ card: ClubOwnerSquadCard; x: number; y: number }>[];
  bench: readonly ClubOwnerSquadCard[];
}>;

export type TouchlineSocialLineupDraftResult =
  | Readonly<{ ok: true; data: TouchlineSocialLineupDraft }>
  | Readonly<{ ok: false; reason: string }>;

/**
 * Read-only social draft source. It consumes the same published-card and
 * persisted Sportmonks projections as ClubHub; it never calls the provider,
 * writes a fixture or manufactures a missing card.
 */
export async function readTouchlineSocialLineupDraft(input: {
  fixtureId: string;
  teamId: string;
}): Promise<TouchlineSocialLineupDraftResult> {
  const fixtureId = input.fixtureId.trim();
  const teamId = input.teamId.trim();
  if (!NUMERIC_ID.test(fixtureId) || !NUMERIC_ID.test(teamId)) {
    return { ok: false, reason: "invalid-identifiers" };
  }

  const sourceReadStart = await readTouchlineSocialSourceRevisionCheckpoint([]);
  if (!sourceReadStart) return { ok: false, reason: "source-revision-unavailable" };

  const snapshot = await readPersistedFantasyFixtureFeed(fixtureId);
  if (!snapshot) return { ok: false, reason: "fixture-feed-unavailable" };
  const publicFeed = toPublicFantasyFixtureFeed(snapshot.feed);
  if (!publicFeed) return { ok: false, reason: "fixture-feed-invalid" };
  const detail = await readPublicFantasyFixtureMatchDetail(fixtureId, publicFeed);
  if (!detail) return { ok: false, reason: "fixture-detail-unavailable" };
  const contract = validateTouchlineSocialLineupContract(detail, teamId);
  if (!contract.ok) return contract;
  const matchState = touchlineFixtureState(detail.fixture);
  const homeScore = detail.fixture.homeScore;
  const awayScore = detail.fixture.awayScore;
  const score = matchState === "finished"
    && Number.isInteger(homeScore) && Number(homeScore) >= 0
    && Number.isInteger(awayScore) && Number(awayScore) >= 0
    ? { state: "finished" as const, home: Number(homeScore), away: Number(awayScore) }
    : null;

  const scheduleFixture = (await readPublicCompetitionFixtures({ includeHistorical: true, limit: 200 }))
    .find((fixture) => String(fixture.source.providerId) === fixtureId) ?? null;
  const homeTeamId = String(scheduleFixture?.homeTeam?.providerId ?? "").trim();
  const awayTeamId = String(scheduleFixture?.awayTeam?.providerId ?? "").trim();
  const feedHomeTeamId = String(publicFeed.fixture.homeTeam?.id ?? "").trim();
  const feedAwayTeamId = String(publicFeed.fixture.awayTeam?.id ?? "").trim();
  if (
    !NUMERIC_ID.test(homeTeamId)
    || !NUMERIC_ID.test(awayTeamId)
    || scheduleFixture?.competitionId !== PREMIER_LEAGUE_COMPETITION_ID
    || !NUMERIC_ID.test(String(scheduleFixture?.seasonId ?? ""))
    || homeTeamId !== feedHomeTeamId
    || awayTeamId !== feedAwayTeamId
    || (teamId !== homeTeamId && teamId !== awayTeamId)
  ) {
    return { ok: false, reason: "canonical-fixture-team-identity-unavailable" };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "qa-read-model-unavailable" };
  const { data: canonicalFixture, error: canonicalFixtureError } = await admin
    .from("football_fixtures")
    .select("id,competition_id,season_id,round_id,home_club_id,away_club_id")
    .eq("provider", "sportmonks")
    .eq("provider_fixture_id", fixtureId)
    .maybeSingle();
  if (canonicalFixtureError
    || !canonicalFixture
    || ![canonicalFixture.id, canonicalFixture.competition_id, canonicalFixture.season_id,
      canonicalFixture.round_id, canonicalFixture.home_club_id, canonicalFixture.away_club_id].every((id) => UUID.test(String(id ?? "")))) {
    return { ok: false, reason: "canonical-fixture-revision-identity-unavailable" };
  }
  const { data: competition, error: competitionError } = await admin
    .from("football_competitions")
    .select("id")
    .eq("id", canonicalFixture.competition_id)
    .eq("provider", "sportmonks")
    .eq("provider_competition_id", PREMIER_LEAGUE_COMPETITION_ID)
    .maybeSingle();
  if (competitionError || !competition?.id) return { ok: false, reason: "current-competition-unavailable" };
  const { data: currentSeason, error: currentSeasonError } = await admin
    .from("football_seasons")
    .select("provider_season_id")
    .eq("id", canonicalFixture.season_id)
    .eq("provider", "sportmonks")
    .eq("competition_id", competition.id)
    .eq("is_current", true)
    .maybeSingle();
  if (currentSeasonError || String(currentSeason?.provider_season_id ?? "") !== String(scheduleFixture.seasonId)) {
    return { ok: false, reason: "current-season-mismatch" };
  }
  const clubForTeamId = (providerTeamId: string) => {
    const matches = TOUCHLINE_ENGLAND_CLUBS.filter((candidate) => candidate.teamId === providerTeamId);
    return matches.length === 1 && matches[0].logoUrl ? matches[0] : null;
  };
  const home = clubForTeamId(homeTeamId);
  const away = clubForTeamId(awayTeamId);
  const club = clubForTeamId(teamId);
  const opponent = contract.value.side === "home" ? away : home;
  if (!home || !away || !club || !opponent) return { ok: false, reason: "club-identity-unavailable" };
  const venue = resolveTouchlineFixtureVenue(scheduleFixture);
  const gameweekMatch = String(scheduleFixture.roundName ?? "").match(/\d+/);
  const gameweekNumber = gameweekMatch ? Number(gameweekMatch[0]) : NaN;
  if (!venue?.name || !Number.isInteger(gameweekNumber) || gameweekNumber < 1) {
    return { ok: false, reason: "verified-match-context-unavailable" };
  }
  const coachIdentity = touchlineLiveCoachForTeam(teamId);
  const coachClassification = touchlineCoachClassificationForProviderId(coachIdentity?.coach.providerId);
  if (!coachIdentity || !coachClassification) return { ok: false, reason: "canonical-coach-unavailable" };

  const [squadResult, coachRanking] = await Promise.all([
    readPublicPremierSquad(teamId, { providedAdmin: admin }),
    loadTouchLineCoachRanking(),
  ]);
  if (squadResult.status !== 200 || squadResult.body.ok === false) {
    return { ok: false, reason: "published-squad-unavailable" };
  }
  const projectedRosterCards = (squadResult.body.rosterPlayers ?? squadResult.body.players)
    .map((player) => publicPremierSquadPlayerToCard(player, club.name));
  const publishedPresentations = await loadTouchlinePublishedCardPresentations({
    playerIds: projectedRosterCards.flatMap((card) => card.canonicalPlayerId ? [card.canonicalPlayerId] : []),
    providedAdmin: admin,
  });
  const rosterCards: ClubOwnerSquadCard[] = projectedRosterCards.map((card): ClubOwnerSquadCard => {
    const published = card.canonicalPlayerId
      ? publishedPresentations.get(card.canonicalPlayerId) ?? null
      : null;
    if (!published) {
      return { ...card, editorialCard: undefined, cardTier: undefined };
    }
    return {
      ...card,
      editorialCard: published,
      cardTier: published.tierKey,
    };
  });
  const starterIds = new Set(contract.value.starterPlayerIds);
  const starterCards = rosterCards.filter((card) => starterIds.has(String(card.id)));
  if (starterCards.length !== 11 || starterCards.some((card) => !card.editorialCard || !card.cardTier)) {
    return { ok: false, reason: "published-starting-xi-unavailable" };
  }
  const officialBench = detail.lineups.filter((member) => (
    member.teamId === teamId
    && member.isSubstitute === true
    && member.isStarter !== true
  ));
  const benchIds = officialBench.map((member) => String(member.playerId ?? "").trim());
  if (
    officialBench.length !== 9
    || new Set(benchIds).size !== 9
    || benchIds.some((id) => !NUMERIC_ID.test(id))
    || benchIds.some((id) => starterIds.has(id))
    || officialBench.some((member) => (
      !Number.isInteger(member.jerseyNumber)
      || Number(member.jerseyNumber) <= 0
      || Number(member.jerseyNumber) > 99
    ))
  ) {
    return { ok: false, reason: "official-bench-incomplete" };
  }
  const rosterByProviderId = new Map(rosterCards.map((card) => [String(card.id), card] as const));
  const benchCards = benchIds.flatMap((id) => {
    const card = rosterByProviderId.get(id);
    return card ? [card] : [];
  });
  if (
    benchCards.length !== 9
    || benchCards.some((card) => !card.editorialCard || !card.cardTier)
  ) {
    const publishedIds = new Set(benchCards.map((card) => String(card.id)));
    const missingNames = officialBench
      .filter((member) => !publishedIds.has(String(member.playerId)))
      .map((member) => member.playerName)
      .join(", ");
    return {
      ok: false,
      reason: `published-official-bench-unavailable${missingNames ? `: ${missingNames}` : ""}`,
    };
  }
  const officialBenchShirts = new Map(officialBench.map((member) => (
    [String(member.playerId), member.jerseyNumber] as const
  )));
  if (benchCards.some((card) => officialBenchShirts.get(String(card.id)) !== card.shirtNumber)) {
    return { ok: false, reason: "canonical-bench-shirt-mismatch" };
  }

  const seasonPoints = await readPublicSeasonPlayerPoints(
    rosterCards.flatMap((card) => card.canonicalPlayerId ? [card.canonicalPlayerId] : []),
    {
      competitionId: String(canonicalFixture.competition_id).toLowerCase(),
      seasonId: String(canonicalFixture.season_id).toLowerCase(),
      providedAdmin: admin,
    },
  );
  const decoratedCards = applyTouchlineMatchdayPoints(
    applyTouchlineSeasonPoints(rosterCards, seasonPoints),
    detail.playerStatistics,
  );
  const decoratedCardByProviderId = new Map(decoratedCards.map((card) => [String(card.id), card] as const));
  const decoratedBenchCards = benchIds.map((id) => decoratedCardByProviderId.get(id)!);
  if (decoratedBenchCards.some((card) => !card)) {
    return { ok: false, reason: "canonical-bench-identity-mismatch" };
  }
  const formationGeometryRegistry = await readTouchlineFormationGeometryRegistry();
  const presentation = buildTouchLineClubMatchdayPresentation({
    club,
    squadCards: decoratedCards,
    officialLineup: snapshot.feed.lineups,
    formation: contract.value.formation,
    fixtureId,
    formationGeometryRegistry,
  });
  if (presentation.lineup.status !== "confirmed" || presentation.lineup.players.length !== 11) {
    return { ok: false, reason: "canonical-lineup-renderer-rejected-xi" };
  }

  const renderedIds = presentation.lineup.players.map(({ card }) => String(card.id));
  if (new Set(renderedIds).size !== 11 || renderedIds.some((id) => !starterIds.has(id))) {
    return { ok: false, reason: "canonical-lineup-identity-mismatch" };
  }
  const officialShirts = new Map(detail.lineups
    .filter((member) => member.teamId === teamId && member.isStarter === true)
    .map((member) => [String(member.playerId), member.jerseyNumber] as const));
  if (presentation.lineup.players.some(({ card }) => officialShirts.get(String(card.id)) !== card.shirtNumber)) {
    return { ok: false, reason: "canonical-card-shirt-mismatch" };
  }

  const coachRankingRow = coachRanking.phase === "ranked"
    ? coachRanking.rows.find((candidate) => candidate.coachProviderId === coachIdentity.coach.providerId) ?? null
    : null;
  const baseCoachSlot = createTouchlineArenaCoachSlot(
    coachIdentity.coach,
    coachRankingRow?.rank ?? coachClassification.finalPosition ?? null,
    coachClassification.tierKey,
  );
  const coachSlot = coachRankingRow && coachRanking.scoringVersion
    ? {
      ...baseCoachSlot,
      touchlinePoints: coachRankingRow.touchlinePoints,
      status: "audited" as const,
      scoreEvidence: {
        provider: "sportmonks" as const,
        providerEventIds: [...coachRanking.fixtureIds],
        scoringVersion: coachRanking.scoringVersion,
      },
    }
    : baseCoachSlot;

  const startsAt = detail.fixture.startsAt ?? "";
  if (!Number.isFinite(Date.parse(startsAt))) return { ok: false, reason: "kickoff-unavailable" };
  const kickOffLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Malta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startsAt)).replace(",", " ·");
  const captionResult = buildTouchlineOfficialLineupCaption({
    fixtureId,
    teamId,
    teamName: club.name,
    opponentName: opponent.name,
    side: contract.value.side === "home" ? "HOME" : "AWAY",
    venueName: venue.name,
    formation: contract.value.formation,
    gameweekNumber,
    kickOffLabel,
    lineupConfirmed: true,
  });
  if (!captionResult.ok) return { ok: false, reason: `caption-${captionResult.reason.toLowerCase()}` };
  const sourceVersion = "touchline-official-lineup-feed-v1";
  const renderSource = {
    sourceProvenance: TOUCHLINE_OFFICIAL_LINEUP_PROVENANCE,
    fixtureId,
    lineupAvailableAt: contract.value.lineupAvailableAt,
    startsAt,
    status: detail.fixture.status ?? "",
    seasonId: String(scheduleFixture.seasonId),
    gameweekNumber,
    venueName: venue.name,
    caption: captionResult.caption,
    score,
    side: contract.value.side,
    formation: contract.value.formation,
    club,
    opponent,
    home,
    away,
    coach: { identity: coachIdentity, slot: coachSlot },
    players: presentation.lineup.players,
    bench: decoratedBenchCards,
  } satisfies Omit<TouchlineSocialLineupDraft,
    "capturedAt" | "sourceVersion" | "sourceChecksum" | "sourceRevisionManifest" | "sourceRevisionChecksum">;
  const sourceChecksum = checksumTouchlineSocialLineupRenderSource(renderSource);
  const canonicalPlayerIds = [...new Set([...presentation.lineup.players.map(({ card }) => card), ...decoratedBenchCards]
    .map((card) => String(card.canonicalPlayerId ?? "").toLowerCase()))].sort();
  if (canonicalPlayerIds.length !== 20 || canonicalPlayerIds.some((playerId) => !UUID.test(playerId))) {
    return { ok: false, reason: "canonical-player-revision-identity-unavailable" };
  }
  const sourceKeys = [
    `fixture-provider:${fixtureId}`,
    `fixture:${String(canonicalFixture.id).toLowerCase()}`,
    `competition:${String(canonicalFixture.competition_id).toLowerCase()}`,
    `season:${String(canonicalFixture.season_id).toLowerCase()}`,
    `round:${String(canonicalFixture.round_id).toLowerCase()}`,
    `club:${String(canonicalFixture.home_club_id).toLowerCase()}`,
    `club:${String(canonicalFixture.away_club_id).toLowerCase()}`,
    ...canonicalPlayerIds.map((playerId) => `player:${playerId}`),
    `formation:${contract.value.formation}`,
    "coach-ranking:touchline-england",
    "card-ranking:touchline-england",
  ];
  const sourceReadEnd = await readTouchlineSocialSourceRevisionCheckpoint(sourceKeys);
  if (!sourceReadEnd || sourceReadStart.clockRevision !== sourceReadEnd.clockRevision) {
    return { ok: false, reason: "source-revision-changed-during-read" };
  }

  return {
    ok: true,
    data: {
      ...renderSource,
      capturedAt: snapshot.capturedAt,
      sourceVersion,
      sourceChecksum,
      sourceRevisionManifest: sourceReadEnd.manifest,
      sourceRevisionChecksum: sourceReadEnd.checksum,
    },
  };
}
