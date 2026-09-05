import type { CSSProperties } from "react";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineGoalFacingPitchCard from "@/components/touchline/cards/TouchlineGoalFacingPitchCard";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import ClubHubCrestTrace from "@/components/touchline/ClubHubCrestTrace";
import ClubHubLiveFixtureScore from "@/components/touchline/ClubHubLiveFixtureScore";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";
import type { TouchLineClubLineup } from "@/lib/touchlineArena/club-lineup";
import type { TouchlineClubMatchPreviewTeam } from "@/lib/touchlineArena/club-match-preview";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { touchlineCardTierName, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import {
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import { TOUCHLINE_NEUTRAL_CARD_ACCENT } from "@/lib/touchlineArena/public-card-presentation";
import { evaluateTouchlineCardCompleteness } from "@/lib/touchlineArena/card-review-state";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";

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
  canEditCardEngine?: boolean;
  matchup?: {
    fixtureId: string | null;
    initialFixture: TouchlinePublicFixture | null;
    home: TouchlineClubMatchPreviewTeam;
    away: TouchlineClubMatchPreviewTeam;
    status: string;
    startsAt: string;
  } | null;
};

export default function ClubHubOfficialLineup({
  clubName,
  lineup,
  locale,
  staticVisualQa = false,
  labels,
  canEditCardEngine = false,
  matchup = null,
}: ClubHubOfficialLineupProps) {
  const isPortuguese = locale === "pt-BR";
  const confirmed = lineup.status === "confirmed";
  const title = confirmed
    ? (isPortuguese ? "Escalação confirmada" : "Confirmed line-up")
    : (isPortuguese ? "Prévia do elenco" : "Squad Preview");

  // The Market formation is stored on a horizontal 105×68 coordinate plane
  // (goalkeeper at the left, attack at the right).  Club Hub presents the
  // same canonical formation on a portrait broadcast pitch: the team attacks
  // upward, so no second set of football positions is introduced here.
  const portraitPitchPosition = (x: number, y: number) => ({
    x: y,
    y: 100 - x,
  });

  return (
    <section id="touchline-club-lineup" className={styles.shell} aria-label={`${clubName} ${title}`}>
      <TouchlineClubPerimeterTrace accent="#a3ff12" className={styles.perimeterTrace} />
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{isPortuguese ? "Escalação da partida" : "Matchday line-up"}</span>
          <h2>{title}</h2>
          <p>
            {confirmed
              ? (isPortuguese ? "Titulares da súmula persistida para esta partida." : "Starting XI from the persisted team sheet for this fixture.")
              : (isPortuguese ? "A prévia pode mudar até a escalação oficial TouchLine ser confirmada." : "This preview can change until the official TouchLine line-up is confirmed.")}
          </p>
        </div>
        <div className={styles.statusPanel}>
          {matchup ? (
            <aside className={styles.matchup} aria-label={isPortuguese ? "Confronto da partida" : "Match-up"}>
              <span>{isPortuguese ? "CONFRONTO" : "MATCH-UP"}</span>
              <div className={styles.matchupTeams}>
                <div className={!matchup.home.logoUrl ? styles.matchupTeamPending : undefined}>
                  {matchup.home.logoUrl && matchup.home.accent ? <ClubHubCrestTrace accent={matchup.home.accent} className={styles.matchupCrest} src={matchup.home.logoUrl} /> : null}
                  <strong>{matchup.home.shortCode}</strong>
                </div>
                <ClubHubLiveFixtureScore fixtureId={matchup.fixtureId} initialFixture={matchup.initialFixture} locale={locale === "pt-BR" ? "pt-BR" : "en-GB"} />
                <div className={!matchup.away.logoUrl ? styles.matchupTeamPending : undefined}>
                  {matchup.away.logoUrl && matchup.away.accent ? <ClubHubCrestTrace accent={matchup.away.accent} className={styles.matchupCrest} src={matchup.away.logoUrl} /> : null}
                  <strong>{matchup.away.shortCode}</strong>
                </div>
              </div>
              <small>{[matchup.status, matchup.startsAt].filter(Boolean).join(" · ")}</small>
            </aside>
          ) : null}
          <div className={styles.formationPanel}>
          <span className={`${styles.status} ${confirmed ? styles.confirmed : ""}`}>
            {confirmed ? (isPortuguese ? "Escalação confirmada" : "Line-up confirmed") : (isPortuguese ? "Prévia do elenco" : "Squad Preview")}
          </span>
          <span className={styles.syncLabel}>{isPortuguese ? "Formação" : "Formation"}</span>
          <strong className={styles.formation}>{lineup.formation}</strong>
          </div>
        </div>
      </header>

      <div className={styles.pitchViewport}>
        <TouchlinePitchSurface
          className={styles.pitch}
          orientation="vertical"
          surfaceVariant="premium-stadium"
          ariaLabel={`${clubName} ${isPortuguese ? "campo de escalação" : "line-up pitch"}`}
        >
          <div className={styles.geometryLayer}>
            {lineup.players.length ? lineup.players.map(({ card, x, y }) => {
            const pitchPosition = portraitPitchPosition(x, y);
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
                data-lineup-edge={pitchPosition.x <= 8 ? "left" : pitchPosition.x >= 92 ? "right" : undefined}
                style={{ "--lineup-x": `${pitchPosition.x}%`, "--lineup-y": `${pitchPosition.y}%` } as CSSProperties}
              >
                <span className={styles.playerName}>{card.name}</span>
                <TouchlineGoalFacingPitchCard className={styles.pitchCard} orientation="attack-up">
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
                      cardReview,
                      activeContractCard: null,
                      extraFields: [
                        {
                          label: isPortuguese ? "Nota total" : "Total rating",
                          value: card.seasonTotalRating == null ? "—" : String(card.seasonTotalRating),
                          accent: true,
                        },
                        {
                          label: isPortuguese ? "Nota da última partida" : "Last match rating",
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
                      showMatchRating
                    />
                  </TouchlineCardZoom>
                </TouchlineGoalFacingPitchCard>
              </article>
            );
            }) : (
              <div className={styles.empty}>{isPortuguese ? "Nenhum card TouchLine publicado nesta escalação." : "No published TouchLine cards in this line-up."}</div>
            )}
          </div>
        </TouchlinePitchSurface>
      </div>
    </section>
  );
}
