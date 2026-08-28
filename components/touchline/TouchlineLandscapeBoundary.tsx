"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { touchlineDeviceNeedsLandscape } from "@/lib/touchlineArena/device-orientation";
import styles from "./TouchlineLandscapeBoundary.module.css";

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

function isMobileOrTablet() {
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

export default function TouchlineLandscapeBoundary({
  children,
  locale,
  skipLabel,
}: Readonly<{
  children: React.ReactNode;
  locale: string;
  skipLabel: string;
}>) {
  const pt = locale === "pt-BR";
  const [blocked, setBlocked] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const gateRef = useRef<HTMLDivElement | null>(null);
  const lastLandscapeScrollYRef = useRef(0);
  const wasBlockedRef = useRef(false);

  useEffect(() => {
    const content = contentRef.current;
    let restoreScrollFrame: number | undefined;

    function rememberLandscapeScroll() {
      // A resize from landscape to portrait can itself emit a scroll event.
      // Only remember positions while the viewport is still landscape so the
      // orientation gate can restore the user's real reading position.
      if (window.innerWidth > window.innerHeight) {
        lastLandscapeScrollYRef.current = window.scrollY;
      }
    }

    function syncOrientation() {
      const nextBlocked = touchlineDeviceNeedsLandscape({
        width: window.innerWidth,
        height: window.innerHeight,
        coarsePointer: window.matchMedia("(pointer: coarse)").matches,
        hoverlessPointer: window.matchMedia("(hover: none)").matches,
        mobileDevice: isMobileOrTablet(),
      });
      setBlocked(nextBlocked);
      if (content) content.inert = nextBlocked;
      document.documentElement.dataset.touchlineOrientation = nextBlocked ? "portrait-blocked" : "landscape-ready";
      document.body.style.overflow = nextBlocked ? "hidden" : "";
      if (nextBlocked) {
        const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
        void orientation?.lock?.("landscape").catch(() => undefined);
      }
      if (!nextBlocked && wasBlockedRef.current) {
        if (restoreScrollFrame !== undefined) window.cancelAnimationFrame(restoreScrollFrame);
        restoreScrollFrame = window.requestAnimationFrame(() => {
          window.scrollTo({ top: lastLandscapeScrollYRef.current, left: 0, behavior: "auto" });
        });
      }
      wasBlockedRef.current = nextBlocked;
    }

    rememberLandscapeScroll();
    syncOrientation();
    window.addEventListener("scroll", rememberLandscapeScroll, { passive: true });
    window.addEventListener("resize", syncOrientation);
    window.addEventListener("orientationchange", syncOrientation);
    return () => {
      window.removeEventListener("scroll", rememberLandscapeScroll);
      window.removeEventListener("resize", syncOrientation);
      window.removeEventListener("orientationchange", syncOrientation);
      if (restoreScrollFrame !== undefined) window.cancelAnimationFrame(restoreScrollFrame);
      if (content) content.inert = false;
      delete document.documentElement.dataset.touchlineOrientation;
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (blocked) gateRef.current?.focus({ preventScroll: true });
  }, [blocked]);

  return <>
    <a
      href="#touchline-main-content"
      aria-hidden={blocked || undefined}
      tabIndex={blocked ? -1 : undefined}
      className="sr-only fixed left-4 top-4 z-[2147483647] rounded-lg bg-[#edfff0] px-4 py-3 text-sm font-black text-[#041019] shadow-[0_16px_48px_rgba(0,0,0,.45)] focus:not-sr-only focus:outline focus:outline-3 focus:outline-offset-4 focus:outline-cyan-300"
    >
      {skipLabel}
    </a>
    <div
      ref={contentRef}
      id="touchline-main-content"
      tabIndex={-1}
      aria-hidden={blocked || undefined}
      data-touchline-main-content-fallback
    >
      {children}
    </div>
    <div
      ref={gateRef}
      className={styles.gate}
      data-active={blocked ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-hidden={!blocked}
      aria-labelledby="touchline-landscape-title"
      aria-describedby="touchline-landscape-description"
      tabIndex={blocked ? -1 : undefined}
    >
      <section className={styles.panel}>
        <span className={styles.icon} aria-hidden="true"><span><RotateCcw /></span></span>
        <span className={styles.eyebrow}>TOUCHLINE LANDSCAPE</span>
        <h2 id="touchline-landscape-title">{pt ? "Gire para o modo horizontal" : "Rotate to landscape"}</h2>
        <p id="touchline-landscape-description">
          {pt
            ? "O jogo inteiro foi calibrado para celular e tablet em modo deitado. Sua sessão e seu time permanecem salvos."
            : "The complete game is calibrated for phones and tablets in landscape. Your session and team remain saved."}
        </p>
        <span className={styles.status}>{pt ? "Aguardando rotação" : "Waiting for rotation"}</span>
      </section>
    </div>
  </>;
}
