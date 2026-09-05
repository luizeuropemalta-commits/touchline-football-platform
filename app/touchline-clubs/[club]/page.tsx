import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import Image from "next/image";
import ClubTrophyCarousel from "@/components/touchline/ClubTrophyCarousel";
import ClubHubMatchdayTechnicalArea from "@/components/touchline/ClubHubMatchdayTechnicalArea";
import ClubHubCanonicalCoachPanel from "@/components/touchline/ClubHubCanonicalCoachPanel";
import ClubHubOfficialLineup from "@/components/touchline/ClubHubOfficialLineup";
import ClubHubOutsideMatchRoster from "@/components/touchline/ClubHubOutsideMatchRoster";
import ClubHubCrestTrace from "@/components/touchline/ClubHubCrestTrace";
import TouchlineClubSocialFeed from "@/components/touchline/club-social/TouchlineClubSocialFeed";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import TouchlineOfficialLeagueTable from "@/components/touchline/TouchlineOfficialLeagueTable";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import TouchlineGameweekCard from "@/components/touchline/fantasy/TouchlineGameweekCard";
import ClubHubNextFixtureCard from "@/components/touchline/club-hub/ClubHubNextFixtureCard";
import ClubHubSectionNavigation from "@/components/touchline/club-hub/ClubHubSectionNavigation";
import officialLeagueStyles from "@/components/touchline/club-hub/ClubHubOfficialLeague.module.css";
import premiumStyles from "@/components/touchline/club-hub/ClubHubPremiumPrototype.module.css";
import type { TouchlineFantasyLineupMember, TouchlineFixture } from "@/lib/football-data/types";
import type { TouchlinePublicFixture, TouchlinePublicTeam } from "@/lib/football-data/public-fixture";
import {
  TOUCHLINE_ENGLAND_CLUBS,
  findTouchLineClub,
  rankClubOwnerCards,
  type ClubOwnerSquadCard,
} from "@/lib/touchlineArena/demo-data";
import { inferArenaRole, normalizeOfficialShirtNumber } from "@/lib/football-data/arena-lineup";
import {
  readPersistedSquadSnapshot,
  type PersistedSquadPlayer,
} from "@/lib/football-data/squad-snapshot-store";
import { readPublicFantasyFixtureSnapshots } from "@/lib/football-data/public-fantasy-snapshot";
import { readPublicFantasyFixtureMatchDetail } from "@/lib/football-data/public-fixture-match-detail-server";
import { toPublicFantasyFixtureFeed, type TouchlinePublicFixturePlayerStatistics } from "@/lib/football-data/public-fantasy-fixture";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { loadTouchlineOfficialLeagueTable } from "@/lib/football-data/official-league-table-server";
import { selectPublicClubFixture } from "@/lib/football-data/public-fixture-selection";
import { buildTouchLineClubMatchdayPresentation } from "@/lib/touchlineArena/club-lineup";
import { applyTouchlineMatchdayPoints, applyTouchlineSeasonPoints } from "@/lib/touchlineArena/matchday-player-points";
import { readPublicSeasonPlayerPoints } from "@/lib/touchlineArena/public-season-player-points-server";
import {
  resolveTouchlineClubMatchPreviewTeam,
  type TouchlineClubMatchPreviewTeam,
} from "@/lib/touchlineArena/club-match-preview";
import {
  normalizeTouchLineLocale,
  touchLineT,
  type TouchLineLocale,
} from "@/lib/touchlineArena/i18n";
import { touchlineCountryCode3FromName } from "@/lib/touchlineArena/country-flags";
import { getTouchlineClubTrophyAssets } from "@/lib/touchlineArena/club-trophy-manifest";
import {
  publicPremierSquadPlayerToCard,
  readPublicPremierSquad,
} from "@/lib/football-data/public-premier-squad-server";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "@/lib/touchlineArena/formation-geometry";
import { readTouchlineFormationGeometryRegistry } from "@/lib/touchlineArena/formation-geometry-server";
import { readTouchlineClubSocialFeed } from "@/lib/touchlineArena/club-social-feed-server";
import { TOUCHLINE_PRESEASON_RANKING_STATE } from "@/lib/touchlineArena/card-ranking-live";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";
import { normalizeTouchlineMatchCentreTimeZone } from "@/lib/touchlineArena/match-centre";
import { TOUCHLINE_STADIUM_CATALOG, toTouchlineLiveFixture } from "@/lib/touchlineArena/stadium-catalog";
import {
  resolveTouchlineClubHubDataSource,
  type TouchlineQaClubHubMirrorReadResult,
} from "@/lib/touchlineMirror/qa-clubhub-mirror";
import {
  loadTouchlineQaClubHubMirror,
  loadTouchlineQaMirroredLeagueTable,
  loadTouchlineQaMirroredSocialFeed,
  mirrorDtoToPublicFixture,
} from "@/lib/touchlineMirror/qa-clubhub-mirror-server";

export const dynamic = "force-dynamic";

type ClubHubPageProps = {
  params: Promise<{
    club: string;
  }>;
  searchParams: Promise<{
    lang?: string;
    feedCursor?: string;
  }>;
};

type ClubMatchPreview = {
  home: TouchlineClubMatchPreviewTeam;
  away: TouchlineClubMatchPreviewTeam;
  status: string;
  startsAt: string;
  source?: string;
};

type ClubMatchSnapshot = {
  preview: ClubMatchPreview;
  previewFixtureId: string | null;
  fixtureId: string | null;
  lineups: TouchlineFantasyLineupMember[];
  formation: string | null;
  /** No persisted matchday-coach DTO exists yet. Never infer a coach by club. */
  coach: null;
  publicFixture: TouchlinePublicFixture | null;
  railFixture: TouchlinePublicFixture | null;
  playerStatistics: TouchlinePublicFixturePlayerStatistics[];
};

function loadClubTrophyAssets(club: NonNullable<ReturnType<typeof findTouchLineClub>>) {
  return getTouchlineClubTrophyAssets({
    shortCode: club.shortCode,
    clubSlug: club.slug,
  });
}

export function generateStaticParams() {
  return TOUCHLINE_ENGLAND_CLUBS.map((club) => ({ club: club.slug }));
}

function persistedSquadPlayerToCard(player: PersistedSquadPlayer, clubName: string): ClubOwnerSquadCard {
  return {
    id: player.providerId,
    name: player.displayName || player.name,
    shortName: player.displayName || player.name,
    role: inferArenaRole(player.position || undefined),
    position: player.position || "MID",
    clubName,
    shirtNumber: normalizeOfficialShirtNumber(player.jerseyNumber),
    countryCode3: touchlineCountryCode3FromName(player.nationality) || "N/A",
    // A squad snapshot proves player membership, not the current public
    // market-value/classification projection. Never revive a legacy tier or
    // commercial value when the canonical projection endpoint is unavailable.
    marketValue: "",
    marketValueSource: "unavailable",
    marketValueState: "unavailable",
    classificationState: "unavailable",
    touchlinePoints: 0,
  };
}

async function loadPersistedClubSquadCards(
  club: NonNullable<ReturnType<typeof findTouchLineClub>>,
  locale: TouchLineLocale,
) {
  try {
    const snapshot = await readPersistedSquadSnapshot(club.teamId);
    if (!snapshot?.players.length) return null;

    const cards = snapshot.players.map((player) => persistedSquadPlayerToCard(player, club.name));
    return {
      cards,
      status: `${cards.length} TouchLine cards`,
      source: touchLineT(locale, "dataCache"),
      state: "ready" as const,
    };
  } catch {
    return null;
  }
}

async function loadClubSquadCards(club: NonNullable<ReturnType<typeof findTouchLineClub>>, locale: TouchLineLocale) {
  try {
    const result = await readPublicPremierSquad(club.teamId);
    if (result.status !== 200 || result.body.ok === false) throw new Error("Squad unavailable");
    const payload = result.body;

    return {
      cards: (payload.rosterPlayers ?? payload.players).map((player) => publicPremierSquadPlayerToCard(player, club.name)),
      status: payload.status ?? `${payload.players.length} TouchLine cards`,
      source: payload.cached ? touchLineT(locale, "dataCache") : touchLineT(locale, "liveData"),
      state: "ready" as const,
    };
  } catch {
    const persistedFallback = await loadPersistedClubSquadCards(club, locale);
    if (persistedFallback) return persistedFallback;

    return {
      cards: [] as ClubOwnerSquadCard[],
      status: locale === "pt-BR" ? "Elenco temporariamente indisponível" : "Squad temporarily unavailable",
      source: locale === "pt-BR" ? "Fonte indisponível" : "Source unavailable",
      state: "unavailable" as const,
    };
  }
}

function previewTeamFromClub(club: NonNullable<ReturnType<typeof findTouchLineClub>>) {
  return {
    accent: club.accent,
    name: club.name,
    shortCode: club.shortCode,
    logoUrl: club.logoUrl,
  };
}

function previewTeamFromPublicTeam(
  team: TouchlinePublicTeam | undefined,
  currentClub: NonNullable<ReturnType<typeof findTouchLineClub>>,
  locale: TouchLineLocale,
): TouchlineClubMatchPreviewTeam {
  const canonical = findTouchLineClub(team?.providerId)
    ?? findTouchLineClub(team?.name)
    ?? findTouchLineClub(team?.shortCode);
  if (canonical) {
    return {
      accent: canonical.accent,
      name: team?.name ?? canonical.name,
      shortCode: team?.shortCode ?? canonical.shortCode,
      logoUrl: canonical.logoUrl,
    };
  }
  const pending = touchLineT(locale, "opponentToBeConfirmed");
  if (team?.providerId === currentClub.teamId) return previewTeamFromClub(currentClub);
  return {
    name: team?.name ?? pending,
    shortCode: team?.shortCode ?? pending,
    logoUrl: team?.logoUrl,
  };
}

function fixtureHasClub(fixture: TouchlineFixture, club: NonNullable<ReturnType<typeof findTouchLineClub>>) {
  return [fixture.homeTeam?.providerId, fixture.awayTeam?.providerId, fixture.homeTeam?.name, fixture.awayTeam?.name, fixture.homeTeam?.shortCode, fixture.awayTeam?.shortCode]
    .filter(Boolean)
    .some((value) => {
      const matched = findTouchLineClub(String(value));
      return matched?.teamId === club.teamId;
    });
}

function fallbackClubMatch(club: NonNullable<ReturnType<typeof findTouchLineClub>>, locale: TouchLineLocale): ClubMatchPreview {
  return {
    home: previewTeamFromClub(club),
    away: {
      name: touchLineT(locale, "opponentToBeConfirmed"),
      shortCode: touchLineT(locale, "opponentToBeConfirmed"),
      logoUrl: undefined,
    },
    status: touchLineT(locale, "opponentToBeConfirmed"),
    startsAt: touchLineT(locale, "kickoffPending"),
  };
}

function feedTeamBelongsToClub(teamId: string | undefined, teamName: string | undefined, club: NonNullable<ReturnType<typeof findTouchLineClub>>) {
  if (teamId && String(teamId) === club.teamId) return true;
  return findTouchLineClub(teamName)?.teamId === club.teamId;
}

function localizedFixtureStatus(value: string, locale: TouchLineLocale) {
  if (locale !== "pt-BR") return value;
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (["not started", "scheduled", "upcoming", "ns"].includes(normalized)) return "Agendada";
  if (["live", "inplay", "in play"].includes(normalized)) return "Ao vivo";
  if (["finished", "ft", "full time"].includes(normalized)) return "Encerrada";
  if (normalized === "postponed") return "Adiada";
  if (["cancelled", "canceled"].includes(normalized)) return "Cancelada";
  return value;
}

/**
 * The match preview may point at the next scheduled fixture, but card scoring
 * must keep the current live fixture (or the most recent settled one) so a
 * final match's verified facts do not disappear before the next kickoff.
 */
function selectPublicClubScoringFixture(
  fixtures: TouchlineFixture[],
  belongsToClub: (fixture: TouchlineFixture) => boolean,
) {
  const statusRank = (fixture: TouchlineFixture) => {
    const status = fixture.status?.trim() ?? "";
    if (/(?:live|in[ -]?play|1st|2nd|half[ -]?time|extra time|penalties)/i.test(status)) return 0;
    if (/(?:^ft(?:_|$)|full[ -]?time|finished|after extra time|aet|after penalties)/i.test(status)) return 1;
    return 2;
  };
  return fixtures
    .filter(belongsToClub)
    .map((fixture) => ({ fixture, rank: statusRank(fixture), startsAt: Date.parse(fixture.startsAt ?? "") || 0 }))
    .filter((entry) => entry.rank < 2)
    .sort((left, right) => left.rank - right.rank || right.startsAt - left.startsAt)[0]?.fixture;
}

async function loadClubMatchSnapshot(
  club: NonNullable<ReturnType<typeof findTouchLineClub>>,
  locale: TouchLineLocale,
  dataSource: ReturnType<typeof resolveTouchlineClubHubDataSource>,
  mirrorResultPromise: Promise<TouchlineQaClubHubMirrorReadResult> | null,
): Promise<ClubMatchSnapshot> {
  const empty = {
    preview: fallbackClubMatch(club, locale),
    previewFixtureId: null as string | null,
    fixtureId: null as string | null,
    lineups: [] as TouchlineFantasyLineupMember[],
    formation: null as string | null,
    coach: null,
    publicFixture: null,
    railFixture: null,
    playerStatistics: [],
  };

  if (dataSource !== "direct") {
    const mirrorResult = mirrorResultPromise ? await mirrorResultPromise : null;
    if (mirrorResult?.state !== "ready") return empty;
    const fixture = mirrorDtoToPublicFixture(mirrorResult.data);
    const startsAt = fixture?.startsAt;
    if (!fixture || !startsAt) return empty;
    return {
      preview: {
        home: previewTeamFromPublicTeam(fixture.homeTeam, club, locale),
        away: previewTeamFromPublicTeam(fixture.awayTeam, club, locale),
        status: fixture.status ?? "TouchLine England",
        startsAt: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(startsAt)),
        source: touchLineT(locale, "dataCache"),
      },
      previewFixtureId: null,
      fixtureId: null,
      lineups: [],
      formation: null,
      coach: null,
      publicFixture: fixture,
      railFixture: fixture,
      playerStatistics: [],
    };
  }

  try {
    const [persistedFeeds, scheduledFixtures] = await Promise.all([
      readPublicFantasyFixtureSnapshots(),
      readPublicCompetitionFixtures(),
    ]);
    const persistedFixtures = persistedFeeds.map((feed) => feed.fixture);
    const fixture = selectPublicClubFixture(
      [...persistedFixtures, ...scheduledFixtures],
      (candidate) => fixtureHasClub(candidate, club),
    );
    const scoringFixture = selectPublicClubScoringFixture(persistedFixtures, (candidate) => fixtureHasClub(candidate, club));
    const previewFixture = fixture ?? scoringFixture;
    if (!previewFixture) return empty;
    // The upcoming fixture owns its official matchday sheet. Scoring can
    // intentionally retain a different live/finished fixture so final points
    // do not disappear before the next kickoff.
    const matchdayFeed = persistedFeeds.find((feed) => feed.fixture.providerId === fixture?.providerId);
    const scoringFeed = persistedFeeds.find((feed) => feed.fixture.providerId === scoringFixture?.providerId);
    const publicFeed = scoringFeed ? toPublicFantasyFixtureFeed(scoringFeed) : null;
    const matchDetail = publicFeed && scoringFixture?.providerId
      ? await readPublicFantasyFixtureMatchDetail(scoringFixture.providerId, publicFeed)
      : null;
    const formation = matchdayFeed?.formations.find((item) => feedTeamBelongsToClub(item.teamId, item.teamName, club))?.formation ?? null;
    return {
      preview: {
        home: resolveTouchlineClubMatchPreviewTeam(previewFixture.homeTeam, club, locale),
        away: resolveTouchlineClubMatchPreviewTeam(previewFixture.awayTeam, club, locale),
        status: previewFixture.status ?? "TouchLine England",
        startsAt: previewFixture.startsAt
          ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(previewFixture.startsAt))
          : touchLineT(locale, "kickoffPending"),
        source: touchLineT(locale, "dataCache"),
      },
      previewFixtureId: previewFixture.providerId,
      fixtureId: matchdayFeed?.fixture.providerId ?? null,
      lineups: matchdayFeed?.lineups ?? [],
      formation,
      coach: null,
      publicFixture: toTouchlineLiveFixture(previewFixture),
      // The rail is a match-state surface: retain a live or final fixture in
      // preference to the next scheduled fixture so it can say LIVE and FULL
      // TIME at the correct moment.
      railFixture: toTouchlineLiveFixture(scoringFixture ?? fixture ?? previewFixture),
      playerStatistics: matchDetail?.playerStatistics ?? [],
    };
  } catch {
    return empty;
  }
}

type ClubHubCardLabels = Readonly<{
  nationality: string;
  points: string;
  totalPoints: string;
  cardPrice: string;
  currentClub: string;
}>;

type ClubHubPresentation = Awaited<ReturnType<typeof loadClubHubPresentation>>;
type ClubHubViewerAccess = Awaited<ReturnType<typeof loadClubHubViewerAccess>>;
const CLUB_HUB_VIEWER_ACCESS_TIMEOUT_MS = 1_800;
const CLUB_HUB_PUBLIC_VIEWER_ACCESS = { userId: null, canEditCardEngine: false } as const;

async function traceClubHubLoader<T>(
  clubSlug: string,
  loader: string,
  operation: () => Promise<T>,
) {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
      console.info(JSON.stringify({
        event: "touchline.clubhub.loader",
        club: clubSlug,
        loader,
        durationMs: Math.round(performance.now() - startedAt),
      }));
    }
  }
}

async function loadClubHubViewerAccess(
  clubSlug: string,
  dataSource: ReturnType<typeof resolveTouchlineClubHubDataSource>,
) {
  if (dataSource !== "direct") return CLUB_HUB_PUBLIC_VIEWER_ACCESS;
  const viewerAccess = traceClubHubLoader(clubSlug, "viewer-access", async () => {
    const supabase = await createClient();
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    return {
      userId: user?.id ?? null,
      canEditCardEngine: Boolean(user && isOwnerEmail(user.email)),
    };
  });
  // Authentication is optional on this public profile. Never allow an Auth
  // outage or a stale refresh token to hold the official ClubHub data hostage.
  return Promise.race([
    viewerAccess.catch(() => CLUB_HUB_PUBLIC_VIEWER_ACCESS),
    new Promise<typeof CLUB_HUB_PUBLIC_VIEWER_ACCESS>((resolve) => {
      setTimeout(() => resolve(CLUB_HUB_PUBLIC_VIEWER_ACCESS), CLUB_HUB_VIEWER_ACCESS_TIMEOUT_MS);
    }),
  ]);
}

async function loadClubHubPresentation(
  club: NonNullable<ReturnType<typeof findTouchLineClub>>,
  locale: TouchLineLocale,
  dataSource: ReturnType<typeof resolveTouchlineClubHubDataSource>,
  mirrorResultPromise: Promise<TouchlineQaClubHubMirrorReadResult> | null,
) {
  if (dataSource !== "direct") {
    const matchSnapshot = await traceClubHubLoader(
      club.slug,
      "match-snapshot",
      () => loadClubMatchSnapshot(club, locale, dataSource, mirrorResultPromise),
    );
    const squadLoad = {
      cards: [] as ClubOwnerSquadCard[],
      status: locale === "pt-BR" ? "Elenco temporariamente indisponível" : "Squad temporarily unavailable",
      source: locale === "pt-BR" ? "Fonte indisponível" : "Source unavailable",
      state: "unavailable" as const,
    };
    const matchdayPresentation = buildTouchLineClubMatchdayPresentation({
      club,
      squadCards: [],
      officialLineup: [],
      formation: null,
      fixtureId: null,
      officialCoach: null,
      formationGeometryRegistry: TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY,
    });
    return {
      squadLoad,
      matchSnapshot,
      matchdayPresentation,
      outsideMatchdayCards: [] as ClubOwnerSquadCard[],
      clubCards: [] as ClubOwnerSquadCard[],
    };
  }

  const squadLoadPromise = traceClubHubLoader(club.slug, "squad", () => loadClubSquadCards(club, locale));
  const matchSnapshotPromise = traceClubHubLoader(
    club.slug,
    "match-snapshot",
    () => loadClubMatchSnapshot(club, locale, dataSource, mirrorResultPromise),
  );
  const formationGeometryPromise = traceClubHubLoader(club.slug, "formation-geometry", () => readTouchlineFormationGeometryRegistry());
  const seasonPointsPromise = squadLoadPromise.then((squadLoad) => traceClubHubLoader(
    club.slug,
    "season-points",
    () => readPublicSeasonPlayerPoints(
      squadLoad.cards.flatMap((card) => card.canonicalPlayerId ? [card.canonicalPlayerId] : []),
    ),
  ));

  const [squadLoad, matchSnapshot, formationGeometryRegistry, seasonPoints] = await Promise.all([
    squadLoadPromise,
    matchSnapshotPromise,
    formationGeometryPromise,
    seasonPointsPromise,
  ]);
  const clubCards = applyTouchlineMatchdayPoints(
    applyTouchlineSeasonPoints(squadLoad.cards, seasonPoints),
    matchSnapshot.playerStatistics,
  ).sort(rankClubOwnerCards);
  const matchdayPresentation = buildTouchLineClubMatchdayPresentation({
    club,
    squadCards: clubCards,
    officialLineup: matchSnapshot.lineups,
    formation: matchSnapshot.formation,
    fixtureId: matchSnapshot.fixtureId,
    officialCoach: matchSnapshot.coach,
    formationGeometryRegistry,
  });
  const displayedMatchdayPlayerIds = new Set(matchdayPresentation.displayedPlayerIds.map(String));
  const outsideMatchdayCards = clubCards.filter((card) => !displayedMatchdayPlayerIds.has(String(card.id)));

  return {
    squadLoad,
    matchSnapshot,
    matchdayPresentation,
    outsideMatchdayCards,
    clubCards,
  };
}

async function loadClubHubLeagueTable(
  club: NonNullable<ReturnType<typeof findTouchLineClub>>,
  dataSource: ReturnType<typeof resolveTouchlineClubHubDataSource>,
  mirrorResultPromise: Promise<TouchlineQaClubHubMirrorReadResult> | null,
) {
  if (dataSource === "qa-mirror") {
    return loadTouchlineQaMirroredLeagueTable(club.teamId, mirrorResultPromise ?? undefined);
  }
  if (dataSource === "invalid") {
    // A requested but malformed mirror must fail closed instead of reading a
    // local database, SportMonks or demonstration standings.
    return loadTouchlineQaMirroredLeagueTable(club.teamId, mirrorResultPromise ?? undefined);
  }
  return loadTouchlineOfficialLeagueTable();
}

function ClubHubDeferredSection({ label, size }: { label: string; size: "lineup" | "panel" | "table" | "cards" }) {
  return (
    <section className={`club-hub-deferred club-hub-deferred-${size}`} aria-busy="true" aria-label={label}>
      <span>{label}</span>
      <i aria-hidden="true" />
    </section>
  );
}

function ClubHubChapterMarker({ index, label, note }: { index: string; label: string; note: string }) {
  return (
    <div className="club-hub-chapter-marker" aria-hidden="true">
      <span>{index}</span>
      <i />
      <strong>{label}</strong>
      <small>{note}</small>
    </div>
  );
}

async function ClubHubLineupSection({
  club,
  locale,
  cardLabels,
  presentationPromise,
  viewerAccessPromise,
  dataSource,
}: {
  club: NonNullable<ReturnType<typeof findTouchLineClub>>;
  locale: TouchLineLocale;
  cardLabels: ClubHubCardLabels;
  presentationPromise: Promise<ClubHubPresentation>;
  viewerAccessPromise: Promise<ClubHubViewerAccess>;
  dataSource: ReturnType<typeof resolveTouchlineClubHubDataSource>;
}) {
  const [presentation, viewerAccess, activeRanking] = await Promise.all([
    presentationPromise,
    viewerAccessPromise,
    dataSource === "direct" ? loadTouchLineActiveRanking() : Promise.resolve(TOUCHLINE_PRESEASON_RANKING_STATE),
  ]);
  const { matchSnapshot, matchdayPresentation } = presentation;
  const matchPreview = matchSnapshot.preview;
  const portuguese = locale === "pt-BR";
  const overallRanking = activeRanking.phase === "ranked"
    ? [...activeRanking.players]
      .filter((player) => player.totalRating !== null)
      .sort((left, right) => (
        (right.totalRating ?? Number.NEGATIVE_INFINITY) - (left.totalRating ?? Number.NEGATIVE_INFINITY)
        || normalizedPlayerIdentity(left.playerId).localeCompare(normalizedPlayerIdentity(right.playerId))
      ))
    : [];
  const rankedClubCards = presentation.clubCards.flatMap((card) => {
    const cardIdentities = new Set([
      normalizedPlayerIdentity(card.canonicalPlayerId),
      normalizedPlayerIdentity(card.id),
    ].filter(Boolean));
    const ranking = overallRanking.find((candidate) => (
      cardIdentities.has(normalizedPlayerIdentity(candidate.playerId))
      || cardIdentities.has(normalizedPlayerIdentity(candidate.providerPlayerId))
    ));
    if (!ranking || ranking.totalRating === null) return [];
    return [{
      card,
      totalRating: ranking.totalRating,
      overallRank: overallRanking.indexOf(ranking) + 1,
      positionRank: ranking.positionRank,
      positionGroup: ranking.positionGroup,
    }];
  }).sort((left, right) => left.overallRank - right.overallRank);
  const clubPositionLeaders = CLUB_POSITION_LEADER_GROUPS.map((group) => ({
    ...group,
    leader: rankedClubCards.find((candidate) => (group.positionGroups as readonly string[]).includes(candidate.positionGroup)),
  }));
  return (
    <ClubHubOfficialLineup
      clubName={club.name}
      lineup={matchdayPresentation.lineup}
      locale={locale}
      labels={cardLabels}
      canEditCardEngine={viewerAccess.canEditCardEngine}
      leaderCards={(
        <>
          {clubPositionLeaders.map(({ key, en, pt, leader }) => (
            <article className={premiumStyles.lineupLeaderCard} data-clubhub-card-spotlight={`position-${key}`} key={key}>
              <TouchlineClubPerimeterTrace accent="#a3ff12" className={premiumStyles.lineupLeaderTrace} />
              <header>
                <span>{portuguese ? pt : en}</span>
                <strong>{leader?.card.name ?? (portuguese ? "Aguardando ranking verificado" : "Awaiting verified ranking")}</strong>
              </header>
              {leader ? (
                <div className={premiumStyles.lineupLeaderVisual}>
                  <TouchlineGameweekCard card={leader.card} locale={locale} displayWidth={128} />
                </div>
              ) : (
                <div className={premiumStyles.lineupLeaderAwaiting} role="status">—</div>
              )}
              <small>{leader ? `${leader.totalRating.toFixed(2)} · #${leader.positionRank}` : (portuguese ? "Ranking em verificação" : "Ranking under verification")}</small>
            </article>
          ))}
        </>
      )}
      matchup={{
        fixtureId: matchSnapshot.previewFixtureId,
        initialFixture: matchSnapshot.publicFixture,
        home: matchPreview.home,
        away: matchPreview.away,
        status: localizedFixtureStatus(matchPreview.status, locale),
        startsAt: matchPreview.startsAt,
        startsAtIso: matchSnapshot.publicFixture?.startsAt ?? null,
      }}
    />
  );
}

async function ClubHubTechnicalSections({
  club,
  locale,
  cardLabels,
  presentationPromise,
  viewerAccessPromise,
  dataSource,
}: {
  club: NonNullable<ReturnType<typeof findTouchLineClub>>;
  locale: TouchLineLocale;
  cardLabels: ClubHubCardLabels;
  presentationPromise: Promise<ClubHubPresentation>;
  viewerAccessPromise: Promise<ClubHubViewerAccess>;
  dataSource: ReturnType<typeof resolveTouchlineClubHubDataSource>;
}) {
  const [presentation, viewerAccess] = await Promise.all([presentationPromise, viewerAccessPromise]);
  const outsideMatchdayCards = presentation.outsideMatchdayCards;
  return (
    <>
      <ClubHubMatchdayTechnicalArea
        clubName={club.name}
        technical={presentation.matchdayPresentation.technical}
        locale={locale}
        labels={cardLabels}
        canEditCardEngine={viewerAccess.canEditCardEngine}
        coachCard={dataSource === "direct" ? (
          <ClubHubCanonicalCoachPanel
            teamId={club.teamId}
            clubName={club.name}
            clubLogoUrl={club.logoUrl}
            clubAccent={club.accent}
            locale={locale}
            userId={viewerAccess.userId}
            presentation="technical"
          />
        ) : null}
      />
      <ClubHubOutsideMatchRoster
        clubName={club.name}
        cards={outsideMatchdayCards}
        locale={locale}
        labels={cardLabels}
        squadUnavailable={presentation.squadLoad.state === "unavailable"}
        retryHref={`/touchline-clubs/${club.slug}?lang=${encodeURIComponent(locale)}`}
      />
    </>
  );
}

async function ClubHubOfficialLeagueSection({
  club,
  locale,
  cursor,
  presentationPromise,
  tablePromise,
  dataSource,
  mirrorResultPromise,
}: {
  club: NonNullable<ReturnType<typeof findTouchLineClub>>;
  locale: TouchLineLocale;
  cursor: string | null;
  presentationPromise: Promise<ClubHubPresentation>;
  tablePromise: ReturnType<typeof loadClubHubLeagueTable>;
  dataSource: ReturnType<typeof resolveTouchlineClubHubDataSource>;
  mirrorResultPromise: Promise<TouchlineQaClubHubMirrorReadResult> | null;
}) {
  const feedPromise = dataSource === "direct"
    ? readTouchlineClubSocialFeed({
      providerTeamId: club.teamId,
      limit: 6,
      cursor,
    })
    : loadTouchlineQaMirroredSocialFeed(club.teamId, mirrorResultPromise ?? undefined);
  const [presentation, table, feedPage] = await Promise.all([
    presentationPromise,
    tablePromise,
    feedPromise,
  ]);
  const fixture = presentation.matchSnapshot.railFixture;
  const homeClub = findTouchLineClub(fixture?.homeTeam?.providerId)
    ?? findTouchLineClub(fixture?.homeTeam?.name);
  const awayClub = findTouchLineClub(fixture?.awayTeam?.providerId)
    ?? findTouchLineClub(fixture?.awayTeam?.name);
  const homePosition = homeClub
    ? table.rows.find((row) => row.team.providerTeamId === homeClub.teamId)?.displayPosition ?? null
    : null;
  const awayPosition = awayClub
    ? table.rows.find((row) => row.team.providerTeamId === awayClub.teamId)?.displayPosition ?? null
    : null;
  const portuguese = locale === "pt-BR";
  const hasVerifiedFixture = Boolean(
    fixture?.startsAt
    && homeClub?.logoUrl
    && awayClub?.logoUrl,
  );

  return (
    <section
      className={officialLeagueStyles.layout}
      aria-label={portuguese ? "Liga oficial e canal do clube" : "Official league and club channel"}
      data-clubhub-official-league="true"
    >
      <div className={officialLeagueStyles.feed} id="club-feed">
        <TouchlineClubPerimeterTrace accent="#a3ff12" className={officialLeagueStyles.surfaceTrace} />
        <TouchlineClubSocialFeed
          clubName={club.name}
          clubSlug={club.slug}
          locale={locale}
          page={feedPage}
        />
      </div>

      <aside className={officialLeagueStyles.rail} aria-label={portuguese ? "Próximo jogo e tabela oficial" : "Next match and official table"}>
        <TouchlineClubPerimeterTrace accent="#a3ff12" className={officialLeagueStyles.surfaceTrace} />
        {hasVerifiedFixture && fixture?.startsAt && homeClub?.logoUrl && awayClub?.logoUrl ? (
          <ClubHubNextFixtureCard
            awayTeam={{ teamId: awayClub.teamId, name: fixture.awayTeam?.name ?? awayClub.name, shortCode: awayClub.shortCode, logoUrl: awayClub.logoUrl }}
            awayPosition={awayPosition}
            className={officialLeagueStyles.fixture}
            homeTeam={{ teamId: homeClub.teamId, name: fixture.homeTeam?.name ?? homeClub.name, shortCode: homeClub.shortCode, logoUrl: homeClub.logoUrl }}
            homePosition={homePosition}
            initialTimeZone={normalizeTouchlineMatchCentreTimeZone("Europe/Malta")}
            locale={locale}
            previewHref={null}
            roundName={fixture.roundName ?? (portuguese ? "Rodada pendente" : "Round pending")}
            startsAt={fixture.startsAt}
            status={fixture.status}
            homeScore={fixture.homeScore}
            awayScore={fixture.awayScore}
            liveMinute={fixture.liveMinute}
            venueName={fixture.venue?.name ?? (TOUCHLINE_STADIUM_CATALOG.find((stadium) => stadium.homeTeamProviderId === fixture.homeTeam?.providerId)?.name ?? null)}
            venueImageUrl={fixture.venue?.interiorImageUrl ?? fixture.venue?.imageUrl ?? TOUCHLINE_STADIUM_CATALOG.find((stadium) => stadium.homeTeamProviderId === fixture.homeTeam?.providerId)?.interiorImageUrl ?? null}
          />
        ) : (
          <article className={`${premiumStyles.nextFixtureCard} ${officialLeagueStyles.fixture}`} data-state="awaiting" role="status">
            <div className={premiumStyles.nextFixtureHeading}>
              <span>{portuguese ? "Próximo confronto" : "Next fixture"}</span>
            </div>
            <div className={premiumStyles.awaitingFixture}>
              <div className={premiumStyles.awaitingFixtureTeams} aria-hidden="true">
                {club.logoUrl ? <Image alt="" height={58} src={club.logoUrl} width={58} /> : <span>{club.shortCode}</span>}
                <b>VS</b>
                <span>?</span>
              </div>
              <strong>{portuguese ? "Próxima partida em verificação" : "Next match under verification"}</strong>
              <p>{portuguese ? "O confronto aparecerá quando a fonte oficial estiver confirmada." : "The match-up will appear when the official source is confirmed."}</p>
            </div>
          </article>
        )}

        <TouchlineOfficialLeagueTable
          className={officialLeagueStyles.table}
          currentTeamId={club.teamId}
          id="club-table"
          locale={locale}
          table={table}
          variant="clubHubRail"
        />
      </aside>
    </section>
  );
}

async function ClubHubHeroNextMatch({
  locale,
  presentationPromise,
}: {
  locale: TouchLineLocale;
  presentationPromise: Promise<ClubHubPresentation>;
}) {
  const presentation = await presentationPromise;
  // The profile hero deliberately represents the next scheduled fixture. The
  // match-state rail below can retain a live or final fixture when appropriate.
  const fixture = presentation.matchSnapshot.publicFixture;
  const homeClub = findTouchLineClub(fixture?.homeTeam?.providerId)
    ?? findTouchLineClub(fixture?.homeTeam?.name);
  const awayClub = findTouchLineClub(fixture?.awayTeam?.providerId)
    ?? findTouchLineClub(fixture?.awayTeam?.name);
  const portuguese = locale === "pt-BR";

  if (!fixture?.startsAt || !homeClub?.logoUrl || !awayClub?.logoUrl) {
    return (
      <aside className="club-hub-hero-next-match club-hub-hero-next-match-awaiting" role="status">
        <span>{portuguese ? "Próximo jogo" : "Next match"}</span>
        <strong>{portuguese ? "Confronto em verificação" : "Fixture under verification"}</strong>
      </aside>
    );
  }

  return (
    <ClubHubNextFixtureCard
      awayTeam={{ teamId: awayClub.teamId, name: fixture.awayTeam?.name ?? awayClub.name, shortCode: awayClub.shortCode, logoUrl: awayClub.logoUrl }}
      awayPosition={null}
      className="club-hub-hero-next-match"
      homeTeam={{ teamId: homeClub.teamId, name: fixture.homeTeam?.name ?? homeClub.name, shortCode: homeClub.shortCode, logoUrl: homeClub.logoUrl }}
      homePosition={null}
      initialTimeZone={normalizeTouchlineMatchCentreTimeZone("Europe/Malta")}
      locale={locale}
      previewHref={null}
      roundName={fixture.roundName ?? (portuguese ? "Rodada" : "Matchday")}
      showPositions={false}
      startsAt={fixture.startsAt}
      status={fixture.status}
      homeScore={fixture.homeScore}
      awayScore={fixture.awayScore}
      liveMinute={fixture.liveMinute}
      variant="hero"
      venueName={fixture.venue?.name ?? (TOUCHLINE_STADIUM_CATALOG.find((stadium) => stadium.homeTeamProviderId === fixture.homeTeam?.providerId)?.name ?? null)}
      venueImageUrl={fixture.venue?.interiorImageUrl ?? fixture.venue?.imageUrl ?? TOUCHLINE_STADIUM_CATALOG.find((stadium) => stadium.homeTeamProviderId === fixture.homeTeam?.providerId)?.interiorImageUrl ?? null}
    />
  );
}

function normalizedPlayerIdentity(value: string | number | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

const CLUB_POSITION_LEADER_GROUPS = [
  { key: "centre-back", positionGroups: ["centre-back"], en: "Top centre-back", pt: "Melhor zagueiro" },
  { key: "full-back", positionGroups: ["full-back"], en: "Top full-back", pt: "Melhor lateral" },
  { key: "midfielder", positionGroups: ["midfielder"], en: "Top midfielder", pt: "Melhor meio-campista" },
  { key: "attacker", positionGroups: ["winger", "striker"], en: "Top attacker", pt: "Melhor atacante" },
] as const;

export default async function ClubHubPage({ params, searchParams }: ClubHubPageProps) {
  const [{ club: clubParam }, { lang, feedCursor }] = await Promise.all([params, searchParams]);
  const locale = normalizeTouchLineLocale(lang);
  const copyrightYear = new Date().getUTCFullYear();
  const t = (key: Parameters<typeof touchLineT>[1]) => touchLineT(locale, key);
  const cardLabels = {
    nationality: t("nationalityShort"),
    points: t("points"),
    totalPoints: t("touchlinePoints"),
    cardPrice: locale === "pt-BR" ? "Preço do card" : "Card price",
    currentClub: locale === "pt-BR" ? "Clube atual" : "Current Club",
  };
  const club = findTouchLineClub(clubParam);
  if (!club) notFound();

  const clubHonours = loadClubTrophyAssets(club);
  const dataSource = resolveTouchlineClubHubDataSource();
  const mirrorResultPromise = dataSource === "direct" ? null : loadTouchlineQaClubHubMirror(club.teamId);
  const homeStadium = TOUCHLINE_STADIUM_CATALOG.find((stadium) => stadium.homeTeamProviderId === club.teamId) ?? null;
  const presentationPromise = loadClubHubPresentation(club, locale, dataSource, mirrorResultPromise);
  const viewerAccessPromise = loadClubHubViewerAccess(club.slug, dataSource);
  const tablePromise = traceClubHubLoader(
    club.slug,
    "league-table",
    () => loadClubHubLeagueTable(club, dataSource, mirrorResultPromise),
  );
  return (
    <main className="club-hub" style={{ "--club-accent": club.accent, "--club-secondary": club.secondaryAccent, "--clubhub-accent": club.accent } as CSSProperties}>
      <span id="club-hub-top" className="club-hub-top-anchor" aria-hidden="true" />
      <TouchlineGlobalNavigation
        locale={locale}
        currentRoute="clubProfile"
        surface="public"
        trustedContext={{
          club: {
            teamId: club.teamId,
            slug: club.slug,
            name: club.name,
          },
        }}
      />
      <section className="club-hub-shell">
        <header className="club-hub-hero">
          <svg className="club-hub-neon-frame" aria-hidden="true" focusable="false">
            <rect className="club-hub-neon-trace" x="0" y="0" width="100%" height="100%" rx="23" pathLength="100" />
          </svg>
          {homeStadium?.interiorImageUrl ? (
            <Image
              alt=""
              className="club-hub-hero-image"
              fill
              priority
              sizes="(max-width: 720px) 100vw, 1540px"
              src={homeStadium.interiorImageUrl}
            />
          ) : null}
          <div className="club-hub-hero-shade" aria-hidden="true" />
          <Suspense fallback={<div className="club-hub-hero-next-match club-hub-hero-next-match-awaiting" aria-hidden="true" />}>
            <ClubHubHeroNextMatch locale={locale} presentationPromise={presentationPromise} />
          </Suspense>
          <div className="club-hub-identity">
            <div className="club-hub-logo-stack">
              {club.logoUrl ? (
                <ClubHubCrestTrace
                  accent={club.accent}
                  ariaLabel={`${club.name} logo`}
                  className="club-hub-logo"
                  loading="eager"
                  src={club.logoUrl}
                />
              ) : <div className="club-hub-logo"><span>{club.shortCode}</span></div>}
            </div>
            <div className="club-hub-title-block">
              <span>{locale === "pt-BR" ? "Perfil oficial do clube" : "Official club profile"}</span>
              <h1>{club.name}</h1>
            </div>
          </div>
          <div className="club-hub-hero-footer">
            {clubHonours.length ? (
              <div className="club-hub-honours" aria-label={`${club.name} trophy cabinet`}>
                <span>{t("clubHonours")}</span>
                <ClubTrophyCarousel
                  ariaLabel={`${club.name} trophy carousel`}
                  honours={clubHonours}
                  previousLabel={t("previousTrophy")}
                  nextLabel={t("nextTrophy")}
                />
              </div>
            ) : (
              <div className="club-hub-honours" aria-label={`${club.name} trophy cabinet`}>
                <span>{t("clubHonours")}</span>
                <p className="club-hub-honours-empty" role="status">{t("clubHonoursUnavailable")}</p>
              </div>
            )}
          </div>
        </header>
        <ClubHubSectionNavigation locale={locale} />

        <div className="club-hub-chapter club-hub-official-league-chapter">
          <Suspense fallback={<ClubHubDeferredSection size="table" label={locale === "pt-BR" ? "Atualizando liga oficial" : "Updating official league"} />}>
            <ClubHubOfficialLeagueSection
              club={club}
              locale={locale}
              cursor={feedCursor ?? null}
              presentationPromise={presentationPromise}
              tablePromise={tablePromise}
              dataSource={dataSource}
              mirrorResultPromise={mirrorResultPromise}
            />
          </Suspense>
        </div>

        <div className="club-hub-chapter club-hub-matchday-chapter">
          <ClubHubChapterMarker
            index="01"
            label={locale === "pt-BR" ? "Dia de jogo" : "Matchday"}
            note={locale === "pt-BR" ? "Escalação, treinador e banco" : "Line-up, coach and bench"}
          />
          <Suspense fallback={<ClubHubDeferredSection size="lineup" label={locale === "pt-BR" ? "Preparando escalação oficial" : "Preparing official line-up"} />}>
            <ClubHubLineupSection
              club={club}
              locale={locale}
              cardLabels={cardLabels}
              presentationPromise={presentationPromise}
              viewerAccessPromise={viewerAccessPromise}
              dataSource={dataSource}
            />
          </Suspense>

          <div className="club-hub-matchday-support">
            <Suspense fallback={<ClubHubDeferredSection size="panel" label={locale === "pt-BR" ? "Preparando área técnica" : "Preparing technical area"} />}>
              <ClubHubTechnicalSections
                club={club}
                locale={locale}
                cardLabels={cardLabels}
                presentationPromise={presentationPromise}
                viewerAccessPromise={viewerAccessPromise}
                dataSource={dataSource}
              />
            </Suspense>
          </div>
        </div>

        <footer className="club-hub-footer">
          <span>© {copyrightYear} TouchLine</span>
          <span>{locale === "pt-BR" ? "Todos os direitos reservados." : "All rights reserved."}</span>
        </footer>

      </section>

      <style>{`
        .club-hub {
          min-height: 100dvh;
          color: #f8fff5;
          background:
            radial-gradient(circle at 16% 18%, color-mix(in srgb, var(--club-accent) 28%, transparent), transparent 26%),
            radial-gradient(circle at 84% 14%, color-mix(in srgb, var(--club-secondary) 18%, transparent), transparent 22%),
            linear-gradient(135deg, #020707 0%, #06110d 44%, #030503 100%);
          padding: 42px 5vw 64px;
        }
        .club-hub-deferred {
          position: relative;
          display: grid;
          align-content: start;
          gap: 14px;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--club-accent) 34%, rgba(255,255,255,.14));
          border-radius: 30px;
          padding: 24px;
          color: rgba(245,255,239,.72);
          background:
            radial-gradient(circle at 12% 0, color-mix(in srgb, var(--club-accent) 15%, transparent), transparent 38%),
            rgba(1,12,9,.72);
          contain: layout paint;
        }
        .club-hub-deferred::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(110deg, transparent 20%, color-mix(in srgb, var(--club-accent) 8%, transparent) 50%, transparent 80%);
          pointer-events: none;
        }
        .club-hub-deferred > span {
          position: relative;
          z-index: 1;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .club-hub-deferred > i {
          position: relative;
          z-index: 1;
          width: 72px;
          height: 3px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
        }
        .club-hub-deferred > i::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: var(--club-accent);
          transform-origin: left;
          animation: club-hub-deferred-progress 1.2s ease-in-out infinite alternate;
        }
        .club-hub-deferred-lineup { min-height: 560px; }
        .club-hub-deferred-panel { min-height: 320px; }
        .club-hub-deferred-table { min-height: 280px; }
        .club-hub-deferred-cards { min-height: 520px; }
        @keyframes club-hub-deferred-progress {
          from { transform: scaleX(.18); opacity: .46; }
          to { transform: scaleX(1); opacity: 1; }
        }
        .club-hub-back,
        .club-hub-actions a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          border: 1px solid rgba(177,255,77,.42);
          border-radius: 999px;
          padding: 0 22px;
          color: #dfff9b;
          text-decoration: none;
                    font-size: 11px;
          font-weight: 950;          background: rgba(8,15,12,.68);
        }
        .club-hub-shell {
          width: min(1540px, 100%);
          min-width: 0;
          max-width: 100%;
          margin: 38px auto 0;
          display: grid;
          gap: 18px;
        }
        .club-hub-shell > * {
          min-width: 0;
          max-width: 100%;
        }
        .club-hub-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 10px;
          border-top: 1px solid rgba(163,255,18,.18);
          padding: 20px 8px 0;
          color: rgba(241,255,234,.54);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .04em;
        }
        .club-hub-footer span:first-child { color: #dfffad; font-weight: 950; }
        .club-hub-chapter {
          min-width: 0;
          display: grid;
          gap: 12px;
          scroll-margin-top: 132px;
        }
        .club-hub-chapter > section {
          margin-top: 0;
        }
        .club-hub-matchday-chapter {
          gap: 14px;
        }
        .club-hub-matchday-support {
          min-width: 0;
          display: grid;
          gap: 14px;
        }
        .club-hub-chapter-marker {
          min-width: 0;
          display: grid;
          grid-template-columns: 38px minmax(40px, 1fr) auto auto;
          align-items: center;
          gap: 12px;
          padding: 4px 8px;
        }
        .club-hub-chapter-marker > span {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          border: 1px solid rgba(163,255,18,.34);
          border-radius: 50%;
          color: #cfff89;
          background: rgba(163,255,18,.055);
          box-shadow: inset 0 1px rgba(255,255,255,.05), 0 0 16px rgba(163,255,18,.07);
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: .08em;
        }
        .club-hub-chapter-marker > i {
          height: 1px;
          overflow: visible;
          background: linear-gradient(90deg, rgba(163,255,18,.52), rgba(163,255,18,.08));
          box-shadow: 0 0 8px rgba(163,255,18,.18);
        }
        .club-hub-chapter-marker > strong {
          color: #efffe6;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: .11em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .club-hub-chapter-marker > small {
          color: rgba(241,255,234,.42);
          font-size: 9px;
          font-weight: 750;
          white-space: nowrap;
        }
        .club-hub-top-anchor {
          display: block;
          width: 0;
          height: 0;
          pointer-events: none;
        }
        .club-hub-hero,
        .club-hub-board,
        .club-hub-touchline {
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(4,12,9,.76), rgba(12,28,18,.62));
          box-shadow: 0 30px 90px rgba(0,0,0,.38);
          backdrop-filter: blur(18px);
        }
        .club-hub-hero {
          min-height: 492px;
          padding: clamp(24px, 4vw, 52px) clamp(24px, 4vw, 52px) 126px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          overflow: hidden;
          position: relative;
          isolation: isolate;
          border-radius: 24px;
          border-color: rgba(163,255,18,.34);
          background:
            radial-gradient(ellipse at 16% 48%, color-mix(in srgb, var(--club-accent) 52%, transparent) 0%, color-mix(in srgb, var(--club-accent) 22%, transparent) 30%, transparent 57%),
            radial-gradient(ellipse at 76% 22%, color-mix(in srgb, var(--club-secondary) 24%, transparent), transparent 48%),
            linear-gradient(105deg, color-mix(in srgb, var(--club-accent) 14%, #020a0b) 0%, rgba(3,13,12,.86) 48%, color-mix(in srgb, var(--club-secondary) 12%, #03100d) 100%);
          box-shadow:
            0 28px 78px color-mix(in srgb, var(--club-accent) 15%, rgba(0,0,0,.42)),
            inset 0 1px 0 rgba(255,255,255,.13);
        }
        .club-hub-hero-image {
          z-index: 0;
          object-fit: cover;
          object-position: center 48%;
          transform: scale(1.012);
          animation: club-hub-stadium-breathe 18s ease-in-out infinite alternate;
          will-change: transform;
        }
        .club-hub-hero-shade {
          position: absolute;
          z-index: 0;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 18% 48%, color-mix(in srgb, var(--club-accent) 22%, transparent), transparent 34%),
            linear-gradient(90deg, rgba(2,8,6,.94) 0%, rgba(2,8,6,.74) 43%, rgba(2,8,6,.24) 78%),
            linear-gradient(0deg, rgba(2,8,6,.96) 0%, transparent 62%);
        }
        #club-feed,
        #club-table,
        #club-squad,
        #touchline-club-lineup { scroll-margin-top: 84px; }
        .club-hub-neon-frame {
          position: absolute;
          z-index: 4;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
          pointer-events: none;
        }
        .club-hub-neon-trace {
          fill: none;
          stroke: #a3ff12;
          stroke-width: 1.35;
          stroke-linecap: round;
          stroke-dasharray: 5 95;
          vector-effect: non-scaling-stroke;
          filter:
            drop-shadow(0 0 2px rgba(163,255,18,.98))
            drop-shadow(0 0 7px rgba(163,255,18,.72));
          animation: club-hub-border-sweep 8s linear infinite;
        }
        .club-hub-identity {
          position: relative;
          z-index: 1;
        }
        .club-hub-identity {
          display: flex;
          align-items: center;
          gap: clamp(34px, 5vw, 78px);
          flex: 1;
          min-width: 0;
          transform: translateY(16px);
        }
        .club-hub-title-block {
          min-width: 0;
          flex: 1;
          animation: club-hub-content-rise .72s cubic-bezier(.2,.8,.2,1) .12s both;
        }
        .club-hub-hero-next-match {
          position: absolute;
          z-index: 2;
          top: clamp(26px, 3vw, 46px);
          right: clamp(22px, 3vw, 48px);
          width: min(318px, 27vw);
        }
        .club-hub-hero-next-match-awaiting {
          display: grid;
          min-height: 84px;
          align-content: center;
          gap: 6px;
          border: 1px solid rgba(163,255,18,.24);
          border-radius: 14px;
          padding: 12px;
          background: rgba(2,12,8,.76);
          box-shadow: inset 0 1px rgba(255,255,255,.06), 0 18px 42px rgba(0,0,0,.25);
        }
        .club-hub-hero-next-match-awaiting span {
          color: #dfffad;
          font-size: 8px;
          font-weight: 950;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .club-hub-hero-next-match-awaiting strong {
          color: rgba(247,255,242,.7);
          font-size: 10px;
        }
        .club-hub-logo {
          width: clamp(180px, 20vw, 298px);
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 0;
          background: transparent;
          overflow: visible;
          isolation: isolate;
          transform: translateZ(0);
          transition: transform 240ms cubic-bezier(.2,.8,.2,1), filter 240ms ease;
        }
        .club-hub-logo-stack {
          position: relative;
          display: grid;
          justify-items: center;
          flex: 0 0 auto;
          isolation: isolate;
          animation: club-hub-crest-arrive .78s cubic-bezier(.2,.8,.2,1) both;
        }
        .club-hub-logo-stack::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset: 10% 4%;
          pointer-events: none;
          background: radial-gradient(circle, color-mix(in srgb, var(--club-accent) 48%, transparent), transparent 68%);
          filter: blur(26px);
          opacity: .52;
          animation: club-hub-crest-aura 4.8s ease-in-out infinite alternate;
        }
        .club-hub-logo img {
          width: 96%;
          height: 96%;
          position: relative;
          z-index: 1;
          object-fit: contain;
          background: transparent;
          border: 0;
          box-shadow: none;
          filter: drop-shadow(0 22px 34px rgba(0,0,0,.46));
        }
        .club-hub-honours {
          width: 100%;
          margin-top: 6px;
          padding: 0;
          background: transparent;
          overflow: hidden;
        }
        .club-hub-honours-empty {
          margin: 10px 0 0;
          padding: 13px 15px;
          border: 1px solid rgba(255,255,255,.14);
          border-left-color: color-mix(in srgb, var(--club-accent) 66%, #fff);
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(255,255,255,.08), rgba(0,0,0,.22));
          color: rgba(255,255,255,.72);
          font-size: 12px;
          line-height: 1.45;
          font-weight: 800;
        }
        .club-hub-honour-row {
          display: block;
          position: relative;
          margin-top: 10px;
          min-height: 116px;
          padding: 2px 0 6px;
          overflow: hidden;
          overscroll-behavior-x: contain;
        }
        .club-hub-honour-viewport {
          width: 100%;
          min-height: inherit;
          overflow: hidden;
        }
        .club-hub-honour-page {
          display: grid;
          grid-template-columns: repeat(var(--club-hub-trophy-page-columns), minmax(0, 78px));
          justify-content: center;
          gap: 9px;
          padding-inline: 8px;
          opacity: 1;
          transform: translate3d(0, 0, 0);
          transition: opacity .22s ease, transform .22s ease;
          will-change: opacity, transform;
        }
        .club-hub-honour-page[data-transition-phase="exit"] {
          opacity: 0;
          transform: translate3d(-12px, 0, 0);
        }
        .club-hub-honour-page[data-transition-phase="enter"] {
          opacity: 0;
          transform: translate3d(12px, 0, 0);
        }
        .club-hub-honour-row.is-static .club-hub-honour-page {
          justify-content: flex-start;
          will-change: auto;
        }
        .club-hub-honour-arrow {
          position: absolute;
          z-index: 3;
          top: 50%;
          width: 38px;
          height: 46px;
          display: grid;
          place-items: center;
          transform: translateY(-50%);
          border: 0;
          padding: 0;
          color: rgba(255,255,255,.92);
          background: transparent;
          box-shadow: none;
          filter: none;
          cursor: pointer;
        }
        .club-hub-honour-arrow::before {
          content: "";
          position: absolute;
          inset: 8px 0;
          background:
            linear-gradient(145deg, rgba(255,255,255,.13), rgba(255,255,255,.035)),
            color-mix(in srgb, var(--club-accent) 16%, rgba(3,10,14,.76));
          clip-path: polygon(100% 14%, 48% 14%, 0 50%, 48% 86%, 100% 86%, 62% 50%);
          opacity: .92;
          transition: background .16s ease, opacity .16s ease;
        }
        .club-hub-honour-arrow.is-next::before {
          transform: scaleX(-1);
        }
        .club-hub-honour-arrow:hover,
        .club-hub-honour-arrow:focus-visible {
          color: color-mix(in srgb, var(--club-accent) 54%, #fff);
          outline: 0;
        }
        .club-hub-honour-arrow:hover::before,
        .club-hub-honour-arrow:focus-visible::before {
          background:
            linear-gradient(145deg, rgba(255,255,255,.2), rgba(255,255,255,.06)),
            color-mix(in srgb, var(--club-accent) 28%, rgba(3,10,14,.72));
          opacity: 1;
        }
        .club-hub-honour-arrow.is-previous {
          left: 2px;
        }
        .club-hub-honour-arrow.is-next {
          right: 2px;
        }
        .club-hub-honour {
          position: relative;
          min-width: 0;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 10px;
          padding: 7px 5px 6px;
          display: grid;
          place-items: center;
          gap: 4px;
          overflow: hidden;
          text-align: center;
          background:
            linear-gradient(180deg, rgba(255,255,255,.1), rgba(0,0,0,.18)),
            rgba(2,10,8,.54);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 14px 28px rgba(0,0,0,.22);
        }
        .club-hub-honour-avatar {
          width: 41px;
          height: 44px;
          position: relative;
          display: grid;
          place-items: center;
        }
        .club-hub-honour-avatar img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 10px 16px rgba(0,0,0,.48));
        }
        .club-hub-honour-avatar picture {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
        }
        .club-hub-honour strong {
          font-size: 15px;
          line-height: 1;
        }
        .club-hub-honour small {
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          color: rgba(255,255,255,.64);
          font-size: 7px;
          line-height: 1.2;
          font-weight: 950;                  }
        .club-hub-hero-footer {
          position: absolute;
          z-index: 1;
          right: clamp(300px, 27vw, 430px);
          bottom: 20px;
          left: clamp(250px, 25vw, 490px);
          min-width: 0;
        }
        .club-hub-identity span,
        .club-hub-board span,
        .club-hub-section-head span,
        .club-hub-next-match > span {
          color: #b6ff4d;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .club-hub-identity h1 {
          margin: 12px 0 14px;
          max-width: 12ch;
          font-size: clamp(42px, 5vw, 76px);
          line-height: .92;
          letter-spacing: -.045em;
          text-wrap: balance;
          text-shadow: 0 18px 38px rgba(0,0,0,.42);
        }
        @keyframes club-hub-stadium-breathe {
          from { transform: scale(1.012); }
          to { transform: scale(1.035); }
        }
        @keyframes club-hub-border-sweep {
          to { stroke-dashoffset: -100; }
        }
        @keyframes club-hub-crest-arrive {
          from { opacity: 0; transform: translate3d(-18px, 8px, 0) scale(.96); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes club-hub-content-rise {
          from { opacity: 0; transform: translate3d(0, 16px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes club-hub-crest-aura {
          from { opacity: .34; transform: scale(.96); }
          to { opacity: .62; transform: scale(1.05); }
        }
        .club-hub-identity p,
        .club-hub-board p,
        .club-hub-next-match p,
        .club-hub-section-head small,
        .club-hub-feature-list small {
          max-width: 650px;
          margin: 0;
          color: rgba(255,255,255,.68);
          font-size: 14px;
          line-height: 1.7;
          font-weight: 800;
        }
        .club-hub-board {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1px;
          overflow: hidden;
        }
        .club-hub-board article {
          padding: 22px;
          background: rgba(0,0,0,.24);
        }
        .club-hub-league-table {
          padding: 24px;
          background:
            radial-gradient(circle at 12% 20%, color-mix(in srgb, var(--club-accent) 20%, transparent), transparent 32%),
            rgba(0,0,0,.2);
        }
        .club-hub-table-list {
          display: grid;
          gap: 8px;
          padding-top: 18px;
        }
        .club-hub-table-row {
          display: grid;
          grid-template-columns: 38px 42px minmax(150px, 1fr) repeat(7, 48px) 58px minmax(70px, .8fr);
          align-items: center;
          gap: 10px;
          min-height: 58px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(255,255,255,.07), rgba(0,0,0,.24));
          color: #f8fff5;
          padding: 8px 12px;
          text-decoration: none;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
        }
        .club-hub-table-row.is-current {
          border-color: rgba(181,255,75,.45);
          background:
            linear-gradient(135deg, rgba(181,255,75,.16), rgba(0,0,0,.26)),
            color-mix(in srgb, var(--club-accent) 14%, transparent);
        }
        .club-hub-table-row span,
        .club-hub-table-row b {
          color: #dfff9b;
          font-weight: 1000;
          text-align: center;
        }
        .club-hub-table-row img {
          width: 34px;
          height: 34px;
          object-fit: contain;
          filter: drop-shadow(0 8px 14px rgba(0,0,0,.42));
        }
        .club-hub-table-row i {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          color: #dfff9b;
          font-size: 9px;
          font-style: normal;
          font-weight: 1000;
        }
        .club-hub-table-row strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 15px;
                  }
        .club-hub-table-row small {
          color: rgba(255,255,255,.62);
          font-size: 10px;
          font-weight: 950;
          text-align: center;
          white-space: nowrap;
        }
        .club-hub-table-form { color: #dfff9b !important; letter-spacing: .04em; }
        .club-hub-table-empty {
          display: grid;
          gap: 7px;
          margin-top: 18px;
          border: 1px dashed rgba(181,255,75,.28);
          border-radius: 8px;
          padding: 20px;
          background: rgba(0,0,0,.18);
        }
        .club-hub-table-empty strong { color: #dfff9b; font-size: 14px; }
        .club-hub-table-empty p { margin: 0; color: rgba(255,255,255,.66); font-size: 12px; line-height: 1.5; }
        .club-hub-board strong {
          display: block;
          margin: 12px 0;
          font-size: 24px;
                  }
        .club-hub-next-match {
          display: grid;
          gap: 12px;
          width: min(760px, 100%);
          margin-top: 20px;
          border-top: 1px solid rgba(255,255,255,.14);
          padding-top: 18px;
        }
        .club-hub-fixture-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          gap: 18px;
          align-items: center;
        }
        .club-hub-fixture-row div {
          min-height: 118px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          border: 0;
          background: transparent;
          box-shadow: none;
          outline: 0;
        }
        .club-hub-fixture-row .club-hub-fixture-crest {
          width: min(104px, 100%);
          height: auto;
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          overflow: visible;
          isolation: isolate;
          transform: translateZ(0);
          transition: transform 180ms ease;
        }
        .club-hub-fixture-row img {
          width: min(112px, 100%);
          height: 92px;
          object-fit: contain;
          background: transparent;
          border: 0;
          box-shadow: none;
          filter: none;
        }
        .club-hub-fixture-row .club-hub-fixture-crest img {
          width: 100%;
          height: 100%;
          position: relative;
          z-index: 1;
          object-fit: contain;
        }
        @media (hover: hover) and (pointer: fine) {
          .club-hub-logo:hover,
          .club-hub-fixture-crest:hover {
            transform: translate3d(0, -2px, 0);
          }
        }
        @media (hover: none), (pointer: coarse) {
          .club-hub-logo:active,
          .club-hub-fixture-crest:active {
            transform: translate3d(0, -1px, 0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .club-hub-logo,
          .club-hub-fixture-crest,
          .club-hub-logo:hover,
          .club-hub-fixture-crest:hover,
          .club-hub-logo:active,
          .club-hub-fixture-crest:active {
            transform: none !important;
            transition: none;
          }
        }
        .club-hub-fixture-row strong {
          margin: 10px 0 0;
          font-size: 16px;
        }
        .club-hub-fixture-team-pending strong {
          max-width: 150px;
          margin: 0;
          color: rgba(255,255,255,.78);
          line-height: 1.25;
          text-align: center;
          white-space: normal;
        }
        .club-hub-fixture-row b {
          color: #dfff9b;
          font-size: 15px;
          font-weight: 1000;          opacity: .86;
        }
        .club-hub-next-match small {
          color: rgba(255,255,255,.56);
          font-size: 10px;
          font-weight: 900;                  }
        .club-hub-touchline {
          padding: 24px;
        }
        .club-hub-section-head {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 24px;
          padding-bottom: 18px;
          border-bottom: 1px solid rgba(255,255,255,.1);
        }
        .club-hub-section-head strong {
          display: block;
          margin-top: 8px;
          font-size: clamp(28px, 3.2vw, 52px);
          line-height: 1;
                  }
        .club-hub-section-actions {
          display: grid;
          justify-items: end;
          gap: 10px;
        }
        .club-hub-section-actions a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          border-radius: 999px;
          border: 1px solid rgba(181,255,75,.4);
          background: linear-gradient(135deg, rgba(181,255,75,.18), rgba(0,0,0,.26));
          color: #efff9b;
          padding: 0 16px;
          text-decoration: none;
                    white-space: nowrap;
          font-size: 9px;
          font-weight: 1000;        }
        .club-hub-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(218px, 1fr));
          gap: 14px;
          padding-top: 22px;
        }
        .club-hub-progressive-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-top: 18px;
          border-top: 1px solid rgba(255,255,255,.1);
          padding-top: 18px;
        }
        .club-hub-progressive-controls span {
          color: rgba(255,255,255,.62);
          font-size: 11px;
          font-weight: 850;
        }
        .club-hub-progressive-controls button {
          min-height: 44px;
          border: 1px solid rgba(181,255,75,.48);
          border-radius: 999px;
          padding: 0 18px;
          color: #efffbd;
          background: rgba(181,255,75,.1);
          font: inherit;
          font-size: 10px;
          font-weight: 950;
          cursor: pointer;
        }
        .club-hub-progressive-controls button:hover,
        .club-hub-progressive-controls button:focus-visible {
          border-color: #c5ff6d;
          background: rgba(181,255,75,.2);
          outline: none;
        }
        .club-hub-card {
          position: relative;
          min-height: 360px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 8px;
          padding: 14px;
          display: grid;
          align-content: start;
          justify-items: center;
          background: linear-gradient(150deg, rgba(255,255,255,.08), rgba(0,0,0,.3));
          overflow: visible;
        }
        .club-hub-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--club-accent) 22%, transparent), transparent 36%);
          border-radius: inherit;
          pointer-events: none;
        }
        .club-hub-rank {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 2;
          border: 1px solid rgba(177,255,77,.35);
          border-radius: 999px;
          padding: 6px 10px;
          color: #dfff9b;
          background: rgba(0,0,0,.44);
          font-size: 11px;
          font-weight: 950;
        }
        .club-hub-rendered-card {
          width: min(100%, 180px) !important;
          --touchline-card-static-scale: .4186046512;
          position: relative;
          z-index: 1;
        }
        .club-hub-card-meta {
          position: relative;
          z-index: 1;
          width: 100%;
          display: grid;
          justify-items: center;
          gap: 6px;
          margin-top: 10px;
          text-align: center;
        }
        .club-hub-card-meta a {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          padding-inline: 12px;
          color: #dfff9b;
          text-decoration: none;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .club-hub-card-meta a:hover,
        .club-hub-card-meta a:focus-visible {
          color: #dfff9b;
          outline: 0;
          text-shadow: 0 0 14px rgba(163,255,18,.42);
        }
        .club-hub-card-meta small {
          display: block;
          color: rgba(255,255,255,.62);
          font-weight: 800;
          font-size: 11px;
          line-height: 1.35;
        }
        .club-hub-feature-list {
          display: grid;
          gap: 10px;
          padding-top: 20px;
        }
        .club-hub-feature-list article {
          display: grid;
          grid-template-columns: 56px minmax(0, 1fr) auto;
          gap: 14px;
          align-items: center;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          padding: 14px;
          background: rgba(0,0,0,.24);
        }
        .club-hub-feature-list span {
          color: #b6ff4d;
          font-size: 13px;
          font-weight: 950;
        }
        .club-hub-feature-list strong {
          font-size: 18px;
                  }
        .club-hub-empty {
          margin-top: 22px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 8px;
          padding: 26px;
          color: rgba(255,255,255,.72);
          font-weight: 900;
        }
        .club-hub-empty strong {
          display: block;
          max-width: 48ch;
        }
        .club-hub-empty a {
          display: inline-flex;
          margin-top: 13px;
          min-height: 38px;
          align-items: center;
          justify-content: center;
          border: 1px solid color-mix(in srgb, var(--club-accent) 58%, rgba(255,255,255,.28));
          border-radius: 999px;
          padding: 0 16px;
          color: #f8fff5;
          font-size: 11px;
          font-weight: 900;
          text-decoration: none;
        }
        @media (max-width: 980px) {
          .club-hub { padding: 22px 14px 42px; }
          .club-hub-hero,
          .club-hub-identity,
          .club-hub-section-head { align-items: stretch; flex-direction: column; }
          .club-hub-section-actions { justify-items: start; }
          .club-hub-section-actions small { text-align: left; }
          .club-hub-honours {
            width: 100%;
          }
          .club-hub-hero-next-match {
            position: relative;
            top: auto;
            right: auto;
            order: 1;
            width: min(100%, 360px);
            margin: 0 auto;
          }
          .club-hub-identity {
            order: 2;
            transform: translateY(0);
          }
          .club-hub-hero-footer {
            position: relative;
            right: auto;
            bottom: auto;
            left: auto;
            order: 3;
            width: 100%;
            margin-top: 4px;
          }
          .club-hub-logo-stack {
            justify-items: center;
          }
          .club-hub-logo {
            width: min(260px, 70vw);
          }
          .club-hub-honour-row {
            margin-inline: -4px;
          }
          .club-hub-board { grid-template-columns: 1fr; }
          .club-hub-league-table { padding: 18px; }
          .club-hub-table-list {
            width: 100%;
            min-width: 0;
            max-width: 100%;
            overflow-x: auto;
            padding-bottom: 6px;
            scrollbar-width: thin;
            scrollbar-color: color-mix(in srgb, var(--club-accent) 70%, #b5ff4b) rgba(255,255,255,.06);
            -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%);
            mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%);
          }
          .club-hub-table-list:focus,
          .club-hub-table-list:hover {
            -webkit-mask-image: none;
            mask-image: none;
            outline: none;
          }
          .club-hub-table-row {
            min-width: 920px;
          }
          .club-hub-feature-list article { grid-template-columns: 42px minmax(0, 1fr); }
          .club-hub-feature-list small { grid-column: 2; }
        }
        @media (max-width: 720px) {
          .club-hub { padding: 18px 10px 36px; }
          .club-hub-honour-page {
            grid-template-columns: repeat(var(--club-hub-trophy-page-columns), minmax(0, 1fr));
            gap: 8px;
            padding-inline: 8px;
          }
          .club-hub-chapter-marker {
            grid-template-columns: 34px minmax(20px, 1fr) auto;
            gap: 8px;
            padding-inline: 2px;
          }
          .club-hub-chapter-marker > small { display: none; }
          .club-hub-shell {
            margin-top: 24px;
            gap: 12px;
          }
          .club-hub-hero {
            min-height: 0;
            padding: 22px 16px 26px;
          }
          .club-hub-identity { gap: 20px; }
          .club-hub-logo-stack { width: 100%; }
          .club-hub-logo { width: min(190px, 58vw); }
          .club-hub-identity h1 {
            margin-top: 17px;
            font-size: clamp(38px, 13vw, 56px);
          }
          .club-hub-identity p,
          .club-hub-board p,
          .club-hub-section-head small,
          .club-hub-feature-list small {
            font-size: 11px;
            line-height: 1.55;
          }
          .club-hub-board article { padding: 17px; }
          .club-hub-league-table,
          .club-hub-touchline {
            min-width: 0;
            overflow: hidden;
            padding: 16px;
          }
          .club-hub-section-head { gap: 15px; }
          .club-hub-section-head strong { font-size: 30px; }
          .club-hub-card-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .club-hub-progressive-controls {
            align-items: stretch;
            flex-direction: column;
          }
          .club-hub-rendered-card {
            width: min(100%, 190px) !important;
            --touchline-card-static-scale: .4418604651;
          }
          .club-hub-card-meta a { min-height: 44px; }
          .club-hub-footer { align-items: flex-start; flex-direction: column; gap: 6px; font-size: 10px; }
          .club-hub-fixture-row { gap: 8px; }
          .club-hub-fixture-row img { height: 72px; }
          .club-hub-fixture-row .club-hub-fixture-crest { width: min(72px, 100%); }
          .club-hub-fixture-row .club-hub-fixture-crest img { height: 100%; }
        }
        @media (orientation: landscape) and (max-width: 1100px) and (max-height: 520px) {
          .club-hub {
            padding: 12px 14px 28px;
          }
          .club-hub-back {
            display: inline-flex;
            min-height: 44px;
            align-items: center;
            padding-inline: 16px;
          }
          .club-hub-shell {
            margin-top: 14px;
            gap: 12px;
          }
          .club-hub-hero,
          .club-hub-identity,
          .club-hub-section-head {
            align-items: center;
            flex-direction: row;
          }
          .club-hub-hero {
            min-height: 0;
            padding: 16px 20px 68px;
          }
          .club-hub-identity {
            gap: 24px;
          }
          .club-hub-logo-stack {
            width: 180px;
            gap: 8px;
          }
          .club-hub-logo {
            width: 136px;
          }
          .club-hub-identity h1 {
            margin: 7px 0 9px;
            font-size: clamp(38px, 6vw, 52px);
          }
          .club-hub-identity p {
            max-width: 520px;
            font-size: 10px;
            line-height: 1.45;
          }
          .club-hub-board {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .club-hub-deferred-lineup { min-height: 420px; }
          .club-hub-deferred-panel { min-height: 260px; }
          .club-hub-deferred-table { min-height: 220px; }
          .club-hub-deferred-cards { min-height: 380px; }
          .club-hub-board article {
            padding: 14px;
          }
          .club-hub-section-head {
            gap: 18px;
          }
          .club-hub-section-head strong {
            font-size: 28px;
          }
          .club-hub-section-actions {
            justify-items: end;
          }
          .club-hub-section-actions small {
            text-align: right;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .club-hub-hero-image,
          .club-hub-neon-trace,
          .club-hub-logo-stack,
          .club-hub-logo-stack::before,
          .club-hub-title-block,
          .club-hub-honour {
            animation: none !important;
            transition: none !important;
          }
          .club-hub-title-block,
          .club-hub-logo-stack { opacity: 1; transform: none; }
          .club-hub-deferred > i::after { animation: none; transform: scaleX(1); }
        }
      `}</style>
    </main>
  );
}
