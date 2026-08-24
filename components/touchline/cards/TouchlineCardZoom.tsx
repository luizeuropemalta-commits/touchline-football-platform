"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  const renderFields = (fields: typeof details.fields) => (
    <dl className={styles.detailsGrid}>
      {fields.map((field) => (
        <div
          key={`${field.label}-${field.value}`}
          className={`${field.accent ? styles.detailAccent : ""} ${field.primary ? styles.detailPrimary : ""}`}
        >
          <dt>{field.icon ? <span className={styles.detailIcon} aria-hidden="true">{field.icon}</span> : null}{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <>
    <aside className={`${styles.details} ${styles.identityDetails}`} aria-label={details.title}>
      <header className={styles.detailsHeader}>
        {details.eyebrow ? <span>{details.eyebrow}</span> : null}
        <h2>{details.title}</h2>
        {details.subtitle ? <p>{details.subtitle}</p> : null}
      </header>
      {identityFields.length ? renderFields(identityFields) : null}
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
          <span>Sportmonks</span>
          <h2>{details.performanceTitle ?? "Performance"}</h2>
          <p>{details.performanceSubtitle ?? "Official match ratings and statistics"}</p>
        </header>
        {renderFields(performanceFields)}
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
    if ((event.target as HTMLElement).closest("a,button")) return;
    setIsOpen(true);
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
