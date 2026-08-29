"use client";

import { useLinkStatus } from "next/link";
import { useEffect, useRef } from "react";
import styles from "./ClubHubNavigationPending.module.css";

type ClubHubNavigationPendingProps = {
  forcePending?: boolean;
  label: string;
  onPendingSettled?: () => void;
};

/**
 * Link-local pending feedback. `useLinkStatus` scopes the state to the nearest
 * parent Link, so activating one club never marks the other nineteen cards.
 */
export default function ClubHubNavigationPending({
  forcePending = false,
  label,
  onPendingSettled,
}: ClubHubNavigationPendingProps) {
  const { pending } = useLinkStatus();
  const sawCanonicalPending = useRef(false);
  const active = forcePending || pending;

  useEffect(() => {
    if (pending) {
      sawCanonicalPending.current = true;
      return;
    }
    if (!sawCanonicalPending.current) return;
    sawCanonicalPending.current = false;
    onPendingSettled?.();
  }, [onPendingSettled, pending]);

  return (
    <span
      className={styles.pending}
      data-pending={active ? "true" : "false"}
      aria-live="polite"
      aria-atomic="true"
      aria-busy={active}
    >
      {active ? (
        <span className={styles.panel} role="status">
          <span className={styles.crest} aria-hidden="true" />
          <span className={styles.lines} aria-hidden="true">
            <span />
            <span />
          </span>
          <span className={styles.copy}>{label}</span>
        </span>
      ) : null}
    </span>
  );
}
