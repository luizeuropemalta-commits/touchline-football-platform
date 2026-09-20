"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { RotateCw, Smartphone } from "lucide-react";
import Image from "next/image";
import {
  installTouchlineOrientationGate,
  TOUCHLINE_PORTRAIT_QUERY,
} from "@/lib/touchlineArena/orientation-gate";
import styles from "./TouchlineLandscapeBoundary.module.css";

/**
 * Owner rule (2026-09-19): mobile gameplay is landscape-only. Keep route and
 * children mounted through rotation; CSS blocks portrait before hydration.
 */
export default function TouchlineLandscapeBoundary({
  children,
  skipLabel,
  locale = "en-GB",
}: Readonly<{
  children: ReactNode;
  skipLabel: string;
  locale?: string;
}>) {
  const contentRef = useRef<HTMLDivElement>(null);
  const gateRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!contentRef.current || !gateRef.current || !skipRef.current) return;
    return installTouchlineOrientationGate({
      content: contentRef.current,
      gate: gateRef.current,
      skipLink: skipRef.current,
      media: window.matchMedia(TOUCHLINE_PORTRAIT_QUERY),
      documentTarget: document,
    });
  }, []);
  const portuguese = locale === "pt-BR";
  return <><div data-touchline-orientation-root>
    <a
      ref={skipRef}
      href="#touchline-main-content"
      className={`${styles.skip} sr-only fixed left-4 top-4 z-[2147483647] rounded-lg bg-[#edfff0] px-4 py-3 text-sm font-black text-[#041019] shadow-[0_16px_48px_rgba(0,0,0,.45)] focus:not-sr-only focus:outline focus:outline-3 focus:outline-offset-4 focus:outline-cyan-300`}
    >
      {skipLabel}
    </a>
    <div
      id="touchline-main-content"
      ref={contentRef}
      className={styles.content}
      tabIndex={-1}
      data-touchline-main-content-fallback
    >
      {children}
    </div>
  </div>
    <div
      data-touchline-orientation-gate
      ref={gateRef}
      className={styles.gate}
      role="dialog"
      aria-modal="true"
      aria-labelledby="touchline-rotate-title"
      aria-describedby="touchline-rotate-description"
      tabIndex={-1}
    >
      <div className={styles.message}>
        <Image className={styles.shield} src="/touchlineArena/brand/tl-shield-lime.svg" width={52} height={60} alt="" aria-hidden="true" unoptimized />
        <p className={styles.brand}>TOUCHLINE ARENA</p>
        <p className={styles.eyebrow}>{portuguese ? "O jogo merece a tela inteira" : "Give the game the whole screen"}</p>
        <div className={styles.device} aria-hidden="true">
          <Smartphone className={styles.phone} size={98} strokeWidth={1} />
          <RotateCw className={styles.rotate} size={28} strokeWidth={1.5} />
          <span className={styles.pitch}><i /><b /></span>
        </div>
        <h1 id="touchline-rotate-title">
          {portuguese ? "Gire para o modo horizontal" : "Rotate to landscape"}
        </h1>
        <p id="touchline-rotate-description">
          {portuguese
            ? "No celular, a TouchLine é jogada deitada. Gire o aparelho para continuar de onde parou."
            : "TouchLine is played in landscape on mobile. Turn your device to continue where you left off."}
        </p>
        <span className={styles.hint}>
          {portuguese ? "Sua página e seu time estão preservados" : "Your page and squad stay exactly as they are"}
        </span>
      </div>
    </div>
  </>;
}
