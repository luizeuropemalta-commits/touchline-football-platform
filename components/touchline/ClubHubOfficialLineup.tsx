import type { CSSProperties } from "react";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import type { TouchLineClubLineup } from "@/lib/touchlineArena/club-lineup";
import { findTouchLineClub, squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { touchlineArenaContractHref } from "@/lib/touchlineArena/arena-navigation";
import { resolveTouchlineVerifiedPlayerEconomy, touchlineArenaTierForKey, touchlineCardTierName, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { formatTouchlineCommercialCardPrice, formatTouchlineContractedCommercialCardPrice, resolveTouchlineCommercialCardPrice } from "@/lib/touchlineArena/commercial-card-pricing";
import { formatPlayerMarketTierRange, formatPlayerMarketValueEur } from "@/lib/touchlineArena/player-market-tiers";
import {
  hasTouchlinePublicCardState,
  resolveTouchlinePublicCardPresentation,
  TOUCHLINE_NEUTRAL_CARD_ACCENT,
  touchlinePublicCardStatusLabel,
  touchlinePublicMarketValueStatusLabel,
} from "@/lib/touchlineArena/public-card-presentation";

import styles from "./ClubHubOfficialLineup.module.css";

type ClubHubOfficialLineupProps = {
  clubName: string;
  lineup: TouchLineClubLineup;
  locale: string;
  labels: {
    nationality: string;
    points: string;
    totalPoints: string;
    cardPrice: string;
  };
};

export default function ClubHubOfficialLineup({ clubName, lineup, locale, labels }: ClubHubOfficialLineupProps) {
  const isPortuguese = locale === "pt-BR";
  const confirmed = lineup.status === "confirmed";
  const title = confirmed
    ? (isPortuguese ? "Escalação confirmada" : "Confirmed line-up")
    : (isPortuguese ? "Provável escalação" : "Predicted line-up");

  return (
    <section className={styles.shell} aria-label={`${clubName} ${title}`}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>ClubHub Match Centre</span>
          <h2>{title}</h2>
          <p>
            {confirmed
              ? (isPortuguese ? "Titulares verificados pela TouchLine e distribuídos automaticamente por toda a plataforma." : "Starting XI verified by TouchLine and distributed automatically across the platform.")
              : (isPortuguese ? "Prévia baseada no elenco disponível. Assim que a TouchLine verificar os titulares, esta formação será atualizada automaticamente." : "Preview based on the available squad. This formation updates automatically as soon as TouchLine verifies the Starting XI.")}
          </p>
        </div>
        <div className={styles.statusPanel}>
          <span className={`${styles.status} ${confirmed ? styles.confirmed : ""}`}>
            {confirmed ? (isPortuguese ? "Escalação confirmada" : "Line-up confirmed") : (isPortuguese ? "Provável escalação" : "Predicted line-up")}
          </span>
          <span className={styles.syncLabel}>{isPortuguese ? "Formação" : "Formation"}</span>
          <strong className={styles.formation}>{lineup.formation}</strong>
        </div>
      </header>

      <div className={styles.syncStrip} aria-label={isPortuguese ? "Distribuição da escalação" : "Line-up distribution"}>
        <span>ClubHub</span>
        <span>TouchLine Arena</span>
        <span>ClubOwners</span>
        <span>{isPortuguese ? "Feeds de Jogadores" : "Player Feeds"}</span>
      </div>

      <div className={styles.pitchViewport}>
        <TouchlinePitchSurface className={styles.pitch} ariaLabel={`${clubName} ${isPortuguese ? "campo de escalação" : "line-up pitch"}`}>
          {lineup.players.length ? lineup.players.map(({ card, x, y }) => {
            const exactPlayer = squadCardToExactPlayer(card, { useSuppliedTier: true });
            const economy = resolveTouchlineVerifiedPlayerEconomy({
              marketValue: card.marketValue,
              marketValueSource: card.marketValueSource,
            });
            const hasCanonicalPublicState = hasTouchlinePublicCardState(card);
            const presentation = hasCanonicalPublicState ? resolveTouchlinePublicCardPresentation(card) : null;
            const contractedTier = card.cardPriceAuthority === "active-contract"
              ? touchlineArenaTierForKey(card.cardTier)
              : null;
            const profileHref = touchlinePlayerProfileHref({
                sportmonksPlayerId: card.id,
                name: card.name,
                clubName: card.clubName,
                position: card.position,
                shirtNumber: card.shirtNumber,
                countryCode3: card.countryCode3,
              }, locale);
            const updating = isPortuguese ? "Em atualização" : "Updating";
            const presentationStatus = presentation
              ? touchlinePublicCardStatusLabel(presentation.visualState, locale)
              : updating;
            const legacyZoomTier = contractedTier?.key ?? (economy.status === "resolved" ? economy.tierKey : card.cardTier);
            const commercialPrice = presentation
              ? presentation.canExposeCommercialPresentation && presentation.tierKey
                ? presentation.isActiveContract
              ? formatTouchlineContractedCommercialCardPrice({
                tierKey: presentation.tierKey,
                priceTableVersion: card.cardPriceVersion,
                competition: "england",
                locale,
              })
              : formatTouchlineCommercialCardPrice(resolveTouchlineCommercialCardPrice({
                tierKey: presentation.tierKey,
                competition: "england",
              }))
                : null
              : contractedTier
                ? formatTouchlineContractedCommercialCardPrice({
                  tierKey: contractedTier.key,
                  priceTableVersion: card.cardPriceVersion,
                  competition: "england",
                  locale,
                })
                : economy.status === "resolved"
                  ? formatTouchlineCommercialCardPrice(resolveTouchlineCommercialCardPrice({
                    tierKey: economy.tierKey,
                    competition: "england",
                  }))
                  : updating;
            const marketValueText = presentation
              ? presentation.marketValueState === "verified" && economy.status === "resolved"
                ? formatPlayerMarketValueEur(economy.marketValueEur, locale)
                : touchlinePublicMarketValueStatusLabel(presentation.marketValueState, locale)
              : economy.status === "resolved"
                ? formatPlayerMarketValueEur(economy.marketValueEur, locale)
                : updating;
            const marketTierRange = presentation
              ? presentation.canExposeCommercialPresentation && economy.status === "resolved"
                ? formatPlayerMarketTierRange(economy.tier, locale)
                : presentationStatus
              : economy.status === "resolved"
                ? formatPlayerMarketTierRange(economy.tier, locale)
                : updating;
            const tierAccent = presentation
              ? presentation.tierKey
                ? touchlineCardTierPalette(presentation.tierKey).accent
                : TOUCHLINE_NEUTRAL_CARD_ACCENT
              : touchlineCardTierPalette(legacyZoomTier).accent;
            const tierLabel = presentation
              ? presentation.tierKey
                ? touchlineCardTierName(presentation.tierKey, locale)
                : presentationStatus
              : contractedTier
                ? touchlineCardTierName(contractedTier.key, locale)
                : economy.status === "resolved"
                  ? touchlineCardTierName(economy.tierKey, locale)
                  : updating;
            return (
              <article
                key={card.id}
                className={styles.player}
                data-lineup-edge={x <= 12 ? "left" : x >= 88 ? "right" : undefined}
                style={{ "--lineup-x": `${x}%`, "--lineup-y": `${y}%` } as CSSProperties}
              >
                <span className={styles.playerName}>{card.name}</span>
                <TouchlineCardZoom
                  ariaLabel={`${isPortuguese ? "Ampliar card de" : "Expand card for"} ${card.name}`}
                  contractHref={presentation && !presentation.canExposeCommercialPresentation
                    ? undefined
                    : touchlineArenaContractHref({
                      locale,
                      playerId: card.id,
                      playerName: card.name,
                      clubId: findTouchLineClub(card.clubName)?.teamId,
                    })}
                  contractLabel={isPortuguese ? "Contratar" : "Contract player"}
                  contractValue={commercialPrice ?? undefined}
                  contractTermLabel={presentation && !presentation.canExposeCommercialPresentation ? undefined : (isPortuguese ? "Contrato · 1 temporada" : "Contract · 1 season")}
                  tierAccent={tierAccent}
                  tierLabel={tierLabel}
                  details={{
                    eyebrow: isPortuguese ? "Perfil económico oficial" : "Official economic profile",
                    title: card.name,
                    subtitle: `${card.clubName} · ${card.position}`,
                    fields: [
                      {
                        label: isPortuguese ? "Valor de mercado" : "Market value",
                        value: marketValueText,
                        accent: presentation ? presentation.marketValueState === "verified" && economy.status === "resolved" : economy.status === "resolved",
                      },
                      {
                        label: isPortuguese ? "Borda oficial" : "Official tier",
                        value: tierLabel,
                      },
                      {
                        label: isPortuguese ? "Faixa de valor" : "Market range",
                        value: marketTierRange,
                      },
                      {
                        label: isPortuguese ? "Preço do card" : "Card price",
                        value: commercialPrice ?? presentationStatus,
                      },
                      { label: isPortuguese ? "Posição" : "Position", value: card.position },
                      { label: isPortuguese ? "Nacionalidade" : "Nationality", value: card.countryCode3 || presentationStatus },
                    ],
                    profileHref,
                    profileLabel: isPortuguese ? "Ver perfil completo" : "View full profile",
                  }}
                  expandedContent={(
                    <TouchlineEliteExactCard
                      player={exactPlayer}
                      labels={labels}
                      imageLoading="lazy"
                      playerProfileHref={profileHref}
                      staticRenderScale={390 / 430}
                      forceNeonActive
                    />
                  )}
                >
                  <TouchlineEliteExactCard
                    className={styles.card}
                    player={exactPlayer}
                    labels={labels}
                    imageLoading="lazy"
                    playerProfileHref={profileHref}
                    staticRenderScale={80 / 430}
                    showProfileAction={false}
                    showSocialMetrics={false}
                  />
                </TouchlineCardZoom>
              </article>
            );
          }) : (
            <div className={styles.empty}>{isPortuguese ? "Elenco em sincronização." : "Squad syncing."}</div>
          )}
        </TouchlinePitchSurface>
      </div>
    </section>
  );
}
