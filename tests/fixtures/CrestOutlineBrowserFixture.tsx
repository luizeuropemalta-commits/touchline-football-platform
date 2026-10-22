import TouchlineCoachCard from "../../components/touchline/cards/TouchlineCoachCard";
import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "../../components/touchline/cards/TouchlineEliteExactCard";
import { createTouchlineArenaCoachSlot } from "../../lib/touchlineArena/coach-card";

const player: TouchlineEliteExactPlayer = {
  sportmonksPlayerId: "synthetic-outline-only", name: "Synthetic Outline", overall: "—", shirtNumber: 9,
  role: "forward", position: "CF", countryCode3: "NZL", clubName: "Nottingham Forest", leagueName: "Synthetic fixture",
  clubLogoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/nottingham-forest.png",
  marketValue: null, updatedAt: "2026-10-21", age: "—", height: "—", foot: "—", contract: "—", nationality: "Synthetic",
  cardTier: "ruby-red", cardTemplateUrl: "/touchlineArena/cards/templates/clubs/Nottingham%20Forest/market-tiers/ruby-red.png",
};

// Synthetic identity only. Original artwork and real components; no account or financial action.
export default function CrestOutlineBrowserFixture() {
  return <main style={{ background: "#07110e", padding: 24 }}>
    <p>ISOLATED SYNTHETIC FIXTURE — NOT QA ACCEPTANCE</p>
    {[160, 430].map(width => <section key={width} style={{ display: "flex", gap: 32, marginBottom: 24 }}>
      <div data-case={`tottenham-${width}`} style={{ width }}>
        <TouchlineCoachCard coach={null} slot={createTouchlineArenaCoachSlot(null, null, "sapphire-blue")}
          displayMode={width === 160 ? "compact" : "default"}
          clubName="Tottenham Hotspur" clubLogoUrl="/touchlineArena/shared/club-logos/2026-27/ui-512/tottenham-hotspur.png"
          enableInteractiveNeon={false} showLeadershipCrown={false} assetLoading="eager" frameLoading="eager" />
      </div>
      <div data-case={`forest-${width}`} style={{ width }}>
        <TouchlineEliteExactCard player={player} staticRenderScale={width / 430} ignoreStoredLayout allowVisualInventoryPreview
          subscribeToRanking={false} enableInteractiveNeon={false} imageLoading="eager" runtimeLocaleOverride="en-GB" />
      </div>
    </section>)}
  </main>;
}
