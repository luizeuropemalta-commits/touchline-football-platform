"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
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
import { useTouchlineDialog } from "@/components/touchline/a11y/TouchlineDialog";
import { TouchlineCoinMark } from "@/components/touchline/market/TouchlineMarketMarks";
import styles from "./TouchlineCardZoom.module.css";

export type TouchlineCardZoomDetails = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  performanceTitle?: string;
  performanceSubtitle?: string;
  fields: ReadonlyArray<{
    label: string;
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
  historyHref?: string;
  historyLabel?: string;
  cardEngineHref?: string;
  cardEngineLabel?: string;
};

type TouchlineCardZoomProps = {
  ariaLabel: string;
  children: ReactNode;
  expandedContent?: ReactNode;
  contractHref?: string;
  contractLabel?: string;
  contractValue?: string;
  contractTermLabel?: string;
  tierAccent?: string;
  tierLabel?: string;
  details?: TouchlineCardZoomDetails;
  detailsContent?: ReactNode;
};

export function TouchlineCardZoomDetailsPanel({ details }: { details: TouchlineCardZoomDetails }) {
  const identityFields = details.fields.filter((field) => field.group !== "performance");
  const performanceFields = details.fields.filter((field) => field.group === "performance");
  const [isFullPerformanceOpen, setIsFullPerformanceOpen] = useState(false);
  const fullPerformanceId = useId();
  const isGoalkeeper = /goalkeeper|goleiro|guarda-redes|keeper/i.test(details.subtitle ?? "");
  const isPortuguese = details.performanceTitle === "Desempenho";
  const copy = isPortuguese
    ? { hide: "Ocultar desempenho completo", view: "Ver desempenho completo", history: "Histórico de partidas", recent: "Últimas partidas", full: "Desempenho completo" }
    : { hide: "Hide full performance", view: "View full performance", history: "Match history", recent: "Recent matches", full: "Full performance" };
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
    const Icon = token.includes("price") || token.includes("preço") ? BadgeDollarSign
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
      : context === "identity" ? UserRound : Activity;
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
            <a className={styles.profileAction} href={details.profileHref}>
              {details.profileLabel ?? "View profile"}
            </a>
          ) : null}
          {details.historyHref ? (
            <a className={styles.historyAction} href={details.historyHref}>
              {details.historyLabel ?? "View TouchLine history"}
            </a>
          ) : null}
          {details.cardEngineHref ? (
            <a className={styles.cardEngineAction} href={details.cardEngineHref}>
              {details.cardEngineLabel ?? "Edit in Card Engine"}
            </a>
          ) : null}
        </nav>
      ) : null}
    </aside>
    {performanceFields.length ? (
      <aside className={`${styles.details} ${styles.performanceDetails}`} aria-label={details.performanceTitle ?? "Performance"}>
        <header className={styles.detailsHeader}>
          <span>TouchLine Verified</span>
          <h2>{details.performanceTitle ?? "Performance"}</h2>
          <p>{details.performanceSubtitle ?? "Official match ratings and statistics"}</p>
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
                    {history.map((field) => <p key={`${field.label}-${field.value}`}><span>{field.label.replace(/^(Match history|Histórico da partida)\s*·\s*/i, "")}</span>{field.value}</p>)}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
        {history.length && !isFullPerformanceOpen ? (
          <div className={styles.historyPreview} aria-label={copy.recent}>
            <h3><History aria-hidden="true" strokeWidth={1.8} />{copy.recent}</h3>
            {history.slice(0, 3).map((field) => <p key={`${field.label}-${field.value}`}><span>{field.label.replace(/^(Match history|Histórico da partida)\s*·\s*/i, "")}</span>{field.value}</p>)}
          </div>
        ) : null}
      </aside>
    ) : null}
    </>
  );
}

export default function TouchlineCardZoom({
  ariaLabel,
  children,
  expandedContent,
  contractHref,
  contractLabel = "Contratar",
  contractValue,
  contractTermLabel,
  tierAccent,
  tierLabel,
  details,
  detailsContent,
}: TouchlineCardZoomProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef(false);
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({
    open: isOpen,
    onDismiss: () => setIsOpen(false),
    label: ariaLabel,
    initialFocusRef: closeRef,
    returnFocusRef: triggerRef,
  });
  // CardZoom is client-only when expanded, so this reads the currently
  // resolved document language without creating a server/client text mismatch.
  const closeLabel = typeof document !== "undefined" && document.documentElement.lang === "pt-BR"
    ? "Fechar card"
    : "Close card";

  useEffect(() => {
    if (!isOpen) return;

    // The expanded card is a self-contained reading surface. Lock the page
    // behind it so Safari/WebKit never exposes a second page scrollbar beside
    // the modal scrollbar. All values are restored exactly when it closes.
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousLock = root.dataset.touchlineModalScrollLock;

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    root.dataset.touchlineModalScrollLock = "true";

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      if (previousLock === undefined) delete root.dataset.touchlineModalScrollLock;
      else root.dataset.touchlineModalScrollLock = previousLock;
    };
  }, [isOpen]);

  function openFromCard(event: MouseEvent<HTMLDivElement>) {
    if (pointerMovedRef.current) {
      pointerMovedRef.current = false;
      return;
    }
    if ((event.target as HTMLElement).closest("a,button")) return;
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
        <div {...dialogProps} className={styles.backdrop} onClick={() => setIsOpen(false)}>
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
              <div className={styles.expandedCard} data-card-zoom="expanded">{expandedContent ?? children}</div>
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
                  {contractValue ? <strong>{contractValue}</strong> : null}
                </a>
              ) : null}
            </div>
            {detailsContent ? <aside className={styles.details}>{detailsContent}</aside> : details ? <TouchlineCardZoomDetailsPanel details={details} /> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
