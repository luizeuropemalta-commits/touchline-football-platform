"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

/** Keep the focused navigation control and its ring inside this rail only. */
export default function TouchlineNavigationRail({ className, children, revealVerticalFocus = false }: { className: string; children: ReactNode; revealVerticalFocus?: boolean }) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const pendingFrame = useRef<number | null>(null);
  const keyboardTab = useRef(false);
  const cancelPendingFrame = useCallback(() => {
    if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = null;
  }, []);

  const revealFocusedControl = useCallback((rail: HTMLDivElement, target: HTMLElement) => {
    cancelPendingFrame();
    const revealVertically = revealVerticalFocus && keyboardTab.current;
    const reveal = () => {
      if (!rail.isConnected || !target.isConnected || target !== rail.ownerDocument.activeElement) return;
      const railStyle = getComputedStyle(rail);
      const horizontalOverflow = /auto|scroll/.test(railStyle.overflowX) && rail.scrollWidth > rail.clientWidth;
      if (!horizontalOverflow && !revealVertically) return;
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
      if (delta && horizontalOverflow) rail.scrollBy({ left: delta, behavior: "instant" });
      // Content forms opt in: WebKit can focus native time inputs without
      // revealing them vertically. Navigation rails retain horizontal-only behavior.
      if (revealVertically) {
        const viewport = rail.ownerDocument.defaultView;
        if (viewport) {
          const current = target.getBoundingClientRect();
          const vertical = current.top < gutter ? current.top - gutter
            : current.bottom > viewport.innerHeight - gutter ? current.bottom - viewport.innerHeight + gutter : 0;
          if (vertical) viewport.scrollBy({ top: vertical, behavior: "instant" });
        }
      }
    };
    // Reveal immediately even when the next animation frame is throttled.
    // Recheck once after native keyboard scrolling has settled.
    reveal();
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null;
      reveal();
    });
  }, [cancelPendingFrame, revealVerticalFocus]);

  useEffect(() => {
    if (!revealVerticalFocus) return;
    const document = railRef.current?.ownerDocument;
    if (!document) return;
    const start = (event: KeyboardEvent) => { keyboardTab.current = event.key === "Tab"; };
    const end = () => { keyboardTab.current = false; };
    document.addEventListener("keydown", start, true);
    document.addEventListener("keyup", end, true);
    document.addEventListener("pointerdown", end, true);
    return () => {
      document.removeEventListener("keydown", start, true);
      document.removeEventListener("keyup", end, true);
      document.removeEventListener("pointerdown", end, true);
      keyboardTab.current = false;
    };
  }, [revealVerticalFocus]);

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
