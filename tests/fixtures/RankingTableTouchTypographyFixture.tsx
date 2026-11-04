import TouchLineTablesClient, { TouchlineCoachRankingTable, TouchlineRankingEnding, TouchlineRankingPodium, TouchlineRankingsHero } from "../../app/rankings/touchline-tables-client";
import styles from "../../app/rankings/touchline-tables.module.css";
import { getTouchLineRankingsCopy } from "../../lib/touchlineArena/rankings-i18n";
import type { TouchLineLocale } from "../../lib/touchlineArena/i18n";
import type { TouchLineCoachRankingState } from "../../lib/touchlineArena/coach-ranking-server";
import { TouchlineCardLeadershipProvider } from "../../components/touchline/cards/TouchlineCardLeadershipProvider";
import TouchlineDecorationMotion from "../../components/touchline/TouchlineDecorationMotion";
import TouchlineLandscapeBoundary from "../../components/touchline/TouchlineLandscapeBoundary";
import TouchlineSiteFooter from "../../components/touchline/TouchlineSiteFooter";
import { buildTouchlineCardLeadershipValue } from "../../lib/touchlineArena/card-leadership-authority";
import { buildTouchlineRankingSnapshot } from "../../lib/touchlineArena/card-ranking";
import { parseTouchlineActiveRankingState } from "../../lib/touchlineArena/card-ranking-live";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../../lib/touchlineArena/card-rules";
import { touchlinePlayerLeadershipScope } from "../../lib/touchlineArena/player-ranking-leadership";
import { projectTouchlineRankingsHighlights } from "../../lib/touchlineArena/rankings-highlight-projection";
import { TOUCHLINE_SELECTION_SLOTS } from "../../lib/touchlineArena/touchline-selection";
import { legacyCoachCatalogue } from "../../lib/touchlineArena/coach-catalogue-contract";
import { findTouchLineClub, type ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";
import type { ClubOwnerStanding } from "../../lib/touchlineArena/club-owner-standings";

// Synthetic identities/results only. Actual ranking components and public-avatar
// refresh/load code run against intercepted GETs; no account or remote backend.
export const photoId = "22222222-2222-4222-8222-000000000001";
export const missingId = "22222222-2222-4222-8222-000000000002";
export const owners: ClubOwnerStanding[] = [
  { rank: 1, name: "Pessoa sintética com foto de referência", touchlinePoints: 48.3,
    publicPhoto: { publicId: photoId, displayName: "Pessoa sintética com foto", planKey: "vip" } },
  { rank: 2, name: "Pessoa sintética sem foto disponível", touchlinePoints: 0,
    publicPhoto: { publicId: missingId, displayName: "Pessoa sintética sem foto", planKey: "master" } },
  { rank: 3, name: "Pessoa sintética sem perfil público", touchlinePoints: 1200.5 },
];
const ranking: TouchLineCoachRankingState = {
  phase: "ranked", snapshotId: "synthetic-typography", seasonId: "synthetic-season",
  scoringVersion: "coach_scoring_v2", fixtureIds: [], generatedAt: "2026-11-03T00:00:00Z",
  rows: Array.from({ length: 7 }, (_, i) => ({
    rank: i + 1, coachProviderId: `synthetic-coach-${i}`, coachName: `Treinador Sintético de Nome Extenso ${i + 1}`,
    clubName: "Clube Sintético de Nome Extenso Para Testar Quebra", touchlinePoints: 21 - i,
    wins: 5, draws: 2, losses: 1, awayWins: 2,
    home: { wins: 3, draws: 1, losses: 0, touchlinePoints: 10 },
    away: { wins: 2, draws: 1, losses: 1, touchlinePoints: 11 - i },
  })),
};
const stamp = "2026-11-03T00:00:00Z";
const playerId = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const catalogue: ClubOwnerSquadCard[] = TOUCHLINE_SELECTION_SLOTS.map((slot, i) => ({
  id: playerId(i + 1), canonicalPlayerId: playerId(i + 1), providerPlayerId: String(100 + i),
  name: `Atleta Sintético ${i + 1}`, shortName: i === 2 ? "Sobrenome-Sintético-Longo" : `Sintético ${i + 1}`, clubName: "Arsenal", countryCode3: "ENG",
  role: slot.group === "goalkeeper" ? "goalkeeper" : ["full-back", "centre-back"].includes(slot.group) ? "defender" : slot.group === "midfielder" ? "midfielder" : "forward", position: slot.label.replace(/^[LR](CB|CM)$/, "$1"), shirtNumber: i + 1,
  touchlinePoints: 0, marketValue: "€1m", seasonTotalRating: 100 - i, matchRating: 7.2,
  matchStats: { goals: 1, assists: 2, defense: 3, cleanSheets: 0, saves: 1, penaltySaves: 0, goalsConceded: 1,
    yellowCards: 0, redCards: 0, ownGoals: 0, rating: 7.2, shotsOnTarget: 3, shotsOffTarget: 2, penaltiesMissed: 0 },
  editorialCard: { tierKey: "ruby-red", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: stamp },
}));
const built = buildTouchlineRankingSnapshot({ snapshotId: "synthetic-typography-ranking", roundId: "synthetic-round",
  generatedAt: stamp, source: "simulation", status: "published", players: catalogue.map((card, i) => ({
    playerId: card.canonicalPlayerId!, providerPlayerId: card.providerPlayerId!, name: card.name,
    clubName: card.clubName, position: card.position!, totalRating: 100 - i, minutesPlayed: 90, appearances: 1,
  })) });
const playerRanking = (() => {
const parsed = parseTouchlineActiveRankingState({ phase: "ranked", leagueKey: "touchline-england", snapshotId: built.snapshotId,
  roundId: built.roundId, publishedAt: stamp, priceTableVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION, scoringVersion: "player_scoring_v4",
  coverageStatus: "complete", seasonId: playerId(50), fixtureIds: ["19722190"], expectedFixtureIds: ["19722190"], totalScorePoints: 0,
  players: built.players, leadershipDecision: { status: "unique-leader", scope: touchlinePlayerLeadershipScope(built.snapshotId),
    leader: { subjectType: "player", subjectId: playerId(1) } },
  cardGoals: { source: "published-card-goals-v1", snapshotId: built.snapshotId,
    rows: catalogue.map((card, i) => ({ playerId: card.canonicalPlayerId!, goals: i === 1 ? 5 : 1 })) },
});
if (!parsed) throw Error("Synthetic fixture ranking must pass the real parser");
return parsed;
})();
const coachCatalogue = legacyCoachCatalogue();
const arsenalCoach = coachCatalogue.current.find(entry => entry.coach.teamId === findTouchLineClub("Arsenal")?.teamId);
if (!arsenalCoach) throw Error("Missing existing Arsenal coach art for isolated fixture");
const renderedRanking = { ...ranking, catalogue: coachCatalogue, seasonId: playerId(50), rows: ranking.rows.map((row, i) => i === 0
  ? { ...row, coachProviderId: arsenalCoach.coach.providerId, coachName: arsenalCoach.coach.name, clubName: "Arsenal" } : row) };
const highlights = projectTouchlineRankingsHighlights(catalogue, {
  snapshotId: "synthetic-typography-xi", roundId: "synthetic-round", publishedAt: stamp, coach: null,
  slots: TOUCHLINE_SELECTION_SLOTS.map((slot, i) => ({ ...slot, playerIds: [playerId(i + 1)] })),
}, [playerId(2)]);
export const fixtureStyles = styles;
export default function RankingTableTouchTypographyFixture({ locale }: { locale: TouchLineLocale }) {
  const copy = getTouchLineRankingsCopy(locale, true);
  return <TouchlineLandscapeBoundary skipLabel="Skip to content" locale={locale} draftLocalesEnabled>
  <TouchlineCardLeadershipProvider value={buildTouchlineCardLeadershipValue(playerRanking, renderedRanking)}>
    <TouchlineDecorationMotion />
    <main className={styles.page} dir="ltr" data-synthetic-ranking-fixture="true">
    <div className={styles.content}>
      <TouchlineRankingEnding copy={copy} locale={locale} touchLineEnglandTable={owners} draftLocalesEnabled />
      <TouchlineRankingsHero copy={copy} rankMode={copy.pointsMode} totalPublishedCards={11} totalRankedCards={11} />
      <section className={styles.selectionSection} id="best-xi"><div className={styles.rankStage}>
        <TouchLineTablesClient copy={copy} locale={locale} highlights={highlights} draftLocalesEnabled canEditCardEngine={false} />
      </div></section>
      <section className={styles.rankingHighlights}>
        <TouchlineRankingPodium catalogue={catalogue} seedRanking={playerRanking} coachRanking={renderedRanking}
          copy={copy} locale={locale} draftLocalesEnabled canEditCardEngine={false} />
      </section>
      <TouchlineCoachRankingTable coachRanking={renderedRanking} locale={locale} copy={copy} draftLocalesEnabled />
    </div>
  </main><TouchlineSiteFooter locale={locale} draftLocalesEnabled />
  </TouchlineCardLeadershipProvider></TouchlineLandscapeBoundary>;
}
