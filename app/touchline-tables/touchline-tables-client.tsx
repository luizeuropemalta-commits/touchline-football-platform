"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import {
  ChevronRight,
  ExternalLink,
  Share2,
  ShieldCheck,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import { TouchlineCoinMark } from "@/components/touchline/market/TouchlineMarketMarks";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import TouchlineProfileQuickNav from "@/components/touchline/TouchlineProfileQuickNav";
import { touchlineArenaContractHref } from "@/lib/touchlineArena/arena-navigation";
import {
  resolveTouchlineVerifiedPlayerEconomy,
  touchlineCardTierName,
  touchlineCardTierPalette,
} from "@/lib/touchlineArena/card-rules";
import {
  formatTouchlineCommercialCardPrice,
  formatTouchlineCommercialCardTotal,
  resolveTouchlineCommercialCardPrice,
} from "@/lib/touchlineArena/commercial-card-pricing";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import {
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  squadCardToExactPlayer,
  type ClubOwnerSquadCard,
  type TouchLineClubOwnerStanding,
} from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import type { TouchlinePublishedTopEleven } from "@/lib/touchlineArena/published-top-eleven";
import type { getTouchLineRankingsCopy } from "@/lib/touchlineArena/rankings-i18n";
import styles from "./touchline-tables.module.css";

type RankingsCopy = ReturnType<typeof getTouchLineRankingsCopy>;

type TouchLineTablesClientProps = {
  cardClubOwnerRank: TouchLineClubOwnerStanding[];
  cardPlayerRank: ClubOwnerSquadCard[];
  copy: RankingsCopy;
  locale: TouchLineLocale;
  rankMode: string;
  publishedTopEleven: TouchlinePublishedTopEleven | null;
  rosterCards: ClubOwnerSquadCard[];
  totalCards: number;
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
        totalPoints: locale === "pt-BR" ? "Pontos TouchLine" : "TouchLine Points",
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

export default function TouchLineTablesClient({
  cardClubOwnerRank,
  cardPlayerRank,
  copy,
  locale,
  rankMode,
  publishedTopEleven,
  rosterCards,
  totalCards,
  totalOwnerValue,
  touchLineEnglandTable,
}: TouchLineTablesClientProps) {
  const [zoomedCardId, setZoomedCardId] = useState<string | null>(null);
  const selection = publishedTopEleven?.slots ?? null;
  const zoomedCard = rosterCards.find((card) => card.id === zoomedCardId) ?? null;
  const isPortuguese = locale === "pt-BR";
  const zoomedCardTierLabel = zoomedCard
    ? touchlineCardTierName(zoomedCard.cardTier, locale)
    : "";
  const zoomedCardTierAccent = zoomedCard
    ? touchlineCardTierPalette(zoomedCard.cardTier).accent
    : "#b8ff46";
  const zoomedCardContractValue = zoomedCard
    ? (() => {
        const economy = resolveTouchlineVerifiedPlayerEconomy({
          marketValue: zoomedCard.marketValue,
          marketValueSource: zoomedCard.marketValueSource,
        });
        const tierKey = economy.status === "resolved" ? economy.tierKey : (zoomedCard.cardTier ?? "ruby-red");
        return formatTouchlineCommercialCardPrice(resolveTouchlineCommercialCardPrice({
          tierKey,
          competition: "england",
        }));
      })()
    : "";
  const zoomedCardContractHref = zoomedCard
    ? touchlineArenaContractHref({
        locale,
        playerId: zoomedCard.id,
        playerName: zoomedCard.name,
      })
    : "#";

  useEffect(() => {
    if (!zoomedCardId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomedCardId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [zoomedCardId]);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <TouchlineProfileQuickNav locale={locale} />
        <span className={styles.status}>
          <ShieldCheck aria-hidden="true" size={18} />
          {isPortuguese ? "Competição TouchLine" : "TouchLine competition"}
        </span>
      </header>

      <section className={styles.hero}>
        <div>
          <p>{isPortuguese ? "TouchLine Cards League" : "TouchLine Cards League"}</p>
          <h1>{copy.tablesTitle}</h1>
          <span>{copy.tablesDescription}</span>
        </div>
        <dl className={styles.summary}>
          <div><dt>{copy.clubOwners}</dt><dd>{cardClubOwnerRank.length}</dd></div>
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
            const card = rosterCards.find((item) => slot.playerIds.includes(item.id));
            if (!card) return null;
            const point = projectedPitchPoint(slot.x, slot.y);
            return (
              <article
                key={slot.id}
                className={styles.pitchPlayer}
                style={{ left: `${point.x}%`, top: `${point.y}%` } as CSSProperties}
              >
                <span className={styles.positionLabel}>{slot.label}</span>
                <button
                  type="button"
                  className={styles.cardButton}
                  aria-label={`${isPortuguese ? "Ampliar card de" : "Open card for"} ${card.name}`}
                  onClick={() => setZoomedCardId(card.id)}
                >
                  <CompactPlayerCard card={card} locale={locale} />
                </button>
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
                <button
                  type="button"
                  className={styles.playerRankCardButton}
                  aria-label={`${isPortuguese ? "Ampliar card de" : "Open card for"} ${card.name}`}
                  onClick={() => setZoomedCardId(card.id)}
                >
                  <CompactPlayerCard card={card} locale={locale} />
                </button>
                <div className={styles.rowIdentity}><strong>{card.name}</strong><span>{card.position} · {card.clubName}</span></div>
                <div className={styles.pointsValue}><strong>{card.touchlinePoints}</strong><span>{copy.pointsShort}</span></div>
                <Link href={touchlinePlayerProfileHref(squadCardToExactPlayer(card), locale)} aria-label={`${isPortuguese ? "Abrir perfil de" : "Open profile for"} ${card.name}`}>
                  <ExternalLink aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol> : <RankingPending copy={copy} />}
        </section>
      </div>

      {zoomedCard ? (
        <div
          className={styles.zoomBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`${isPortuguese ? "Card ampliado de" : "Expanded card for"} ${zoomedCard.name}`}
          onClick={() => setZoomedCardId(null)}
        >
          <div
            className={styles.zoomContent}
            style={{ "--touchline-card-accent": zoomedCardTierAccent } as CSSProperties}
            onClick={(event) => {
              event.stopPropagation();
              if ((event.target as HTMLElement).closest("a,button")) return;
              setZoomedCardId(null);
            }}
          >
            <button
              type="button"
              className={styles.zoomClose}
              aria-label={isPortuguese ? "Fechar" : "Close"}
              onClick={() => setZoomedCardId(null)}
            >
              <X aria-hidden="true" size={20} />
            </button>
            <div className={styles.zoomCardVisual}>
              <CompactPlayerCard card={zoomedCard} locale={locale} expanded />
            </div>
            <div className={styles.zoomSide}>
              <div className={styles.zoomCardMeta}>
                <strong>{zoomedCardTierLabel}</strong>
                <span>{isPortuguese ? "Contrato · 1 temporada" : "Contract · 1 season"}</span>
              </div>
              <Link className={styles.zoomContract} href={zoomedCardContractHref}>
                <TouchlineCoinMark size={18} />
                <span>{isPortuguese ? "Contratar" : "Contract"}</span>
                <strong>{zoomedCardContractValue}</strong>
              </Link>
              <div className={styles.zoomActions}>
                <button type="button">
                  <Share2 aria-hidden="true" size={17} />
                  {isPortuguese ? "Compartilhar" : "Share"}
                </button>
                <Link href={touchlinePlayerProfileHref(squadCardToExactPlayer(zoomedCard), locale)}>
                  <UserRound aria-hidden="true" size={17} />
                  {isPortuguese ? "Perfil" : "Profile"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <footer className={styles.footer}>
        <Trophy aria-hidden="true" size={19} />
        <span>{copy.connectedDescription}</span>
      </footer>
    </main>
  );
}
