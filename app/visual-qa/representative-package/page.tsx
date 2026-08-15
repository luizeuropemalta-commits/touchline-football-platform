import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import TouchlineCardZoom, {
  TouchlineCardZoomDetailsPanel,
} from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard, {
  type TouchlineEliteExactPlayer,
} from "@/components/touchline/cards/TouchlineEliteExactCard";
import { buildTouchlinePlayerCardZoomDetails } from "@/lib/touchlineArena/card-zoom-details";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT } from "@/lib/touchlineArena/coach-card-layout";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import {
  TOUCHLINE_QA_REPRESENTATIVE_COACH,
  TOUCHLINE_QA_REPRESENTATIVE_FIXTURE_VERSION,
  TOUCHLINE_QA_UI_STATES,
} from "@/lib/touchlineArena/qa-representative-fixtures";
import { resolveTouchlineVisualQaLocale } from "@/lib/touchlineArena/visual-qa-locale";

export const metadata = {
  title: "TouchLine · Representative QA package",
  robots: { index: false, follow: false },
};

const club = findTouchLineClub("manchester-city")!;

const playerBase: Omit<TouchlineEliteExactPlayer, "sportmonksPlayerId" | "formationPlayerId" | "overall" | "shirtNumber" | "name"> = {
  role: "midfielder",
  position: "CM",
  countryCode3: "ENG",
  clubName: club.name,
  clubLogoUrl: club.logoUrl,
  leagueName: "TouchLine England",
  leagueLogoUrl: null,
  marketValue: null,
  marketValueSource: "unavailable",
  marketValueState: "unavailable",
  classificationState: "unavailable",
  cardTier: null,
  cardPriceVersion: null,
  updatedAt: "QA FIXTURE · NOT AN OFFICIAL FOOTBALL FACT",
  age: "—",
  height: "—",
  foot: "—",
  contract: "QA FIXTURE ONLY",
  nationality: "QA Fixture",
  stadiumName: null,
  avatarImageUrl: "/touchlineArena/qa-fixtures/missing-player-image.webp",
  avatarStatus: "qa-missing-image-fallback",
  sourcePhotoUrl: null,
  frameUrl: null,
  cardTemplateUrl: null,
  fantasyPoints: 0,
  seasonStats: { goals: 0, assists: 0, defense: 0, cleanSheets: 0, yellowCards: 0, redCards: 0 },
};

const longNamePlayer: TouchlineEliteExactPlayer = {
  ...playerBase,
  sportmonksPlayerId: "qa-fixture-long-name",
  formationPlayerId: "qa-fixture-long-name",
  overall: 88,
  shirtNumber: 88,
  name: "Alexandre Representative-Santos",
  editorialCard: {
    tierKey: "diamond-gold",
    cardPrice: { amountMinor: 1500, currency: "GBP" },
    lastReviewedAt: "2026-08-15T00:00:00.000Z",
  },
};

const shortNamePlayer: TouchlineEliteExactPlayer = {
  ...playerBase,
  sportmonksPlayerId: "qa-fixture-short-name",
  formationPlayerId: "qa-fixture-short-name",
  overall: 7,
  shirtNumber: 7,
  name: "Kai",
  editorialCard: {
    tierKey: "ruby-red",
    cardPrice: { amountMinor: 0, currency: "GBP" },
    lastReviewedAt: "2026-08-15T00:00:00.000Z",
  },
};

const coachSlot = {
  ...createTouchlineArenaCoachSlot(TOUCHLINE_QA_REPRESENTATIVE_COACH, null, "sapphire-blue"),
  status: "awaiting-match-evidence" as const,
};

function StaticPlayerCard({
  player,
  locale,
  compact = false,
  scale = 0.7,
}: Readonly<{
  player: TouchlineEliteExactPlayer;
  locale: "en-GB" | "pt-BR";
  compact?: boolean;
  scale?: number;
}>) {
  return (
    <TouchlineEliteExactCard
      player={player}
      isEditable={false}
      persistLayoutToMaster={false}
      ignoreStoredLayout={true}
      startUnlocked={false}
      isRemovalMarkerEnabled={false}
      staticRenderScale={scale}
      runtimeLocaleOverride={locale}
      subscribeToRanking={false}
      enableInteractiveNeon={false}
      showCardActions={false}
      showProfileAction={false}
      showMatchPoints={false}
      rankingMode="preview"
      showSocialMetrics={false}
      forceNeonActive={false}
      optimizeForLiveCompact={compact}
    />
  );
}
type PageProps = Readonly<{ searchParams: Promise<Readonly<{ lang?: string }>> }>;

export default async function RepresentativePackageVisualQaPage({ searchParams }: PageProps) {
  const locale = resolveTouchlineVisualQaLocale((await searchParams).lang);
  const pt = locale === "pt-BR";
  const activeContractDetails = buildTouchlinePlayerCardZoomDetails({
    locale,
    name: pt ? "Contrato ativo preservado" : "Preserved active contract",
    clubName: club.name,
    position: "CM",
    nationality: pt ? "Fixture QA" : "QA Fixture",
    activeContractCard: { tierKey: "emerald-green", cardPrice: "£7.00" },
    touchlinePoints: 0,
    eyebrow: "QA FIXTURE · ACTIVE-CONTRACT AUTHORITY",
  });
  const publishedDetails = buildTouchlinePlayerCardZoomDetails({
    locale,
    name: longNamePlayer.name,
    clubName: club.name,
    position: longNamePlayer.position,
    nationality: longNamePlayer.nationality,
    editorialCard: longNamePlayer.editorialCard,
    touchlinePoints: 0,
    eyebrow: "QA FIXTURE · PUBLISHED EDITORIAL CARD",
  });
  const copy = pt
    ? {
      title: "Pacote representativo de QA",
      description: "Fixtures sintéticos, administrativos e não públicos para validar composição visual, fallback e estados de produto sem alterar dados canônicos.",
      full: "Card completo · nome longo · imagem ausente",
      compact: "Card compacto · nome curto",
      zoom: "Abrir zoom do card publicado",
      coach: "Treinador sintético · apresentação apenas",
      ui: "Estados de interface",
      boundary: "Nenhuma identidade desta página é oficial, comercial ou publicável. Nenhuma ação, assinatura de dados, persistência de layout, perfil público ou contratação está ativa.",
    }
    : {
      title: "Representative QA package",
      description: "Synthetic, admin-only, non-public fixtures validate visual composition, fallback and product states without changing canonical data.",
      full: "Full card · long name · missing image",
      compact: "Compact card · short name",
      zoom: "Open published-card zoom",
      coach: "Synthetic coach · presentation only",
      ui: "Interface states",
      boundary: "No identity on this page is official, commercial or publishable. Actions, data subscriptions, layout persistence, public profiles and signings are disabled.",
    };

  return (
    <main
      data-representative-qa-package="static"
      data-qa-fixture-version={TOUCHLINE_QA_REPRESENTATIVE_FIXTURE_VERSION}
      data-production-allowed="false"
      data-visual-qa-locale={locale}
      lang={locale}
      style={{ minHeight: "100dvh", overflowX: "clip", background: "radial-gradient(circle at 50% 0%, rgba(164,255,40,.13), transparent 35%), #020806", color: "#f8fafc", padding: "clamp(20px,4vw,56px)" }}
    >
      <header style={{ width: "min(1280px,100%)", margin: "0 auto", borderBottom: "1px solid rgba(164,255,40,.25)", paddingBottom: 22 }}>
        <p style={{ margin: 0, color: "#a4ff28", fontSize: 12, fontWeight: 900, letterSpacing: ".14em" }}>ADMIN-GATED · QA FIXTURE · NOT PRODUCTION DATA</p>
        <h1 style={{ margin: "9px 0 0", fontSize: "clamp(31px,5vw,56px)", letterSpacing: "-.05em", lineHeight: 1 }}>{copy.title}</h1>
        <p style={{ maxWidth: 850, color: "rgba(226,232,240,.74)", lineHeight: 1.65 }}>{copy.description}</p>
      </header>

      <section aria-label="Representative player-card fixtures" style={{ width: "min(1280px,100%)", margin: "32px auto 0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 24, alignItems: "start" }}>
        <article data-qa-card-case="published-long-name-missing-image" style={{ display: "grid", gap: 14, padding: 20, border: "1px solid rgba(164,255,40,.25)", borderRadius: 24, background: "rgba(3,14,11,.92)" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{copy.full}</h2>
          <TouchlineCardZoom
            ariaLabel={copy.zoom}
            expandedContent={<StaticPlayerCard player={longNamePlayer} locale={locale} scale={0.92} />}
            details={publishedDetails}
            tierAccent="#ffd85e"
            tierLabel="Diamond Gold · QA FIXTURE"
          >
            <StaticPlayerCard player={longNamePlayer} locale={locale} />
          </TouchlineCardZoom>
        </article>

        <article data-qa-card-case="published-short-name-compact" style={{ display: "grid", gap: 14, padding: 20, border: "1px solid rgba(164,255,40,.25)", borderRadius: 24, background: "rgba(3,14,11,.92)" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{copy.compact}</h2>
          <StaticPlayerCard player={shortNamePlayer} locale={locale} compact={true} scale={0.62} />
        </article>

        <article data-qa-card-case="active-contract-authority" style={{ display: "grid", gap: 14, padding: 20, border: "1px solid rgba(164,255,40,.25)", borderRadius: 24, background: "rgba(3,14,11,.92)" }}>
          <TouchlineCardZoomDetailsPanel details={activeContractDetails} />
        </article>

        <article data-qa-card-case="synthetic-coach" style={{ display: "grid", gap: 14, padding: 20, border: "1px solid rgba(164,255,40,.25)", borderRadius: 24, background: "rgba(3,14,11,.92)" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{copy.coach}</h2>
          <TouchlineCoachCard
            coach={TOUCHLINE_QA_REPRESENTATIVE_COACH}
            slot={coachSlot}
            clubName="QA Fixture Club"
            clubLogoUrl={null}
            clubAccent="#5ab4ff"
            countryCode3="ENG"
            locale={locale}
            layoutOverride={TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT}
            displayMode="default"
            optimizeForLiveCompact={false}
            enableInteractiveNeon={false}
          />
        </article>
      </section>

      <section aria-label={copy.ui} style={{ width: "min(1280px,100%)", margin: "28px auto 0" }}>
        <h2>{copy.ui}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          {TOUCHLINE_QA_UI_STATES.map((state) => (
            <div key={state} data-qa-ui-state={state} role="status" style={{ minHeight: 72, display: "grid", placeItems: "center", borderRadius: 14, border: "1px solid rgba(125,211,252,.22)", background: "rgba(8,20,24,.92)", color: "#bae6fd", fontWeight: 850, textTransform: "uppercase", letterSpacing: ".08em", fontSize: 11 }}>
              {state.replace("-", " ")}
            </div>
          ))}
        </div>
      </section>

      <aside aria-label="QA fixture safety boundary" style={{ width: "min(1280px,100%)", margin: "26px auto 0", padding: "14px 16px", borderRadius: 16, border: "1px solid rgba(164,255,40,.24)", background: "rgba(77,124,15,.12)", color: "rgba(236,252,203,.88)", fontSize: 13, lineHeight: 1.55 }}>
        {copy.boundary}
      </aside>
    </main>
  );
}
