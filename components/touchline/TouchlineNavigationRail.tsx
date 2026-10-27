"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

/** Keep the focused navigation control and its ring inside this rail only. */
export default function TouchlineNavigationRail({ className, children }: { className: string; children: ReactNode }) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const pendingFrame = useRef<number | null>(null);
  const cancelPendingFrame = useCallback(() => {
    if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = null;
  }, []);

  const revealFocusedControl = useCallback((rail: HTMLDivElement, target: HTMLElement) => {
    cancelPendingFrame();
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
  }, [cancelPendingFrame]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    // WebKit's native time editor may emit focus without focusin. React's
    // synthetic onFocusCapture follows focusin, so listen to native capture
    // for this control only and reuse the same local reveal operation.
    const nativeTimeFocus = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('input[type="time"]')) {
        revealFocusedControl(rail, target);
      }
    };
    rail.addEventListener("focus", nativeTimeFocus, true);
    return () => {
      rail.removeEventListener("focus", nativeTimeFocus, true);
      cancelPendingFrame();
    };
  }, [cancelPendingFrame, revealFocusedControl]);

  return <div ref={railRef} className={className} onFocusCapture={event => {
    // Native capture owns time controls even in engines emitting both events.
    if (!event.target.matches('input[type="time"]')) revealFocusedControl(event.currentTarget, event.target);
  }} onBlurCapture={cancelPendingFrame}>{children}</div>;
}
