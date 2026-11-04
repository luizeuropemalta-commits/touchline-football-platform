import TouchlineCoachCategoryShowcase from "../../components/touchline/TouchlineCoachCategoryShowcase";
import { legacyCoachCatalogue } from "../../lib/touchlineArena/coach-catalogue-contract";
import { TOUCHLINE_ENGLAND_CLUBS } from "../../lib/touchlineArena/demo-data";
import TouchlineDecorationMotion from "../../components/touchline/TouchlineDecorationMotion";
import { TOUCHLINE_CARD_TIER_KEYS } from "../../lib/touchlineArena/card-rules";
import type { ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";
import styles from "../../app/touchline-clubs/touchline-clubs.module.css";

// Synthetic current-ranking transport over real seed identities/classifications.
// It exercises seven real cards (including a repeated tier), not current facts,
// a server route, provider data or QA publication correctness.
const catalogue = { ...legacyCoachCatalogue(), phase: "ready" as const, revision: 1 };
const ids = ["307", "455907", "529482", "255", "455355", "95", "523911"];
const rows = ids.map((id, index) => {
  const entry = catalogue.current.find(item => item.coach.providerId === id)!;
  return { rank: index + 1, coachProviderId: id, coachName: entry.coach.displayName,
    clubName: TOUCHLINE_ENGLAND_CLUBS.find(club => club.teamId === entry.coach.teamId)!.name,
    touchlinePoints: 0, wins: 0, draws: 0, losses: 0, awayWins: 0,
    home: { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 }, away: { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 } };
});
// Synthetic public player identities, real immutable seven-tier artwork. No
// external account/provider fact, price/valuation claim or editable inventory.
const playerEntries = TOUCHLINE_CARD_TIER_KEYS.map((tierKey, index) => ({ officialRank: index + 1, card: {
  id: `synthetic-gallery-${index}`, canonicalPlayerId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  providerPlayerId: String(100 + index), name: `Gallery Player ${index + 1}`, shortName: `Player ${index + 1}`,
  role: "forward", position: "ST", clubName: "Manchester City", shirtNumber: index + 1, countryCode3: "ENG", touchlinePoints: 0,
  marketValue: "€1000000", marketValueSource: "verified-cache", marketValueState: "verified",
  editorialCard: { tierKey, cardPrice: { amountMinor: 1500, currency: "GBP" }, marketValueEur: 1000000, lastReviewedAt: "2026-11-04T00:00:00Z" },
  publishedRanking: { snapshotId: "synthetic-gallery", providerPlayerId: String(100 + index), totalRating: 7 - index, minutesPlayed: 90, appearances: 1 },
} satisfies ClubOwnerSquadCard }));
export default function CoachGalleryFrameDensityBrowserFixture() {
  return <main className={styles.shell} dir="ltr">
    <TouchlineDecorationMotion />
    <div className={styles.content} data-gallery-directory-content>
      <TouchlineCoachCategoryShowcase locale="en-GB" playerEntries={playerEntries} coachRanking={{
        phase: "ranked", snapshotId: "synthetic-gallery", seasonId: "2026-27", scoringVersion: "coach_scoring_v2",
        fixtureIds: [], generatedAt: null, rows, catalogue,
      }} />
    </div>
  </main>;
}
