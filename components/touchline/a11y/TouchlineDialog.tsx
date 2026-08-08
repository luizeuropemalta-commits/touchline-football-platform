"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  "area[href]",
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'iframe:not([tabindex="-1"])',
  'object:not([tabindex="-1"])',
  'embed:not([tabindex="-1"])',
  '[contenteditable="true"]:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type TouchlineDialogOptions = {
  /** Whether the dialog is currently rendered. */
  open: boolean;
  /** Called for the keyboard Escape dismissal gesture. */
  onDismiss: () => void;
  /** A complete, already-localised dialog label. */
  label: string;
  /** Prefer this control when the dialog receives focus. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Prefer this control after the dialog closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

type InertSnapshot = {
  count: number;
  inert: boolean;
  ariaHidden: string | null;
};

// More than one dialog can be mounted while React is reconciling state. Keep a
// small reference count so one cleanup never re-enables a sibling that is still
// protected by another open dialog.
const inertSnapshots = new WeakMap<HTMLElement, InertSnapshot>();

function isVisible(element: HTMLElement) {
  return element.getClientRects().length > 0 && !element.hasAttribute("hidden");
}

function focusElement(element: HTMLElement | null | undefined) {
  if (!element || !element.isConnected || !isVisible(element)) return false;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
  return document.activeElement === element;
}

function getFocusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true" && isVisible(element),
  );
}

function hasInertAncestor(element: HTMLElement) {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.inert || current.getAttribute("aria-hidden") === "true") return true;
    current = current.parentElement;
  }
  return false;
}

function lockSiblingBackground(dialog: HTMLElement) {
  const siblings: HTMLElement[] = [];
  let child: HTMLElement = dialog;
  let parent = dialog.parentElement;

  // A Market confirmation lives several levels below the Arena field. Lock
  // siblings at every safe ancestor level, never an ancestor that contains the
  // dialog itself. This gives the same background isolation to portaled and
  // in-tree dialogs without relying on a fragile global app-root selector.
  while (parent) {
    for (const element of Array.from(parent.children)) {
      if (!(element instanceof HTMLElement) || element === child || element.contains(dialog)) continue;
      siblings.push(element);
    }
    if (parent === document.body) break;
    child = parent;
    parent = parent.parentElement;
  }

  if (!siblings.length) return () => undefined;

  for (const sibling of siblings) {
    const existing = inertSnapshots.get(sibling);
    if (existing) {
      existing.count += 1;
      continue;
    }

    inertSnapshots.set(sibling, {
      count: 1,
      inert: sibling.inert,
      ariaHidden: sibling.getAttribute("aria-hidden"),
    });
    sibling.inert = true;
    sibling.setAttribute("aria-hidden", "true");
  }

  return () => {
    for (const sibling of siblings) {
      const snapshot = inertSnapshots.get(sibling);
      if (!snapshot) continue;
      snapshot.count -= 1;
      if (snapshot.count > 0) continue;

      sibling.inert = snapshot.inert;
      if (snapshot.ariaHidden === null) sibling.removeAttribute("aria-hidden");
      else sibling.setAttribute("aria-hidden", snapshot.ariaHidden);
      inertSnapshots.delete(sibling);
    }
  };
}

/**
 * Shared behaviour for the public TouchLine dialogs. It deliberately does not
 * own visual markup, so card, Arena and table surfaces keep their established
 * responsive layouts while sharing the same keyboard and assistive-tech rules.
 */
export function useTouchlineDialog<T extends HTMLElement = HTMLElement>({
  open,
  onDismiss,
  label,
  initialFocusRef,
  returnFocusRef,
}: TouchlineDialogOptions) {
  const dialogRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  const onKeyDownCapture = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismissRef.current();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = getFocusableElements(dialog);
    if (!focusable.length) {
      event.preventDefault();
      focusElement(dialog);
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      focusElement(last);
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      focusElement(first);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const activeElement = document.activeElement;
    previousFocusRef.current = activeElement instanceof HTMLElement && !dialog.contains(activeElement)
      ? activeElement
      : null;
    const explicitReturnTarget = returnFocusRef?.current ?? null;

    const unlockBackground = lockSiblingBackground(dialog);
    const focusFrame = window.requestAnimationFrame(() => {
      if (!dialog.isConnected) return;
      if (focusElement(initialFocusRef?.current)) return;
      if (focusElement(getFocusableElements(dialog)[0])) return;
      focusElement(dialog);
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      unlockBackground();

      window.requestAnimationFrame(() => {
        const anotherDialogIsOpen = document.querySelector('[data-touchline-dialog-root="true"][aria-modal="true"]');
        if (anotherDialogIsOpen) return;

        const returnTarget = explicitReturnTarget ?? previousFocusRef.current;
        if (!returnTarget || hasInertAncestor(returnTarget)) return;
        focusElement(returnTarget);
      });
    };
  }, [initialFocusRef, open, returnFocusRef]);

  const dialogProps = useMemo(() => ({
    ref: dialogRef,
    role: "dialog" as const,
    "aria-modal": true,
    "aria-label": label,
    tabIndex: -1,
    "data-touchline-dialog-root": "true",
    onKeyDownCapture,
  }), [label, onKeyDownCapture]);

  return { dialogRef, dialogProps };
}
