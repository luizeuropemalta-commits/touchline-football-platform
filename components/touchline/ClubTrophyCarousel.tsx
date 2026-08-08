/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useId, useRef, useState } from "react";

type ClubTrophyCarouselItem = {
  id: string;
  label: string;
  count: number;
  imageUrl: string;
  tone: "gold" | "silver" | "blue" | "green";
};

type ClubTrophyCarouselProps = {
  ariaLabel: string;
  honours: ClubTrophyCarouselItem[];
  nextLabel: string;
  previousLabel: string;
};

type CarouselMetrics = {
  manualStepDistance: number;
  setWidth: number;
};

export default function ClubTrophyCarousel({
  ariaLabel,
  honours,
  nextLabel,
  previousLabel,
}: ClubTrophyCarouselProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const manualStepMsRef = useRef(0);
  const manualOffsetRef = useRef(0);
  const metricsRef = useRef<CarouselMetrics>({ manualStepDistance: 0, setWidth: 0 });
  const [isCarousel, setIsCarousel] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const viewportId = useId();

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    const track = trackRef.current;
    if (!row || !track || !honours.length) return;

    let animation: Animation | null = null;
    let frame = 0;
    let lastSize = "";

    const start = () => {
      const rowWidth = Math.round(row.clientWidth);
      const honourSet = track.querySelector<HTMLElement>(".club-hub-honour-set");
      const setWidth = Math.round(honourSet?.scrollWidth ?? 0);
      const size = `${rowWidth}:${setWidth}`;
      if (!rowWidth || !setWidth || size === lastSize) return;
      lastSize = size;

      animation?.cancel();
      track.style.transform = "translate3d(0, 0, 0)";

      const shouldScroll = setWidth > rowWidth;
      setIsCarousel(shouldScroll);
      manualOffsetRef.current = 0;
      metricsRef.current = { manualStepDistance: 0, setWidth: 0 };
      if (!shouldScroll) {
        animationRef.current = null;
        manualStepMsRef.current = 0;
        return;
      }

      const firstHonour = track.querySelector<HTMLElement>(".club-hub-honour");
      const gap = honourSet ? Number.parseFloat(window.getComputedStyle(honourSet).columnGap) || 0 : 0;
      const manualStepDistance = (firstHonour?.offsetWidth ?? 98) + gap;
      metricsRef.current = { manualStepDistance, setWidth };

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        animationRef.current = null;
        manualStepMsRef.current = 0;
        return;
      }

      const duration = Math.max(10000, (setWidth / 42) * 1000);
      manualStepMsRef.current = duration * (manualStepDistance / setWidth);
      animation = track.animate(
        [
          { transform: "translate3d(0, 0, 0)" },
          { transform: `translate3d(${-setWidth}px, 0, 0)` },
        ],
        {
          duration,
          easing: "linear",
          iterations: Infinity,
        },
      );
      animationRef.current = animation;
    };

    const scheduleStart = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(start);
    };

    const resizeObserver = new ResizeObserver(scheduleStart);
    resizeObserver.observe(row);
    resizeObserver.observe(track);
    scheduleStart();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      animation?.cancel();
      animationRef.current = null;
      manualStepMsRef.current = 0;
      manualOffsetRef.current = 0;
      metricsRef.current = { manualStepDistance: 0, setWidth: 0 };
    };
  }, [honours, prefersReducedMotion]);

  const shiftCarousel = (direction: -1 | 1) => {
    const animation = animationRef.current;
    const timing = animation?.effect?.getTiming();
    const duration = Number(timing?.duration);
    if (animation && Number.isFinite(duration) && duration > 0) {
      const currentTime = Number(animation.currentTime ?? 0);
      const currentIterationStart = currentTime - (currentTime % duration);
      const currentIterationTime = currentTime % duration;
      const step = manualStepMsRef.current || 1800;
      const nextIterationTime = (currentIterationTime + direction * step + duration) % duration;
      animation.currentTime = currentIterationStart + nextIterationTime;
      animation.play();
      return;
    }

    const track = trackRef.current;
    const { manualStepDistance, setWidth } = metricsRef.current;
    if (!track || !manualStepDistance || !setWidth) return;

    const nextOffset = (manualOffsetRef.current + direction * manualStepDistance + setWidth) % setWidth;
    manualOffsetRef.current = nextOffset;
    track.style.transform = `translate3d(${-nextOffset}px, 0, 0)`;
  };

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
          onClick={() => shiftCarousel(-1)}
        >
        </button>
      ) : null}
      <div id={viewportId} className="club-hub-honour-viewport">
        <div ref={trackRef} className="club-hub-honour-track">
          {(isCarousel ? [0, 1, 2, 3] : [0]).map((copyIndex) => (
            <div
              key={copyIndex}
              className="club-hub-honour-set"
              aria-hidden={copyIndex === 0 ? undefined : true}
            >
              {honours.map((honour) => (
                <article
                  key={`${copyIndex}-${honour.id}`}
                  className={`club-hub-honour is-${honour.tone}`}
                >
                  <div className="club-hub-honour-avatar" aria-hidden="true">
                    <img src={honour.imageUrl} alt="" draggable={false} />
                  </div>
                  <strong>{honour.count}</strong>
                  <small title={honour.label}>{honour.label}</small>
                </article>
              ))}
            </div>
          ))}
        </div>
      </div>
      {isCarousel ? (
        <button
          type="button"
          className="club-hub-honour-arrow is-next"
          aria-controls={viewportId}
          aria-label={nextLabel}
          onClick={() => shiftCarousel(1)}
        >
        </button>
      ) : null}
    </div>
  );
}
