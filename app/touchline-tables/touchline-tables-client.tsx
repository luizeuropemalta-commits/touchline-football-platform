"use client";

import Image from "next/image";
import Link from "next/link";
import { type CSSProperties } from "react";
import {
  ChevronRight,
  Crown,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import {
  touchlineCardTierName,
  touchlineCardTierPalette,
} from "@/lib/touchlineArena/card-rules";
import {
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import type { TouchlineGlobalNavigationSurface } from "@/lib/touchlineArena/global-navigation";
import {
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  TOUCHLINE_ENGLAND_CLUBS,
  squadCardToExactPlayer,
  type ClubOwnerSquadCard,
  type TouchLineClubOwnerStanding,
} from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";
import type { TouchlinePublishedTopEleven } from "@/lib/touchlineArena/published-top-eleven";
import { compareTouchLineRankedCards } from "@/lib/touchlineArena/ranked-card-catalog";
import type { TouchLineCoachRankingState } from "@/lib/touchlineArena/coach-ranking-server";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import {
  touchlineCoachClassificationForProviderId,
  touchlineLiveCoachForProviderId,
} from "@/lib/touchlineArena/live-coaches";
import type { getTouchLineRankingsCopy } from "@/lib/touchlineArena/rankings-i18n";
import styles from "./touchline-tables.module.css";

type RankingsCopy = ReturnType<typeof getTouchLineRankingsCopy>;

type TouchLineTablesClientProps = {
  canEditCardEngine: boolean;
  coachRanking: TouchLineCoachRankingState;
  copy: RankingsCopy;
  currentProviderRoundName: string | null;
  locale: TouchLineLocale;
  navigationSurface: TouchlineGlobalNavigationSurface;
  rankMode: string;
  publishedTopEleven: TouchlinePublishedTopEleven | null;
  rosterCards: ClubOwnerSquadCard[];
  totalCards: number;
  totalClubOwners: number;
  touchLineEnglandTable: TouchLineClubOwnerStanding[];
};

function projectedPitchPoint(x: number, y: number) {
  return {
    // Keep the broadcast card area safely inside the canonical pitch markings.
    x: 11 + (1 - y / 100) * 78,
    y: 11 + (x / 100) * 78,
  };
}

function OwnerAvatar({ owner }: { owner: TouchLineClubOwnerStanding }) {
  if (owner.avatarUrl) {
    return <Image src={owner.avatarUrl} alt="" width={54} height={54} unoptimized />;
  }
  return <span aria-hidden="true">{owner.name.slice(0, 2)}</span>;
}

function RankingPending({ copy }: { copy: RankingsCopy }) {
  return (
    <div className={styles.rankingPending} role="status">
      <strong>{copy.rankingPending}</strong>
      <p>{copy.rankingPendingDescription}</p>
    </div>
  );
}

function CompactPlayerCard({
  card,
  locale,
  expanded = false,
}: {
  card: ClubOwnerSquadCard;
  locale: string;
  expanded?: boolean;
}) {
  return (
    <TouchlineEliteExactCard
      className={expanded ? styles.expandedRenderedCard : styles.pitchRenderedCard}
      player={squadCardToExactPlayer(card, { useSuppliedTier: true })}
      labels={{
        nationality: locale === "pt-BR" ? "País" : "Nat",
        totalRating: locale === "pt-BR" ? "Nota total" : "Total rating",
        cardPrice: locale === "pt-BR" ? "Preço do card" : "Card price",
        currentClub: locale === "pt-BR" ? "Clube atual" : "Current Club",
      }}
      layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
      imageLoading={expanded ? "eager" : "lazy"}
      rankingMode="preview"
      showCardActions={expanded}
      showProfileAction={false}
      showSocialMetrics={expanded}
    />
  );
}

function TablePlayerCardZoom({
  card,
  locale,
  canEditCardEngine,
}: {
  card: ClubOwnerSquadCard;
  locale: string;
  canEditCardEngine: boolean;
}) {
  const player = squadCardToExactPlayer(card, { useSuppliedTier: true });
  const tierKey = card.editorialCard?.tierKey ?? null;
  const isPortuguese = locale === "pt-BR";
  const profileHref = touchlinePlayerProfileHref(player, locale);

  return (
    <TouchlineCardZoom
      ariaLabel={`${isPortuguese ? "Ampliar card de" : "Open card for"} ${card.name}`}
      tierAccent={tierKey ? touchlineCardTierPalette(tierKey).accent : "#b8ff46"}
      tierLabel={tierKey ? touchlineCardTierName(tierKey, locale) : undefined}
      details={buildTouchlinePlayerCardZoomDetails({
        locale,
        name: card.name,
        clubName: card.clubName,
        position: card.position,
        nationality: card.countryCode3,
        editorialCard: card.editorialCard,
        cardReview: card.cardReview,
        profileHref,
        cardEngineHref: canEditCardEngine
          ? touchlineCardEnginePlayerHref(card.canonicalPlayerId, locale)
          : null,
        extraFields: [
          {
            label: isPortuguese ? "Nota total" : "Total rating",
            value: card.seasonTotalRating == null ? "—" : String(card.seasonTotalRating),
            accent: true,
            primary: true,
          },
          {
            label: isPortuguese ? "Nota da última partida" : "Last match rating",
            value: card.matchRating == null ? "—" : String(card.matchRating),
            accent: true,
            kind: "rating-last",
          },
          ...buildTouchlineVerifiedMatchFactFields({
            statistics: card.matchStats,
            position: card.position,
          }, locale),
        ],
      })}
      expandedContent={<CompactPlayerCard card={card} locale={locale} expanded />}
    >
      <CompactPlayerCard card={card} locale={locale} />
    </TouchlineCardZoom>
  );
}

export default function TouchLineTablesClient({
  canEditCardEngine,
  coachRanking,
  copy,
  currentProviderRoundName,
  locale,
  navigationSurface,
  rankMode,
  publishedTopEleven,
  rosterCards,
  totalCards,
  totalClubOwners,
  touchLineEnglandTable,
}: TouchLineTablesClientProps) {
  const selection = publishedTopEleven?.slots ?? null;
  const publishedRosterCards = rosterCards.filter((card) => Boolean(card.editorialCard));
  const topPlayerCards = publishedRosterCards
    .filter((card) => card.seasonTotalRating != null)
    .sort(compareTouchLineRankedCards)
    .slice(0, 3);
  const topSevenCoaches = coachRanking.phase === "ranked" ? coachRanking.rows.slice(0, 7) : [];
  const topCoachRow = topSevenCoaches[0] ?? null;
  const topCoachIdentity = topCoachRow
    ? touchlineLiveCoachForProviderId(topCoachRow.coachProviderId)
    : null;
  const topCoachClub = topCoachIdentity
    ? TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === topCoachIdentity.coach.teamId) ?? null
    : null;
  const topCoachClassification = topCoachRow
    ? touchlineCoachClassificationForProviderId(topCoachRow.coachProviderId)
    : null;
  const topCoachSlot = topCoachIdentity && topCoachRow ? {
    ...createTouchlineArenaCoachSlot(topCoachIdentity.coach, null, topCoachClassification?.tierKey),
    touchlinePoints: topCoachRow.touchlinePoints,
    status: "audited" as const,
    scoreEvidence: {
      provider: "sportmonks" as const,
      providerEventIds: [...coachRanking.fixtureIds],
      scoringVersion: coachRanking.scoringVersion ?? "coach_scoring_v2",
    },
  } : null;
  const isPortuguese = locale === "pt-BR";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <TouchlineGlobalNavigation
          locale={locale}
          currentRoute="rankings"
          surface={navigationSurface}
          className={styles.globalNavigation}
        />
        <span className={styles.status}>
          <ShieldCheck aria-hidden="true" size={18} />
          {currentProviderRoundName
            ? `${isPortuguese ? "Rodada" : "Matchweek"} ${currentProviderRoundName}`
            : isPortuguese ? "Rodada aguardando provider" : "Matchweek awaiting provider"}
        </span>
      </header>

      <section className={styles.hero}>
        <div>
          <p>{isPortuguese ? "TouchLine Cards League" : "TouchLine Cards League"}</p>
          <h1>{copy.tablesTitle}</h1>
          <span>{copy.tablesDescription}</span>
        </div>
        <dl className={styles.summary}>
          <div><dt>{copy.clubOwners}</dt><dd>{totalClubOwners}</dd></div>
          <div><dt>{copy.cardsTracked}</dt><dd>{totalCards}</dd></div>
          <div><dt>{copy.rankMode}</dt><dd>{rankMode}</dd></div>
        </dl>
      </section>

      <section className={styles.selectionSection} id="best-xi">
        <div className={styles.rankStage}>
          <div className={styles.bestXiPanel}>
            <div className={styles.sectionHeading}>
              <div>
                <p>{copy.touchLineXi}</p>
                <h2>{copy.seasonSelection}</h2>
              </div>
              <span>{copy.seasonSelectionRule}</span>
            </div>

            {selection ? <><TouchlinePitchSurface className={styles.pitch} ariaLabel={copy.seasonSelection}>
              {selection.map((slot) => {
                const card = publishedRosterCards.find((item) => slot.playerIds.includes(item.id));
                if (!card) return null;
                const point = projectedPitchPoint(slot.x, slot.y);
                return (
                  <article
                    key={slot.id}
                    className={styles.pitchPlayer}
                    data-best-eleven-player={card.canonicalPlayerId}
                    data-best-eleven-position={slot.label}
                    style={{ left: `${point.x}%`, top: `${point.y}%` } as CSSProperties}
                  >
                    <span className={styles.positionLabel}>{slot.label}</span>
                    <div className={styles.cardButton}>
                      <TablePlayerCardZoom card={card} locale={locale} canEditCardEngine={canEditCardEngine} />
                    </div>
                    <div className={styles.pitchIdentity}>
                      <strong>{card.shortName}</strong>
                      <span>{card.seasonTotalRating?.toFixed(2) ?? "—"}</span>
                    </div>
                  </article>
                );
              })}
            </TouchlinePitchSurface>
            <p className={styles.pitchHint}>
              {isPortuguese
                ? "Toque em um card para ampliar. Cada vaga muda automaticamente quando outro jogador da mesma posição assume a maior Nota TouchLine acumulada."
                : "Tap a card to enlarge it. Each slot updates automatically when another player in the same position takes the highest accumulated TouchLine Rating."}
            </p></> : <div className={styles.selectionPending} role="status"><strong>{copy.seasonSelectionPending}</strong><p>{copy.seasonSelectionPendingDescription}</p></div>}
          </div>
          <aside className={styles.topCoachPanel} data-top-coach-card aria-labelledby="top-coach-title">
            <header>
              <span><Crown aria-hidden="true" /> {isPortuguese ? "TREINADOR Nº 1" : "NO. 1 COACH"}</span>
              <h2 id="top-coach-title">{isPortuguese ? "Melhor treinador" : "Best coach"}</h2>
              <p>{isPortuguese ? "Líder atual pelos resultados oficiais da temporada." : "Current leader from official season results."}</p>
            </header>
            {topCoachIdentity && topCoachClub && topCoachSlot && topCoachRow ? (
              <div className={styles.topCoachBody}>
                <Link
                  className={styles.topCoachCardLink}
                  href={`/touchline-coaches/${encodeURIComponent(topCoachRow.coachProviderId)}?lang=${encodeURIComponent(locale)}`}
                  aria-label={`${isPortuguese ? "Abrir card de" : "Open card for"} ${topCoachRow.coachName}`}
                >
                  <TouchlineCoachCard
                    className={styles.topCoachCard}
                    coach={topCoachIdentity.coach}
                    slot={topCoachSlot}
                    clubName={topCoachClub.name}
                    clubLogoUrl={topCoachClub.logoUrl}
                    clubAccent={topCoachClub.accent}
                    countryCode3={topCoachIdentity.countryCode3}
                    locale={locale}
                    displayMode="compact"
                    optimizeForLiveCompact
                    assetLoading="eager"
                    frameLoading="eager"
                    frameFetchPriority="high"
                  />
                </Link>
                <div className={styles.topCoachIdentity}>
                  <span>{isPortuguese ? "LÍDER DA TEMPORADA" : "SEASON LEADER"}</span>
                  <strong>{topCoachRow.coachName}</strong>
                  <small>{topCoachRow.clubName}</small>
                  <b>{topCoachRow.touchlinePoints} {copy.pointsShort}</b>
                </div>
              </div>
            ) : <RankingPending copy={copy} />}
          </aside>
        </div>
      </section>

      <section className={styles.rankingHighlights} aria-label={isPortuguese ? "Destaques da temporada" : "Season highlights"}>
        <div className={styles.podiumPanel} id="top-player-cards">
          <div className={styles.sectionHeading}>
            <div>
              <p>{isPortuguese ? "PÓDIO GERAL" : "OVERALL PODIUM"}</p>
              <h2>{isPortuguese ? "Top 3 Cards da Temporada" : "Season Top 3 Cards"}</h2>
            </div>
            <span>{isPortuguese ? "Os três maiores Ratings acumulados, atualizados automaticamente." : "The three highest accumulated Ratings, updated automatically."}</span>
          </div>
          {topPlayerCards.length ? (
            <ol className={styles.playerPodium}>
              {topPlayerCards.map((card, index) => (
                <li key={card.canonicalPlayerId} data-player-podium-rank={index + 1}>
                  <span className={styles.podiumRank}>{String(index + 1).padStart(2, "0")}</span>
                  <div className={styles.podiumCard}>
                    <TablePlayerCardZoom card={card} locale={locale} canEditCardEngine={canEditCardEngine} />
                  </div>
                  <div className={styles.podiumIdentity}>
                    <strong>{card.shortName}</strong>
                    <span>{card.clubName} · {card.position}</span>
                    <b>{card.seasonTotalRating?.toFixed(2) ?? "—"}</b>
                  </div>
                </li>
              ))}
            </ol>
          ) : <RankingPending copy={copy} />}
        </div>

        <aside className={styles.coachRankingPanel} id="coach-rankings" aria-labelledby="coach-ranking-title">
          <header>
            <span><Crown aria-hidden="true" /> {isPortuguese ? "RANKING DA TEMPORADA" : "SEASON RANKING"}</span>
            <h2 id="coach-ranking-title">{isPortuguese ? "Melhores treinadores" : "Best coaches"}</h2>
            <p>{isPortuguese ? "Top 7 pelos pontos canônicos. Empates seguem vitórias, vitórias fora e identidade canônica." : "Top 7 by canonical points. Ties use wins, away wins and canonical identity."}</p>
          </header>
          {topSevenCoaches.length ? <ol
            className={styles.coachList}
            data-coach-scoring-version={coachRanking.scoringVersion ?? undefined}
            tabIndex={0}
            aria-label={isPortuguese ? "Classificação dos treinadores" : "Coach standings"}
          >
            {topSevenCoaches.map((coach) => (
              <li key={coach.coachProviderId} data-coach-rank={coach.rank}>
                <b>{String(coach.rank).padStart(2, "0")}</b>
                <div className={styles.coachMonogram}><span aria-hidden="true">{coach.coachName.slice(0, 2)}</span></div>
                <div className={styles.rowIdentity}><strong>{coach.coachName}</strong><span>{coach.clubName} · {coach.wins}W {coach.draws}D {coach.losses}L</span></div>
                <div className={styles.pointsValue}><strong>{coach.touchlinePoints}</strong><span>{copy.pointsShort}</span></div>
              </li>
            ))}
          </ol> : <RankingPending copy={copy} />}
        </aside>
      </section>

      <section className={styles.clubOwnerSection} id="club-owner-table">
        <div className={styles.sectionHeading}>
          <div>
            <p>{copy.englandTable}</p>
            <h2>{copy.ownerLeagueTable}</h2>
          </div>
          <span>{copy.ownerLeagueRule}</span>
        </div>
        <div className={styles.clubOwnerTableShell}>
          <div className={styles.clubOwnerTableHeader}>
            <span>{isPortuguese ? "POS" : "POS"}</span>
            <span>CLUBOWNER</span>
            <span>{isPortuguese ? "CLUBE" : "CLUB"}</span>
            <span>{isPortuguese ? "PONTOS" : "POINTS"}</span>
          </div>
          {touchLineEnglandTable.length ? <ol className={styles.ownerTableList}>
            {touchLineEnglandTable.map((owner, index) => (
              <li key={owner.id}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div className={styles.ownerAvatar}><OwnerAvatar owner={owner} /></div>
                <div className={styles.rowIdentity}><strong>{owner.name}</strong><span>{owner.clubName}</span></div>
                <div className={styles.pointsValue}><strong>{owner.touchlinePoints}</strong><span>{copy.pointsShort}</span></div>
                {owner.profileHref ? <Link href={`${owner.profileHref}?lang=${encodeURIComponent(locale)}`} aria-label={`${isPortuguese ? "Abrir perfil de" : "Open profile for"} ${owner.name}`}><ChevronRight aria-hidden="true" /></Link> : <span className={styles.rowEnd} />}
              </li>
            ))}
          </ol> : <RankingPending copy={copy} />}
        </div>
      </section>

      <footer className={styles.footer}>
        <Trophy aria-hidden="true" size={19} />
        <span>{copy.connectedDescription}</span>
      </footer>
    </main>
  );
}
