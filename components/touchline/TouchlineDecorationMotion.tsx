"use client";

import { useEffect } from "react";
import { observeVisibleDecorationMotion } from "@/lib/touchlineArena/visible-decoration-motion";

export default function TouchlineDecorationMotion() {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let frame = 0;

    // Begin after load and one paint so styles and their animation objects
    // exist. The observer controls animation objects without mutating the
    // server markup that React may still be hydrating.
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
