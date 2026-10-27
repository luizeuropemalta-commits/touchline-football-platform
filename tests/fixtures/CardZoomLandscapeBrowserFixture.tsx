import TouchlineGameweekCard from "../../components/touchline/fantasy/TouchlineGameweekCard";
import TouchlineCoachCardZoom from "../../components/touchline/cards/TouchlineCoachCardZoom";
import { TouchlineCardLeadershipProvider } from "../../components/touchline/cards/TouchlineCardLeadershipProvider";
import { buildTouchlineCardLeadershipValue } from "../../lib/touchlineArena/card-leadership-authority";
import { buildTouchlineRankingSnapshot } from "../../lib/touchlineArena/card-ranking";
import { parseTouchlineActiveRankingState } from "../../lib/touchlineArena/card-ranking-live";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../../lib/touchlineArena/card-rules";
import { createTouchlineArenaCoachSlot } from "../../lib/touchlineArena/coach-card";
import type { ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";
import type { TouchlineCoach } from "../../lib/football-data/types";

// Synthetic identities/publication are only layout inputs. The production zoom,
// dialogue hooks, player/coach components, crown authority and artwork are real.
const playerId = "10000000-0000-4000-8000-000000000001";
const now = "2026-10-24T00:00:00.000Z";
const player: ClubOwnerSquadCard = {
  id: playerId, canonicalPlayerId: playerId, providerPlayerId: "990001",
  name: "Synthetic Landscape Player", shortName: "Landscape Player", role: "forward", position: "Centre Forward",
  clubName: "Arsenal", countryCode3: "ENG", shirtNumber: 9, touchlinePoints: 0, seasonTotalRating: 9,
  marketValue: "€1m", marketValueState: "verified",
  editorialCard: { tierKey: "sapphire-blue", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: now },
};
const snapshot = buildTouchlineRankingSnapshot({ snapshotId: "synthetic-landscape-ranking", roundId: "synthetic-round", generatedAt: now,
  source: "simulation", status: "published", players: [{ playerId, providerPlayerId: "990001", name: player.name,
    clubName: "Arsenal", position: "ST", totalRating: 9, minutesPlayed: 90, appearances: 1 },
    // A verified ranking is complete across all six position groups. These
    // unrendered peers establish valid authority rather than bypass its parser.
    ...["GK", "CB", "RB", "CM", "RW"].map((position, index) => ({
      playerId: `10000000-0000-4000-8000-00000000000${index + 2}`, providerPlayerId: String(990010 + index),
      name: `Synthetic ranking peer ${index}`, clubName: "Arsenal", position, totalRating: 7, minutesPlayed: 90, appearances: 1,
    }))] });
const ranking = parseTouchlineActiveRankingState({ phase: "ranked", leagueKey: "touchline-england", snapshotId: snapshot.snapshotId,
  roundId: snapshot.roundId, publishedAt: now, priceTableVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION, scoringVersion: "player_scoring_v4",
  coverageStatus: "complete", seasonId: "10000000-0000-4000-8000-000000000050", fixtureIds: ["990090"], expectedFixtureIds: ["990090"],
  totalScorePoints: 0, players: snapshot.players,
  leadershipDecision: { status: "unique-leader", scope: { rankingId: "touchline-player-overall", snapshotId: snapshot.snapshotId },
    leader: { subjectType: "player", subjectId: playerId } }, cardGoals: null });
if (!ranking) throw Error("Synthetic landscape crown authority rejected");
const authority = buildTouchlineCardLeadershipValue(ranking, null);
const coach: TouchlineCoach = { id: "synthetic-landscape-coach", providerId: "990002", provider: "sportmonks",
  name: "Synthetic Landscape Coach", displayName: "Synthetic Landscape Coach", teamId: "19", nationality: "England",
  dateOfBirth: "1980-01-01", source: { provider: "sportmonks", providerId: "990002", raw: { syntheticLayoutFixture: true } } };

export default function CardZoomLandscapeBrowserFixture() {
  return <TouchlineCardLeadershipProvider value={authority}>
    <main style={{ minHeight: 1700, padding: "550px 80px 300px" }}>
      <div style={{ display: "flex", gap: 48, alignItems: "end" }}>
        <div data-landscape-subject="player" style={{ width: 80 }}>
          <TouchlineGameweekCard card={player} locale="en-GB" compact displayWidth={80} />
        </div>
        <div data-landscape-subject="coach" style={{ width: 80 }}>
          <TouchlineCoachCardZoom coach={coach} slot={createTouchlineArenaCoachSlot(coach, 1, "sapphire-blue")}
            countryCode3="ENG" clubName="Arsenal" clubLogoUrl="/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png" locale="en-GB" contract={null} showLeadershipCrown assetLoading="eager"
            profileHref="/touchline-coaches/990002?lang=en-GB" />
        </div>
      </div>
    </main>
  </TouchlineCardLeadershipProvider>;
}
