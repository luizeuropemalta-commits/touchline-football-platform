/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

type ClubTrophyCarouselItem = {
  id: string;
  label: string;
  count: number;
  imageUrl: string;
  imageSources: {
    avif: string;
    webp: string;
  };
  tone: "gold" | "silver" | "blue" | "green";
};

type ClubTrophyCarouselProps = {
  ariaLabel: string;
  honours: ClubTrophyCarouselItem[];
  nextLabel: string;
  previousLabel: string;
};

type TrophyTransitionPhase = "idle" | "exit" | "empty" | "enter";

const AUTO_ADVANCE_DELAY_MS = 5600;
const EXIT_DURATION_MS = 220;
const EMPTY_GAP_MS = 90;
const ENTER_DURATION_MS = 220;

function TrophyArtwork({ honour }: { honour: ClubTrophyCarouselItem }) {
  const [useOriginal, setUseOriginal] = useState(false);

  if (useOriginal) {
    return (
      <img
        src={honour.imageUrl}
        alt=""
        width={256}
        height={256}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    );
  }

  return (
    <picture>
      <source srcSet={`${honour.imageSources.avif} 256w`} sizes="42px" type="image/avif" />
      <source srcSet={`${honour.imageSources.webp} 256w`} sizes="42px" type="image/webp" />
      <img
        src={honour.imageUrl}
        alt=""
        width={256}
        height={256}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        draggable={false}
        onError={() => setUseOriginal(true)}
      />
    </picture>
  );
}

function pageSizeForWidth(width: number, itemCount: number) {
  const cardWidth = 78;
  const gap = 9;
  const horizontalPadding = 16;
  const capacity = Math.max(1, Math.floor((width - horizontalPadding + gap) / (cardWidth + gap)));
  const pageCount = Math.max(1, Math.ceil(itemCount / capacity));
  return Math.max(1, Math.ceil(itemCount / pageCount));
}

function splitIntoPages<T>(items: readonly T[], pageSize: number) {
  const pages: T[][] = [];
  for (let start = 0; start < items.length; start += pageSize) {
    pages.push(items.slice(start, start + pageSize));
  }
  return pages;
}

export default function ClubTrophyCarousel({
  ariaLabel,
  honours,
  nextLabel,
  previousLabel,
}: ClubTrophyCarouselProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const transitionTimersRef = useRef<number[]>([]);
  const transitionFrameRef = useRef<number | null>(null);
  const transitionInFlightRef = useRef(false);
  const [pageSize, setPageSize] = useState(6);
  const [activePage, setActivePage] = useState(0);
  const [phase, setPhase] = useState<TrophyTransitionPhase>("idle");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const viewportId = useId();
  const pages = useMemo(() => splitIntoPages(honours, pageSize), [honours, pageSize]);
  const isCarousel = pages.length > 1;
  const currentPageIndex = Math.min(activePage, Math.max(0, pages.length - 1));
  const activeHonours = pages[currentPageIndex] ?? [];

  const clearTransition = useCallback(() => {
    for (const timer of transitionTimersRef.current) window.clearTimeout(timer);
    transitionTimersRef.current = [];
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }
    transitionInFlightRef.current = false;
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const syncPageSize = () => {
      const nextPageSize = pageSizeForWidth(Math.round(row.clientWidth), honours.length);
      setPageSize((current) => current === nextPageSize ? current : nextPageSize);
    };

    const resizeObserver = new ResizeObserver(syncPageSize);
    resizeObserver.observe(row);
    syncPageSize();
    return () => resizeObserver.disconnect();
  }, [honours.length]);

  const movePage = useCallback((direction: -1 | 1) => {
    if (pages.length < 2 || transitionInFlightRef.current) return;

    const moveImmediately = () => {
      setActivePage((current) => (current + direction + pages.length) % pages.length);
      setPhase("idle");
    };

    if (prefersReducedMotion) {
      moveImmediately();
      return;
    }

    transitionInFlightRef.current = true;
    setPhase("exit");
    const exitTimer = window.setTimeout(() => {
      setPhase("empty");
      const emptyTimer = window.setTimeout(() => {
        setActivePage((current) => (current + direction + pages.length) % pages.length);
        setPhase("enter");
        transitionFrameRef.current = window.requestAnimationFrame(() => {
          transitionFrameRef.current = null;
          setPhase("idle");
        });
        const finishTimer = window.setTimeout(() => {
          transitionInFlightRef.current = false;
        }, ENTER_DURATION_MS);
        transitionTimersRef.current.push(finishTimer);
      }, EMPTY_GAP_MS);
      transitionTimersRef.current.push(emptyTimer);
    }, EXIT_DURATION_MS);
    transitionTimersRef.current.push(exitTimer);
  }, [pages.length, prefersReducedMotion]);

  useEffect(() => {
    if (!isCarousel || prefersReducedMotion || phase !== "idle") return;
    const timer = window.setTimeout(() => movePage(1), AUTO_ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isCarousel, movePage, phase, prefersReducedMotion]);

  useEffect(() => clearTransition, [clearTransition]);

  const pageStyle = {
    "--club-hub-trophy-page-columns": Math.max(1, Math.min(pageSize, activeHonours.length)),
  } as CSSProperties;

  return (
    <div
      ref={rowRef}
      className={`club-hub-honour-row ${isCarousel ? "is-carousel" : "is-static"}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
    >
      {isCarousel ? (
        <button
          type="button"
          className="club-hub-honour-arrow is-previous"
          aria-controls={viewportId}
          aria-label={previousLabel}
          disabled={phase !== "idle"}
          onClick={() => movePage(-1)}
        />
      ) : null}
      <div id={viewportId} className="club-hub-honour-viewport" aria-live="polite">
        {phase !== "empty" ? (
          <div
            className="club-hub-honour-page"
            data-transition-phase={phase}
            style={pageStyle}
          >
            {activeHonours.map((honour) => (
              <article key={honour.id} className={`club-hub-honour is-${honour.tone}`}>
                <div className="club-hub-honour-avatar" aria-hidden="true">
                  <TrophyArtwork honour={honour} />
                </div>
                <strong>{honour.count}</strong>
                <small>{honour.label}</small>
              </article>
            ))}
          </div>
        ) : null}
      </div>
      {isCarousel ? (
        <button
          type="button"
          className="club-hub-honour-arrow is-next"
          aria-controls={viewportId}
          aria-label={nextLabel}
          disabled={phase !== "idle"}
          onClick={() => movePage(1)}
        />
      ) : null}
    </div>
  );
}
