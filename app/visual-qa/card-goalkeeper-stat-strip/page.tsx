import TouchlineEliteExactCard, {
  type TouchlineEliteExactPlayer,
} from "@/components/touchline/cards/TouchlineEliteExactCard";
import {
  TOUCHLINE_CARD_TIER_KEYS,
  type TouchlineCardTierKey,
} from "@/lib/touchlineArena/card-rules";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { resolveTouchlineVisualQaLocale } from "@/lib/touchlineArena/visual-qa-locale";

export const metadata = {
  title: "TouchLine · Goalkeeper stat-strip visual QA",
  robots: { index: false, follow: false },
};

const club = findTouchLineClub("manchester-city")!;
const REVIEWED_AT = "2026-09-10T00:00:00.000Z";

function staticPlayer(
  tierKey: TouchlineCardTierKey,
  role: "goalkeeper" | "midfielder",
): TouchlineEliteExactPlayer {
  const goalkeeper = role === "goalkeeper";

  return {
    sportmonksPlayerId: `static-${role}-${tierKey}`,
    formationPlayerId: `static-${role}-${tierKey}`,
    overall: goalkeeper ? 91 : 88,
    shirtNumber: goalkeeper ? 1 : 8,
    role,
    position: goalkeeper ? "GK" : "CM",
    countryCode3: goalkeeper ? "BRA" : "ENG",
    name: goalkeeper ? "STATIC GOALKEEPER" : "STATIC MIDFIELDER",
    clubName: club.name,
    clubLogoUrl: club.logoUrl,
    leagueName: "TouchLine England League",
    leagueLogoUrl: null,
    marketValue: null,
    marketValueSource: "unavailable",
    marketValueState: "unavailable",
    classificationState: "unavailable",
    cardTier: null,
    editorialCard: {
      tierKey,
      cardPrice: { amountMinor: 0, currency: "GBP" },
      lastReviewedAt: REVIEWED_AT,
    },
    cardPriceVersion: null,
    updatedAt: "STATIC LOCAL VISUAL QA",
    age: "—",
    height: "—",
    foot: "—",
    contract: "Static fixture only",
    nationality: "Static fixture",
    stadiumName: null,
    avatarImageUrl: null,
    avatarStatus: "static-fixture",
    sourcePhotoUrl: null,
    frameUrl: null,
    cardTemplateUrl: null,
    fantasyPoints: 0,
    seasonStats: goalkeeper
      ? { goals: 0, assists: 0, saves: 43, cleanSheets: 9, yellowCards: 0, redCards: 0 }
      : { goals: 6, assists: 8, defense: 18, cleanSheets: 7, yellowCards: 0, redCards: 0 },
  };
}

function StaticCard({ player, locale }: Readonly<{
  player: TouchlineEliteExactPlayer;
  locale: "en-GB" | "pt-BR";
}>) {
  return (
    <TouchlineEliteExactCard
      player={player}
      isEditable={false}
      persistLayoutToMaster={false}
      ignoreStoredLayout={true}
      startUnlocked={false}
      isRemovalMarkerEnabled={false}
      staticRenderScale={0.4}
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

type VisualQaPageProps = Readonly<{
  searchParams: Promise<Readonly<{ lang?: string }>>;
}>;

export default async function GoalkeeperStatStripVisualQaPage({ searchParams }: VisualQaPageProps) {
  const locale = resolveTouchlineVisualQaLocale((await searchParams).lang);
  const copy = locale === "pt-BR"
    ? {
      title: "QA visual · estatística de goleiro",
      description: "Fixtures estáticos e sanitizados conferem GOL, AST, SAVES e CS do goleiro contra GOL, AST, DEF e CS do jogador de linha nas sete molduras oficiais.",
      goalkeeper: "GOLEIRO · SLOT 3: SAVES / LUVA",
      outfield: "JOGADOR DE LINHA · SLOT 3: DEF / ESCUDO",
    }
    : {
      title: "Visual QA · goalkeeper statistic",
      description: "Static, sanitised fixtures compare the goalkeeper's GOL, AST, SAVES and CS with an outfield player's GOL, AST, DEF and CS across all seven official frames.",
      goalkeeper: "GOALKEEPER · SLOT 3: SAVES / GLOVE",
      outfield: "OUTFIELD PLAYER · SLOT 3: DEF / SHIELD",
    };

  return (
    <main
      data-goalkeeper-stat-strip-visual-qa="static"
      data-visual-qa-locale={locale}
      lang={locale}
      style={{
        minHeight: "100dvh",
        overflowX: "clip",
        background: "radial-gradient(circle at 50% 0%, rgba(163,255,18,.13), transparent 32%), linear-gradient(150deg, #02050a, #06130f 56%, #020407)",
        color: "#f8fafc",
        padding: "clamp(20px, 4vw, 56px)",
      }}
    >
      <header style={{ width: "min(1280px, 100%)", margin: "0 auto", borderBottom: "1px solid rgba(163,255,18,.25)", paddingBottom: 22 }}>
        <p style={{ margin: 0, color: "#caff6d", fontSize: 12, fontWeight: 900, letterSpacing: ".14em" }}>ADMIN-GATED · STATIC LOCAL VISUAL QA · NO LOGIN · NO PROVIDER · NO WRITE</p>
        <h1 style={{ margin: "9px 0 0", fontSize: "clamp(31px, 5vw, 56px)", letterSpacing: "-.05em", lineHeight: 1 }}>{copy.title}</h1>
        <p style={{ maxWidth: 860, margin: "15px 0 0", color: "rgba(226,232,240,.72)", fontSize: 15, lineHeight: 1.65 }}>{copy.description}</p>
      </header>

      <section style={{ width: "min(1280px, 100%)", margin: "32px auto 0", display: "grid", gap: "clamp(28px, 4vw, 48px)" }}>
        {TOUCHLINE_CARD_TIER_KEYS.map((tierKey) => (
          <article key={tierKey} data-gk-qa-tier={tierKey} style={{ borderRadius: 24, border: "1px solid rgba(255,255,255,.12)", background: "rgba(4,9,14,.72)", padding: "clamp(18px, 3vw, 30px)" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>{tierKey.replace("-", " ")}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "clamp(20px, 4vw, 48px)", justifyItems: "center", alignItems: "start", marginTop: 18 }}>
              <section style={{ display: "grid", justifyItems: "center", gap: 9 }}>
                <b style={{ fontSize: 11, letterSpacing: ".08em", color: "#caff6d" }}>{copy.goalkeeper}</b>
                <StaticCard player={staticPlayer(tierKey, "goalkeeper")} locale={locale} />
              </section>
              <section style={{ display: "grid", justifyItems: "center", gap: 9 }}>
                <b style={{ fontSize: 11, letterSpacing: ".08em", color: "rgba(226,232,240,.76)" }}>{copy.outfield}</b>
                <StaticCard player={staticPlayer(tierKey, "midfielder")} locale={locale} />
              </section>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
