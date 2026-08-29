"use client";

import { useLinkStatus } from "next/link";
import styles from "./ClubHubNavigationPending.module.css";

type ClubHubNavigationPendingProps = {
  label: string;
};

/**
 * Link-local pending feedback. `useLinkStatus` scopes the state to the nearest
 * parent Link, so activating one club never marks the other nineteen cards.
 */
export default function ClubHubNavigationPending({ label }: ClubHubNavigationPendingProps) {
  const { pending } = useLinkStatus();

  return (
    <span
      className={styles.pending}
      data-pending={pending ? "true" : "false"}
      aria-live="polite"
      aria-atomic="true"
      aria-busy={pending}
    >
      {pending ? (
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
