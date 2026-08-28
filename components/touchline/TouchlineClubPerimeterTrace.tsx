import type { CSSProperties } from "react";

import styles from "./TouchlineClubPerimeterTrace.module.css";

type Props = Readonly<{
  accent?: string;
  className?: string;
}>;

/**
 * Shared TouchLine club-colour perimeter used by Club Hub and Live.
 *
 * The accent must already belong to a verified canonical club. This component
 * is decorative only and intentionally renders nothing for an unresolved
 * colour, keeping the host's static border as the fail-closed presentation.
 */
export default function TouchlineClubPerimeterTrace({ accent, className }: Props) {
  if (!accent) return null;

  return (
    <svg
      aria-hidden="true"
      className={`${styles.trace}${className ? ` ${className}` : ""}`}
      data-touchline-club-perimeter-trace="true"
      focusable="false"
      style={{ "--touchline-perimeter-accent": accent } as CSSProperties}
    >
      <rect
        className={styles.base}
        data-touchline-club-perimeter-trace-base="true"
        height="calc(100% - 2px)"
        pathLength="100"
        width="calc(100% - 2px)"
        x="1"
        y="1"
      />
      <rect
        className={styles.run}
        data-touchline-club-perimeter-trace-run="true"
        height="calc(100% - 2px)"
        pathLength="100"
        width="calc(100% - 2px)"
        x="1"
        y="1"
      />
    </svg>
  );
}
