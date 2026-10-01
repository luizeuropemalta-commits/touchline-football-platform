"use client";

import Image from "next/image";
import { touchlineCoachRankingGem } from "@/lib/touchlineArena/coach-ranking-gems";
import { type CSSProperties } from "react";
import {
  Crown,
  Trophy,
} from "lucide-react";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineCoachCardZoom from "@/components/touchline/cards/TouchlineCoachCardZoom";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
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
import { touchlineCoachRankingClubLogo } from "@/lib/touchlineArena/coach-ranking-club";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";
import type { TouchlineRankingsHighlights } from "@/lib/touchlineArena/rankings-highlight-projection";
import { touchlineTopElevenBroadcastPoint } from "@/lib/touchlineArena/top-eleven-broadcast-layout";
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
  locale: TouchLineLocale;
  navigationSurface: TouchlineGlobalNavigationSurface;
  rankMode: string;
  highlights: TouchlineRankingsHighlights;
  totalPublishedCards: number | null;
  totalRankedCards: number | null;
  touchLineEnglandTable: TouchLineClubOwnerStanding[];
};

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

export default function TouchLineTablesClient({ canEditCardEngine, copy, locale, highlights }: Pick<TouchLineTablesClientProps, "canEditCardEngine" | "copy" | "locale" | "highlights">) {
  const isPortuguese = locale === "pt-BR";
  const { gameweekBest } = highlights;
  const selection = gameweekBest.phase === "ready" ? gameweekBest.slots : null;
  return (<div className={styles.bestXiPanel}>
            <div className={styles.sectionHeading}>
              <div>
                <p>{copy.touchLineXi}</p>
                <h2>{copy.seasonSelection}</h2>
              </div>
              <span>{copy.seasonSelectionRule}</span>
            </div>

            {selection ? <><TouchlinePitchSurface className={styles.pitch} ariaLabel={copy.seasonSelection} surfaceVariant="premium-stadium">
              {selection.map(({ slot, card }) => {
                const point = touchlineTopElevenBroadcastPoint(slot);
                // An unknown role must not be projected onto a live card and
                // overlap a published player. The immutable selection itself
                // remains available to the rest of the page.
                if (!point) return null;
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
                    </div>
                  </article>
                );
              })}
            </TouchlinePitchSurface>
            <p className={styles.pitchHint}>
              {copy.seasonSelectionHint}
            </p>
            </> : <><div className={`${styles.pitch} ${styles.selectionPending}`} role="status"><strong>{copy.seasonSelectionPending}</strong><p>{gameweekBest.phase === "unavailable" && gameweekBest.reason === "incomplete-card-catalogue"
              ? (isPortuguese ? "A seleção publicada ainda não resolve os 11 cards canônicos; nenhum card parcial é exibido." : "The published selection does not yet resolve all 11 canonical cards; no partial XI is shown.")
              : copy.seasonSelectionPendingDescription}</p></div><p className={styles.pitchHint}>{copy.seasonSelectionHint}</p></>}
          </div>);
}

export function TouchlineRankingsHero({ copy, rankMode, totalPublishedCards, totalRankedCards }: Pick<TouchLineTablesClientProps, "copy" | "rankMode" | "totalPublishedCards" | "totalRankedCards">) {
 return (      <section className={styles.hero}>
        <div>
          <p>TouchLine Cards League</p>
          <h1>{copy.tablesTitle}</h1>
          <span>{copy.tablesDescription}</span>
        </div>
        <dl className={styles.summary}>
          <div><dt>{copy.publishedCards}</dt><dd>{totalPublishedCards ?? "—"}</dd></div>
          <div><dt>{copy.rankedCards}</dt><dd>{totalRankedCards ?? "—"}</dd></div>
          <div><dt>{copy.rankMode}</dt><dd>{rankMode}</dd></div>
        </dl>
      </section>);
}

export function TouchlineFeaturedCoach({ coachRanking, copy, locale }: Pick<TouchLineTablesClientProps, "coachRanking" | "copy" | "locale">) {
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
  const topCoachCompetition = topCoachRow
    && coachRanking.snapshotId
    && coachRanking.seasonId
    && coachRanking.scoringVersion
    ? {
        snapshotId: coachRanking.snapshotId,
        seasonId: coachRanking.seasonId,
        seasonLabel: isPortuguese ? "Temporada atual" : "Current season",
        rank: topCoachRow.rank,
        scoringVersion: coachRanking.scoringVersion,
        home: topCoachRow.home,
        away: topCoachRow.away,
        totalTouchlinePoints: topCoachRow.touchlinePoints,
      }
    : null;

 return (          <aside className={styles.topCoachPanel} data-top-coach-card aria-labelledby="top-coach-title"
            data-coach-tier-frame={topCoachSlot?.cardTier ?? "unresolved"}
            style={{ "--tier-accent": topCoachSlot ? touchlineCardTierPalette(topCoachSlot.cardTier).accent : undefined } as CSSProperties}>
            <TouchlineClubPerimeterTrace accent={topCoachSlot ? touchlineCardTierPalette(topCoachSlot.cardTier).accent : undefined} />
            <header>
              <span><Crown aria-hidden="true" /> {isPortuguese ? "TREINADOR Nº 1" : "NO. 1 COACH"}</span>
              <h2 id="top-coach-title">{isPortuguese ? "Melhor treinador" : "Best coach"}</h2>
              <p>{isPortuguese ? "Líder atual pelos resultados oficiais da temporada." : "Current leader from official season results."}</p>
            </header>
            {topCoachIdentity && topCoachClub && topCoachSlot && topCoachRow ? (
              <div className={styles.topCoachBody}>
                <div
                  className={styles.topCoachCardLink}
                >
                  <TouchlineCoachCardZoom
                    cardClassName={styles.topCoachCard}
                    coach={topCoachIdentity.coach}
                    slot={topCoachSlot}
                    clubName={topCoachClub.name}
                    clubLogoUrl={topCoachClub.logoUrl}
                    clubAccent={topCoachClub.accent}
                    countryCode3={topCoachIdentity.countryCode3}
                    locale={locale}
                    contract={null}
                    competition={topCoachCompetition}
                    profileHref={`/touchline-coaches/${encodeURIComponent(topCoachRow.coachProviderId)}?lang=${encodeURIComponent(locale)}`}
                    assetLoading="eager"
                    frameLoading="eager"
                    frameFetchPriority="high"
                    publishedTouchlinePoints={topCoachRow.touchlinePoints}
                    showLeadershipCrown={topCoachRow.rank === 1}
                  />
                </div>
                <div className={styles.topCoachIdentity}>
                  <span>{isPortuguese ? "LÍDER DA TEMPORADA" : "SEASON LEADER"}</span>
                  <strong>{topCoachRow.coachName}</strong>
                  <small>{topCoachRow.clubName}</small>
                  <b>{topCoachRow.touchlinePoints} {copy.pointsShort}</b>
                </div>
              </div>
            ) : <RankingPending copy={copy} />}
          </aside>);
}

export function TouchlineCoachRankingTable({ coachRanking, copy, locale }: Pick<TouchLineTablesClientProps, "coachRanking" | "copy" | "locale">) {
  const isPortuguese = locale === "pt-BR";
  const topSevenCoaches = coachRanking.phase === "ranked" ? coachRanking.rows.slice(0, 7) : [];
  return (
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
            {topSevenCoaches.map((coach) => {
              const coachClubLogoUrl = touchlineCoachRankingClubLogo(coach.coachProviderId, coach.clubName);
              return (
              <li key={coach.coachProviderId} data-coach-rank={coach.rank}>
                <b>{String(coach.rank).padStart(2, "0")}</b>
                <div className={styles.coachRankGem} aria-hidden="true">
                  {touchlineCoachRankingGem(coach.rank) ? <Image
                    src={touchlineCoachRankingGem(coach.rank)!}
                    alt="" width={44} height={44} unoptimized
                  /> : null}
                </div>
                <div className={styles.rowIdentity}>
                  <strong>{coach.coachName}</strong>
                  <span className={styles.coachClubIdentity}>
                    {coachClubLogoUrl ? <Image src={coachClubLogoUrl} alt="" width={22} height={22} unoptimized /> : null}
                    <span>{coach.clubName}</span>
                  </span>
                </div>
                <dl className={styles.coachRecord}>
                  <div><dt><abbr title={isPortuguese ? "Vitórias" : "Wins"} aria-label={isPortuguese ? "Vitórias" : "Wins"}>{isPortuguese ? "V" : "W"}</abbr></dt><dd>{coach.wins}</dd></div>
                  <div><dt><abbr title={isPortuguese ? "Empates" : "Draws"} aria-label={isPortuguese ? "Empates" : "Draws"}>{isPortuguese ? "E" : "D"}</abbr></dt><dd>{coach.draws}</dd></div>
                  <div><dt><abbr title={isPortuguese ? "Derrotas" : "Losses"} aria-label={isPortuguese ? "Derrotas" : "Losses"}>{isPortuguese ? "D" : "L"}</abbr></dt><dd>{coach.losses}</dd></div>
                </dl>
                <div className={styles.pointsValue}><strong>{coach.touchlinePoints}</strong><span>{copy.pointsShort}</span></div>
              </li>
              );
            })}
          </ol> : <RankingPending copy={copy} />}
        </aside>
  );
}

function PodiumHeading({ locale }: { locale: TouchLineLocale }) {
  const isPortuguese = locale === "pt-BR";
  return <div className={styles.sectionHeading}>
            <div>
              <p>{isPortuguese ? "PÓDIO GERAL" : "OVERALL PODIUM"}</p>
              <h2>{isPortuguese ? "Top 3 Cards da Temporada" : "Season Top 3 Cards"}</h2>
            </div>
            <span>{isPortuguese ? "Os três maiores Ratings acumulados, atualizados automaticamente." : "The three highest accumulated Ratings, updated automatically."}</span>
          </div>;
}

/** Only layout geometry: no sporting identities, ranks, tiers or scores. */
function PodiumEnvelope() {
  return <div className={styles.playerPodium} aria-hidden="true">
    {[0, 1, 2].map(slot => <div className={styles.podiumPlaceholder} key={slot}>
      <div className={styles.podiumCard}><div className={styles.podiumCardPlaceholder} /></div>
      <div className={styles.podiumIdentity}><strong>&nbsp;</strong><span>&nbsp;</span></div>
    </div>)}
  </div>;
}

export function TouchlineRankingPodiumPending({ locale }: { locale: TouchLineLocale }) {
  return <div className={styles.podiumPanel} aria-busy="true">
    <PodiumHeading locale={locale} />
    <div className={styles.podiumReserve}><PodiumEnvelope /><p className={styles.podiumLoading} role="status">{locale === "pt-BR" ? "Carregando classificações…" : "Loading rankings…"}</p></div>
  </div>;
}

export function TouchlineRankingPodium({ highlights, copy, locale, canEditCardEngine }: Pick<TouchLineTablesClientProps, "highlights" | "copy" | "locale" | "canEditCardEngine">) {
  const { topPlayerCards } = highlights;
  return (
        <div className={styles.podiumPanel} id="top-player-cards">
          <PodiumHeading locale={locale} />
          {topPlayerCards.length ? (
            <ol className={styles.playerPodium}>
              {topPlayerCards.map((card, index) => {
                const tierKey = card.editorialCard?.tierKey;
                const palette = tierKey ? touchlineCardTierPalette(tierKey) : null;
                return (
                <li key={card.canonicalPlayerId} data-player-podium-rank={index + 1}
                  style={{ "--tier-accent": palette?.accent } as CSSProperties}>
                  <TouchlineClubPerimeterTrace accent={palette?.accent} />
                  <span className={styles.podiumRank}>{String(index + 1).padStart(2, "0")}</span>
                  <div className={styles.podiumCard}>
                    <TablePlayerCardZoom card={card} locale={locale} canEditCardEngine={canEditCardEngine} />
                  </div>
                  <div className={styles.podiumIdentity}>
                    <strong>{card.shortName}</strong>
                    <span>{card.clubName} · {card.position}</span>
                  </div>
                </li>
                );
              })}
            </ol>
          ) : <div className={styles.podiumReserve}><PodiumEnvelope /><RankingPending copy={copy} /></div>}
        </div>
  );
}

export function TouchlineRankingEnding({ copy, locale, touchLineEnglandTable }: Pick<TouchLineTablesClientProps, "copy" | "locale" | "touchLineEnglandTable">) {
  const isPortuguese = locale === "pt-BR";
  return (<>
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
                <span className={styles.rowEnd} />
              </li>
            ))}
          </ol> : <RankingPending copy={copy} />}
        </div>
      </section>

      <footer className={styles.footer}>
        <Trophy aria-hidden="true" size={19} />
        <span>{copy.connectedDescription}</span>
      </footer>
  </>);
}
