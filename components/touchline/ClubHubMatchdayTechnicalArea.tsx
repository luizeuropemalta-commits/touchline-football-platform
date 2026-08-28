import type { ReactNode } from "react";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import type { TouchLineClubMatchdayPresentation } from "@/lib/touchlineArena/club-lineup";
import { squadCardToExactPlayer, findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { evaluateTouchlineCardCompleteness } from "@/lib/touchlineArena/card-review-state";
import { touchlineCardTierName, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import {
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import { TOUCHLINE_NEUTRAL_CARD_ACCENT } from "@/lib/touchlineArena/public-card-presentation";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";

import styles from "./ClubHubMatchdayTechnicalArea.module.css";

type ClubHubMatchdayTechnicalAreaProps = {
  clubName: string;
  technical: TouchLineClubMatchdayPresentation["technical"];
  locale: string;
  coachCard: ReactNode;
  canEditCardEngine?: boolean;
  labels: {
    nationality: string;
    points: string;
    totalPoints: string;
    cardPrice: string;
  };
};

/**
 * The Club Hub always keeps the coach and a nine-card bench close to the
 * pitch. Until the official sheet is persisted, the cards are explicitly a
 * squad preview; no player is presented as a confirmed substitute early.
 */
export default function ClubHubMatchdayTechnicalArea({
  clubName,
  technical,
  locale,
  coachCard,
  canEditCardEngine = false,
  labels,
}: ClubHubMatchdayTechnicalAreaProps) {
  const portuguese = locale === "pt-BR";
  const confirmed = technical.state === "confirmed";
  const bench = (confirmed ? technical.bench : technical.previewBench).slice(0, 9);
  const coachLabel = portuguese ? "Treinador principal" : "First-team coach";
  const benchLabel = portuguese ? "Banco" : "Bench";
  const status = confirmed
    ? (portuguese ? "Súmula confirmada" : "Team sheet confirmed")
    : (portuguese ? "Prévia do banco · atualiza com a escalação oficial TouchLine" : "Bench preview · updates with the official TouchLine line-up");

  return (
    <section
      className={styles.shell}
      data-matchday-sheet={confirmed ? "confirmed" : "preview"}
      aria-label={`${clubName} ${portuguese ? "área técnica da partida" : "matchday technical area"}`}
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{portuguese ? "EQUIPE TÉCNICA" : "TECHNICAL STAFF"}</span>
          <h2>{portuguese ? "Área técnica" : "Technical area"}</h2>
        </div>
        <span className={`${styles.status} ${confirmed ? styles.confirmed : ""}`} aria-live="polite">{status}</span>
      </header>

      <div className={styles.content}>
        <section className={styles.coach} aria-label={coachLabel}>
          <span className={styles.label}>{coachLabel}</span>
          {coachCard ?? <p>{portuguese ? "Card do treinador indisponível" : "Coach card unavailable"}</p>}
        </section>

        <section className={styles.bench} aria-label={`${benchLabel} (${bench.length})`}>
          <div className={styles.benchHeader}>
            <div>
              <span className={styles.label}>{benchLabel}</span>
              <p>{confirmed
                ? (portuguese ? "Reservas da súmula oficial" : "Official sheet substitutes")
                : (portuguese ? "9 cards do elenco disponível" : "9 cards from the available squad")}</p>
            </div>
            <strong>{bench.length}/9</strong>
          </div>
          {bench.length ? (
            <ol className={styles.cards}>
              {bench.map((card, index) => {
                const cardReview = card.cardReview ?? evaluateTouchlineCardCompleteness({
                  displayName: card.name,
                  shirtNumber: card.shirtNumber,
                  countryCode3: card.countryCode3,
                  position: card.position,
                  hasVerifiedMarketValue: Boolean(card.editorialCard),
                  hasClubAsset: Boolean(findTouchLineClub(card.clubName)?.logoUrl),
                });
                const exactPlayer = squadCardToExactPlayer({ ...card, cardReview }, { useSuppliedTier: true });
                const tierKey = card.editorialCard?.tierKey ?? null;
                const tierAccent = tierKey
                  ? touchlineCardTierPalette(tierKey).accent
                  : TOUCHLINE_NEUTRAL_CARD_ACCENT;
                const tierLabel = tierKey ? touchlineCardTierName(tierKey, locale) : undefined;
                const profileHref = touchlinePlayerProfileHref({
                  sportmonksPlayerId: card.id,
                  name: card.name,
                  clubName: card.clubName,
                  position: card.position,
                  shirtNumber: card.shirtNumber,
                  countryCode3: card.countryCode3,
                }, locale);
                return (
                  <li key={card.id}>
                    <span className={styles.cardNumber}>{index + 1}</span>
                    <TouchlineCardZoom
                      ariaLabel={`${portuguese ? "Ampliar card de" : "Expand card for"} ${card.name}`}
                      tierAccent={tierAccent}
                      tierLabel={tierLabel}
                      details={buildTouchlinePlayerCardZoomDetails({
                        locale,
                        name: card.name,
                        clubName: card.clubName,
                        position: card.position,
                        nationality: card.countryCode3,
                        editorialCard: card.editorialCard,
                        cardReview,
                        activeContractCard: null,
                        extraFields: [
                          {
                            label: portuguese ? "Nota total" : "Total rating",
                            value: card.seasonTotalRating == null ? "—" : String(card.seasonTotalRating),
                            accent: true,
                          },
                          {
                            label: portuguese ? "Nota da última partida" : "Last match rating",
                            value: card.matchRating == null ? "—" : String(card.matchRating),
                            accent: true,
                            kind: "rating-last",
                          },
                          ...buildTouchlineVerifiedMatchFactFields({
                            statistics: card.matchStats,
                            position: card.position || card.role,
                          }, locale),
                        ],
                        profileHref,
                        cardEngineHref: canEditCardEngine
                          ? touchlineCardEnginePlayerHref(card.canonicalPlayerId, locale)
                          : null,
                      })}
                      expandedContent={(
                        <TouchlineEliteExactCard
                          player={exactPlayer}
                          labels={labels}
                          imageLoading="lazy"
                          playerProfileHref={profileHref}
                          staticRenderScale={390 / 430}
                          subscribeToRanking={false}
                          enableInteractiveNeon={false}
                          rankingMode="live"
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
                        staticRenderScale={104 / 430}
                        subscribeToRanking={false}
                        enableInteractiveNeon={false}
                        rankingMode="preview"
                        showProfileAction={false}
                        showSocialMetrics={false}
                        showMatchRating
                      />
                    </TouchlineCardZoom>
                  </li>
                );
              })}
            </ol>
          ) : <p className={styles.empty}>{portuguese ? "Aguardando os reservas da súmula oficial." : "Awaiting substitutes from the official team sheet."}</p>}
        </section>
      </div>
    </section>
  );
}
