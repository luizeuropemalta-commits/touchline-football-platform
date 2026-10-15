import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "@/components/touchline/cards/TouchlineEliteExactCard";
import { notFound } from "next/navigation";
import { inspectTouchlineIsolatedPreviewEnvironment } from "@/lib/touchlinePreview/isolation";
import TouchlineGoldenBootPresentation from "@/components/touchline/cards/TouchlineGoldenBootPresentation";
import { TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_ASSET, touchlinePlayerLeaderGoldenBallStyle } from "@/lib/touchlineArena/player-leader-golden-ball-presentation";

export const metadata = { title: "Golden Boot · isolated visual fixture", robots: { index: false, follow: false } };
const player: TouchlineEliteExactPlayer = {
  name: "VISUAL FIXTURE", sportmonksPlayerId: "visual-only", formationPlayerId: "visual-only",
  overall: 94, shirtNumber: 10, role: "forward", position: "ST", countryCode3: "ENG",
  clubName: "Manchester City", clubLogoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/manchester-city.png",
  leagueName: "Visual fixture", leagueLogoUrl: null,
  marketValue: null, marketValueSource: "unavailable", marketValueState: "unavailable",
  classificationState: "unavailable", cardTier: null,
  editorialCard: { tierKey: "diamond-gold", cardPrice: { amountMinor: 0, currency: "GBP" }, lastReviewedAt: "2026-09-10T00:00:00.000Z" },
  cardPriceVersion: null, updatedAt: "STATIC VISUAL FIXTURE", age: "—", height: "—", foot: "—",
  contract: "Visual fixture", nationality: "Visual fixture", stadiumName: null,
  avatarImageUrl: null, avatarStatus: "static-visual-qa", sourcePhotoUrl: null, frameUrl: null, cardTemplateUrl: null,
  fantasyPoints: 0, seasonStats: { goals: 0, assists: 0, defense: 0, cleanSheets: 0, yellowCards: 0, redCards: 0 },
};

export default function GoldenBootPreview() {
  const localDevelopment = process.env.NODE_ENV === "development"
    && !process.env.VERCEL && !process.env.VERCEL_ENV && !process.env.VERCEL_URL;
  const validatedQa = process.env.VERCEL_ENV === "preview"
    && inspectTouchlineIsolatedPreviewEnvironment().status === "qa";
  if (!localDevelopment && !validatedQa) notFound();
  return <main lang="en-GB" data-golden-boot-fixture="synthetic-no-award-authority" style={{ padding: 24, background: "#080d16", color: "white", minHeight: "100dvh" }}>
    <h1>Golden Boot — visual fixture only</h1>
    <p>No current scorer or leadership is asserted. The Golden Ball below is a presentation sample, not a ranking decision.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "start" }}>
      {[64, 100, 300].flatMap((width) => [false, true].map((goldenBall) => {
        const goldenBallStyle = touchlinePlayerLeaderGoldenBallStyle(width / 430);
        return <section key={`${width}-${goldenBall}`} data-fixture-width={width} data-fixture-golden-ball={String(goldenBall)}>
          <h2 style={{ fontSize: 12 }}>{width}px · {goldenBall ? "both" : "boot"}</h2>
          <div style={{ paddingTop: goldenBall ? -goldenBallStyle.top : 0 }}>
            <TouchlineGoldenBootPresentation cardWidth={width} label="Golden Boot — demonstration only">
              {goldenBall ? <img src={TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_ASSET} alt="Golden Ball — demonstration only" data-fixture-golden-ball-image="true"
                style={{ position: "absolute", width: goldenBallStyle.width, height: "auto", top: goldenBallStyle.top, left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }} /> : null}
              <TouchlineEliteExactCard player={player} isEditable={false} persistLayoutToMaster={false}
                ignoreStoredLayout startUnlocked={false} isRemovalMarkerEnabled={false}
                staticRenderScale={width / 430} runtimeLocaleOverride="en-GB" subscribeToRanking={false}
                enableInteractiveNeon={false} showCardActions={false} showProfileAction={false}
                showMatchPoints={false} rankingMode="preview" showSocialMetrics={false} />
            </TouchlineGoldenBootPresentation>
          </div>
        </section>;
      }))}
    </div>
  </main>;
}
