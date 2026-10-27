import TouchlineCoachCardZoom from "../../components/touchline/cards/TouchlineCoachCardZoom";
import TouchlineGameweekCard from "../../components/touchline/fantasy/TouchlineGameweekCard";
import { createTouchlineArenaCoachSlot } from "../../lib/touchlineArena/coach-card";
import type { TouchlineCoach } from "../../lib/football-data/types";
import type { ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";

// Synthetic identities, real components and local artwork. No account or data writes.
const coach: TouchlineCoach = {
  id: "synthetic-crest-coach", provider: "sportmonks", providerId: "990001",
  name: "Fixture Coach", displayName: "Fixture Coach", teamId: "19",
  source: { provider: "sportmonks", providerId: "990001", raw: { syntheticLayoutFixture: true } },
};
const player: ClubOwnerSquadCard = {
  id: "synthetic-crest-player", canonicalPlayerId: "synthetic-crest-player", name: "Fixture Player", shortName: "Player",
  role: "midfielder", position: "Central Midfield", clubName: "Arsenal", shirtNumber: 8, countryCode3: "ENG",
  marketValue: "", marketValueState: "verified", touchlinePoints: 0, seasonTotalRating: null,
  editorialCard: { tierKey: "sapphire-blue", marketValueEur: 1_000_000, marketValueState: "verified",
    cardPrice: { amountMinor: 0, currency: "GBP" }, lastReviewedAt: "2026-10-03T00:00:00Z" },
};

export default function CoachZoomCrestFixture() {
  return <main style={{ display: "flex", gap: 32, padding: 24 }}>
    <section data-fixture-kind="player" style={{ width: 96 }}>
      <TouchlineGameweekCard card={player} locale="en-GB" displayWidth={96} />
    </section>
    <section data-fixture-kind="coach" style={{ width: 96 }}>
      <TouchlineCoachCardZoom coach={coach} slot={createTouchlineArenaCoachSlot(coach, 1, "sapphire-blue")}
        clubName="Arsenal" clubLogoUrl="/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png"
        countryCode3="ENG" locale="en-GB" contract={null} competition={null} profileHref="/touchline-coaches/990001?lang=en-GB" />
    </section>
  </main>;
}
