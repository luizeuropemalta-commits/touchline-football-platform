import TouchlineDecorationMotion from "../../components/touchline/TouchlineDecorationMotion";
import TouchlineGameweekCard from "../../components/touchline/fantasy/TouchlineGameweekCard";
import { TouchlineCardLeadershipProvider } from "../../components/touchline/cards/TouchlineCardLeadershipProvider";
import { EMPTY_CARD_LEADERSHIP_AUTHORITY } from "../../lib/touchlineArena/card-leadership-authority";
import type { ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";

const tiers = ["ruby-red", "sapphire-blue", "amethyst-purple", "radiant-gold", "emerald-green", "clear-diamond", "diamond-gold"] as const;
const positions = ["Goalkeeper", "Centre Back", "Right Back", "Central Midfield", "Right Winger", "Centre Forward"];

// Synthetic identities, ratings and publication inputs are isolated test data.
// No provider identity, account, server ranking or hosted transport is supplied.
// The 36 real gameweek cards, original tier artwork, zoom and motion owner run
// unchanged. This is a dense browser fixture, not an actual customer's roster.
const cards: ClubOwnerSquadCard[] = Array.from({ length: 36 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  const id = `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  return {
    id, canonicalPlayerId: id, providerPlayerId: null,
    name: `Synthetic Squad ${number}`, shortName: `Squad ${number}`,
    role: "synthetic", position: positions[index % positions.length],
    clubName: "Arsenal", countryCode3: "ENG", shirtNumber: index + 1,
    touchlinePoints: 0, seasonTotalRating: 0, marketValue: "—", marketValueState: "unavailable",
    editorialCard: { tierKey: tiers[index % tiers.length], cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: "2026-11-03T00:00:00.000Z" },
  };
});

export default function DenseSquadMotionBrowserFixture() {
  return <TouchlineCardLeadershipProvider value={EMPTY_CARD_LEADERSHIP_AUTHORITY}>
    <TouchlineDecorationMotion />
    <main style={{ padding: "20px 24px 40px", maxWidth: 844, marginInline: "auto" }}>
      <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: "20px" }}>Isolated synthetic squad · 36 original cards · no account or network</p>
      <section data-dense-squad-grid="true" aria-label="Synthetic full squad"
        style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", columnGap: 24, rowGap: 28 }}>
        {cards.map((card, index) => <article key={card.id} data-dense-card={index + 1}
          style={{ minWidth: 0, display: "grid", justifyItems: "center", alignContent: "start", gap: 8 }}>
          <TouchlineGameweekCard card={card} locale="en-GB" compact displayWidth={104} />
          <span style={{ fontSize: 12, lineHeight: "16px" }}>{String(index + 1).padStart(2, "0")}</span>
        </article>)}
      </section>
    </main>
  </TouchlineCardLeadershipProvider>;
}
