import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "../../components/touchline/cards/TouchlineEliteExactCard";

// Mirrors the failing T12 Forest160 renderer and original asset. The browser
// diagnostic substitutes a separate DOM clone only, never this image or file.
const player: TouchlineEliteExactPlayer = {
  sportmonksPlayerId: "synthetic-outline-calibration", name: "Synthetic Outline", overall: "—", shirtNumber: 9,
  role: "forward", position: "CF", countryCode3: "NZL", clubName: "Nottingham Forest", leagueName: "Synthetic fixture",
  clubLogoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/nottingham-forest.png",
  marketValue: null, updatedAt: "2026-10-21", age: "—", height: "—", foot: "—", contract: "—", nationality: "Synthetic",
  cardTier: "ruby-red", cardTemplateUrl: "/touchlineArena/cards/templates/clubs/Nottingham%20Forest/market-tiers/ruby-red.png",
};
export default function CrestOutlineCalibrationBrowserFixture() {
  return <main style={{ background: "#07110e", padding: 24 }}>
    <p>INDEPENDENT SYNTHETIC CALIBRATION — NOT T12 ACCEPTANCE</p>
    <div data-calibration-card="true" style={{ width: 160 }}>
      <TouchlineEliteExactCard player={player} staticRenderScale={160 / 430} ignoreStoredLayout allowVisualInventoryPreview
        subscribeToRanking={false} enableInteractiveNeon={false} imageLoading="eager" runtimeLocaleOverride="en-GB" />
    </div>
  </main>;
}
