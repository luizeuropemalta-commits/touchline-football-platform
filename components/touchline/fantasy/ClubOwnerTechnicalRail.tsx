"use client";

import { useEffect, useRef, type CSSProperties, type FocusEvent, type ReactNode } from "react";
import layout from "./ClubOwnerCollectionSlots.module.css";

/** One horizontal technical area, not a second scrolling pitch or selector. */
export default function ClubOwnerTechnicalRail({ enabled, cardWidth, label, children }: {
  enabled: boolean; cardWidth: number; label: string; children: ReactNode;
}) {
  const frame = useRef<number | null>(null);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, [enabled]);

  const revealFocus = (event: FocusEvent<HTMLDivElement>) => {
    const rail = event.currentTarget;
    const target = event.target;
    const item = target.closest<HTMLElement>("[data-collection-slot], [data-technical-coach]");
    if (!item || !rail.contains(item)) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!rail.isConnected || !item.contains(document.activeElement)) return;
      const bounds = rail.getBoundingClientRect(), card = item.getBoundingClientRect();
      const left = bounds.left + rail.clientLeft + 8;
      const right = bounds.left + rail.clientLeft + rail.clientWidth - 8;
      const delta = card.left < left ? card.left - left : card.right > right ? card.right - right : 0;
      // Geometric deltas preserve negative-offset RTL scrolling. Never scroll
      // the document or animate focus under reduced-motion preferences.
      if (delta) rail.scrollBy({ left: delta, behavior: "instant" });
    });
  };
  if (!enabled) return children;
  const slotWidth = Number.isFinite(cardWidth) ? Math.max(44, cardWidth) : 44;
  return <div className={layout.technicalRail} data-clubowner-technical-rail="true"
    role="region" aria-label={label} tabIndex={0} onFocusCapture={revealFocus}
    style={{ "--technical-slot-width": `${slotWidth}px` } as CSSProperties}>
    <div className={layout.technicalCanvas}>{children}</div>
  </div>;
}
