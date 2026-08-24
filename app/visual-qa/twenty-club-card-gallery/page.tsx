import TouchlineEliteExactCard, {
  type TouchlineEliteExactPlayer,
} from "@/components/touchline/cards/TouchlineEliteExactCard";
import { TOUCHLINE_CARD_TIER_KEYS } from "@/lib/touchlineArena/card-rules";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import { resolveTouchlineVisualQaLocale } from "@/lib/touchlineArena/visual-qa-locale";

export const metadata = {
  title: "TouchLine · Twenty-club card gallery visual QA",
  robots: { index: false, follow: false },
};

const QA_REVIEWED_AT = "2026-08-11T00:00:00.000Z";

const players: readonly TouchlineEliteExactPlayer[] = TOUCHLINE_ENGLAND_CLUBS.map((club, index) => {
  const tierKey = TOUCHLINE_CARD_TIER_KEYS[index % TOUCHLINE_CARD_TIER_KEYS.length]!;
  const nominalPriceGbp = [0, 1, 2, 4, 7, 10, 15][index % TOUCHLINE_CARD_TIER_KEYS.length]!;
  return {
    sportmonksPlayerId: `static-gallery-${club.teamId}`,
    formationPlayerId: `static-gallery-${club.teamId}`,
    overall: 0,
    shirtNumber: index + 1,
    role: "midfielder",
    position: "CM",
    countryCode3: "ENG",
    name: club.name,
    clubName: club.name,
    clubLogoUrl: club.logoUrl,
    leagueName: "TouchLine England",
    leagueLogoUrl: null,
    marketValue: null,
    marketValueSource: "unavailable",
    marketValueState: "unavailable",
    classificationState: "unavailable",
    cardTier: null,
    editorialCard: {
      tierKey,
      cardPrice: { amountMinor: nominalPriceGbp * 100, currency: "GBP" },
      lastReviewedAt: QA_REVIEWED_AT,
    },
    cardPriceVersion: null,
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
});

function StaticGalleryCard({ player, locale }: Readonly<{
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
      staticRenderScale={0.38}
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

export default async function TwentyClubCardGalleryVisualQaPage({ searchParams }: VisualQaPageProps) {
  const locale = resolveTouchlineVisualQaLocale((await searchParams).lang);
  const copy = locale === "pt-BR"
    ? {
      title: "Galeria dos 20 clubes · cards editoriais",
      description: "Uma fixture local mostra um card publicado estático por clube, distribuindo os sete tiers canônicos. Ela valida escudo, moldura, traço e nome do clube sem usar valores de mercado, conta, provedor ou banco.",
      boundary: "ADMIN-GATED · STATIC LOCAL VISUAL QA · dados fictícios · nenhum card é publicado por esta página",
    }
    : {
      title: "Twenty-club gallery · editorial cards",
      description: "One static published card per club distributes the seven canonical tiers. It validates crest, frame, trace and club name without market values, an account, provider or database access.",
      boundary: "ADMIN-GATED · STATIC LOCAL VISUAL QA · fictional data · this page publishes no card",
    };

  return (
    <main
      data-twenty-club-card-gallery="static"
      data-visual-qa-locale={locale}
      lang={locale}
      style={{
        minHeight: "100dvh",
        overflowX: "clip",
        background: "radial-gradient(circle at 50% 0%, rgba(163,255,18,.15), transparent 30%), linear-gradient(150deg, #02050a, #06130f 56%, #020407)",
        color: "#f8fafc",
        padding: "clamp(20px, 4vw, 56px)",
      }}
    >
      <header style={{ width: "min(1280px, 100%)", margin: "0 auto", borderBottom: "1px solid rgba(163,255,18,.25)", paddingBottom: 22 }}>
        <p style={{ margin: 0, color: "#caff6d", fontSize: 12, fontWeight: 900, letterSpacing: ".14em" }}>{copy.boundary}</p>
        <h1 style={{ margin: "9px 0 0", fontSize: "clamp(31px, 5vw, 56px)", letterSpacing: "-.05em", lineHeight: 1 }}>{copy.title}</h1>
        <p style={{ maxWidth: 860, margin: "15px 0 0", color: "rgba(226,232,240,.72)", fontSize: 15, lineHeight: 1.65 }}>{copy.description}</p>
      </header>
      <section
        aria-label={copy.title}
        style={{
          width: "min(1280px, 100%)",
          margin: "32px auto 0",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
          gap: "clamp(16px, 2.2vw, 30px)",
          justifyItems: "center",
          alignItems: "start",
        }}
      >
        {players.map((player) => (
          <article key={player.sportmonksPlayerId} data-club-team-id={player.sportmonksPlayerId.replace("static-gallery-", "")} style={{ width: "min(100%, 210px)", display: "grid", justifyItems: "center", gap: 8 }}>
            <p style={{ margin: 0, color: "rgba(255,255,255,.72)", fontSize: 10, fontWeight: 850, letterSpacing: ".06em", textAlign: "center" }}>{player.clubName}</p>
            <StaticGalleryCard player={player} locale={locale} />
          </article>
        ))}
      </section>
    </main>
  );
}
