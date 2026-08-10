import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import type { CSSProperties } from "react";
import TouchlineEliteExactCard, {
  type TouchlineEliteExactPlayer,
} from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import { TOUCHLINE_DEMO_COACH, createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT } from "@/lib/touchlineArena/coach-card-layout";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { resolveTouchlineVisualQaLocale } from "@/lib/touchlineArena/visual-qa-locale";

import styles from "./arena-main-field.module.css";

export const metadata = {
  title: "TouchLine · Arena main field visual QA",
  robots: { index: false, follow: false },
};

function requireStaticClub() {
  const club = findTouchLineClub("manchester-city");
  if (!club) throw new Error("TL_STATIC_ARENA_FIELD_QA_CLUB_UNAVAILABLE");
  return club;
}

const staticClub = requireStaticClub();

const STATIC_FIELD_SLOTS = [
  { id: "gk", name: "Harper Quinn", position: "GK", role: "goalkeeper", shirtNumber: 1, x: 50, y: 98, cardTier: "clear-diamond" },
  { id: "rb", name: "Mikael Hart", position: "RB", role: "defender", shirtNumber: 2, x: 79, y: 82, cardTier: "sapphire-blue" },
  { id: "rcb", name: "Tomás Alexander Vale", position: "CB", role: "defender", shirtNumber: 4, x: 60, y: 82, cardTier: "ruby-red" },
  { id: "lcb", name: "Dario Maximilian Cole", position: "CB", role: "defender", shirtNumber: 5, x: 40, y: 82, cardTier: "ruby-red" },
  { id: "lb", name: "Elliot Brooks", position: "LB", role: "defender", shirtNumber: 3, x: 21, y: 82, cardTier: "sapphire-blue" },
  { id: "rcm", name: "Rafael Elias Stone", position: "CM", role: "midfielder", shirtNumber: 8, x: 72, y: 55, cardTier: "radiant-gold" },
  { id: "cm", name: "Nico Alexander Reed", position: "CM", role: "midfielder", shirtNumber: 6, x: 50, y: 55, cardTier: "emerald-green" },
  { id: "lcm", name: "Thiago James Moreno", position: "CM", role: "midfielder", shirtNumber: 10, x: 28, y: 55, cardTier: "radiant-gold" },
  { id: "rw", name: "Isaac Benjamin Ford", position: "RW", role: "forward", shirtNumber: 11, x: 78, y: 27, cardTier: "amethyst-purple" },
  { id: "cf", name: "Leo Christopher Grant", position: "CF", role: "forward", shirtNumber: 9, x: 50, y: 27, cardTier: "diamond-gold" },
  { id: "lw", name: "Mateo Victor Hale", position: "LW", role: "forward", shirtNumber: 7, x: 22, y: 27, cardTier: "amethyst-purple" },
] as const;

type StaticFieldSlot = (typeof STATIC_FIELD_SLOTS)[number];

const STATIC_COACH_SLOT = {
  ...createTouchlineArenaCoachSlot(TOUCHLINE_DEMO_COACH, 12, "radiant-gold"),
  status: "awaiting-match-evidence" as const,
};

function staticPlayer(slot: StaticFieldSlot): TouchlineEliteExactPlayer {
  return {
    sportmonksPlayerId: `static-arena-${slot.id}`,
    formationPlayerId: `static-arena-${slot.id}`,
    overall: slot.shirtNumber,
    shirtNumber: slot.shirtNumber,
    role: slot.role,
    position: slot.position,
    countryCode3: "ENG",
    name: slot.name,
    clubName: staticClub.name,
    clubLogoUrl: staticClub.logoUrl,
    leagueName: "TouchLine England",
    leagueLogoUrl: null,
    marketValue: "€20M",
    marketValueSource: "verified-cache",
    marketValueState: "verified",
    classificationState: "verified",
    cardTier: slot.cardTier,
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
}

function StaticFieldCard({ slot, locale }: Readonly<{ slot: StaticFieldSlot; locale: "en-GB" | "pt-BR" }>) {
  return (
    <div
      className={styles.fieldPlayer}
      data-static-arena-field-player={slot.id}
      data-formation-position={slot.position}
      style={{ "--field-x": `${slot.x}%`, "--field-y": `${slot.y}%` } as CSSProperties}
      tabIndex={0}
      aria-label={`${slot.position} · ${slot.name}`}
    >
      <span className={styles.playerGroundShadow} aria-hidden="true" />
      <TouchlineEliteExactCard
        player={staticPlayer(slot)}
        className={styles.fieldCard}
        isEditable={false}
        persistLayoutToMaster={false}
        ignoreStoredLayout={true}
        startUnlocked={false}
        isRemovalMarkerEnabled={false}
        initialRenderScale={0.16}
        optimizeForLiveCompact
        runtimeLocaleOverride={locale}
        subscribeToRanking={false}
        enableInteractiveNeon={false}
        showCardActions={false}
        showProfileAction={false}
        showMatchPoints={false}
        rankingMode="preview"
        showSocialMetrics={false}
      />
    </div>
  );
}

type VisualQaPageProps = Readonly<{
  searchParams: Promise<Readonly<{ lang?: string; viewport?: string }>>;
}>;

function visualViewport(value?: string) {
  return value === "390" || value === "768" || value === "1280" ? value : "1280";
}

export default async function ArenaMainFieldVisualQaPage({ searchParams }: VisualQaPageProps) {
  const { lang, viewport: viewportParam } = await searchParams;
  const locale = resolveTouchlineVisualQaLocale(lang);
  const viewport = visualViewport(viewportParam);
  const embedded = viewportParam != null;
  const ptBr = locale === "pt-BR";
  const copy = ptBr
    ? {
      title: "Campo principal da Arena · contrato visual",
      description: "Fixture estático local de um 4-3-3, treinador técnico e barra premium de placares. Não usa conta, Live, banco, provedor, cache, arrastar ou persistência.",
      field: "Campo tático estático 4-3-3",
      coach: "Área técnica",
      scoreRail: "Placares premium · sem data nesta superfície",
      live: "AO VIVO · 63′",
      final: "FINAL",
      next: "PRÓXIMO",
      staticNotice: "ADMIN-GATED · STATIC LOCAL VISUAL QA",
      frames: "Matrizes de viewport estáticas",
      desktop: "1280PX · DESKTOP",
      tablet: "768PX · TABLET",
      mobile: "390PX · MOBILE",
      boundary: "Os cards são puramente visuais: não podem selecionar, arrastar, gravar escalação ou acionar uma chamada de dados.",
    }
    : {
      title: "Arena main field · visual contract",
      description: "Static local fixture for a 4-3-3, technical coach and premium score rail. It uses no account, Live, database, provider, cache, drag or persistence.",
      field: "Static 4-3-3 tactical field",
      coach: "Technical area",
      scoreRail: "Premium scores · no date on this surface",
      live: "LIVE · 63′",
      final: "FT",
      next: "NEXT",
      staticNotice: "ADMIN-GATED · STATIC LOCAL VISUAL QA",
      frames: "Static viewport matrix",
      desktop: "1280PX · DESKTOP",
      tablet: "768PX · TABLET",
      mobile: "390PX · MOBILE",
      boundary: "Cards are visual-only: they cannot select, drag, save a lineup or trigger a data call.",
    };

  const frameWidth = viewport === "390" ? 390 : viewport === "768" ? 768 : 1280;

  return (
    <main
      className={styles.page}
      data-arena-main-field-fixture="static"
      data-arena-main-field-viewport={viewport}
      data-visual-qa-locale={locale}
      lang={locale}
    >
      {!embedded ? (
        <header className={styles.header}>
          <p>{copy.staticNotice}</p>
          <h1>{copy.title}</h1>
          <span>{copy.description}</span>
        </header>
      ) : null}

      <section
        className={styles.viewportCanvas}
        aria-label={`${copy.field} · ${viewport}px`}
        style={{ "--fixture-width": `${frameWidth}px` } as CSSProperties}
      >
        <div className={styles.arenaGrid}>
          <TouchlinePitchSurface ariaLabel={copy.field} className={styles.pitch}>
            <div className={styles.fieldPlayerLayer}>
              {STATIC_FIELD_SLOTS.map((slot) => <StaticFieldCard key={slot.id} slot={slot} locale={locale} />)}
            </div>
          </TouchlinePitchSurface>

          <aside className={styles.technicalArea} aria-label={copy.coach}>
            <p>{copy.coach}</p>
            <TouchlineCoachCard
              className={styles.coachCard}
              coach={TOUCHLINE_DEMO_COACH}
              slot={STATIC_COACH_SLOT}
              clubName={staticClub.name}
              clubLogoUrl={staticClub.logoUrl}
              clubAccent={staticClub.accent}
              countryCode3="ITA"
              locale={locale}
              layoutOverride={TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT}
              displayMode="compact"
              optimizeForLiveCompact
              enableInteractiveNeon={false}
              frameLoading="eager"
              frameDecoding="sync"
              frameFetchPriority="high"
            />
          </aside>

          <section className={styles.scoreRail} aria-label={copy.scoreRail}>
            <p>{copy.scoreRail}</p>
            <div className={styles.scoreFixtures}>
              <article data-static-arena-score="live">
                <strong>Manchester City</strong><span>1</span><b aria-hidden="true">—</b><span>0</span><strong>Arsenal</strong><em>{copy.live}</em>
              </article>
              <article data-static-arena-score="final">
                <strong>Liverpool</strong><span>2</span><b aria-hidden="true">—</b><span>1</span><strong>Chelsea</strong><em>{copy.final}</em>
              </article>
              <article data-static-arena-score="next">
                <strong>Tottenham</strong><b aria-hidden="true">—</b><strong>Newcastle</strong><em>{copy.next}</em>
              </article>
            </div>
          </section>
        </div>
        <p className={styles.boundary}>{copy.boundary}</p>
      </section>

      {!embedded ? (
        <section className={styles.frameMatrix} aria-label={copy.frames}>
          <p>{copy.frames}</p>
          <div>
            {[
              ["1280", copy.desktop, 760],
              ["768", copy.tablet, 710],
              ["390", copy.mobile, 650],
            ].map(([frameViewport, label, height]) => (
              <article key={frameViewport}>
                <strong>{label}</strong>
                <iframe
                  title={`${copy.title} · ${label}`}
                  src={`/visual-qa/arena-main-field?viewport=${frameViewport}&lang=${locale}`}
                  style={{ width: Number(frameViewport), height: Number(height) }}
                />
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
