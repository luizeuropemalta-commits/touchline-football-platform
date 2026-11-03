import TouchlineGameweekCard from "../../components/touchline/fantasy/TouchlineGameweekCard";
import { useState } from "react";
import { TouchlineCardLeadershipProvider } from "../../components/touchline/cards/TouchlineCardLeadershipProvider";
import { buildTouchlineCardLeadershipValue } from "../../lib/touchlineArena/card-leadership-authority";
import { buildTouchlineRankingSnapshot } from "../../lib/touchlineArena/card-ranking";
import { parseTouchlineActiveRankingState } from "../../lib/touchlineArena/card-ranking-live";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../../lib/touchlineArena/card-rules";
import type { ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";

// Synthetic identities/publication are test inputs only. Production card, zoom,
// authority parser, award consumers, dialog and artwork are real.
const playerId = "10000000-0000-4000-8000-000000000001";
const now = "2026-10-24T00:00:00.000Z";
const player: ClubOwnerSquadCard = {
  id: playerId, canonicalPlayerId: playerId, providerPlayerId: "990001",
  name: "Synthetic Dual Award Player", shortName: "Dual Award Player", role: "forward", position: "Centre Forward",
  clubName: "Arsenal", countryCode3: "ENG", shirtNumber: 9, touchlinePoints: 0, seasonTotalRating: 9,
  marketValue: "€1m", marketValueState: "verified", seasonStats: { goals: 12 },
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
    leader: { subjectType: "player", subjectId: playerId } }, cardGoals: { source: "published-card-goals-v1", snapshotId: snapshot.snapshotId, rows: snapshot.players.map(row => ({ playerId: row.playerId, goals: row.playerId === playerId ? 12 : 1 })) } });
if (!ranking) throw Error("Synthetic landscape crown authority rejected");
export default function DualAwardBrowserFixture() {
  const [boot, setBoot] = useState(true);
  const value = buildTouchlineCardLeadershipValue(boot ? ranking : { ...ranking!, cardGoals: null }, null);
  return <TouchlineCardLeadershipProvider value={value}>
    <main style={{ padding: "100px 40px 40px", color: "white" }}>
      <p>Synthetic publication only — no real leadership changed</p>
      <button type="button" onClick={() => setBoot(value => !value)}>Toggle synthetic goals publication</button>
      <div data-dual-award-card="true" style={{ width: 240, marginTop: 80 }}>
        <TouchlineGameweekCard card={player} locale="en-GB" displayWidth={240} />
      </div>
    </main>
  </TouchlineCardLeadershipProvider>;

}
