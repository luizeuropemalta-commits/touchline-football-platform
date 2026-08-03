import type { ReactNode } from "react";

import styles from "./TouchlinePitchSurface.module.css";

type TouchlinePitchSurfaceProps = Readonly<{
  ariaLabel: string;
  children?: ReactNode;
  className?: string;
}>;

/**
 * Canonical TouchLine horizontal field. It owns only the field art; each
 * consumer retains its own cards, interaction and responsive dimensions.
 */
export default function TouchlinePitchSurface({ ariaLabel, children, className }: TouchlinePitchSurfaceProps) {
  return (
    <div className={[styles.surface, className].filter(Boolean).join(" ")} aria-label={ariaLabel}>
      <span className={`${styles.box} ${styles.boxStart}`} aria-hidden="true" />
      <span className={`${styles.box} ${styles.boxEnd}`} aria-hidden="true" />
      {children}
    </div>
  );
}
