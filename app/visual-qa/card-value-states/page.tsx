import TouchlineEliteExactCard, {
  type TouchlineEliteExactPlayer,
} from "@/components/touchline/cards/TouchlineEliteExactCard";
import { resolveTouchlineVisualQaLocale } from "@/lib/touchlineArena/visual-qa-locale";

export const metadata = {
  title: "TouchLine · Editorial card-state visual QA",
  robots: { index: false, follow: false },
};

type CardFixture = Readonly<{
  id: "published" | "review" | "draft";
  label: string;
  description: string;
  expectedTier: string;
  expectedPresentation: string;
  editorialState: "published" | "review" | "draft";
  player: TouchlineEliteExactPlayer;
}>;

const FIXTURE_BASE: Omit<
  TouchlineEliteExactPlayer,
  | "sportmonksPlayerId"
  | "formationPlayerId"
  | "overall"
  | "shirtNumber"
  | "name"
  | "marketValue"
  | "marketValueSource"
  | "marketValueState"
  | "classificationState"
  | "cardTier"
  | "cardPriceVersion"
  | "cardPriceAuthority"
> = {
  role: "midfielder",
  position: "CM",
  countryCode3: "ENG",
  clubName: "Manchester City",
  clubLogoUrl: "/touchlineArena/shared/club-logos/2026-27/manchester-city.png",
  leagueName: "TouchLine England",
  leagueLogoUrl: null,
  updatedAt: "STATIC LOCAL QA FIXTURE",
  age: "—",
  height: "—",
  foot: "—",
  contract: "Synthetic fixture only",
  nationality: "England",
  stadiumName: null,
  avatarImageUrl: null,
  avatarStatus: "static-fixture",
  sourcePhotoUrl: null,
  frameUrl: null,
  cardTemplateUrl: null,
  fantasyPoints: 0,
  seasonStats: {
    goals: 0,
    assists: 0,
    defense: 0,
    cleanSheets: 0,
    yellowCards: 0,
    redCards: 0,
  },
};

const CARD_FIXTURES: readonly CardFixture[] = [
  {
    id: "published",
    label: "PUBLISHED · MANUAL PROFILE",
    description: "A synthetic published editorial profile with an explicitly approved tier and card price.",
    expectedTier: "Radiant Gold",
    expectedPresentation: "Manual tier · manual card price",
    editorialState: "published",
    player: {
      ...FIXTURE_BASE,
      sportmonksPlayerId: "visual-fixture-published",
      formationPlayerId: "visual-fixture-published",
      overall: 17,
      shirtNumber: 17,
      name: "PUBLISHED",
      marketValue: null,
      marketValueSource: "unavailable",
      marketValueState: "unavailable",
      classificationState: "unavailable",
      cardTier: null,
      cardPriceVersion: null,
      editorialCard: {
        tierKey: "radiant-gold",
        cardPrice: { amountMinor: 1500, currency: "GBP" },
        lastReviewedAt: "2026-08-10T09:00:00Z",
      },
    },
  },
  {
    id: "review",
    label: "REVIEW · NOT PUBLIC",
    description: "A synthetic editorial review remains neutral until an editor explicitly publishes its profile.",
    expectedTier: "Neutral",
    expectedPresentation: "No public card profile",
    editorialState: "review",
    player: {
      ...FIXTURE_BASE,
      sportmonksPlayerId: "visual-fixture-review",
      formationPlayerId: "visual-fixture-review",
      overall: 18,
      shirtNumber: 18,
      name: "REVIEW",
      marketValue: null,
      marketValueSource: "unavailable",
      marketValueState: "unavailable",
      classificationState: "unavailable",
      cardTier: null,
      cardPriceVersion: null,
    },
  },
  {
    id: "draft",
    label: "DRAFT · NOT PUBLIC",
    description: "A synthetic editorial draft stays neutral and exposes no unpublished card profile.",
    expectedTier: "Neutral",
    expectedPresentation: "No public card profile",
    editorialState: "draft",
    player: {
      ...FIXTURE_BASE,
      sportmonksPlayerId: "visual-fixture-draft",
      formationPlayerId: "visual-fixture-draft",
      overall: 19,
      shirtNumber: 19,
      name: "DRAFT",
      marketValue: null,
      marketValueSource: "unavailable",
      marketValueState: "unavailable",
      classificationState: "unavailable",
      cardTier: null,
      cardPriceVersion: null,
    },
  },
];

function StaticCanonicalCard({ player, locale }: { player: TouchlineEliteExactPlayer; locale: "en-GB" | "pt-BR" }) {
  return (
    <TouchlineEliteExactCard
      player={player}
      isEditable={false}
      persistLayoutToMaster={false}
      ignoreStoredLayout={true}
      startUnlocked={false}
      isRemovalMarkerEnabled={false}
      staticRenderScale={0.72}
      runtimeLocaleOverride={locale}
      subscribeToRanking={false}
      enableInteractiveNeon={false}
      showCardActions={false}
      showProfileAction={false}
      showMatchPoints={false}
      rankingMode="preview"
      showSocialMetrics={false}
      forceNeonActive={false}
    />
  );
}

type VisualQaPageProps = Readonly<{
  searchParams: Promise<Readonly<{ lang?: string }>>;
}>;

function fixtureCopy(fixture: CardFixture, locale: "en-GB" | "pt-BR") {
  if (locale !== "pt-BR") return fixture;
  const localized = {
    published: {
      label: "PUBLICADO · PERFIL MANUAL",
      description: "Perfil editorial sintético publicado, com tier e preço do card aprovados explicitamente.",
      expectedTier: "Radiant Gold",
      expectedPresentation: "Tier manual · preço manual do card",
    },
    review: {
      label: "EM REVISÃO · NÃO PÚBLICO",
      description: "Revisão editorial sintética permanece neutra até a publicação explícita do perfil.",
      expectedTier: "Neutro",
      expectedPresentation: "Sem perfil público de card",
    },
    draft: {
      label: "RASCUNHO · NÃO PÚBLICO",
      description: "Rascunho editorial sintético permanece neutro e não expõe perfil de card não publicado.",
      expectedTier: "Neutro",
      expectedPresentation: "Sem perfil público de card",
    },
  } as const;
  return { ...fixture, ...localized[fixture.id] };
}

export default async function CardValueStatesVisualQaPage({ searchParams }: VisualQaPageProps) {
  const locale = resolveTouchlineVisualQaLocale((await searchParams).lang);
  const ptBr = locale === "pt-BR";
  const copy = ptBr
    ? {
      title: "Estados editoriais do card",
      description: "Três fixtures sintéticos exercitam a fronteira de publicação editorial controlada pelo servidor. Não contêm dados de jogador, elenco, provedor, contrato ou conta.",
      expectedBorder: "Borda esperada",
      expectedPresentation: "Apresentação esperada",
      safety: "Apenas fixture visual estático. Assinatura de ranking, ações de card, links de perfil, seleção de neon, edição de layout e acesso a layout persistido estão desativados.",
    }
    : {
      title: "Editorial card states",
      description: "Three synthetic fixtures exercise the server-owned editorial publication boundary. They contain no player, roster, provider, contract or account data.",
      expectedBorder: "Expected border",
      expectedPresentation: "Expected presentation",
      safety: "Static visual fixture only. Ranking subscription, card actions, profile links, neon selection, layout editing and persisted layout access are disabled.",
    };

  return (
    <main
      data-card-value-states-fixture="static"
      data-visual-qa-locale={locale}
      lang={locale}
      style={{
        minHeight: "100dvh",
        background: "radial-gradient(circle at 50% 0%, rgba(125, 211, 252, .12), transparent 34%), linear-gradient(145deg, #03070d, #07120f 54%, #020406)",
        color: "#f8fafc",
        padding: "clamp(20px, 4vw, 56px)",
      }}
    >
      <header style={{ width: "min(1280px, 100%)", margin: "0 auto", borderBottom: "1px solid rgba(186, 230, 253, .22)", paddingBottom: 22 }}>
        <p style={{ margin: 0, color: "#bae6fd", fontSize: 12, fontWeight: 900, letterSpacing: ".14em" }}>ADMIN-GATED · STATIC LOCAL VISUAL QA</p>
        <h1 style={{ margin: "9px 0 0", fontSize: "clamp(31px, 5vw, 56px)", letterSpacing: "-.05em", lineHeight: 1 }}>{copy.title}</h1>
        <p style={{ maxWidth: 800, margin: "15px 0 0", color: "rgba(226,232,240,.72)", fontSize: 15, lineHeight: 1.65 }}>
          {copy.description}
        </p>
      </header>

      <section
        aria-label="Editorial card-state fixtures"
        style={{
          width: "min(1280px, 100%)",
          margin: "32px auto 0",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
          gap: "clamp(18px, 3vw, 30px)",
          alignItems: "start",
        }}
      >
        {CARD_FIXTURES.map((fixture) => {
          const localizedFixture = fixtureCopy(fixture, locale);
          return (
          <article
            key={fixture.id}
            data-card-fixture={fixture.id}
            data-editorial-state={fixture.editorialState}
            style={{
              display: "grid",
              gap: 16,
              border: "1px solid rgba(186, 230, 253, .20)",
              borderRadius: 24,
              background: "linear-gradient(150deg, rgba(15, 23, 42, .94), rgba(2, 9, 13, .98))",
              padding: "clamp(16px, 2vw, 24px)",
              boxShadow: "0 24px 60px rgba(0,0,0,.32)",
            }}
          >
            <div>
              <p style={{ margin: 0, color: "#bae6fd", fontSize: 11, fontWeight: 900, letterSpacing: ".1em" }}>{localizedFixture.label}</p>
              <p style={{ minHeight: 50, margin: "9px 0 0", color: "rgba(226,232,240,.70)", fontSize: 14, lineHeight: 1.55 }}>{localizedFixture.description}</p>
            </div>
            <StaticCanonicalCard player={localizedFixture.player} locale={locale} />
            <dl style={{ display: "grid", gap: 8, margin: 0, color: "rgba(226,232,240,.78)", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}><dt style={{ color: "rgba(186,230,253,.62)" }}>{copy.expectedBorder}</dt><dd style={{ margin: 0, fontWeight: 850, textAlign: "right" }}>{localizedFixture.expectedTier}</dd></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}><dt style={{ color: "rgba(186,230,253,.62)" }}>{copy.expectedPresentation}</dt><dd style={{ margin: 0, fontWeight: 850, textAlign: "right" }}>{localizedFixture.expectedPresentation}</dd></div>
            </dl>
          </article>
          );
        })}
      </section>

      <aside
        aria-label="Fixture safety boundary"
        style={{ width: "min(1280px, 100%)", margin: "26px auto 0", borderRadius: 16, border: "1px solid rgba(163, 230, 53, .24)", background: "rgba(77, 124, 15, .12)", padding: "14px 16px", color: "rgba(236,252,203,.88)", fontSize: 13, lineHeight: 1.55 }}
      >
        {copy.safety}
      </aside>
    </main>
  );
}
