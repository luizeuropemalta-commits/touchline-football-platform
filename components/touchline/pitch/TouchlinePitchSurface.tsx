import type { ReactNode } from "react";

import styles from "./TouchlinePitchSurface.module.css";

type TouchlinePitchSurfaceProps = Readonly<{
  ariaLabel: string;
  children?: ReactNode;
  className?: string;
}>;

/**
 * The one canonical TouchLine horizontal football field. Consumers own their
 * cards and interactions, never a second field design or a second set of
 * markings. This keeps Arena, Match Centre, squad-management views and
 * ClubHub on the same broadcast-quality football surface.
 */
export default function TouchlinePitchSurface({ ariaLabel, children, className }: TouchlinePitchSurfaceProps) {
  return (
    <div
      className={[styles.surface, className].filter(Boolean).join(" ")}
      role="group"
      aria-label={ariaLabel}
    >
      <span className={styles.boundary} aria-hidden="true" />
      <span className={styles.halfway} aria-hidden="true" />
      <span className={`${styles.box} ${styles.boxStart}`} aria-hidden="true" />
      <span className={`${styles.box} ${styles.boxEnd}`} aria-hidden="true" />
      <span className={`${styles.sixYardBox} ${styles.sixYardBoxStart}`} aria-hidden="true" />
      <span className={`${styles.sixYardBox} ${styles.sixYardBoxEnd}`} aria-hidden="true" />
      <span className={`${styles.goal} ${styles.goalStart}`} aria-hidden="true" />
      <span className={`${styles.goal} ${styles.goalEnd}`} aria-hidden="true" />
      <span className={`${styles.spot} ${styles.spotStart}`} aria-hidden="true" />
      <span className={`${styles.spot} ${styles.spotEnd}`} aria-hidden="true" />
      {children}
    </div>
  );
}
