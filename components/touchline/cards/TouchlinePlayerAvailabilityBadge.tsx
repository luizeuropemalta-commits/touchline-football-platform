"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { playerAvailabilityBadgeLabel, type PlayerAvailabilityBadge } from "@/lib/touchlineArena/player-availability-badge";
import styles from "./TouchlinePlayerAvailabilityBadge.module.css";

/** The caller must pass a badge resolved from exact confirmed provider
 * evidence. This component never calculates injury or suspension from totals. */
export default function TouchlinePlayerAvailabilityBadge({ badge, locale }: {
  badge: PlayerAvailabilityBadge;
  locale: TouchLineLocale;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const scrollContent = useRef<HTMLSpanElement>(null);
  const pointerType = useRef("");
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();
  const label = playerAvailabilityBadgeLabel(badge, locale);
  function cancelLeave() {
    if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  }
  function scheduleLeave() {
    cancelLeave();
    // Allow the pointer to cross the small visual gap into the portaled text.
    leaveTimer.current = setTimeout(() => {
      if (document.activeElement !== trigger.current) setOpen(false);
    }, 180);
  }
  function scrollTooltip(key: string) {
    const node = scrollContent.current;
    if (!open || !node || node.scrollHeight <= node.clientHeight) return false;
    const page = Math.max(1, node.clientHeight - 16);
    const offsets: Record<string, number> = { ArrowUp: -32, ArrowDown: 32, PageUp: -page, PageDown: page };
    if (key === "Home") node.scrollTop = 0;
    else if (key === "End") node.scrollTop = node.scrollHeight;
    else if (Object.hasOwn(offsets, key)) node.scrollTop += offsets[key];
    else return false;
    return true;
  }
  useLayoutEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    let frame: number | null = null;
    let disposed = false;
    function place() {
      if (disposed || !trigger.current || !tooltip.current) return;
      // Pinch changes the visual viewport without changing CSS 100vw. Constrain
      // the text before measuring it so both edges can fit the visible area.
      const availableWidth = `${Math.max(0, (viewport?.width ?? window.innerWidth) - 16)}px`;
      if (tooltip.current.style.getPropertyValue("--touchline-tooltip-available-width") !== availableWidth) {
        tooltip.current.style.setProperty("--touchline-tooltip-available-width", availableWidth);
      }
      const availableHeight = `${Math.max(0, (viewport?.height ?? window.innerHeight) - 16)}px`;
      if (tooltip.current.style.getPropertyValue("--touchline-tooltip-available-height") !== availableHeight) {
        tooltip.current.style.setProperty("--touchline-tooltip-available-height", availableHeight);
      }
      const anchor = trigger.current.getBoundingClientRect();
      const box = tooltip.current.getBoundingClientRect();
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
      const left = Math.max(leftEdge, Math.min(anchor.left + (anchor.width - box.width) / 2, rightEdge - box.width));
      const preferredTop = anchor.top - box.height - 8;
      const top = Math.max(topEdge, Math.min(preferredTop >= topEdge ? preferredTop : anchor.bottom + 8, bottomEdge - box.height));
      setPosition(previous => previous?.left === left && previous.top === top ? previous : { left, top });
    }
    function schedulePlace() {
      if (disposed || frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        place();
      });
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !tooltip.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const activeDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], dialog[open]'));
      const anotherDialogOwnsEscape = trigger.current?.closest("[inert]")
        || activeDialogs.some(dialog => !dialog.contains(trigger.current)
          && !dialog.closest('[inert], [aria-hidden="true"]') && dialog.getClientRects().length > 0);
      if (anotherDialogOwnsEscape) {
        cancelLeave();
        setOpen(false);
        return; // The active dialog keeps its own Escape and focus restoration.
      }
      event.preventDefault();
      event.stopPropagation();
      cancelLeave();
      setOpen(false);
    }
    place();
    const resize = new ResizeObserver(schedulePlace);
    if (tooltip.current) resize.observe(tooltip.current);
    window.addEventListener("resize", schedulePlace);
    window.addEventListener("scroll", schedulePlace, true);
    viewport?.addEventListener("resize", schedulePlace);
    viewport?.addEventListener("scroll", schedulePlace);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      cancelLeave();
      resize.disconnect();
      window.removeEventListener("resize", schedulePlace);
      window.removeEventListener("scroll", schedulePlace, true);
      viewport?.removeEventListener("resize", schedulePlace);
      viewport?.removeEventListener("scroll", schedulePlace);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, label]);
  return <span className={styles.anchor} data-player-availability-badge={badge.reason} data-open={open ? "true" : "false"}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={label} aria-expanded={open}
      aria-describedby={open ? tooltipId : undefined}
      onPointerDown={(event) => { pointerType.current = event.pointerType; event.stopPropagation(); }}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") { cancelLeave(); setOpen(true); } }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") scheduleLeave(); }}
      onFocus={() => { if (pointerType.current !== "touch") setOpen(true); }}
      onClick={(event) => { event.stopPropagation(); pointerType.current = ""; setOpen(value => !value); }}
      onKeyDown={(event) => {
        pointerType.current = "";
        if (scrollTooltip(event.key)) { event.preventDefault(); event.stopPropagation(); return; }
        if (["Escape", "Enter", " "].includes(event.key)) event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      }}
      onBlur={() => { pointerType.current = ""; setOpen(false); }}>
      <Image src={badge.asset} alt="" width={badge.width} height={badge.height} draggable={false} unoptimized />
    </button>
    {open ? createPortal(<span ref={tooltip} id={tooltipId} className={styles.tooltip} role="tooltip"
      onPointerEnter={cancelLeave} onPointerLeave={scheduleLeave}
      onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
      dir={locale === "ar-SA" ? "rtl" : "ltr"}><span ref={scrollContent} className={styles.tooltipText}>{label}</span></span>, document.body) : null}
  </span>;
}
