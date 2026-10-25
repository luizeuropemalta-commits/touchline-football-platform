"use client";

import { useEffect, useRef, type FocusEvent, type ReactNode } from "react";

/** Keep the focused navigation control and its ring inside this rail only. */
export default function TouchlineNavigationRail({ className, children }: { className: string; children: ReactNode }) {
  const pendingFrame = useRef<number | null>(null);
  const cancelPendingFrame = () => {
    if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = null;
  };
  useEffect(() => () => {
    if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
  }, []);

  function revealFocusedControl(event: FocusEvent<HTMLDivElement>) {
    cancelPendingFrame();
    const rail = event.currentTarget;
    const target = event.target;
    const reveal = () => {
      if (!rail.isConnected || !target.isConnected || target !== rail.ownerDocument.activeElement) return;
      const railStyle = getComputedStyle(rail);
      if (!/auto|scroll/.test(railStyle.overflowX) || rail.scrollWidth <= rail.clientWidth) return;
      const targetStyle = getComputedStyle(target);
      const outline = Math.max(0, parseFloat(targetStyle.outlineWidth) + parseFloat(targetStyle.outlineOffset));
      const gutter = Math.max(7, outline + 1);
      const frame = rail.getBoundingClientRect();
      const control = target.getBoundingClientRect();
      const left = frame.left + rail.clientLeft + gutter;
      const right = frame.left + rail.clientLeft + rail.clientWidth - gutter;
      const delta = control.left < left ? control.left - left : control.right > right ? control.right - right : 0;
      // Physical bounds also support negative RTL scroll offsets. Never use
      // scrollIntoView: it can move the document or an ancestor vertically.
      if (delta) rail.scrollBy({ left: delta, behavior: "instant" });
    };
    // Reveal immediately even when the next animation frame is throttled.
    // Recheck once after native keyboard scrolling has settled.
    reveal();
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null;
      reveal();
    });
  }

  return <div className={className} onFocusCapture={revealFocusedControl} onBlurCapture={cancelPendingFrame}>{children}</div>;
}
