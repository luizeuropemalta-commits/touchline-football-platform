import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import TouchlineEliteExactCard, {
  type TouchlineEliteExactPlayer,
} from "@/components/touchline/cards/TouchlineEliteExactCard";
import {
  TOUCHLINE_DEMO_COACH,
  createTouchlineArenaCoachSlot,
} from "@/lib/touchlineArena/coach-card";
import { TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT } from "@/lib/touchlineArena/coach-card-layout";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";

export const metadata = {
  title: "TouchLine · Card perimeter trace visual QA",
  robots: { index: false, follow: false },
};

const club = findTouchLineClub("manchester-city")!;

const player: TouchlineEliteExactPlayer = {
  sportmonksPlayerId: "static-neon-player",
  formationPlayerId: "static-neon-player",
  overall: 17,
  shirtNumber: 17,
  role: "midfielder",
  position: "CM",
  countryCode3: "ENG",
  name: "STATIC TRACE PLAYER",
  clubName: club.name,
  clubLogoUrl: club.logoUrl,
  leagueName: "TouchLine England",
  leagueLogoUrl: null,
  marketValue: "€20M",
  marketValueSource: "verified-cache",
  marketValueState: "verified",
  classificationState: "verified",
  cardTier: "radiant-gold",
  cardPriceVersion: "2026-07-premier-v1",
  updatedAt: "STATIC LOCAL QA FIXTURE",
  age: "—",
  height: "—",
  foot: "—",
  contract: "Static fixture only",
  nationality: "England",
  stadiumName: null,
  avatarImageUrl: null,
  avatarStatus: "static-fixture",
  sourcePhotoUrl: null,
  frameUrl: null,
  cardTemplateUrl: null,
  fantasyPoints: 0,
  seasonStats: { goals: 0, assists: 0, defense: 0, cleanSheets: 0, yellowCards: 0, redCards: 0 },
};

const coachSlot = {
  ...createTouchlineArenaCoachSlot(TOUCHLINE_DEMO_COACH, 12, "radiant-gold"),
  status: "awaiting-match-evidence" as const,
};

function StaticPlayerCard() {
  return (
    <TouchlineEliteExactCard
      player={player}
      isEditable={false}
      persistLayoutToMaster={false}
      ignoreStoredLayout={true}
      startUnlocked={false}
      isRemovalMarkerEnabled={false}
      staticRenderScale={0.7}
      runtimeLocaleOverride="en-GB"
      subscribeToRanking={false}
      enableInteractiveNeon={false}
      showCardActions={false}
      showProfileAction={false}
      showMatchPoints={false}
      rankingMode="preview"
      showSocialMetrics={false}
      forceNeonActive
    />
  );
}

function StaticCoachCard() {
  return (
    <TouchlineCoachCard
      coach={TOUCHLINE_DEMO_COACH}
      slot={coachSlot}
      clubName={club.name}
      clubLogoUrl={club.logoUrl}
      clubAccent={club.accent}
      countryCode3="ITA"
      locale="en-GB"
      layoutOverride={TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT}
      displayMode="default"
      optimizeForLiveCompact={false}
      enableInteractiveNeon={false}
      forceNeonActive
    />
  );
}

export default function CardNeonTraceVisualQaPage() {
  return (
    <main
      data-card-neon-trace-fixture="static"
      style={{
        minHeight: "100dvh",
        overflowX: "clip",
        background: "radial-gradient(circle at 50% 0%, rgba(255,216,94,.14), transparent 34%), linear-gradient(145deg, #03070d, #07120f 54%, #020406)",
        color: "#f8fafc",
        padding: "clamp(20px, 4vw, 56px)",
      }}
    >
      <header style={{ width: "min(1180px, 100%)", margin: "0 auto", borderBottom: "1px solid rgba(255, 242, 168, .24)", paddingBottom: 22 }}>
        <p style={{ margin: 0, color: "#fff2a8", fontSize: 12, fontWeight: 900, letterSpacing: ".14em" }}>ADMIN-GATED · STATIC LOCAL VISUAL QA</p>
        <h1 style={{ margin: "9px 0 0", fontSize: "clamp(31px, 5vw, 56px)", letterSpacing: "-.05em", lineHeight: 1 }}>Canonical card perimeter trace</h1>
        <p style={{ maxWidth: 800, margin: "15px 0 0", color: "rgba(226,232,240,.72)", fontSize: 15, lineHeight: 1.65 }}>
          One static Player card and one static Coach card exercise the shared centre-line trace, canonical tier token and club-crest treatment. No account, provider, roster, contract or persisted-layout data is used.
        </p>
      </header>

      <section
        aria-label="Static card perimeter trace fixtures"
        style={{
          width: "min(1180px, 100%)",
          margin: "32px auto 0",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
          gap: "clamp(22px, 4vw, 54px)",
          justifyItems: "center",
          alignItems: "start",
        }}
      >
        <article data-card-neon-trace-case="player" style={{ width: "min(100%, 420px)", display: "grid", justifyItems: "center", gap: 14 }}>
          <p style={{ margin: 0, color: "rgba(255,255,255,.74)", fontSize: 12, fontWeight: 850, letterSpacing: ".08em" }}>PLAYER · RADIANT GOLD · MANCHESTER CITY CREST</p>
          <StaticPlayerCard />
        </article>
        <article data-card-neon-trace-case="coach" style={{ width: "min(100%, 420px)", display: "grid", justifyItems: "center", gap: 14 }}>
          <p style={{ margin: 0, color: "rgba(255,255,255,.74)", fontSize: 12, fontWeight: 850, letterSpacing: ".08em" }}>COACH · RADIANT GOLD · MANCHESTER CITY CREST</p>
          <div style={{ width: "min(330px, 100%)" }}><StaticCoachCard /></div>
        </article>
      </section>

      <aside
        aria-label="Fixture safety boundary"
        style={{ width: "min(1180px, 100%)", margin: "32px auto 0", borderRadius: 16, border: "1px solid rgba(163, 230, 53, .24)", background: "rgba(77, 124, 15, .12)", padding: "14px 16px", color: "rgba(236,252,203,.88)", fontSize: 13, lineHeight: 1.55 }}
      >
        Static fixture only. The travelling line finishes as a soft residual border; reduced-motion users receive the illuminated static border with no animation. Interaction, data subscriptions, layout persistence and provider access are disabled.
      </aside>
    </main>
  );
}
