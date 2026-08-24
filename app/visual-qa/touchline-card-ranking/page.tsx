import RankingSimulator from "./ranking-simulator";
import { CLUB_OWNER_SQUAD_CARDS } from "@/lib/touchlineArena/demo-data";
import { buildTouchlineRankingSnapshot } from "@/lib/touchlineArena/card-ranking";

export default function TouchlineCardRankingQaPage() {
  const simulatedPlayers = CLUB_OWNER_SQUAD_CARDS.map((card, index) => {
    const shirtNumber = card.shirtNumber ?? 0;
    return {
      playerId: card.id,
      providerPlayerId: `qa-${String(index + 1).padStart(3, "0")}`,
      name: card.name,
      clubName: card.clubName,
      position: card.position,
      role: card.role,
      // The visual fixture follows the public ranking contract: ratings are
      // the sole player-performance order, never a converted points value.
      totalRating: Number((8 + ((index * 11 + shirtNumber * 3) % 43) / 10).toFixed(2)),
      minutesPlayed: 90 + ((index * 137 + shirtNumber * 17) % 810),
      appearances: 1 + ((index * 3 + shirtNumber) % 10),
    };
  });

  const snapshot = buildTouchlineRankingSnapshot({
    snapshotId: "qa-round-01-v1",
    roundId: "qa-round-01",
    status: "draft",
    generatedAt: "2026-08-15T18:00:00.000Z",
    source: "simulation",
    players: simulatedPlayers,
  });

  return <RankingSimulator snapshot={snapshot} />;
}
