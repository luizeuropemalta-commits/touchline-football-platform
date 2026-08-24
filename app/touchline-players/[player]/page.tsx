/* eslint-disable @next/next/no-img-element */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Activity,
  BarChart3,
  CalendarDays,
  Footprints,
  Ruler,
  Shield,
  Sparkles,
  Trophy,
} from "lucide-react";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import {
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  CLUB_OWNER_SQUAD_CARDS,
} from "@/lib/touchlineArena/demo-data";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import {
  resolveTouchLinePlayerProfile,
  resolveTouchLineUnavailableOfficialProfile,
  type TouchLinePlayerProfileSearchParams,
} from "@/lib/touchlineArena/player-profile";
import {
  resolveTouchLineOfficialLookup,
  touchlinePlayerProfileHref,
} from "@/lib/touchlineArena/player-links";
import { loadTouchLineOfficialPlayerIdentity } from "@/lib/touchlineArena/player-profile-official";
import { loadTouchlinePublicPlayerProjections } from "@/lib/touchlineArena/market-value-read-model";
import { loadTouchLinePlayerStatisticsReadModel } from "@/lib/touchlineArena/player-season-statistics-server";
import {
  touchLinePlayerSeasonCoverageMessage,
  type TouchLinePlayerSeasonStatistics,
  type TouchLinePlayerStatisticsReadModel,
} from "@/lib/touchlineArena/player-season-statistics";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";
import { resolveTouchlineCardCompetition } from "@/lib/touchlineArena/card-ranking-live";
import { TOUCHLINE_POSITION_RANKING_LABELS } from "@/lib/touchlineArena/card-ranking";
import {
  touchlineArenaTierForKey,
  touchlineCardTierName,
  touchlineCardTierPalette,
} from "@/lib/touchlineArena/card-rules";
import { touchlineDemoTierForPlayer } from "@/lib/touchlineArena/demo-card-tier";
import {
  TOUCHLINE_NEUTRAL_CARD_ACCENT,
  TOUCHLINE_NEUTRAL_CARD_SECONDARY,
} from "@/lib/touchlineArena/public-card-presentation";
import { loadTouchlinePublishedCardPresentations } from "@/lib/touchlineArena/card-publication-read-model";
import { formatTouchlineEditorialCardPrice } from "@/lib/touchlineArena/editorial-card-profile";
import {
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import {
  normalizeTouchlineCountryCode3,
  touchlineCountryCode3FromName,
  touchlineCountryFlagUrl,
} from "@/lib/touchlineArena/country-flags";
import {
  TouchlineSocialFeed,
  TouchlineSocialProfileActions,
  type TouchlineSocialPost,
} from "@/components/touchline/social/TouchlineSocial";
import { touchlineArenaContractHref } from "@/lib/touchlineArena/arena-navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { resolveTouchlineGlobalNavigationSurface } from "@/lib/touchlineArena/global-navigation";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";
import {
  projectTouchlineCardStatsByPosition,
  type TouchlineCardStats,
} from "@/lib/touchlineArena/position-aware-card-stats";
import styles from "./player-profile.module.css";

export const dynamic = "force-dynamic";

type PlayerProfilePageProps = {
  params: Promise<{
    player: string;
  }>;
  searchParams: Promise<TouchLinePlayerProfileSearchParams>;
};

const copy = {
  en: {
    back: "Back to Arena",
    eyebrow: "Player profile + card profile",
    realFootball: "Real football",
    touchlineCard: "TouchLine card",
    position: "Position",
    born: "Born",
    birthplace: "Birthplace",
    height: "Height",
    weight: "Weight",
    nationality: "Nationality",
    foot: "Preferred foot",
    joined: "Joined club",
    contract: "Contract",
    points: "Total rating",
    rank: "Position rank",
    rankGroup: "Ranking group",
    price: "Card price",
    frame: "Current frame",
    shirt: "Shirt number",
    career: "Career path",
    season: "TouchLine season",
    seasonCopy:
      "TouchLine ratings, card rank and verified match history update here as league fixtures are played.",
    current: "Current status",
    currentCopy:
      "The card is connected to the shared TouchLine master used by Arena, squad, market and club profile.",
    sources: "Verified football sources",
    currentClub: "Current club",
    openClub: "Open club profile",
    awaiting: "Verified career history is awaiting TouchLine verification.",
    fromClub: "From",
    toClub: "To",
    rankPending: "Pending",
    officialData: "Official football data",
    performance: "Verified performance",
    performanceCopy: "Every statistic below comes from the canonical TouchLine Verified season read model. No estimated values are used.",
    syncPending: "TouchLine Verified statistics are awaiting a complete player, season and fixture sync.",
    latestSeason: "Last completed season",
    updatedAt: "Updated",
    verifiedSeason: "Verified season",
    fullStats: "TouchLine Verified statistics",
    providerVerified: "Verified by TouchLine",
    officialSummary: "Key numbers",
    officialAttack: "Attack",
    officialDistribution: "Passing",
    officialDefending: "Defending",
    officialDiscipline: "Discipline",
    officialGoalkeeping: "Goalkeeping",
    officialOther: "More official stats",
    rankings: "Open Card Player Rankings",
    bestEleven: "Best 11 after the first official ranking",
    touchlineData: "TouchLine game data",
    currentSeason: "Current season",
    lastFiveMatches: "Last five matches",
    currentFixture: "Current or selected fixture",
    currentMatchPoints: "Current match rating",
    unavailable: "Unavailable",
    appearances: "Appearances",
    starts: "Starts",
    substituteAppearances: "Substitute appearances",
    minutes: "Minutes",
    goals: "Goals",
    assists: "Assists",
    rating: "Rating",
    totalRating: "Total rating",
    ratedAppearances: "Rated appearances",
    matchHistory: "Match history",
    yellowCards: "Yellow cards",
    redCards: "Red cards",
  },
  pt: {
    back: "Voltar à Arena",
    eyebrow: "Perfil do jogador + perfil do card",
    realFootball: "Futebol real",
    touchlineCard: "Card TouchLine",
    position: "Posição",
    born: "Nascimento",
    birthplace: "Local de nascimento",
    height: "Altura",
    weight: "Peso",
    nationality: "Nacionalidade",
    foot: "Pé preferido",
    joined: "Chegou ao clube",
    contract: "Contrato",
    points: "Nota total",
    rank: "Rank da posição",
    rankGroup: "Grupo do ranking",
    price: "Preço do card",
    frame: "Moldura atual",
    shirt: "Número da camisa",
    career: "Trajetória",
    season: "Temporada TouchLine",
    seasonCopy:
      "Notas TouchLine, rank do card e histórico verificado serão atualizados aqui conforme a liga acontecer.",
    current: "Estado atual",
    currentCopy:
      "O card está conectado ao padrão mestre compartilhado pela Arena, elenco, mercado e perfil do clube.",
    sources: "Fontes oficiais verificadas",
    currentClub: "Clube atual",
    openClub: "Abrir perfil do clube",
    awaiting: "O histórico verificado aguarda validação TouchLine.",
    fromClub: "Origem",
    toClub: "Destino",
    rankPending: "Pendente",
    officialData: "Dados do futebol real",
    performance: "Desempenho verificado",
    performanceCopy: "Todas as estatísticas abaixo vêm do modelo canônico de temporada TouchLine Verified. Nenhum valor estimado é usado.",
    syncPending: "As estatísticas TouchLine Verified aguardam sincronização completa de jogador, temporada e fixtures.",
    latestSeason: "Última temporada concluída",
    updatedAt: "Atualizado",
    verifiedSeason: "Temporada verificada",
    fullStats: "Estatísticas TouchLine Verified",
    providerVerified: "Verificado pela TouchLine",
    officialSummary: "Números principais",
    officialAttack: "Ataque",
    officialDistribution: "Passe",
    officialDefending: "Defesa",
    officialDiscipline: "Disciplina",
    officialGoalkeeping: "Goleiro",
    officialOther: "Mais estatísticas oficiais",
    rankings: "Abrir Card Player Rankings",
    bestEleven: "Best 11 após o primeiro ranking oficial",
    touchlineData: "Dados do jogo TouchLine",
    currentSeason: "Temporada atual",
    lastFiveMatches: "Últimas cinco partidas",
    currentFixture: "Fixture atual ou selecionada",
    currentMatchPoints: "Nota da partida atual",
    unavailable: "Indisponível",
    appearances: "Jogos",
    starts: "Titularidades",
    substituteAppearances: "Entradas como substituto",
    minutes: "Minutos",
    goals: "Gols",
    assists: "Assistências",
    rating: "Nota",
    totalRating: "Nota total",
    ratedAppearances: "Partidas com nota",
    matchHistory: "Histórico de partidas",
    yellowCards: "Cartões amarelos",
    redCards: "Cartões vermelhos",
  },
} as const;

function languageQuery(locale: string) {
  return `?lang=${encodeURIComponent(locale)}`;
}

function formatOfficialSyncTime(value: string | null, locale: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatTransferDate(value: string | undefined, locale: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return value ?? "--";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function localizedTransferType(value: string, locale: string) {
  if (locale !== "pt-BR") return value;
  const normalized = value.trim().toLowerCase();
  return {
    transfer: "Transferência",
    "free transfer": "Transferência livre",
    loan: "Empréstimo",
    "loan return": "Retorno de empréstimo",
    "end of loan": "Fim do empréstimo",
  }[normalized] ?? value;
}

function dataFact(
  icon: ReactNode,
  label: string,
  value?: string | number | null,
) {
  if (value === null || value === undefined || value === "" || value === "--") {
    return null;
  }

  return (
    <div className={styles.fact}>
      <span className={styles.factIcon}>{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

const ptStatLabels: Record<string, string> = {
  appearances: "Jogos",
  starts: "Titularidades",
  minutes: "Minutos",
  goals: "Gols",
  assists: "Assistências",
  "yellow-cards": "Cartões amarelos",
  "red-cards": "Cartões vermelhos",
  fouls: "Faltas",
  offsides: "Impedimentos",
  penalties: "Pênaltis",
  "shots-total": "Finalizações",
  "shots-on-target": "Finalizações no gol",
  "shots-off-target": "Finalizações para fora",
  "shots-blocked": "Finalizações bloqueadas",
  "blocked-shots": "Chutes bloqueados",
  "hit-woodwork": "Bolas na trave",
  passes: "Passes",
  "accurate-passes": "Passes certos",
  "accurate-passes-percentage": "Precisão dos passes",
  "key-passes": "Passes decisivos",
  "total-crosses": "Cruzamentos",
  "accurate-crosses": "Cruzamentos certos",
  "long-balls": "Lançamentos longos",
  "long-balls-won": "Lançamentos longos certos",
  "through-balls": "Passes em profundidade",
  "through-balls-won": "Passes em profundidade certos",
  tackles: "Desarmes",
  interceptions: "Interceptações",
  clearances: "Cortes",
  "total-duels": "Duelos",
  "duels-won": "Duelos vencidos",
  "aerial-won": "Duelos aéreos vencidos",
  "aerials-won": "Duelos aéreos vencidos",
  "aerial-duels-won": "Duelos aéreos vencidos",
  "dribble-attempts": "Tentativas de drible",
  "successful-dribbles": "Dribles certos",
  "dribbled-past": "Dribles sofridos",
  dispossessed: "Perdas de posse",
  "fouls-drawn": "Faltas sofridas",
  "goals-conceded": "Gols sofridos",
  saves: "Defesas",
  "saves-insidebox": "Defesas dentro da área",
  "error-lead-to-goal": "Erro que resultou em gol",
  "clean-sheets": "Jogos sem sofrer gol",
  cleansheets: "Jogos sem sofrer gol",
  yellowcards: "Cartões amarelos",
  redcards: "Cartões vermelhos",
  "minutes-played": "Minutos jogados",
  lineups: "Titularidades",
  bench: "No banco",
  captain: "Capitão",
  "team-wins": "Vitórias da equipe",
  "team-draws": "Empates da equipe",
  "team-lost": "Derrotas da equipe",
  "big-chances-created": "Grandes chances criadas",
  "big-chances-missed": "Grandes chances perdidas",
  "average-points-per-game": "Média de pontos por jogo",
  rating: "Nota",
};

function _localizedStatLabel(code: string, fallback: string, locale: string) {
  if (locale !== "pt-BR") return fallback;
  const normalized = code.toLowerCase().replace(/[_\s]+/g, "-");
  const normalizedFallback = fallback.toLowerCase().replace(/[_\s]+/g, "-");
  return ptStatLabels[normalized] ?? ptStatLabels[normalizedFallback] ?? fallback;
}

function measurement(value: string | undefined, unit: "cm" | "kg") {
  if (!value) return undefined;
  return /[a-z]/i.test(value) ? value : `${value} ${unit}`;
}

const ptPositionLabels: Record<string, string> = {
  attacker: "Atacante",
  forward: "Atacante",
  striker: "Centroavante",
  defender: "Defensor",
  goalkeeper: "Goleiro",
  midfielder: "Meio-campista",
  winger: "Ponta",
  player: "Jogador",
  st: "Centroavante",
  cf: "Atacante",
  lw: "Ponta esquerda",
  rw: "Ponta direita",
  am: "Meia ofensivo",
  cm: "Meio-campista",
  dm: "Volante",
  cb: "Zagueiro",
  lb: "Lateral esquerdo",
  rb: "Lateral direito",
  gk: "Goleiro",
};

const ptCountryLabels: Record<string, string> = {
  brazil: "Brasil",
  england: "Inglaterra",
  france: "França",
  norway: "Noruega",
  spain: "Espanha",
  portugal: "Portugal",
  italy: "Itália",
  germany: "Alemanha",
  netherlands: "Holanda",
  sweden: "Suécia",
  denmark: "Dinamarca",
  croatia: "Croácia",
  argentina: "Argentina",
  belgium: "Bélgica",
  ecuador: "Equador",
  egypt: "Egito",
  cameroon: "Camarões",
  japan: "Japão",
  "south korea": "Coreia do Sul",
  "korea republic": "Coreia do Sul",
  united_states: "Estados Unidos",
  "united states": "Estados Unidos",
  usa: "Estados Unidos",
};

function lookupKey(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function localizedPositionLabel(value: string | null | undefined, locale: string) {
  if (!value) return value;
  if (locale !== "pt-BR") return value;
  return ptPositionLabels[lookupKey(value)] ?? value;
}

function localizedCountryLabel(value: string | null | undefined, locale: string) {
  if (!value) return value;
  if (locale !== "pt-BR") return value;
  return ptCountryLabels[lookupKey(value)] ?? value;
}

function playerFollowerCount(playerId: string) {
  const hash = [...playerId].reduce((total, character) => ((total * 33) + character.charCodeAt(0)) >>> 0, 23);
  return 24_000 + (hash % 940_000);
}

function seasonSummaryEntries(statistics: TouchLinePlayerSeasonStatistics, text: typeof copy.en | typeof copy.pt) {
  return [
    [text.appearances, statistics.summary.appearances],
    [text.starts, statistics.summary.starts],
    [text.substituteAppearances, statistics.summary.substituteAppearances],
    [text.minutes, statistics.summary.minutes],
    [text.goals, statistics.summary.goals],
    [text.assists, statistics.summary.assists],
    [text.rating, statistics.summary.rating],
    [text.totalRating, statistics.summary.totalRating],
    [text.ratedAppearances, statistics.summary.ratedAppearances],
    [text.yellowCards, statistics.summary.yellowCards],
    [text.redCards, statistics.summary.redCards],
  ] as const;
}

function SeasonStatisticsPanel({
  title,
  statistics,
  text,
}: {
  title: string;
  statistics: TouchLinePlayerSeasonStatistics;
  text: typeof copy.en | typeof copy.pt;
}) {
  const coverageMessage = touchLinePlayerSeasonCoverageMessage(statistics);
  const entries = seasonSummaryEntries(statistics, text);
  const hasStatistics = entries.some(([, value]) => value !== null)
    || Object.keys(statistics.positionStatistics).length > 0;

  return (
    <article className={styles.officialGroup} data-season-coverage={statistics.coverageStatus}>
      <h3>{title}</h3>
      <div className={styles.seasonMeta}>
        <strong>{statistics.seasonName ?? text.unavailable}</strong>
        {statistics.competitionName ? <span>{statistics.competitionName}</span> : null}
        {statistics.latestSyncAt ? <time dateTime={statistics.latestSyncAt}>{statistics.latestSyncAt}</time> : null}
      </div>
      {coverageMessage ? <p className={styles.partialData} data-partial-season-data>{coverageMessage}</p> : null}
      {hasStatistics ? (
        <div className={styles.officialStats} data-stat-count={entries.length}>
          {entries.map(([label, value]) => (
            <div key={label} className={value === null ? styles.unavailableStat : styles.primaryStat}>
              <small>{label}</small>
              <strong>{value === null ? text.unavailable : String(value)}</strong>
            </div>
          ))}
          {Object.entries(statistics.positionStatistics).map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.pendingSync}>
          <Activity aria-hidden="true" size={22} />
          <div><strong>{text.unavailable}</strong><small>{text.syncPending}</small></div>
        </div>
      )}
    </article>
  );
}

function FixtureStatisticsPanel({
  model,
  text,
  matchStats,
  position,
  locale,
}: {
  model: TouchLinePlayerStatisticsReadModel;
  text: typeof copy.en | typeof copy.pt;
  matchStats: TouchlineCardStats | null | undefined;
  position: string | null | undefined;
  locale: string;
}) {
  const current = model.currentOrSelectedFixture;
  const matchFacts = buildTouchlineVerifiedMatchFactFields({ statistics: matchStats, position }, locale);
  const appearanceLabel = (value: "started" | "substitute" | "unused" | "absent" | "unavailable") => {
    const labels = text === copy.pt
      ? { started: "Titular", substitute: "Substituto", unused: "Não utilizado", absent: "Ausente", unavailable: text.unavailable }
      : { started: "Started", substitute: "Substitute", unused: "Unused", absent: "Absent", unavailable: text.unavailable };
    return labels[value];
  };
  return (
    <div className={styles.fixtureStatsGrid}>
      <article className={styles.officialGroup}>
        <h3>{text.matchHistory}</h3>
        {model.matchHistory.length ? (
          <div className={styles.fixtureStatsList}>
            {model.matchHistory.map((fixture) => (
              <div key={fixture.fixtureId}>
                <span>{fixture.fixtureStartsAt ?? text.unavailable}</span>
                <strong>{appearanceLabel(fixture.appearanceStatus)}</strong>
                <small>{fixture.minutes === null ? text.unavailable : `${fixture.minutes} ${text.minutes.toLowerCase()}`}</small>
                <small>{text.rating}: {fixture.rating === null ? "—" : String(fixture.rating)}</small>
              </div>
            ))}
          </div>
        ) : <p className={styles.unavailableFixture}>{text.unavailable}</p>}
      </article>
      <article className={styles.officialGroup}>
        <h3>{text.currentFixture}</h3>
        {current ? (
          <>
            <div className={styles.fixtureStatsList}><div><span>{current.fixtureStartsAt ?? text.unavailable}</span><strong>{appearanceLabel(current.appearanceStatus)}</strong><small>{current.minutes === null ? text.unavailable : `${current.minutes} ${text.minutes.toLowerCase()}`}</small><small>{text.currentMatchPoints}: {current.rating === null ? "—" : String(current.rating)}</small></div></div>
            {matchFacts.length ? (
              <div className={styles.officialStats} data-stat-count={matchFacts.length} data-position-aware-player-facts>
                {matchFacts.map((fact) => (
                  <div key={fact.label} className={fact.value === "—" ? styles.unavailableStat : styles.primaryStat}>
                    <small>{fact.label}</small>
                    <strong>{fact.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : <p className={styles.unavailableFixture}>{text.unavailable}</p>}
      </article>
    </div>
  );
}

export function generateStaticParams() {
  return CLUB_OWNER_SQUAD_CARDS.map((card) => ({
    player: card.id,
  }));
}

export default async function TouchLinePlayerProfilePage({
  params,
  searchParams,
}: PlayerProfilePageProps) {
  const [{ player: playerKey }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = normalizeTouchLineLocale(
    Array.isArray(query.lang) ? query.lang[0] : query.lang,
  );
  const text = locale === "pt-BR" ? copy.pt : copy.en;
  const isPortuguese = locale === "pt-BR";
  const supabase = await createClient();
  const currentUserPromise = supabase
    ? supabase.auth.getUser().then(({ data }) => data.user)
    : Promise.resolve(null);
  const fallbackProfile = resolveTouchLinePlayerProfile(playerKey, query);
  const officialLookup = resolveTouchLineOfficialLookup({
    providerPlayerId: Array.isArray(query.playerId) ? query.playerId[0] : query.playerId,
    requestedName: Array.isArray(query.name) ? query.name[0] : query.name,
    fallbackName: fallbackProfile.card.name,
  });
  const [publicProjectionBatch, official, activeRanking, currentUser] = await Promise.all([
    loadTouchlinePublicPlayerProjections({
      providerPlayerIds: [officialLookup.providerPlayerId],
      includeMarketValues: false,
    }),
    loadTouchLineOfficialPlayerIdentity({
      name: officialLookup.name,
      providerPlayerId: officialLookup.providerPlayerId,
    }),
    loadTouchLineActiveRanking(),
    currentUserPromise,
  ]);
  const navigationSurface = resolveTouchlineGlobalNavigationSurface({
    isAuthenticated: Boolean(currentUser),
    isAdmin: Boolean(currentUser && isOwnerEmail(currentUser.email)),
  });
  const publicProjection = officialLookup.providerPlayerId
    ? publicProjectionBatch.projections.find((projection) => projection.providerPlayerId === officialLookup.providerPlayerId)
    : undefined;
  const canonicalIdentity = publicProjection?.identity.status === "verified"
    && publicProjection.identity.value
    ? {
      providerPlayerId: publicProjection.providerPlayerId,
      name: publicProjection.identity.value.name,
      displayName: publicProjection.identity.value.displayName,
      clubName: publicProjection.currentClub.status === "verified"
        ? publicProjection.currentClub.value?.name ?? null
        : null,
      position: publicProjection.membership.status === "verified"
        ? publicProjection.membership.value?.position ?? null
        : null,
      nationality: publicProjection.identity.value.nationality,
      jerseyNumber: publicProjection.membership.status === "verified"
        ? publicProjection.membership.value?.jerseyNumber ?? null
        : null,
    }
    : null;
  // A numeric provider ID identifies an official public profile. If its
  // canonical row cannot be loaded, show a controlled unavailable state rather
  // than letting a URL slug or demo seed substitute another footballer.
  const profile = canonicalIdentity
    ? resolveTouchLinePlayerProfile(playerKey, query, canonicalIdentity)
    : officialLookup.providerPlayerId
    ? resolveTouchLineUnavailableOfficialProfile(officialLookup.providerPlayerId)
    : resolveTouchLinePlayerProfile(playerKey, query);
  const { card, exactPlayer, club, isLocalCard } = profile;
  const canonicalProviderPlayerId = canonicalIdentity?.providerPlayerId
    ?? officialLookup.providerPlayerId
    ?? official.providerPlayerId;
  const playerStatistics = await loadTouchLinePlayerStatisticsReadModel({
    providerPlayerId: canonicalProviderPlayerId,
    selectedFixtureId: Array.isArray(query.fixture) ? query.fixture[0] : query.fixture,
    position: canonicalIdentity?.position ?? null,
  });
  if (canonicalProviderPlayerId) exactPlayer.sportmonksPlayerId = canonicalProviderPlayerId;
  const canonicalPlayerId = canonicalIdentity ? publicProjection?.identity.value?.playerId : null;
  exactPlayer.canonicalPlayerId = canonicalPlayerId;
  const publishedCards = canonicalPlayerId
    ? await loadTouchlinePublishedCardPresentations({ playerIds: [canonicalPlayerId] })
    : new Map();
  const editorialCard = canonicalPlayerId ? publishedCards.get(canonicalPlayerId) ?? null : null;
  exactPlayer.editorialCard = editorialCard;
  exactPlayer.marketValue = null;
  exactPlayer.marketValueSource = "unavailable";
  exactPlayer.marketValueState = "unavailable";
  exactPlayer.cardTier = editorialCard?.tierKey ?? null;
  exactPlayer.classificationState = "unavailable";
  const rankingCompetition = resolveTouchlineCardCompetition({
    state: activeRanking,
    playerId: card.id,
    providerPlayerId: canonicalProviderPlayerId,
  });
  const competition = rankingCompetition;
  const zoomMatchHistoryFields = playerStatistics.matchHistory.map((fixture) => {
    const appearance = isPortuguese
      ? {
        started: "Titular",
        substitute: "Substituto",
        unused: "Não utilizado",
        absent: "Ausente",
        unavailable: text.unavailable,
      }[fixture.appearanceStatus]
      : {
        started: "Started",
        substitute: "Substitute",
        unused: "Unused",
        absent: "Absent",
        unavailable: text.unavailable,
      }[fixture.appearanceStatus];
    const minutes = fixture.minutes === null
      ? text.unavailable
      : `${fixture.minutes} ${text.minutes.toLowerCase()}`;
    const rating = fixture.rating === null ? "—" : String(fixture.rating);
    return {
      label: `${isPortuguese ? "Histórico da partida" : "Match history"} · ${fixture.fixtureStartsAt ?? text.unavailable}`,
      value: `${appearance} · ${minutes} · ${isPortuguese ? "Nota" : "Rating"} ${rating}`,
      kind: "history" as const,
    };
  });
  const totalRatingText = playerStatistics.currentSeason.summary.totalRating ?? competition.totalRating;
  const cumulativeRatingText = totalRatingText === null
    ? text.unavailable
    : String(totalRatingText);
  exactPlayer.totalRating = totalRatingText;
  exactPlayer.matchRating = playerStatistics.currentOrSelectedFixture?.rating ?? null;
  const statisticNumber = (statistics: Record<string, string | number>, ...keys: string[]) => {
    for (const key of keys) {
      const value = statistics[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return undefined;
  };
  const seasonPositionStatistics = playerStatistics.currentSeason.positionStatistics;
  const seasonCleanSheets = statisticNumber(seasonPositionStatistics, "clean-sheets", "cleansheets");
  const seasonSaves = statisticNumber(seasonPositionStatistics, "saves");
  const seasonGoalsConceded = statisticNumber(seasonPositionStatistics, "goalkeeper-goals-conceded", "goals-conceded");
  const seasonDefense = statisticNumber(seasonPositionStatistics, "def-score");
  const cardFactPosition = canonicalIdentity?.position ?? exactPlayer.position ?? card.position;
  exactPlayer.seasonStats = projectTouchlineCardStatsByPosition({
    position: cardFactPosition,
    statistics: {
      goals: playerStatistics.currentSeason.summary.goals,
      assists: playerStatistics.currentSeason.summary.assists,
      ...(seasonCleanSheets === undefined ? {} : { cleanSheets: seasonCleanSheets }),
      ...(seasonSaves === undefined ? {} : { saves: seasonSaves }),
      ...(seasonGoalsConceded === undefined ? {} : { goalsConceded: seasonGoalsConceded }),
      ...(seasonDefense === undefined ? {} : { defense: seasonDefense }),
      yellowCards: playerStatistics.currentSeason.summary.yellowCards,
      redCards: playerStatistics.currentSeason.summary.redCards,
      cards: playerStatistics.currentSeason.summary.yellowCards === null
        || playerStatistics.currentSeason.summary.redCards === null
        ? null
        : playerStatistics.currentSeason.summary.yellowCards + playerStatistics.currentSeason.summary.redCards,
      rating: playerStatistics.currentSeason.summary.rating,
    },
  });
  const selectedFixtureStatistics = playerStatistics.currentOrSelectedFixture?.statistics ?? {};
  const selectedStatistic = (...keys: string[]) => statisticNumber(selectedFixtureStatistics, ...keys);
  const selectedYellowCards = selectedStatistic("yellow-cards", "yellowcards");
  const selectedRedCards = selectedStatistic("red-cards", "redcards");
  exactPlayer.matchStats = projectTouchlineCardStatsByPosition({
    position: cardFactPosition,
    statistics: {
      ...(selectedStatistic("goals") === undefined ? {} : { goals: selectedStatistic("goals")! }),
      ...(selectedStatistic("assists") === undefined ? {} : { assists: selectedStatistic("assists")! }),
      ...(selectedStatistic("clean-sheets", "cleansheets") === undefined ? {} : { cleanSheets: selectedStatistic("clean-sheets", "cleansheets")! }),
      ...(selectedStatistic("saves") === undefined ? {} : { saves: selectedStatistic("saves")! }),
      ...(selectedStatistic("goalkeeper-goals-conceded", "goals-conceded") === undefined ? {} : { goalsConceded: selectedStatistic("goalkeeper-goals-conceded", "goals-conceded")! }),
      ...(selectedStatistic("def-score") === undefined ? {} : { defense: selectedStatistic("def-score")! }),
      ...(selectedStatistic("shots-on-target") === undefined ? {} : { shotsOnTarget: selectedStatistic("shots-on-target")! }),
      ...(selectedStatistic("shots-off-target") === undefined ? {} : { shotsOffTarget: selectedStatistic("shots-off-target")! }),
      ...(selectedStatistic("defensive-actions-total") === undefined ? {} : { defensiveActionsTotal: selectedStatistic("defensive-actions-total")! }),
      ...(selectedStatistic("penalty-saves") === undefined ? {} : { penaltySaves: selectedStatistic("penalty-saves")! }),
      ...(selectedStatistic("penalties-missed") === undefined ? {} : { penaltiesMissed: selectedStatistic("penalties-missed")! }),
      ...(selectedStatistic("own-goals") === undefined ? {} : { ownGoals: selectedStatistic("own-goals")! }),
      ...(selectedYellowCards === undefined ? {} : { yellowCards: selectedYellowCards }),
      ...(selectedRedCards === undefined ? {} : { redCards: selectedRedCards }),
      ...(selectedYellowCards === undefined || selectedRedCards === undefined ? {} : { cards: selectedYellowCards + selectedRedCards }),
      ...(playerStatistics.currentOrSelectedFixture
        ? { rating: playerStatistics.currentOrSelectedFixture.rating }
        : {}),
    },
  });
  const requestedPreviewTier = Array.isArray(query.previewTier) ? query.previewTier[0] : query.previewTier;
  // Preview tiers are available only for an explicit local-development demo.
  // A public numeric provider ID never accepts a visual tier from a
  // query parameter, even if its slug collides with a demo card.
  const previewTier = !officialLookup.providerPlayerId && isLocalCard && process.env.NODE_ENV !== "production"
    ? touchlineArenaTierForKey(requestedPreviewTier)
      ?? touchlineArenaTierForKey(touchlineDemoTierForPlayer(card.id, exactPlayer.sportmonksPlayerId, card.name))
    : null;
  if (previewTier) {
    exactPlayer.cardTier = previewTier.key;
    exactPlayer.classificationState = "verified";
  }
  const isExplicitLocalDevelopmentDemo = !officialLookup.providerPlayerId
    && isLocalCard
    && process.env.NODE_ENV !== "production";
  const developmentTier = isExplicitLocalDevelopmentDemo
    ? previewTier ?? touchlineArenaTierForKey(card.cardTier)
    : null;
  const tier = editorialCard
    ? touchlineArenaTierForKey(editorialCard.tierKey)
    : developmentTier;
  const displayedPriceText = editorialCard
    ? formatTouchlineEditorialCardPrice(editorialCard.cardPrice, locale)
    : null;
  const hasActiveContractOffer = false;
  const hasPublishedEditorialCard = Boolean(editorialCard);
  const officialSyncTime = formatOfficialSyncTime(official.fetchedAt, locale);
  const rankingGroupLabel = competition.positionGroup
    ? TOUCHLINE_POSITION_RANKING_LABELS[competition.positionGroup][locale === "pt-BR" ? "pt" : "en"]
    : text.rankPending;
  const displayPosition = localizedPositionLabel(canonicalIdentity?.position ?? (!officialLookup.providerPlayerId ? official.player?.position : null) ?? card.position, locale);
  const displayNationality = localizedCountryLabel(canonicalIdentity?.nationality ?? (!officialLookup.providerPlayerId ? official.player?.nationality : null) ?? card.countryCode3, locale);
  const officialNationality = canonicalIdentity?.nationality?.trim() ?? (!officialLookup.providerPlayerId ? official.player?.nationality?.trim() : null);
  const officialCountryCode3 = touchlineCountryCode3FromName(officialNationality)
    ?? (officialNationality && officialNationality.length <= 3
      ? normalizeTouchlineCountryCode3(officialNationality)
      : null);
  const profileCountryCode3 = officialCountryCode3
    ?? normalizeTouchlineCountryCode3(exactPlayer.countryCode3 || card.countryCode3);
  const profileFlagUrl = touchlineCountryFlagUrl(profileCountryCode3);
  const clubHref = club
    ? `/touchline-clubs/${club.slug}${languageQuery(locale)}`
    : null;
  const profileHref = touchlinePlayerProfileHref(
    exactPlayer,
    locale,
    previewTier ? { previewTier: previewTier.key } : undefined,
  );
  const tierPalette = tier
    ? touchlineCardTierPalette(tier.key)
    : { accent: TOUCHLINE_NEUTRAL_CARD_ACCENT, secondary: TOUCHLINE_NEUTRAL_CARD_SECONDARY };
  const tierDisplayName = tier
    ? touchlineCardTierName(tier.key, locale)
    : null;
  const accent = tierPalette.accent;
  const secondaryAccent = tierPalette.secondary;
  const pageStyle = {
    "--player-accent": accent,
    "--player-accent-secondary": secondaryAccent,
  } as CSSProperties;
  const marketHref = touchlineArenaContractHref({
    locale,
    playerId: exactPlayer.sportmonksPlayerId || card.id,
    playerName: card.name,
    clubId: club?.teamId,
  });
  const socialCardVisual = (ariaLabel: string) => editorialCard ? (
    <TouchlineCardZoom
      ariaLabel={ariaLabel}
      contractHref={hasActiveContractOffer ? marketHref : undefined}
      contractLabel={locale === "pt-BR" ? "Contratar" : "Contract player"}
      contractValue={hasActiveContractOffer ? displayedPriceText ?? undefined : undefined}
      contractTermLabel={hasActiveContractOffer ? (locale === "pt-BR" ? "Contrato · 1 temporada" : "Contract · 1 season") : undefined}
      tierAccent={tierPalette.accent}
      tierLabel={tierDisplayName ?? undefined}
      details={buildTouchlinePlayerCardZoomDetails({
        locale,
        name: card.name,
        clubName: card.clubName,
        position: displayPosition,
        nationality: displayNationality,
        editorialCard,
        cardReview: exactPlayer.cardReview,
        profileHref,
        cardEngineHref: currentUser && isOwnerEmail(currentUser.email)
          ? touchlineCardEnginePlayerHref(canonicalPlayerId, locale)
          : null,
        eyebrow: isPortuguese ? "Perfil oficial do atleta" : "Official player profile",
        extraFields: [
          {
            label: isPortuguese ? "Nota da última partida" : "Last match rating",
            value: exactPlayer.matchRating === null ? "—" : String(exactPlayer.matchRating),
            accent: true,
            kind: "rating-last",
          },
          {
            label: text.totalRating,
            value: playerStatistics.currentSeason.summary.totalRating === null
              ? "—"
              : String(playerStatistics.currentSeason.summary.totalRating),
            accent: true,
            kind: "rating-total",
          },
          ...buildTouchlineVerifiedMatchFactFields({
            statistics: exactPlayer.matchStats,
            position: exactPlayer.position || card.position,
          }, locale),
          ...zoomMatchHistoryFields,
        ],
      })}
      expandedContent={(
        <TouchlineEliteExactCard
          player={exactPlayer}
          layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
          playerProfileHref={profileHref}
          runtimeLocaleOverride={locale}
          rankingMode={previewTier ? "preview" : "live"}
          staticRenderScale={390 / 430}
          showCardActions
          showProfileAction
          forceNeonActive
        />
      )}
    >
      <TouchlineEliteExactCard
        player={exactPlayer}
        layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
        runtimeLocaleOverride={locale}
        rankingMode={previewTier ? "preview" : "live"}
        staticRenderScale={178 / 430}
        showProfileAction={false}
        showSocialMetrics={false}
        showMatchRating
      />
    </TouchlineCardZoom>
  ) : undefined;
  const playerSocialPosts: TouchlineSocialPost[] = [
    {
      id: `card-status-${card.id}-${tier?.key ?? "unpublished"}`,
      kind: "official",
      title: hasPublishedEditorialCard
        ? (isPortuguese ? "Perfil editorial do card publicado" : "Editorial card profile published")
        : (isPortuguese ? "Perfil do card TouchLine" : "TouchLine card profile"),
      body: isPortuguese
        ? "Tier e preço só aparecem quando a equipa editorial publica este card."
        : "Tier and price appear only when the editorial team publishes this card.",
      meta: "TouchLine",
      accent,
      badge: tierDisplayName ?? `${cumulativeRatingText} ${isPortuguese ? "nota total" : "total rating"}`,
      visual: socialCardVisual(`${isPortuguese ? "Ampliar card atual de" : "Open current card for"} ${card.name}`),
      visualTheme: "market",
      metrics: [
        { label: text.totalRating, value: cumulativeRatingText },
        ...(tierDisplayName ? [{ label: isPortuguese ? "Tier do card" : "Card tier", value: tierDisplayName }] : []),
        ...(displayedPriceText ? [{ label: isPortuguese ? "Preço do card" : "Card price", value: displayedPriceText }] : []),
      ],
    },
    {
      id: `official-profile-${card.id}-${official.status}`,
      kind: "official",
      title: official.player
        ? (isPortuguese ? "Dados oficiais do atleta atualizados" : "Official player data updated")
        : (isPortuguese ? "Sincronização oficial em andamento" : "Official sync in progress"),
      body: official.player
        ? (isPortuguese
            ? `Perfil esportivo verificado para ${official.player?.displayName ?? card.name}. Eventos de partida serão publicados aqui sem revelar qualquer estratégia de ClubOwner.`
            : `Verified football profile for ${official.player?.displayName ?? card.name}. Match events will be published here without revealing any ClubOwner strategy.`)
        : (isPortuguese
            ? "O feed aguardará dados verificados antes de publicar desempenho, lesões ou acontecimentos da partida."
            : "The feed waits for verified data before publishing performance, injuries or match events."),
      meta: officialSyncTime || "TouchLine Data",
      accent,
      badge: `${displayNationality} · ${displayPosition}`,
      visualImageUrl: profileFlagUrl || undefined,
      visualAlt: displayNationality || card.countryCode3,
      visualKicker: isPortuguese ? "Perfil oficial" : "Official profile",
      visualValue: profileCountryCode3,
      visualTheme: "profile",
      metrics: [
        { label: isPortuguese ? "Posição" : "Position", value: displayPosition || "—" },
        { label: isPortuguese ? "País" : "Country", value: profileCountryCode3 },
        { label: isPortuguese ? "Verificação" : "Verification", value: isPortuguese ? "TouchLine Verified" : "Verified by TouchLine" },
      ],
    },
  ];
  if (process.env.NODE_ENV !== "production" && previewTier) {
    playerSocialPosts.unshift(
      {
        id: `simulation-final-whistle-${card.id}`,
        kind: "simulation",
        title: isPortuguese ? `Fim de jogo: grande atuação de ${card.name}` : `Full time: outstanding display from ${card.name}`,
        body: isPortuguese
          ? "Exemplo de publicação automática após o encerramento da partida com a nota TouchLine verificada."
          : "Example of an automatic full-time post with the verified TouchLine rating.",
        meta: isPortuguese ? "Demonstração · após a partida" : "Demo · after the match",
        accent,
        badge: isPortuguese ? "Nota 8,7 · nota total simulada 38,0" : "Rating 8.7 · simulated total rating 38.0",
        visual: socialCardVisual(`${isPortuguese ? "Ampliar card da partida de" : "Open match card for"} ${card.name}`),
        visualTheme: "match",
        metrics: [
          { label: isPortuguese ? "Nota" : "Rating", value: isPortuguese ? "8,7" : "8.7" },
          { label: isPortuguese ? "Minutos" : "Minutes", value: "90" },
          { label: isPortuguese ? "Nota total" : "Total rating", value: "38.0" },
        ],
        baseLikeCount: 11_420,
      },
      {
        id: `simulation-goal-${card.id}`,
        kind: "simulation",
        title: isPortuguese ? `${card.name} marcou para o ${card.clubName}` : `${card.name} scored for ${card.clubName}`,
        body: isPortuguese
          ? "A atualização de gol verificada pela TouchLine gera esta comunicação automaticamente para todos os seguidores do atleta."
          : "The TouchLine Verified goal update generates this communication automatically for every follower of the player.",
        meta: isPortuguese ? "Demonstração · 67 minutos" : "Demo · 67 minutes",
        accent,
        badge: isPortuguese ? "1 gol · nota TouchLine verificada" : "1 goal · verified TouchLine rating",
        visual: socialCardVisual(`${isPortuguese ? "Ampliar card do gol de" : "Open goal card for"} ${card.name}`),
        visualTheme: "goal",
        metrics: [
          { label: isPortuguese ? "Gols" : "Goals", value: "1" },
          { label: isPortuguese ? "Minuto" : "Minute", value: "67'" },
          { label: isPortuguese ? "Nota" : "Rating", value: "8.7" },
        ],
        baseLikeCount: 3_018,
      },
      {
        id: `simulation-tier-${card.id}`,
        kind: "simulation",
        title: isPortuguese ? "A equipa editorial atualizou o tier do card" : "The editorial team updated the card tier",
        body: isPortuguese
          ? "Exemplo visual de uma alteração editorial independente de qualquer valuation."
          : "Visual example of an editorial change independent of any valuation.",
        meta: isPortuguese ? "Demonstração · revisão editorial" : "Demo · editorial review",
        accent,
        badge: `${isPortuguese ? "Categoria atualizada" : "Tier updated"}${tierDisplayName ? ` · ${tierDisplayName}` : ""}`,
        visual: socialCardVisual(`${isPortuguese ? "Ampliar card evoluído de" : "Open upgraded card for"} ${card.name}`),
        visualTheme: "evolution",
        metrics: [
          ...(displayedPriceText ? [{ label: isPortuguese ? "Preço do card" : "Card price", value: displayedPriceText }] : []),
          { label: isPortuguese ? "Evolução" : "Progress", value: isPortuguese ? "Confirmada" : "Confirmed" },
          { label: "Status", value: isPortuguese ? "Evoluiu" : "Upgraded" },
        ],
        baseLikeCount: 2_764,
      },
      {
        id: `simulation-availability-${card.id}`,
        kind: "simulation",
        title: isPortuguese ? "Atualização de disponibilidade do atleta" : "Player availability update",
        body: isPortuguese
          ? "Quando a TouchLine verificar lesão, suspensão ou dúvida para a próxima partida, os seguidores recebem uma atualização como esta."
          : "When TouchLine verifies an injury, suspension or doubt for the next match, followers receive an update like this.",
        meta: isPortuguese ? "Demonstração · alerta esportivo" : "Demo · football alert",
        accent: "#f59e0b",
        badge: isPortuguese ? "Situação simulada · aguardando confirmação" : "Simulated status · awaiting confirmation",
        visualImageUrl: profileFlagUrl || undefined,
        visualAlt: displayNationality || card.countryCode3,
        visualKicker: isPortuguese ? "Disponibilidade" : "Availability",
        visualValue: isPortuguese ? "ATENÇÃO" : "ATTENTION",
        visualTheme: "availability",
        metrics: [
          { label: isPortuguese ? "Situação" : "Status", value: isPortuguese ? "Dúvida" : "Doubt" },
          { label: isPortuguese ? "Fonte" : "Source", value: isPortuguese ? "Oficial" : "Official" },
          { label: isPortuguese ? "Próximo passo" : "Next step", value: isPortuguese ? "Revisão" : "Review" },
        ],
        baseLikeCount: 864,
      },
    );
  }
  return (
    <main className={styles.page} style={pageStyle}>
      <div className={styles.backgroundGlow} aria-hidden="true" />
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <TouchlineGlobalNavigation
            locale={locale}
            currentRoute="playerProfile"
            surface={navigationSurface}
            className={styles.profileQuickNav}
          />
        </div>

        <section className={styles.identityBand}>
          <div className={styles.cardColumn}>
            <div className={styles.cardFrame}>
            <TouchlineEliteExactCard
              player={exactPlayer}
              layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
              playerProfileHref={profileHref}
              runtimeLocaleOverride={locale}
              rankingMode={previewTier ? "preview" : "live"}
              staticRenderScale={372 / 430}
              showCardActions={false}
              showProfileAction={false}
              showSocialMetrics={false}
            />
            </div>
          </div>
          <div className={styles.identity}>
            <p className={styles.eyebrow}>{text.eyebrow}</p>
            <div className={styles.identityHeading}>
              <div>
                <h1>{card.name}</h1>
              </div>
              {club?.logoUrl ? (
                <div className={styles.currentClub}>
                  <span>{text.currentClub}</span>
                  <Link
                    className={styles.identityCrest}
                    href={clubHref ?? "#"}
                    aria-label={`${text.openClub}: ${club.name}`}
                  >
                    <span className={styles.identityCrestLogo}>
                      <img src={club.logoUrl} alt={club.name} />
                    </span>
                    <small>{text.openClub}</small>
                  </Link>
                </div>
              ) : null}
            </div>
            <p className={styles.roleLine}>
              {displayPosition} · {card.clubName} · {card.shirtNumber ? `#${card.shirtNumber}` : "--"}
            </p>

            <div className={styles.socialActions}>
              <TouchlineSocialProfileActions
                entityId={`athlete:${card.id}`}
                entityName={card.name}
                followerCount={playerFollowerCount(card.id)}
                accent={accent}
                locale={locale}
                purchaseHref={hasActiveContractOffer ? marketHref : undefined}
                purchaseLabel={locale === "pt-BR" ? "Contratar jogador" : "Contract player"}
              />
            </div>

            <p className={styles.biography}>
              {official.player
                ? `${official.player?.displayName ?? card.name} · ${displayNationality} · ${displayPosition}`
                : text.syncPending}
            </p>

            <div className={styles.sourceLegend}>
              <span>
                <i className={styles.realDot} />
                {text.officialData}
              </span>
              <span>
                <i className={styles.touchlineDot} />
                {text.touchlineData}
              </span>
            </div>

            <div className={styles.factGrid}>
              {dataFact(
                <Footprints aria-hidden="true" size={19} />,
                text.position,
                displayPosition,
              )}
              {dataFact(
                <CalendarDays aria-hidden="true" size={19} />,
                text.born,
                official.player?.dateOfBirth,
              )}
              {dataFact(
                <Ruler aria-hidden="true" size={19} />,
                text.height,
                measurement(official.player?.height, "cm"),
              )}
              {dataFact(
                <Ruler aria-hidden="true" size={19} />,
                text.weight,
                measurement(official.player?.weight, "kg"),
              )}
              {dataFact(
                <Footprints aria-hidden="true" size={19} />,
                text.foot,
                official.player?.preferredFoot,
              )}
              {dataFact(
                profileFlagUrl ? (
                  <img
                    className={styles.factFlag}
                    src={profileFlagUrl}
                    alt=""
                    width={28}
                    height={21}
                  />
                ) : (
                  <Shield aria-hidden="true" size={19} />
                ),
                text.nationality,
                displayNationality,
              )}
              {dataFact(
                <Shield aria-hidden="true" size={19} />,
                text.contract,
                official.player?.contractUntil,
              )}
            </div>
          </div>
        </section>

        <TouchlineSocialFeed
          entityId={`athlete:${card.id}`}
          entityName={card.name}
          entityImageUrl={club?.logoUrl}
          entityImageAlt={card.clubName}
          entityRole={`${displayPosition} · ${card.clubName}`}
          posts={playerSocialPosts}
          accent={accent}
          locale={locale}
          highlights={[
            ...(tierDisplayName ? [{ label: isPortuguese ? "Tier do card" : "Card tier", value: tierDisplayName }] : []),
            ...(displayedPriceText ? [{ label: isPortuguese ? "Preço do card" : "Card price", value: displayedPriceText }] : []),
            { label: text.totalRating, value: cumulativeRatingText },
            { label: isPortuguese ? "Posição" : "Position", value: displayPosition || "—" },
          ]}
          defaultActionHref={hasActiveContractOffer ? marketHref : undefined}
          defaultActionLabel={hasActiveContractOffer && displayedPriceText ? `${locale === "pt-BR" ? "Contratar jogador" : "Contract player"} · ${displayedPriceText}` : undefined}
        />

        <section className={styles.officialBand} id="official-performance">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>{text.officialData}</p>
              <h2>{text.performance}</h2>
              <p className={styles.sectionIntro}>{text.performanceCopy}</p>
            </div>
            <BarChart3 aria-hidden="true" size={30} />
          </div>

          <div className={styles.syncLine}>
            <div className={styles.syncSource}>
              <span><i />{text.providerVerified}</span>
              {playerStatistics.previousCompletedSeason.latestSyncAt
                ? <time dateTime={playerStatistics.previousCompletedSeason.latestSyncAt}>{text.updatedAt} {formatOfficialSyncTime(playerStatistics.previousCompletedSeason.latestSyncAt, locale)}</time>
                : null}
            </div>
            <div className={styles.syncSeason}>
              <em>{text.latestSeason}</em>
              <strong>{playerStatistics.previousCompletedSeason.seasonName ?? text.verifiedSeason}</strong>
            </div>
          </div>
          <div className={styles.officialGroups}>
            <SeasonStatisticsPanel title={text.latestSeason} statistics={playerStatistics.previousCompletedSeason} text={text} />
            <SeasonStatisticsPanel title={text.currentSeason} statistics={playerStatistics.currentSeason} text={text} />
          </div>
          <FixtureStatisticsPanel
            model={playerStatistics}
            text={text}
            matchStats={exactPlayer.matchStats}
            position={cardFactPosition}
            locale={locale}
          />
          <p className={styles.providerNote}>{text.fullStats}</p>
        </section>

        <section className={styles.dataBand}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>{text.touchlineData}</p>
              <h2>{text.touchlineCard}</h2>
            </div>
            <Sparkles aria-hidden="true" size={28} />
          </div>

          <div className={styles.metrics}>
            <div>
              <small>{text.points}</small>
              <strong>{cumulativeRatingText}</strong>
            </div>
            <div>
              <small>{text.rank}</small>
              <strong>
                {competition.positionRank ? `#${competition.positionRank}` : text.rankPending}
              </strong>
            </div>
            <div>
              <small>{text.rankGroup}</small>
              <strong>{rankingGroupLabel}</strong>
            </div>
            {tierDisplayName ? (
              <div>
                <small>{text.frame}</small>
                <strong>{tierDisplayName}</strong>
              </div>
            ) : null}
            {displayedPriceText ? (
              <div>
                <small>{text.price}</small>
                <strong>{displayedPriceText}</strong>
              </div>
            ) : null}
          </div>

          <div className={styles.statusGrid}>
            <article>
              <Trophy aria-hidden="true" size={24} />
              <div>
                <h3>{text.season}</h3>
                <p>{text.seasonCopy}</p>
              </div>
            </article>
            <article>
              <Shield aria-hidden="true" size={24} />
              <div>
                <h3>{text.current}</h3>
                <p>{text.currentCopy}</p>
              </div>
            </article>
          </div>

        </section>

        <section className={styles.careerBand}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>{text.officialData}</p>
              <h2>{text.career}</h2>
            </div>
          </div>

          {official.transfers.length ? (
            <ol className={styles.timeline}>
              {official.transfers.map((transfer) => (
                <li key={transfer.id}>
                  <span className={styles.timelineMarker} aria-hidden="true" />
                  <small>{formatTransferDate(transfer.date, locale)}</small>
                  <div className={styles.transferJourney}>
                    <span>
                      <em>{text.fromClub}</em>
                      <strong>{transfer.fromTeamName ?? "--"}</strong>
                    </span>
                    <ArrowRight aria-hidden="true" size={14} />
                    <span>
                      <em>{text.toClub}</em>
                      <strong>{transfer.toTeamName ?? "--"}</strong>
                    </span>
                  </div>
                  {transfer.type ? (
                    <span className={styles.transferType}>
                      {localizedTransferType(transfer.type, locale)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyState}>{text.awaiting}</p>
          )}
        </section>
      </div>
    </main>
  );
}
