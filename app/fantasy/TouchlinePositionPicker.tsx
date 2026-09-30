"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "@/components/touchline/a11y/TouchlineDialog";
import styles from "./position-picker.module.css";
import navigationStyles from "@/components/touchline/TouchlineGlobalNavigation.module.css";

/** Only the catalogue overlays the pitch; lineup state stays with its owner. */
export default function TouchlinePositionPicker({ open, inline = false, title, closeLabel, onClose, returnFocusRef, children }: {
  open: boolean;
  inline?: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({
    open, onDismiss: onClose, label: title, initialFocusRef: closeRef, returnFocusRef,
  });

  useTouchlineDialogScrollLock(open);

  if (inline) return <>{children}</>;
  if (!open) return null;
  return createPortal(
    <div {...dialogProps} id="touchline-position-picker" className={styles.overlay}>
      <section className={styles.panel}>
        <header className={styles.heading}>
          <div><span>TOUCHLINE · XI</span><h2>{title}</h2></div>
          <button ref={closeRef} type="button" className={navigationStyles.link} onClick={onClose} aria-label={closeLabel}>{closeLabel} ×</button>
        </header>
        <div className={styles.content}>{children}</div>
      </section>
    </div>, document.body,
  );
}
