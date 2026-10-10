"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { matchCardLabel } from "@/lib/touchlineFantasy/match-card-i18n";
import styles from "./TouchlineMatchCardBadge.module.css";

/** A plain referee card for a confirmed event in the active match. */
export default function TouchlineMatchCardBadge({ kind, playerName, locale, draftLocalesEnabled = false }: {
  kind: "yellow" | "red";
  playerName: string;
  locale: string;
  draftLocalesEnabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const pointerType = useRef("");
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();
  const label = `${playerName} — ${matchCardLabel(kind, locale, draftLocalesEnabled)}`;
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
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (!trigger.current || !tooltip.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const box = tooltip.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
      const left = Math.max(leftEdge, Math.min(anchor.left + (anchor.width - box.width) / 2, rightEdge - box.width));
      const preferredTop = anchor.top - box.height - 8;
      const top = Math.max(topEdge, Math.min(preferredTop >= topEdge ? preferredTop : anchor.bottom + 8, bottomEdge - box.height));
      setPosition({ left, top });
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
    const resize = new ResizeObserver(place);
    if (tooltip.current) resize.observe(tooltip.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      cancelLeave();
      resize.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, label]);
  return <span className={styles.anchor} data-match-card={kind} data-open={open ? "true" : "false"}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={label} aria-expanded={open}
      aria-describedby={open ? tooltipId : undefined}
      onPointerDown={(event) => { pointerType.current = event.pointerType; event.stopPropagation(); }}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") { cancelLeave(); setOpen(true); } }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") scheduleLeave(); }}
      onFocus={() => { if (pointerType.current !== "touch") setOpen(true); }}
      onClick={(event) => { event.stopPropagation(); pointerType.current = ""; setOpen(value => !value); }}
      onKeyDown={(event) => {
        pointerType.current = "";
        if (["Escape", "Enter", " "].includes(event.key)) event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      }}
      onBlur={() => { pointerType.current = ""; setOpen(false); }}>
      <span className={styles.card} aria-hidden="true" />
    </button>
    {open ? createPortal(<span ref={tooltip} id={tooltipId} className={styles.tooltip} role="tooltip"
      onPointerEnter={cancelLeave} onPointerLeave={scheduleLeave}
      onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
      dir={locale === "ar-SA" ? "rtl" : "ltr"}>{label}</span>, document.body) : null}
  </span>;
}
