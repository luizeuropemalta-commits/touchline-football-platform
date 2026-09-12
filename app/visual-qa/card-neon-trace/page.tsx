import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import TouchlineEliteExactCard, {
  type TouchlineEliteExactPlayer,
} from "@/components/touchline/cards/TouchlineEliteExactCard";
import {
  TOUCHLINE_DEMO_COACH,
  createTouchlineArenaCoachSlot,
} from "@/lib/touchlineArena/coach-card";
import { TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT } from "@/lib/touchlineArena/coach-card-layout";
import type { TouchlineCardTierKey } from "@/lib/touchlineArena/card-rules";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { resolveTouchlineVisualQaLocale } from "@/lib/touchlineArena/visual-qa-locale";

export const metadata = {
  title: "TouchLine · Card perimeter trace visual QA",
  robots: { index: false, follow: false },
};

const club = findTouchLineClub("manchester-city")!;
const CARD_TIERS: readonly TouchlineCardTierKey[] = [
  "ruby-red", "sapphire-blue", "amethyst-purple", "radiant-gold",
  "emerald-green", "clear-diamond", "diamond-gold",
];

// This visual-QA fixture intentionally contains a complete, static editorial
// profile. Keep it separate from `player` because that public player shape
// correctly permits missing editorial data at runtime.
const TRACE_EDITORIAL_CARD: NonNullable<TouchlineEliteExactPlayer["editorialCard"]> = {
  tierKey: "radiant-gold",
  cardPrice: { amountMinor: 1500, currency: "GBP" },
  lastReviewedAt: "2026-08-11T00:00:00.000Z",
};

const player: TouchlineEliteExactPlayer = {
  sportmonksPlayerId: "static-neon-player",
  formationPlayerId: "static-neon-player",
  overall: 17,
  shirtNumber: 17,
  role: "midfielder",
  position: "CM",
  countryCode3: "ENG",
  name: "TRACE",
  clubName: club.name,
  clubLogoUrl: club.logoUrl,
  leagueName: "TouchLine England",
  leagueLogoUrl: null,
  // Compatibility-only legacy fields stay neutral. The fixture exercises the
  // published manual editorial profile below, never a player valuation.
  marketValue: null,
  marketValueSource: "unavailable",
  marketValueState: "unavailable",
  classificationState: "unavailable",
  cardTier: "radiant-gold",
  editorialCard: TRACE_EDITORIAL_CARD,
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
  totalRating: null,
  seasonStats: { goals: 0, assists: 0, defense: 0, cleanSheets: 0, yellowCards: 0, redCards: 0 },
};

function StaticPlayerCard({ locale, tier }: Readonly<{ locale: "en-GB" | "pt-BR"; tier: TouchlineCardTierKey }>) {
  const playerForTier: TouchlineEliteExactPlayer = {
    ...player,
    cardTier: tier,
    editorialCard: { ...TRACE_EDITORIAL_CARD, tierKey: tier },
  };
  return (
    <TouchlineEliteExactCard
      player={playerForTier}
      isEditable={false}
      persistLayoutToMaster={false}
      ignoreStoredLayout={true}
      startUnlocked={false}
      isRemovalMarkerEnabled={false}
      staticRenderScale={0.7}
      runtimeLocaleOverride={locale}
      subscribeToRanking={false}
      enableInteractiveNeon={false}
      showCardActions={false}
      showProfileAction={false}
      showMatchPoints={false}
      rankingMode="preview"
      showSocialMetrics={false}
    />
  );
}

function StaticCoachCard({ locale, tier }: Readonly<{ locale: "en-GB" | "pt-BR"; tier: TouchlineCardTierKey }>) {
  const coachSlot = {
    ...createTouchlineArenaCoachSlot(TOUCHLINE_DEMO_COACH, 12, tier),
    status: "awaiting-match-evidence" as const,
  };
  return (
    <TouchlineCoachCard
      coach={TOUCHLINE_DEMO_COACH}
      slot={coachSlot}
      clubName={club.name}
      clubLogoUrl={club.logoUrl}
      clubAccent={club.accent}
      countryCode3="ITA"
      locale={locale}
      layoutOverride={TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT}
      displayMode="default"
      optimizeForLiveCompact={false}
      enableInteractiveNeon={false}
    />
  );
}

type VisualQaPageProps = Readonly<{
  searchParams: Promise<Readonly<{ lang?: string }>>;
}>;

export default async function CardNeonTraceVisualQaPage({ searchParams }: VisualQaPageProps) {
  const locale = resolveTouchlineVisualQaLocale((await searchParams).lang);
  const copy = locale === "pt-BR"
    ? {
      title: "Traço perimetral canônico do card",
      description: "Um card estático de Jogador e um de Treinador exercitam o traço compartilhado pelo centro da borda, o token de tier canônico e o tratamento do escudo do clube. Não usa conta, provedor, elenco, contrato ou layout persistido.",
      player: "JOGADOR · 7 BORDAS OFICIAIS · ESCUDO DO MANCHESTER CITY",
      coach: "TREINADOR · 7 BORDAS OFICIAIS · ESCUDO DO MANCHESTER CITY",
      boundary: "Apenas fixture estático. A linha viajante completa um loop calmo, descansa como borda residual suave e reinicia automaticamente; usuários com redução de movimento recebem a borda estática iluminada, sem animação. Interação, assinaturas de dados, persistência de layout e acesso a provedor estão desativados.",
      cases: "Fixtures estáticos de traço perimetral do card",
    }
    : {
      title: "Canonical card perimeter trace",
      description: "One static Player card and one static Coach card exercise the shared centre-line trace, canonical tier token and club-crest treatment. No account, provider, roster, contract or persisted-layout data is used.",
      player: "PLAYER · 7 OFFICIAL BORDERS · MANCHESTER CITY CREST",
      coach: "COACH · 7 OFFICIAL BORDERS · MANCHESTER CITY CREST",
      boundary: "Static fixture only. The travelling line completes one calm loop, rests as a soft residual border, then restarts automatically; reduced-motion users receive the illuminated static border with no animation. Interaction, data subscriptions, layout persistence and provider access are disabled.",
      cases: "Static card perimeter trace fixtures",
    };

  return (
    <main
      data-card-neon-trace-fixture="static"
      data-visual-qa-locale={locale}
      lang={locale}
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
        <h1 style={{ margin: "9px 0 0", fontSize: "clamp(31px, 5vw, 56px)", letterSpacing: "-.05em", lineHeight: 1 }}>{copy.title}</h1>
        <p style={{ maxWidth: 800, margin: "15px 0 0", color: "rgba(226,232,240,.72)", fontSize: 15, lineHeight: 1.65 }}>
          {copy.description}
        </p>
      </header>

      <section
        aria-label={copy.cases}
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
        <article data-card-neon-trace-case="player" style={{ width: "min(100%, 550px)", display: "grid", justifyItems: "center", gap: 14 }}>
          <p style={{ margin: 0, color: "rgba(255,255,255,.74)", fontSize: 12, fontWeight: 850, letterSpacing: ".08em" }}>{copy.player}</p>
          <div data-card-neon-trace-tier-grid="player" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, width: "100%", justifyItems: "center" }}>
            {CARD_TIERS.map((tier) => <StaticPlayerCard key={tier} locale={locale} tier={tier} />)}
          </div>
        </article>
        <article data-card-neon-trace-case="coach" style={{ width: "min(100%, 550px)", display: "grid", justifyItems: "center", gap: 14 }}>
          <p style={{ margin: 0, color: "rgba(255,255,255,.74)", fontSize: 12, fontWeight: 850, letterSpacing: ".08em" }}>{copy.coach}</p>
          <div data-card-neon-trace-tier-grid="coach" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, width: "100%", justifyItems: "center" }}>
            {CARD_TIERS.map((tier) => <div key={tier} style={{ width: "min(190px, 100%)" }}><StaticCoachCard locale={locale} tier={tier} /></div>)}
          </div>
        </article>
      </section>

      <aside
        aria-label="Fixture safety boundary"
        style={{ width: "min(1180px, 100%)", margin: "32px auto 0", borderRadius: 16, border: "1px solid rgba(163, 230, 53, .24)", background: "rgba(77, 124, 15, .12)", padding: "14px 16px", color: "rgba(236,252,203,.88)", fontSize: 13, lineHeight: 1.55 }}
      >
        {copy.boundary}
      </aside>
    </main>
  );
}
