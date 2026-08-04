"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TouchlineCoinMark } from "@/components/touchline/market/TouchlineMarketMarks";
import styles from "./TouchlineCardZoom.module.css";

export type TouchlineCardZoomDetails = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  fields: ReadonlyArray<{
    label: string;
    value: string;
    accent?: boolean;
  }>;
  profileHref?: string;
  profileLabel?: string;
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
};

export function TouchlineCardZoomDetailsPanel({ details }: { details: TouchlineCardZoomDetails }) {
  return (
    <aside className={styles.details} aria-label={details.title}>
      <header className={styles.detailsHeader}>
        {details.eyebrow ? <span>{details.eyebrow}</span> : null}
        <h2>{details.title}</h2>
        {details.subtitle ? <p>{details.subtitle}</p> : null}
      </header>
      <dl className={styles.detailsGrid}>
        {details.fields.map((field) => (
          <div key={`${field.label}-${field.value}`} className={field.accent ? styles.detailAccent : undefined}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
      {details.profileHref ? (
        <a className={styles.profileAction} href={details.profileHref}>
          {details.profileLabel ?? "View profile"}
        </a>
      ) : null}
    </aside>
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
}: TouchlineCardZoomProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeControl = closeRef.current;
    const trigger = triggerRef.current;
    closeControl?.focus();
    return () => trigger?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

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
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={ariaLabel} onClick={() => setIsOpen(false)}>
          <div
            className={`${styles.panel} ${details ? styles.panelWithDetails : ""}`}
            style={{ "--touchline-card-zoom-accent": tierAccent } as CSSProperties}
            onClick={(event) => {
              event.stopPropagation();
              if ((event.target as HTMLElement).closest("a,button")) return;
              setIsOpen(false);
            }}
          >
            <button ref={closeRef} type="button" className={styles.close} aria-label="Fechar card" onClick={() => setIsOpen(false)}>
              ×
            </button>
            <div className={styles.cardColumn}>
              <div className={styles.expandedCard} data-card-zoom="expanded">{expandedContent ?? children}</div>
              {(tierLabel || contractTermLabel) ? (
                <div className={styles.expandedMeta}>
                  {tierLabel ? <strong>{tierLabel}</strong> : null}
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
            {details ? <TouchlineCardZoomDetailsPanel details={details} /> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
