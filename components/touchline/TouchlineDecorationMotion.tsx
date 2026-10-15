"use client";

import { useEffect } from "react";
import { observeVisibleDecorationMotion } from "@/lib/touchlineArena/visible-decoration-motion";

export default function TouchlineDecorationMotion() {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let frame = 0;

    // This observer writes an inline CSS custom property. Starting it while
    // Next is still hydrating streamed route content can mutate server markup
    // before React has claimed it, causing a hydration mismatch and a visible
    // flash. Decorative motion is never required for content, so initialise it
    // only after the document load boundary and one paint.
    const start = () => {
      frame = window.requestAnimationFrame(() => {
        stop = observeVisibleDecorationMotion();
      });
    };

    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    return () => {
      window.removeEventListener("load", start);
      if (frame) window.cancelAnimationFrame(frame);
      stop?.();
    };
  }, []);
  return null;
}
