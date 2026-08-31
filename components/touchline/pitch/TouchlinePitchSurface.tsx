import type { ReactNode } from "react";

import styles from "./TouchlinePitchSurface.module.css";

type TouchlinePitchSurfaceProps = Readonly<{
  ariaLabel: string;
  children?: ReactNode;
  className?: string;
  orientation?: "horizontal" | "vertical";
}>;

/**
 * The one canonical TouchLine regulation football field. Its markings follow
 * the 105 × 68 m reference geometry in either orientation. Consumers own their
 * cards and interactions, never a second field design or a second set of
 * markings. This keeps Arena, Match Centre, squad-management views and
 * ClubHub on the same broadcast-quality football surface.
 */
export default function TouchlinePitchSurface({
  ariaLabel,
  children,
  className,
  orientation = "horizontal",
}: TouchlinePitchSurfaceProps) {
  return (
    <div
      className={[
        styles.surface,
        orientation === "vertical" ? styles.surfaceVertical : null,
        className,
      ].filter(Boolean).join(" ")}
      data-touchline-pitch-orientation={orientation}
      role="group"
      aria-label={ariaLabel}
    >
      <span className={styles.boundary} aria-hidden="true" />
      <span className={styles.halfway} aria-hidden="true" />
      <span className={styles.centreCircle} aria-hidden="true" />
      <span className={styles.centreSpot} aria-hidden="true" />
      <span className={`${styles.box} ${styles.boxStart}`} aria-hidden="true" />
      <span className={`${styles.box} ${styles.boxEnd}`} aria-hidden="true" />
      <span className={`${styles.sixYardBox} ${styles.sixYardBoxStart}`} aria-hidden="true" />
      <span className={`${styles.sixYardBox} ${styles.sixYardBoxEnd}`} aria-hidden="true" />
      <span className={`${styles.goal} ${styles.goalStart}`} aria-hidden="true" />
      <span className={`${styles.goal} ${styles.goalEnd}`} aria-hidden="true" />
      <span className={`${styles.spot} ${styles.spotStart}`} aria-hidden="true" />
      <span className={`${styles.spot} ${styles.spotEnd}`} aria-hidden="true" />
      <span className={`${styles.penaltyArc} ${styles.penaltyArcStart}`} aria-hidden="true" />
      <span className={`${styles.penaltyArc} ${styles.penaltyArcEnd}`} aria-hidden="true" />
      <span className={`${styles.cornerArc} ${styles.cornerStartTop}`} aria-hidden="true" />
      <span className={`${styles.cornerArc} ${styles.cornerStartBottom}`} aria-hidden="true" />
      <span className={`${styles.cornerArc} ${styles.cornerEndTop}`} aria-hidden="true" />
      <span className={`${styles.cornerArc} ${styles.cornerEndBottom}`} aria-hidden="true" />
      {children}
    </div>
  );
}
