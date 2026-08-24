"use client";

import Image from "next/image";
import Link from "next/link";
import { type CSSProperties } from "react";
import {
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
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
import {
  formatTouchlineCommercialCardTotal,
} from "@/lib/touchlineArena/commercial-card-pricing";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import type { TouchlineGlobalNavigationSurface } from "@/lib/touchlineArena/global-navigation";
import {
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  squadCardToExactPlayer,
  type ClubOwnerSquadCard,
  type TouchLineClubOwnerStanding,
} from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";
import type { TouchlinePublishedTopEleven } from "@/lib/touchlineArena/published-top-eleven";
import type { TouchLineCoachRankingState } from "@/lib/touchlineArena/coach-ranking-server";
import type { getTouchLineRankingsCopy } from "@/lib/touchlineArena/rankings-i18n";
import styles from "./touchline-tables.module.css";

type RankingsCopy = ReturnType<typeof getTouchLineRankingsCopy>;

type TouchLineTablesClientProps = {
  canEditCardEngine: boolean;
  cardClubOwnerRank: TouchLineClubOwnerStanding[];
  cardPlayerRank: ClubOwnerSquadCard[];
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
  totalOwnerValue: string;
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
            label: isPortuguese ? "Nota da partida" : "Match rating",
            value: card.matchRating == null ? "—" : String(card.matchRating),
            accent: true,
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
  cardClubOwnerRank,
  cardPlayerRank,
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
  totalOwnerValue,
  touchLineEnglandTable,
}: TouchLineTablesClientProps) {
  const selection = publishedTopEleven?.slots ?? null;
  const publishedRosterCards = rosterCards.filter((card) => Boolean(card.editorialCard));
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
          <div><dt>{copy.totalValue}</dt><dd>{totalOwnerValue}</dd></div>
        </dl>
      </section>

      <section className={styles.selectionSection} id="best-xi">
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
                style={{ left: `${point.x}%`, top: `${point.y}%` } as CSSProperties}
              >
                <span className={styles.positionLabel}>{slot.label}</span>
                <div className={styles.cardButton}>
                  <TablePlayerCardZoom card={card} locale={locale} canEditCardEngine={canEditCardEngine} />
                </div>
              </article>
            );
          })}

        </TouchlinePitchSurface>
        <p className={styles.pitchHint}>
          {isPortuguese
            ? "Toque em um card para ampliar. A Seleção TouchLine usa o mesmo ranking de todas as páginas do jogo."
            : "Tap a card to enlarge it. The TouchLine XI uses the same ranking across the game."}
        </p></> : <div className={styles.selectionPending} role="status"><strong>{copy.seasonSelectionPending}</strong><p>{copy.seasonSelectionPendingDescription}</p></div>}
      </section>

      <div className={styles.cascade}>
        <section className={styles.rankSection} id="club-owner-table">
          <div className={styles.sectionHeading}>
            <div><p>{copy.clubOwnerRank}</p><h2>{copy.mostValuableOwners}</h2></div>
            <span>{copy.ownerValueRule}</span>
          </div>
          {cardClubOwnerRank.length ? <ol className={styles.ownerList}>
            {cardClubOwnerRank.map((owner, index) => (
              <li key={owner.id}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div className={styles.ownerAvatar}><OwnerAvatar owner={owner} /></div>
                <div className={styles.rowIdentity}>
                  <strong>{owner.name}</strong>
                  <span>{owner.clubName}</span>
                </div>
                <div className={styles.rowValue}>
                  <strong>{formatTouchlineCommercialCardTotal({
                    numericPrice: owner.squadValueTc,
                    competition: "england",
                  })}</strong>
                  <span>{owner.squadCount} {copy.cards}</span>
                </div>
                {owner.profileHref ? (
                  <Link href={`${owner.profileHref}?lang=${encodeURIComponent(locale)}`} aria-label={`${isPortuguese ? "Abrir perfil de" : "Open profile for"} ${owner.name}`}>
                    <ChevronRight aria-hidden="true" />
                  </Link>
                ) : <span className={styles.rowEnd} />}
              </li>
            ))}
          </ol> : <RankingPending copy={copy} />}
        </section>

        <section className={styles.rankSection} id="touchline-england">
          <div className={styles.sectionHeading}>
            <div><p>{copy.englandTable}</p><h2>{copy.ownerLeagueTable}</h2></div>
            <span>{copy.ownerLeagueRule}</span>
          </div>
          {touchLineEnglandTable.length ? <ol className={styles.tableList}>
            {touchLineEnglandTable.map((owner, index) => (
              <li key={owner.id}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div className={styles.ownerAvatar}><OwnerAvatar owner={owner} /></div>
                <div className={styles.rowIdentity}><strong>{owner.name}</strong><span>{owner.clubName}</span></div>
                <div className={styles.pointsValue}><strong>{owner.touchlinePoints}</strong><span>{copy.pointsShort}</span></div>
              </li>
            ))}
          </ol> : <RankingPending copy={copy} />}
        </section>

        <section className={styles.playerRankSection} id="card-rankings">
          <div className={styles.sectionHeading}>
            <div><p>{copy.playerRank}</p><h2>{copy.bestPlayerCards}</h2></div>
            <span>{copy.playerOrderRule}</span>
          </div>
          {cardPlayerRank.length ? <ol className={styles.playerList}>
            {cardPlayerRank.map((card, index) => (
              <li key={card.id}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div className={styles.playerRankCardButton}>
                  <TablePlayerCardZoom card={card} locale={locale} canEditCardEngine={canEditCardEngine} />
                </div>
                <div className={styles.rowIdentity}><strong>{card.name}</strong><span>{card.position} · {card.clubName}</span></div>
                <div className={styles.pointsValue}><strong>{card.seasonTotalRating?.toFixed(2) ?? "—"}</strong><span>{isPortuguese ? "nota total" : "total rating"}</span></div>
                <Link href={touchlinePlayerProfileHref(squadCardToExactPlayer(card), locale)} aria-label={`${isPortuguese ? "Abrir perfil de" : "Open profile for"} ${card.name}`}>
                  <ExternalLink aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol> : <RankingPending copy={copy} />}
        </section>

        <section className={styles.rankSection} id="coach-rankings">
          <div className={styles.sectionHeading}>
            <div>
              <p>{isPortuguese ? "Ranking de treinadores" : "Coach ranking"}</p>
              <h2>{isPortuguese ? "Melhores treinadores TouchLine" : "Top TouchLine coaches"}</h2>
            </div>
            <span>{isPortuguese ? "Pontos V2, vitórias e vitórias fora de casa definem a ordem." : "V2 points, wins and away wins define the order."}</span>
          </div>
          {coachRanking.phase === "ranked" && coachRanking.rows.length ? <ol className={styles.tableList} data-coach-scoring-version={coachRanking.scoringVersion ?? undefined}>
            {coachRanking.rows.map((coach) => (
              <li key={coach.coachProviderId}>
                <b>{String(coach.rank).padStart(2, "0")}</b>
                <div className={styles.ownerAvatar}><span aria-hidden="true">{coach.coachName.slice(0, 2)}</span></div>
                <div className={styles.rowIdentity}><strong>{coach.coachName}</strong><span>{coach.clubName} · {coach.wins}W {coach.draws}D {coach.losses}L</span></div>
                <div className={styles.pointsValue}><strong>{coach.touchlinePoints}</strong><span>{copy.pointsShort}</span></div>
              </li>
            ))}
          </ol> : <RankingPending copy={copy} />}
        </section>
      </div>

      <footer className={styles.footer}>
        <Trophy aria-hidden="true" size={19} />
        <span>{copy.connectedDescription}</span>
      </footer>
    </main>
  );
}
