import TouchlineEliteExactCard, {
  type TouchlineEliteExactPlayer,
} from "@/components/touchline/cards/TouchlineEliteExactCard";
import { resolveTouchlineVisualQaLocale } from "@/lib/touchlineArena/visual-qa-locale";

export const metadata = {
  title: "TouchLine · Player leader crown visual QA",
  robots: { index: false, follow: false },
};

const reviewedAt = "2026-09-10T00:00:00.000Z";

const player: TouchlineEliteExactPlayer = {
  sportmonksPlayerId: "visual-player-leader-provider",
  formationPlayerId: "visual-player-leader",
  // This is deliberately the same canonical subject used by the mocked
  // published leadership decision in the browser proof. Without it, the QA
  // card could never exercise the real crown eligibility path.
  canonicalPlayerId: "visual-player-leader",
  overall: 94,
  shirtNumber: 10,
  role: "midfielder",
  position: "CM",
  countryCode3: "ENG",
  name: "PLAYER LEADER QA",
  clubName: "Manchester City",
  clubLogoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/manchester-city.png",
  leagueName: "TouchLine England League",
  leagueLogoUrl: null,
  marketValue: null,
  marketValueSource: "unavailable",
  marketValueState: "unavailable",
  classificationState: "unavailable",
  cardTier: null,
  editorialCard: {
    tierKey: "diamond-gold",
    cardPrice: { amountMinor: 0, currency: "GBP" },
    lastReviewedAt: reviewedAt,
  },
  cardPriceVersion: null,
  updatedAt: "STATIC VISUAL QA SHELL",
  age: "—",
  height: "—",
  foot: "—",
  contract: "Static visual QA shell",
  nationality: "Static visual QA shell",
  stadiumName: null,
  avatarImageUrl: null,
  avatarStatus: "static-visual-qa",
  sourcePhotoUrl: null,
  frameUrl: null,
  cardTemplateUrl: null,
  fantasyPoints: 0,
  seasonStats: { goals: 0, assists: 0, defense: 0, cleanSheets: 0, yellowCards: 0, redCards: 0 },
};

type VisualQaPageProps = Readonly<{
  searchParams: Promise<Readonly<{ lang?: string }>>;
}>;

/**
 * The card starts crownless. Browser QA supplies a read-only canonical active
 * ranking response to exercise the real leadership decision seam; this page
 * itself does not manufacture a leader or fall back to rank/points.
 */
export default async function PlayerLeaderCrownVisualQaPage({ searchParams }: VisualQaPageProps) {
  const locale = resolveTouchlineVisualQaLocale((await searchParams).lang);

  return (
    <main
      data-player-leader-crown-visual-qa="canonical-decision-only"
      data-visual-qa-locale={locale}
      lang={locale}
      style={{
        minHeight: "100dvh",
        overflowX: "clip",
        background: "radial-gradient(circle at 50% 0%, rgba(255,207,73,.18), transparent 32%), linear-gradient(150deg, #02050a, #10110a 56%, #020407)",
        color: "#f8fafc",
        padding: "clamp(28px, 6vw, 76px) clamp(18px, 4vw, 56px)",
      }}
    >
      <header style={{ width: "min(920px, 100%)", margin: "0 auto", borderBottom: "1px solid rgba(255,225,139,.30)", paddingBottom: 22 }}>
        <p style={{ margin: 0, color: "#ffe18b", fontSize: 12, fontWeight: 900, letterSpacing: ".14em" }}>VISUAL QA · CANONICAL LEADERSHIP ONLY · NO WRITE</p>
        <h1 style={{ margin: "9px 0 0", fontSize: "clamp(31px, 5vw, 56px)", letterSpacing: "-.05em", lineHeight: 1 }}>Player leader crown</h1>
        <p style={{ maxWidth: 760, margin: "15px 0 0", color: "rgba(226,232,240,.72)", fontSize: 15, lineHeight: 1.65 }}>
          The crown is rendered only from the published, unique player-leadership decision. It is a transparent layer above the frame and never changes the card artwork.
        </p>
      </header>

      <section style={{ width: "min(520px, 100%)", margin: "clamp(150px, 22vw, 220px) auto 0", display: "grid", justifyItems: "center" }}>
        <TouchlineEliteExactCard
          player={player}
          isEditable={false}
          persistLayoutToMaster={false}
          ignoreStoredLayout={true}
          startUnlocked={false}
          isRemovalMarkerEnabled={false}
          staticRenderScale={0.78}
          runtimeLocaleOverride={locale}
          subscribeToRanking
          enableInteractiveNeon={false}
          showCardActions={false}
          showProfileAction={false}
          showMatchPoints={false}
          rankingMode="preview"
          showSocialMetrics={false}
        />
      </section>
    </main>
  );
}
