import type { CSSProperties } from "react";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import type { TouchLineClubLineup } from "@/lib/touchlineArena/club-lineup";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { touchlineCardTierName, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { buildTouchlinePlayerCardZoomDetails } from "@/lib/touchlineArena/card-zoom-details";
import { TOUCHLINE_NEUTRAL_CARD_ACCENT } from "@/lib/touchlineArena/public-card-presentation";

import styles from "./ClubHubOfficialLineup.module.css";

type ClubHubOfficialLineupProps = {
  clubName: string;
  lineup: TouchLineClubLineup;
  locale: string;
  /** Isolates the static local visual fixture from card-ranking activity. */
  staticVisualQa?: boolean;
  labels: {
    nationality: string;
    points: string;
    totalPoints: string;
    cardPrice: string;
  };
};

export default function ClubHubOfficialLineup({
  clubName,
  lineup,
  locale,
  staticVisualQa = false,
  labels,
}: ClubHubOfficialLineupProps) {
  const isPortuguese = locale === "pt-BR";
  const confirmed = lineup.status === "confirmed";
  const title = confirmed
    ? (isPortuguese ? "Escalação confirmada" : "Confirmed line-up")
    : (isPortuguese ? "Prévia do elenco" : "Squad Preview");

  return (
    <section className={styles.shell} aria-label={`${clubName} ${title}`}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{isPortuguese ? "Escalação da partida" : "Matchday line-up"}</span>
          <h2>{title}</h2>
          <p>
            {confirmed
              ? (isPortuguese ? "Titulares da súmula persistida para esta partida." : "Starting XI from the persisted team sheet for this fixture.")
              : (isPortuguese ? "Prévia do elenco disponível. Não é uma previsão: a escalação oficial aparece somente quando a súmula desta partida estiver completa." : "Preview from the available squad. This is not a prediction; the official XI appears only when this fixture's team sheet is complete.")}
          </p>
        </div>
        <div className={styles.statusPanel}>
          <span className={`${styles.status} ${confirmed ? styles.confirmed : ""}`}>
            {confirmed ? (isPortuguese ? "Escalação confirmada" : "Line-up confirmed") : (isPortuguese ? "Prévia do elenco" : "Squad Preview")}
          </span>
          <span className={styles.syncLabel}>{isPortuguese ? "Formação" : "Formation"}</span>
          <strong className={styles.formation}>{lineup.formation}</strong>
        </div>
      </header>

      <div className={styles.pitchViewport}>
        <TouchlinePitchSurface className={styles.pitch} ariaLabel={`${clubName} ${isPortuguese ? "campo de escalação" : "line-up pitch"}`}>
          {lineup.players.length ? lineup.players.map(({ card, x, y }) => {
            const dataPending = !card.shirtNumber || card.countryCode3 === "N/A";
            if (!card.editorialCard) {
              return (
                <article
                  key={card.id}
                  className={`${styles.player} ${styles.pendingPlayer}`}
                  data-lineup-edge={x <= 12 ? "left" : x >= 88 ? "right" : undefined}
                  style={{ "--lineup-x": `${x}%`, "--lineup-y": `${y}%` } as CSSProperties}
                >
                  <span className={styles.playerName}>{card.name}</span>
                  <div className={styles.pendingCard} aria-label={`${card.name} ${dataPending ? "data pending" : "card pending review"}`}>
                    <span>{dataPending ? (isPortuguese ? "DADOS PENDENTES" : "DATA PENDING") : (isPortuguese ? "CARD EM REVISÃO" : "CARD PENDING REVIEW")}</span>
                    <strong>{card.shirtNumber ? `#${card.shirtNumber}` : "—"}</strong>
                    <small>{card.position || "—"}</small>
                  </div>
                </article>
              );
            }
            const exactPlayer = squadCardToExactPlayer(card, { useSuppliedTier: true });
            const tierKey = card.editorialCard?.tierKey ?? null;
            const profileHref = touchlinePlayerProfileHref({
                sportmonksPlayerId: card.id,
                name: card.name,
                clubName: card.clubName,
                position: card.position,
                shirtNumber: card.shirtNumber,
                countryCode3: card.countryCode3,
              }, locale);
            const tierAccent = tierKey
              ? touchlineCardTierPalette(tierKey).accent
              : TOUCHLINE_NEUTRAL_CARD_ACCENT;
            const tierLabel = tierKey ? touchlineCardTierName(tierKey, locale) : undefined;
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
                  contractHref={undefined}
                  contractLabel={isPortuguese ? "Contratar" : "Contract player"}
                  contractValue={undefined}
                  contractTermLabel={undefined}
                  tierAccent={tierAccent}
                  tierLabel={tierLabel}
                  details={buildTouchlinePlayerCardZoomDetails({
                    locale,
                    name: card.name,
                    clubName: card.clubName,
                    position: card.position,
                    nationality: card.countryCode3,
                    editorialCard: card.editorialCard,
                    activeContractCard: null,
                    touchlinePoints: card.touchlinePoints,
                    profileHref,
                  })}
                  expandedContent={(
                    <TouchlineEliteExactCard
                      player={exactPlayer}
                      labels={labels}
                      imageLoading="lazy"
                      playerProfileHref={profileHref}
                      staticRenderScale={390 / 430}
                      subscribeToRanking={!staticVisualQa}
                      enableInteractiveNeon={!staticVisualQa}
                      rankingMode={staticVisualQa ? "preview" : "live"}
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
                    subscribeToRanking={!staticVisualQa}
                    enableInteractiveNeon={!staticVisualQa}
                    rankingMode={staticVisualQa ? "preview" : "live"}
                    showProfileAction={false}
                    showSocialMetrics={false}
                  />
                </TouchlineCardZoom>
              </article>
            );
          }) : (
            <div className={styles.empty}>{isPortuguese ? "Nenhum card TouchLine publicado nesta escalação." : "No published TouchLine cards in this line-up."}</div>
          )}
        </TouchlinePitchSurface>
      </div>
    </section>
  );
}
