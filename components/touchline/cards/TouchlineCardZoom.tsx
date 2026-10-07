"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  Award,
  BadgeDollarSign,
  Building2,
  ChartNoAxesCombined,
  ChevronDown,
  CircleGauge,
  Clock3,
  Flag,
  Footprints,
  Goal,
  Hand,
  History,
  Medal,
  Shield,
  ShieldCheck,
  Shirt,
  Star,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "@/components/touchline/a11y/TouchlineDialog";
import { TouchlineCoinMark } from "@/components/touchline/market/TouchlineMarketMarks";
import styles from "./TouchlineCardZoom.module.css";
import TouchlinePlayerSocialActions from "@/components/touchline/social/TouchlinePlayerSocialActions";
import { resolvePlayerSocialSubject } from "@/lib/touchlineArena/player-social-client";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlineCardZoomCopy } from "@/lib/touchlineArena/card-zoom-i18n";
import type { TouchlinePlayerPositionKind } from "@/lib/touchlineArena/position-aware-card-stats";

// Canonical match-fact tokens are presentation authority, regardless of label.
// Other/omitted tokens keep the existing legacy icon inference below.
const MATCH_FACT_ICONS = {
  goal: Goal,
  assist: Footprints,
  defense: Shield,
  "clean-sheet": ShieldCheck,
  cards: Award,
  "yellow-card": Award,
  "red-card": Award,
  saves: Hand,
  "goals-conceded": Goal,
  "shots-on-target": Target,
  "shots-off-target": Target,
  "penalty-missed": Activity,
  "own-goal": Goal,
  rating: Star,
  minutes: Clock3,
  appearances: Trophy,
} as const;

// Coach-owned tokens keep translated copy out of icon selection. Distinct
// rank tokens deliberately preserve the existing PT/EN presentation; legacy
// rank/home/away/verified/history tokens retain their fallback below.
const COACH_DETAIL_ICONS = {
  "coach-club": Building2,
  "coach-nationality": Flag,
  "coach-role": UserRound,
  "coach-birth": History,
  "coach-tier": Medal,
  "coach-rank-position": UserRound,
  "coach-rank": Activity,
  "coach-home": Activity,
  "coach-away": Activity,
  "coach-verified": Activity,
  "coach-evidence": History,
} as const;

// Preserve the existing player identity artwork independently of translation.
// Generic legacy tokens intentionally remain governed by the old fallback.
const PLAYER_IDENTITY_ICONS = {
  "player-identity-status": Award,
  "player-identity-missing-field": UserRound,
  "player-identity-price": BadgeDollarSign,
  "player-identity-tier": Medal,
  "player-identity-club": Building2,
  "player-identity-position": UserRound,
  "player-identity-nationality": Flag,
} as const;

export type TouchlineCardZoomDetails = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Canonical role; omission retains legacy subtitle inference. */
  positionKind?: TouchlinePlayerPositionKind;
  performanceTitle?: string;
  performanceSubtitle?: string;
  fields: ReadonlyArray<{
    label: string;
    /** Literal history heading, independent of the translated field label. */
    historyDisplayLabel?: string;
    value: string;
    accent?: boolean;
    group?: "identity" | "performance";
    /** Controls the compact performance composition without changing data. */
    kind?: "identity" | "rating-total" | "rating-last" | "stat" | "history";
    icon?: string;
    primary?: boolean;
  }>;
  profileHref?: string;
  profileLabel?: string;
  profileActionKind?: "coach" | "player";
  historyHref?: string;
  historyLabel?: string;
  cardEngineHref?: string;
  cardEngineLabel?: string;
};

type TouchlineCardZoomProps = {
  ariaLabel: string;
  /** Explicit page context wins; omission preserves the legacy fallbacks. */
  locale?: string;
  draftLocalesEnabled?: boolean;
  children: ReactNode;
  expandedContent?: ReactNode;
  contractHref?: string;
  contractLabel?: string;
  /** Legacy caller compatibility; card prices are not part of public presentation. */
  contractValue?: string;
  contractTermLabel?: string;
  tierAccent?: string;
  tierLabel?: string;
  details?: TouchlineCardZoomDetails;
  detailsContent?: ReactNode;
  socialProviderId?: string;
};

export function TouchlineCardZoomDetailsPanel({ details, locale, draftLocalesEnabled = false }: { details: TouchlineCardZoomDetails; locale?: string; draftLocalesEnabled?: boolean }) {
  const identityFields = details.fields.filter((field) => field.group !== "performance");
  const performanceFields = details.fields.filter((field) => field.group === "performance");
  const [isFullPerformanceOpen, setIsFullPerformanceOpen] = useState(false);
  const fullPerformanceId = useId();
  const isGoalkeeper = details.positionKind === undefined
    ? /goalkeeper|goleiro|guarda-redes|keeper/i.test(details.subtitle ?? "")
    : details.positionKind === "goalkeeper";
  const presentationLocale = locale === undefined
    ? (details.performanceTitle === "Desempenho" ? "pt-BR" : "en-GB")
    : resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const copy = getTouchlineCardZoomCopy(presentationLocale, draftLocalesEnabled);
  const fieldKind = (field: TouchlineCardZoomDetails["fields"][number]) => {
    if (field.kind) return field.kind;
    const label = field.label.toLowerCase();
    if (field.primary || /total rating|nota total/.test(label)) return "rating-total";
    if (/last match|última partida|ultima partida|nota da partida|current match/.test(label)) return "rating-last";
    if (/match history|histórico da partida|historico da partida/.test(label)) return "history";
    return "stat";
  };
  const performanceByKind = performanceFields.reduce<Record<string, typeof performanceFields>>((groups, field) => {
    const kind = fieldKind(field);
    (groups[kind] ??= []).push(field);
    return groups;
  }, {});
  const totalRating = performanceByKind["rating-total"]?.[0];
  const lastMatchRating = performanceByKind["rating-last"]?.[0];
  const history = performanceByKind.history ?? [];
  const statistics = performanceByKind.stat ?? [];
  const coreStatLimit = isGoalkeeper ? 5 : 6;
  const availableStatistics = statistics.filter((field) => field.value !== "—");
  const coreStatistics = [...availableStatistics, ...statistics.filter((field) => field.value === "—")]
    .slice(0, coreStatLimit);
  const advancedStatistics = statistics.filter((field) => !coreStatistics.includes(field));
  const iconForField = (field: TouchlineCardZoomDetails["fields"][number], context: "identity" | "performance") => {
    const token = `${field.icon ?? ""} ${field.label}`.toLowerCase();
    const explicitIcon = field.icon && Object.hasOwn(MATCH_FACT_ICONS, field.icon)
      ? MATCH_FACT_ICONS[field.icon as keyof typeof MATCH_FACT_ICONS]
      : field.icon && Object.hasOwn(COACH_DETAIL_ICONS, field.icon)
        ? COACH_DETAIL_ICONS[field.icon as keyof typeof COACH_DETAIL_ICONS]
        : field.icon && Object.hasOwn(PLAYER_IDENTITY_ICONS, field.icon)
          ? PLAYER_IDENTITY_ICONS[field.icon as keyof typeof PLAYER_IDENTITY_ICONS]
          : undefined;
    const Icon = explicitIcon ?? (token.includes("price") || token.includes("preço") ? BadgeDollarSign
      : token.includes("tier") ? Medal
      : token.includes("club") || token.includes("clube") ? Building2
      : token.includes("national") || token.includes("nacional") ? Flag
      : token.includes("position") || token.includes("posição") ? UserRound
      : token.includes("shirt") || token.includes("camisa") ? Shirt
      : token.includes("total rating") || token.includes("nota total") || token.includes("rating") || token.includes("nota") ? Star
      : token.includes("goal") || token.includes("gols") ? Goal
      : token.includes("assist") ? Footprints
      : token.includes("save") || token.includes("defesa") ? Hand
      : token.includes("clean") || token.includes("sem sofrer") ? ShieldCheck
      : token.includes("def") || token.includes("defens") ? Shield
      : token.includes("card") || token.includes("cart") ? Award
      : token.includes("minute") || token.includes("minuto") ? Clock3
      : token.includes("appearance") || token.includes("apariç") ? Trophy
      : token.includes("history") || token.includes("histórico") ? History
      : token.includes("shot") || token.includes("chute") ? Target
      : context === "identity" ? UserRound : Activity);
    return <Icon aria-hidden="true" strokeWidth={1.8} />;
  };
  const renderIdentityFields = (fields: typeof identityFields) => (
    <dl className={styles.identityGrid}>
      {fields.slice(0, 5).map((field) => (
        <div key={`${field.label}-${field.value}`} className={field.accent ? styles.detailAccent : undefined}>
          <dt><span className={styles.detailIcon}>{iconForField(field, "identity")}</span>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
  const renderStat = (field: TouchlineCardZoomDetails["fields"][number], compact = false) => (
    <div key={`${field.label}-${field.value}`} className={compact ? styles.statTile : styles.fullStat}>
      <span className={styles.statIcon}>{iconForField(field, "performance")}</span>
      <span>{field.label}</span>
      <strong>{field.value}</strong>
    </div>
  );

  return (
    <>
    <aside className={`${styles.details} ${styles.identityDetails}`} aria-label={details.title}>
      <header className={styles.detailsHeader}>
        {details.eyebrow ? <span>{details.eyebrow}</span> : null}
        <h2>{details.title}</h2>
        {details.subtitle ? <p>{details.subtitle}</p> : null}
      </header>
      {identityFields.length ? renderIdentityFields(identityFields) : null}
      {(details.profileHref || details.historyHref || details.cardEngineHref) ? (
        <nav className={styles.detailActions} aria-label={details.title}>
          {details.profileHref ? (
            <a
              className={styles.profileAction}
              data-coach-profile-action={details.profileActionKind === "coach" ? "true" : undefined}
              href={details.profileHref}
            >
              {details.profileLabel ?? copy.profile}
            </a>
          ) : null}
          {details.historyHref ? (
            <a className={styles.historyAction} href={details.historyHref}>
              {details.historyLabel ?? copy.historyLink}
            </a>
          ) : null}
          {details.cardEngineHref ? (
            <a className={styles.cardEngineAction} href={details.cardEngineHref}>
              {details.cardEngineLabel ?? copy.cardEngine}
            </a>
          ) : null}
        </nav>
      ) : null}
    </aside>
    {performanceFields.length ? (
      <aside className={`${styles.details} ${styles.performanceDetails}`} aria-label={details.performanceTitle ?? copy.performance}>
        <header className={styles.detailsHeader}>
          <span>TouchLine Verified</span>
          <h2>{details.performanceTitle ?? copy.performance}</h2>
          <p>{details.performanceSubtitle ?? copy.performanceSubtitle}</p>
        </header>
        {totalRating ? (
          <section className={styles.ratingHero} aria-label={totalRating.label}>
            <span><Star aria-hidden="true" strokeWidth={1.8} />{totalRating.label}</span>
            <strong>{totalRating.value}</strong>
            {lastMatchRating ? <p><CircleGauge aria-hidden="true" strokeWidth={1.8} />{lastMatchRating.label}: <b>{lastMatchRating.value}</b></p> : null}
          </section>
        ) : lastMatchRating ? (
          <section className={styles.ratingHero} aria-label={lastMatchRating.label}>
            <span><Star aria-hidden="true" strokeWidth={1.8} />{lastMatchRating.label}</span>
            <strong>{lastMatchRating.value}</strong>
          </section>
        ) : null}
        {coreStatistics.length ? <div className={styles.statGrid}>{coreStatistics.map((field) => renderStat(field, true))}</div> : null}
        {(advancedStatistics.length || history.length) ? (
          <>
            <button
              type="button"
              className={styles.fullPerformanceToggle}
              aria-expanded={isFullPerformanceOpen}
              aria-controls={fullPerformanceId}
              onClick={() => setIsFullPerformanceOpen((open) => !open)}
            >
              <ChartNoAxesCombined aria-hidden="true" strokeWidth={1.8} />
              <span>{isFullPerformanceOpen ? copy.hide : copy.view}</span>
              <ChevronDown aria-hidden="true" strokeWidth={2} />
            </button>
            {isFullPerformanceOpen ? (
              <section id={fullPerformanceId} className={styles.fullPerformance} aria-label={copy.full}>
                {advancedStatistics.length ? <div className={styles.fullStats}>{advancedStatistics.map((field) => renderStat(field))}</div> : null}
                {history.length ? (
                  <div className={styles.matchHistory}>
                    <h3><History aria-hidden="true" strokeWidth={1.8} />{copy.history}</h3>
                    {history.map((field) => <p key={`${field.label}-${field.value}`}><span>{field.historyDisplayLabel ?? field.label.replace(/^(Match history|Histórico da partida)\s*·\s*/i, "")}</span>{field.value}</p>)}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
        {history.length && !isFullPerformanceOpen ? (
          <div className={styles.historyPreview} aria-label={copy.recent}>
            <h3><History aria-hidden="true" strokeWidth={1.8} />{copy.recent}</h3>
            {history.slice(0, 3).map((field) => <p key={`${field.label}-${field.value}`}><span>{field.historyDisplayLabel ?? field.label.replace(/^(Match history|Histórico da partida)\s*·\s*/i, "")}</span>{field.value}</p>)}
          </div>
        ) : null}
      </aside>
    ) : null}
    </>
  );
}

export default function TouchlineCardZoom({
  ariaLabel,
  locale,
  draftLocalesEnabled = false,
  children,
  expandedContent,
  contractHref,
  contractLabel = "Contratar",
  contractTermLabel,
  tierAccent,
  tierLabel,
  details,
  detailsContent,
  socialProviderId,
}: TouchlineCardZoomProps) {
  const explicitLocale = locale === undefined ? undefined : resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const socialPlayerId = details?.profileActionKind === "coach" ? null : resolvePlayerSocialSubject(socialProviderId, details?.profileHref);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef(false);
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({
    open: isOpen,
    onDismiss: () => setIsOpen(false),
    label: ariaLabel,
    initialFocusRef: closeRef,
    returnFocusRef: triggerRef,
  });
  // Only legacy callers consult the document. Explicit page context is stable
  // on server/client and never inferred from a translated heading.
  const closeLocale = explicitLocale ?? (
    typeof document !== "undefined" && document.documentElement.lang === "pt-BR" ? "pt-BR" : "en-GB"
  );
  const closeLabel = getTouchlineCardZoomCopy(closeLocale, draftLocalesEnabled).close;

  useLayoutEffect(() => {
    if (!isOpen) return;
    const element = expandedRef.current;
    if (!element) return;
    // The official player canvas is 430px wide. Static cards and live cards
    // must fit the SAME zoom column; do not scale their text independently.
    // Coach cards already scale proportionally with this column via CSS.
    const fit = (width: number) => {
      if (width > 0) element.style.setProperty("--touchline-card-static-scale", String(Math.min(1, width / 430)));
    };
    fit(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) fit(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isOpen]);

  useTouchlineDialogScrollLock(isOpen);

  function openFromCard(event: MouseEvent<HTMLDivElement>) {
    if (pointerMovedRef.current) {
      pointerMovedRef.current = false;
      return;
    }
    if ((event.target as HTMLElement).closest("a,button")) return;
    // Cards often live on selectable tactical surfaces. Opening the universal
    // card profile must not also trigger the surrounding slot replacement.
    event.stopPropagation();
    setIsOpen(true);
  }

  function rememberPointerOrigin(event: PointerEvent<HTMLDivElement>) {
    pointerOriginRef.current = { x: event.clientX, y: event.clientY };
    pointerMovedRef.current = false;
  }

  function trackPointerMovement(event: PointerEvent<HTMLDivElement>) {
    const origin = pointerOriginRef.current;
    if (!origin) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= 8) {
      pointerMovedRef.current = true;
    }
  }

  function openFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    setIsOpen(true);
  }

  return (
    <>
      <div
        className={styles.triggerFrame}
        data-touchline-card-zoom="trigger"
        style={{ "--touchline-card-zoom-accent": tierAccent } as CSSProperties}
      >
        <div
          ref={triggerRef}
          className={styles.trigger}
          role="button"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          onPointerDown={rememberPointerOrigin}
          onPointerMove={trackPointerMovement}
          onPointerCancel={() => {
            pointerOriginRef.current = null;
            pointerMovedRef.current = false;
          }}
          onClick={openFromCard}
          onKeyDown={openFromKeyboard}
        >
          {children}
        </div>
      </div>

      {isOpen ? createPortal(
        <div {...dialogProps} dir={draftLocalesEnabled ? "ltr" : undefined} lang={explicitLocale} className={styles.backdrop} onClick={() => setIsOpen(false)}>
          <div
            className={`${styles.panel} ${details || detailsContent ? styles.panelWithDetails : ""}`}
            style={{ "--touchline-card-zoom-accent": tierAccent } as CSSProperties}
            onClick={(event) => {
              event.stopPropagation();
              if ((event.target as HTMLElement).closest("a,button")) return;
              setIsOpen(false);
            }}
          >
            <button ref={closeRef} type="button" className={styles.close} aria-label={closeLabel} onClick={() => setIsOpen(false)}>
              ×
            </button>
            <div className={styles.cardColumn}>
              <div ref={expandedRef} className={styles.expandedCard} data-card-zoom="expanded">{expandedContent ?? children}</div>
              {socialPlayerId && details ? <TouchlinePlayerSocialActions
                draftLocalesEnabled={draftLocalesEnabled}
                providerId={socialPlayerId}
                playerName={details.title}
                locale={explicitLocale ?? (details.performanceTitle === "Desempenho" ? "pt-BR" : "en-GB")}
                accent={tierAccent}
              /> : null}
              {(contractTermLabel || (!details && tierLabel)) ? (
                <div className={styles.expandedMeta}>
                  {!details && tierLabel ? <strong>{tierLabel}</strong> : null}
                  {contractTermLabel ? <span>{contractTermLabel}</span> : null}
                </div>
              ) : null}
              {contractHref ? (
                <a className={styles.contractAction} href={contractHref}>
                  <TouchlineCoinMark size={18} />
                  <span>{contractLabel}</span>
                </a>
              ) : null}
            </div>
            {detailsContent ? <aside className={styles.details}>{detailsContent}</aside> : details ? <TouchlineCardZoomDetailsPanel details={details} locale={explicitLocale} draftLocalesEnabled={draftLocalesEnabled} /> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
