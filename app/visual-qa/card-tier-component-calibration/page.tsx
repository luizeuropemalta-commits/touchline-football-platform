import TouchlineEliteExactCard, {
  type TouchlineEliteExactPlayer,
} from "@/components/touchline/cards/TouchlineEliteExactCard";
import {
  TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATION_REVISION,
  TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATIONS,
  type TouchlineCardCalibrationPresentation,
} from "@/lib/touchlineArena/card-tier-component-calibration";
import { TOUCHLINE_CARD_TIER_KEYS } from "@/lib/touchlineArena/card-rules";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import { resolveTouchlineVisualQaLocale } from "@/lib/touchlineArena/visual-qa-locale";

export const metadata = {
  title: "TouchLine · Seven-tier component calibration visual QA",
  robots: { index: false, follow: false },
};

const CALIBRATION_PRESENTATIONS: readonly TouchlineCardCalibrationPresentation[] = ["normal", "compact", "zoom"];

function fixtureForTier(index: number): TouchlineEliteExactPlayer {
  const tierKey = TOUCHLINE_CARD_TIER_KEYS[index]!;
  const club = TOUCHLINE_ENGLAND_CLUBS[index]!;
  return {
    sportmonksPlayerId: `tier-calibration-${tierKey}`,
    formationPlayerId: `tier-calibration-${tierKey}`,
    overall: 10 + index,
    shirtNumber: 10 + index,
    role: "midfielder",
    position: "CM",
    countryCode3: "ENG",
    name: `CALIBRATION ${index + 1}`,
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
      cardPrice: { amountMinor: (index + 1) * 100, currency: "GBP" },
      lastReviewedAt: "2026-09-10T00:00:00.000Z",
    },
    cardPriceVersion: null,
    updatedAt: "STATIC VISUAL QA FIXTURE",
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
    fantasyPoints: 42 + index,
    seasonStats: { goals: 4, assists: 3, defense: 8, cleanSheets: 2, yellowCards: 1, redCards: 0 },
  };
}

function CardDelivery({ player, locale, presentation }: Readonly<{
  player: TouchlineEliteExactPlayer;
  locale: "en-GB" | "pt-BR";
  presentation: TouchlineCardCalibrationPresentation;
}>) {
  const compact = presentation === "compact";
  const zoom = presentation === "zoom";
  const renderScale = zoom ? 0.4 : 0.28;
  const metricSeed = Number(player.shirtNumber) || 0;

  return (
    <div data-card-calibration-presentation={presentation} style={{ display: "grid", justifyItems: "center", justifySelf: "center", width: 430 * renderScale, gap: 8 }}>
      <span style={{ color: "rgba(226,232,240,.7)", fontSize: 11, fontWeight: 850, letterSpacing: ".09em", textTransform: "uppercase" }}>{presentation}</span>
      <TouchlineEliteExactCard
        player={player}
        isEditable={false}
        persistLayoutToMaster={false}
        ignoreStoredLayout={true}
        staticRenderScale={renderScale}
        optimizeForLiveCompact={compact}
        tierCalibrationPresentation={presentation}
        runtimeLocaleOverride={locale}
        subscribeToRanking={false}
        enableInteractiveNeon={false}
        showCardActions
        showProfileAction={false}
        showMatchPoints={false}
        rankingMode="preview"
        showSocialMetrics
        followerCount={12_000 + metricSeed}
        likeCount={2_000 + metricSeed}
      />
    </div>
  );
}

type VisualQaPageProps = Readonly<{ searchParams: Promise<Readonly<{ lang?: string }>> }>;

export default async function CardTierComponentCalibrationVisualQaPage({ searchParams }: VisualQaPageProps) {
  const locale = resolveTouchlineVisualQaLocale((await searchParams).lang);
  const copy = locale === "pt-BR"
    ? { title: "Calibração visual dos sete tiers", description: "Fixture estática: nome, número, escudo, pontos, ações e logo, em normal, compacto e zoom. Não altera arte, moldura, camisa, ranking, dados ou armazenamento.", boundary: "SOMENTE QA VISUAL · SEM ESCRITA" }
    : { title: "Seven-tier visual calibration", description: "Static fixture: name, number, crest, points, actions and logo in normal, compact and zoom. It changes no artwork, frame, shirt, ranking, data or storage.", boundary: "VISUAL QA ONLY · NO WRITES" };

  return (
    <main data-card-tier-calibration-gallery="true" data-calibration-revision={TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATION_REVISION} lang={locale} style={{ minHeight: "100dvh", background: "linear-gradient(150deg, #02050a, #07150f 58%, #020407)", color: "#f8fafc", padding: "clamp(20px, 4vw, 56px)" }}>
      <header style={{ width: "min(1480px, 100%)", margin: "0 auto", borderBottom: "1px solid rgba(163,255,18,.25)", paddingBottom: 22 }}>
        <p style={{ margin: 0, color: "#caff6d", fontSize: 12, fontWeight: 900, letterSpacing: ".14em" }}>{copy.boundary}</p>
        <h1 style={{ margin: "9px 0 0", fontSize: "clamp(31px, 5vw, 56px)", letterSpacing: "-.05em", lineHeight: 1 }}>{copy.title}</h1>
        <p style={{ maxWidth: 920, margin: "15px 0 0", color: "rgba(226,232,240,.72)", fontSize: 15, lineHeight: 1.65 }}>{copy.description}</p>
      </header>
      <section aria-label={copy.title} style={{ width: "min(1480px, 100%)", margin: "32px auto 0", display: "grid", gap: 28 }}>
        {TOUCHLINE_CARD_TIER_KEYS.map((tierKey, index) => {
          const calibration = TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATIONS[tierKey];
          const player = fixtureForTier(index);
          return (
            <article key={tierKey} data-card-tier={tierKey} style={{ overflow: "hidden", border: `1px solid ${calibration.palette.accent}66`, borderRadius: 20, background: "rgba(2,8,12,.72)", padding: "clamp(16px, 2vw, 26px)" }}>
              <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong style={{ color: calibration.palette.accent, letterSpacing: ".09em", textTransform: "uppercase" }}>{tierKey}</strong>
                <small style={{ color: "rgba(226,232,240,.62)" }}>{calibration.layoutRevision}</small>
              </header>
              <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "clamp(18px, 2.5vw, 44px)", alignItems: "start", overflowX: "auto", paddingBottom: 8 }}>
                {CALIBRATION_PRESENTATIONS.map((presentation) => <CardDelivery key={presentation} player={player} locale={locale} presentation={presentation} />)}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
