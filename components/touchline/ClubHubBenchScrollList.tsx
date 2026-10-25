"use client";

import type { FocusEvent, ReactNode } from "react";

/** Keep keyboard-focused artwork inside this rail, without moving the page. */
export default function ClubHubBenchScrollList({ className, children }: { className: string; children: ReactNode }) {
  const revealFocusedCard = (event: FocusEvent<HTMLOListElement>) => {
    const rail = event.currentTarget;
    const target = event.target;
    const item = target.closest("li");
    if (!item || item.parentElement !== rail) return;
    // Native focus scrolling differs between engines; measure after it settles.
    requestAnimationFrame(() => {
      if (!rail.isConnected || !item.contains(document.activeElement)) return;
      const frame = rail.getBoundingClientRect();
      const card = item.getBoundingClientRect();
      const gutter = 8; // includes the 7px forced-colours focus outline
      const left = frame.left + rail.clientLeft + gutter;
      const right = frame.left + rail.clientLeft + rail.clientWidth - gutter;
      const delta = card.left < left ? card.left - left : card.right > right ? card.right - right : 0;
      // Geometric deltas work for both LTR and negative-offset RTL scrollports.
      if (delta) rail.scrollBy({ left: delta, behavior: "instant" });
    });
  };
  return <ol className={className} onFocusCapture={revealFocusedCard}>{children}</ol>;
}
