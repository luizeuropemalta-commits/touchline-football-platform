import type { CSSProperties } from "react";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import type { TouchLineClubLineup } from "@/lib/touchlineArena/club-lineup";
import { findTouchLineClub, squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { touchlineArenaContractHref } from "@/lib/touchlineArena/arena-navigation";
import { resolveTouchlineVerifiedPlayerEconomy, touchlineCardTierName, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { formatTouchlineCommercialCardPrice, resolveTouchlineCommercialCardPrice } from "@/lib/touchlineArena/commercial-card-pricing";
import { formatPlayerMarketTierRange, formatPlayerMarketValueEur } from "@/lib/touchlineArena/player-market-tiers";

import styles from "./ClubHubOfficialLineup.module.css";

/* This is deliberately local to ClubHub's visual presentation. The canonical
   4-3-3 coordinates remain the source of truth for every other pitch. On a
   horizontal field, x keeps the defensive line at the same depth; only the
   cross-field breathing room is refined here. */
const CLUB_HUB_DEFENDER_Y_REFINEMENT: Readonly<Record<number, number>> = {
  17: 15,
  39: 38.25,
  61: 61.75,
  83: 85,
};

function resolveClubHubLineupY(role: string, y: number) {
  return role === "defender" ? (CLUB_HUB_DEFENDER_Y_REFINEMENT[y] ?? y) : y;
}

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
              ? (isPortuguese ? "Titulares confirmados pelo provedor e distribuídos automaticamente por toda a TouchLine." : "Starting XI confirmed by the provider and distributed automatically across TouchLine.")
              : (isPortuguese ? "Prévia baseada no elenco disponível. Assim que o provedor confirmar os titulares, esta formação será atualizada automaticamente." : "Preview based on the available squad. This formation updates automatically as soon as the provider confirms the Starting XI.")}
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
        <span>Player Feeds</span>
      </div>

      <div className={styles.pitchViewport}>
        <TouchlinePitchSurface className={styles.pitch} ariaLabel={`${clubName} ${isPortuguese ? "campo de escalação" : "line-up pitch"}`}>
          {lineup.players.length ? lineup.players.map(({ card, x, y }) => {
            const exactPlayer = squadCardToExactPlayer(card, { useSuppliedTier: true });
            const economy = resolveTouchlineVerifiedPlayerEconomy({
              marketValue: card.marketValue,
              marketValueSource: card.marketValueSource,
            });
            const profileHref = touchlinePlayerProfileHref({
                sportmonksPlayerId: card.id,
                name: card.name,
                clubName: card.clubName,
                position: card.position,
                shirtNumber: card.shirtNumber,
                countryCode3: card.countryCode3,
              }, locale, { previewTier: card.cardTier });
            const zoomTier = economy.status === "resolved" ? economy.tierKey : card.cardTier;
            const updating = isPortuguese ? "Em atualização" : "Updating";
            const commercialPrice = economy.status === "resolved"
              ? formatTouchlineCommercialCardPrice(resolveTouchlineCommercialCardPrice({
                tierKey: economy.tierKey,
                competition: "england",
              }))
              : updating;
            const visualY = resolveClubHubLineupY(card.role, y);

            return (
              <article
                key={card.id}
                className={styles.player}
                style={{ "--lineup-x": `${x}%`, "--lineup-y": `${visualY}%` } as CSSProperties}
              >
                <span className={styles.playerName}>{card.name}</span>
                <TouchlineCardZoom
                  ariaLabel={`${isPortuguese ? "Ampliar card de" : "Expand card for"} ${card.name}`}
                  contractHref={touchlineArenaContractHref({
                    locale,
                    playerId: card.id,
                    playerName: card.name,
                    clubId: findTouchLineClub(card.clubName)?.teamId,
                  })}
                  contractLabel={isPortuguese ? "Contratar" : "Contract player"}
                  contractValue={commercialPrice}
                  contractTermLabel={isPortuguese ? "Contrato · 1 temporada" : "Contract · 1 season"}
                  tierAccent={touchlineCardTierPalette(zoomTier).accent}
                  tierLabel={economy.status === "resolved" ? touchlineCardTierName(economy.tierKey, locale) : updating}
                  details={{
                    eyebrow: isPortuguese ? "Perfil económico oficial" : "Official economic profile",
                    title: card.name,
                    subtitle: `${card.clubName} · ${card.position}`,
                    fields: [
                      {
                        label: isPortuguese ? "Valor de mercado" : "Market value",
                        value: economy.status === "resolved" ? formatPlayerMarketValueEur(economy.marketValueEur, locale) : updating,
                        accent: economy.status === "resolved",
                      },
                      {
                        label: isPortuguese ? "Borda oficial" : "Official tier",
                        value: economy.status === "resolved" ? touchlineCardTierName(economy.tierKey, locale) : updating,
                      },
                      {
                        label: isPortuguese ? "Faixa de valor" : "Market range",
                        value: economy.status === "resolved" ? formatPlayerMarketTierRange(economy.tier, locale) : updating,
                      },
                      {
                        label: isPortuguese ? "Preço do card" : "Card price",
                        value: commercialPrice,
                      },
                      { label: isPortuguese ? "Posição" : "Position", value: card.position },
                      { label: isPortuguese ? "Nacionalidade" : "Nationality", value: card.countryCode3 || updating },
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
