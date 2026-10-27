import TouchlineCoachCard from "../../components/touchline/cards/TouchlineCoachCard";
import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "../../components/touchline/cards/TouchlineEliteExactCard";
import { createTouchlineArenaCoachSlot } from "../../lib/touchlineArena/coach-card";
import { TOUCHLINE_CARD_TIER_KEYS, type TouchlineCardTierKey } from "../../lib/touchlineArena/card-rules";

// Synthetic identity only. Each tier uses its actual approved Arsenal/coach
// artwork through the real renderer; no account, publication or provider.
export default function CardFrameDensityBrowserFixture({ presentation, tiers = TOUCHLINE_CARD_TIER_KEYS, coachDisplayWidth }: {
  presentation: "compact" | "zoom"; tiers?: readonly TouchlineCardTierKey[]; coachDisplayWidth?: number;
}) {
  const compact = presentation === "compact";
  const playerWidth = compact ? 119 : 390;
  const coachWidth = compact ? coachDisplayWidth ?? 160 : 390;
  return <main style={{ background: "#07110e", padding: 24 }}>
    <p>ISOLATED FRAME DELIVERY — SYNTHETIC IDENTITY — NOT QA ACCEPTANCE</p>
    {TOUCHLINE_CARD_TIER_KEYS.filter(tier => tiers.includes(tier)).map(tier => {
      const player: TouchlineEliteExactPlayer = {
        sportmonksPlayerId: `synthetic-density-${tier}`, name: "Synthetic Density", overall: "—", shirtNumber: 9,
        role: "forward", position: "CF", countryCode3: "NZL", clubName: "Arsenal FC", leagueName: "Synthetic fixture",
        clubLogoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png",
        marketValue: null, updatedAt: "2026-10-21", age: "—", height: "—", foot: "—", contract: "—", nationality: "Synthetic",
        cardTier: tier, cardTemplateUrl: `/touchlineArena/cards/templates/clubs/Arsenal%20FC/market-tiers/${tier}.png`,
      };
      return <section key={tier} data-frame-tier={tier} style={{ padding: 8, marginBottom: 24, width: 860 }}>
        <h2>{tier} · {presentation}</h2>
        <div style={{ display: "flex", alignItems: "start", gap: 32 }}>
          <div data-frame-kind="player" style={{ width: playerWidth }}>
            <TouchlineEliteExactCard player={player} staticRenderScale={playerWidth / 430} optimizeForLiveCompact={compact}
              ignoreStoredLayout allowVisualInventoryPreview subscribeToRanking={false} enableInteractiveNeon={false}
              showCardActions={false} showProfileAction={false} showSocialMetrics={false}
              imageLoading="eager" runtimeLocaleOverride="en-GB" />
          </div>
          <div data-frame-kind="coach" style={{ width: coachWidth }}>
            <TouchlineCoachCard coach={null} slot={createTouchlineArenaCoachSlot(null, null, tier)}
              displayMode={compact ? "compact" : "default"} optimizeForLiveCompact={compact}
              frameDisplayWidth={compact ? coachDisplayWidth : undefined}
              clubName="Arsenal FC" clubLogoUrl="/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png" countryCode3="ENG"
              enableInteractiveNeon={false} showLeadershipCrown={false} assetLoading="eager" frameLoading="eager" />
          </div>
        </div>
      </section>;
    })}
  </main>;
}
