"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FastForward } from "lucide-react";

import {
  TOUCHLINE_ARENA_INTRO_SLOGAN,
  TOUCHLINE_ARENA_OFFICIAL_LOGO,
  TOUCHLINE_ARENA_VIDEO_POSTER,
  touchlineArenaIntroTimeline,
  type TouchlineArenaIntroLaunchMode,
  type TouchlineArenaIntroPhase,
} from "@/lib/touchlineArena/arena-intro";

import styles from "./touchline-arena-intro.module.css";

type TouchlineArenaIntroProps = {
  locale: string;
  mode: "pending" | "hidden" | TouchlineArenaIntroLaunchMode;
  onComplete: () => void;
  onReveal: (reducedMotion: boolean) => void;
  onSequenceStart: (canSkip: boolean) => void;
  onSkip: () => void;
};

type MotionPreference = "pending" | "normal" | "reduce";
type IntroDisplayPhase = "pending" | TouchlineArenaIntroPhase;

export default function TouchlineArenaIntro({
  locale,
  mode,
  onComplete,
  onReveal,
  onSequenceStart,
  onSkip,
}: TouchlineArenaIntroProps) {
  const [motionPreference, setMotionPreference] = useState<MotionPreference>("pending");
  const [phase, setPhase] = useState<IntroDisplayPhase>("pending");
  const completeRef = useRef(onComplete);
  const revealRef = useRef(onReveal);
  const sequenceStartRef = useRef(onSequenceStart);
  const skipRef = useRef(onSkip);
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    completeRef.current = onComplete;
    revealRef.current = onReveal;
    sequenceStartRef.current = onSequenceStart;
    skipRef.current = onSkip;
  }, [onComplete, onReveal, onSequenceStart, onSkip]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setMotionPreference(media.matches ? "reduce" : "normal");
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (mode === "hidden" || mode === "skip" || motionPreference === "pending") return;
    if (mode === "pending") return;

    const reducedMotion = motionPreference === "reduce";
    const timeline = touchlineArenaIntroTimeline(reducedMotion);
    const timers: number[] = [];

    sequenceStartRef.current(false);
    timers.push(window.setTimeout(() => setPhase("suspense"), 0));
    timers.push(window.setTimeout(() => setPhase("outline"), timeline.outlineAt));
    timers.push(window.setTimeout(() => setPhase("energy"), timeline.energyAt));
    timers.push(window.setTimeout(() => setPhase("slogan"), timeline.sloganAt));
    timers.push(window.setTimeout(() => setPhase("stadium"), timeline.stadiumAt));
    timers.push(window.setTimeout(() => {
      setPhase("reveal");
      revealRef.current(reducedMotion);
    }, timeline.revealAt));
    timers.push(window.setTimeout(() => completeRef.current(), timeline.completeAt));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [mode, motionPreference]);

  const isPortuguese = locale === "pt-BR";
  const displayPhase: IntroDisplayPhase = mode === "pending" ? "pending" : phase;
  const canSkipSequence = mode === "first" && displayPhase !== "reveal";

  useEffect(() => {
    if (displayPhase === "suspense") {
      dialogRef.current?.focus();
    }
  }, [displayPhase]);

  if (mode === "hidden" || mode === "skip") return null;

  return (
    <section
      ref={dialogRef}
      className={styles.root}
      data-testid="touchline-arena-intro"
      data-mode={mode}
      data-phase={displayPhase}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-label={isPortuguese ? "Introdução oficial da TouchLine Arena" : "Official TouchLine Arena introduction"}
      style={{ "--touchline-arena-intro-poster": `url(${TOUCHLINE_ARENA_VIDEO_POSTER})` } as CSSProperties}
    >
      <div className={styles.arenaPreview} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.scan} aria-hidden="true" />

      <div className={styles.brandStage}>
        <div className={styles.logoStage} aria-hidden="true">
          <span className={styles.logoHalo} />
          <Image
            className={styles.logoOutline}
            src={TOUCHLINE_ARENA_OFFICIAL_LOGO}
            alt=""
            fill
            sizes="(max-width: 980px) 132px, 190px"
            priority
            unoptimized
          />
          <Image
            className={styles.logo}
            src={TOUCHLINE_ARENA_OFFICIAL_LOGO}
            alt=""
            fill
            sizes="(max-width: 980px) 132px, 190px"
            priority
            unoptimized
          />
          <span className={styles.logoSweep} />
        </div>

        <p className={styles.slogan} aria-hidden="true">
          <span>THIS IS NOT A FANTASY.</span>
          <strong>THIS IS REALITY.</strong>
        </p>
        <span className={styles.srOnly} role="status" aria-live="polite">
          {displayPhase === "slogan" ? TOUCHLINE_ARENA_INTRO_SLOGAN : ""}
        </span>

      </div>

      {canSkipSequence ? (
        <button type="button" className={styles.sequenceSkip} onClick={() => skipRef.current()}>
          {isPortuguese ? "Pular intro" : "Skip intro"}
          <FastForward aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
