import type { ReactNode } from "react";

import styles from "./TouchlineGoalFacingPitchCard.module.css";

type Props = Readonly<{
  children: ReactNode;
  className?: string;
}>;

/**
 * Compact tactical-field presentation shared by Market and Club Hub line-up.
 * The card's top points into the attacking half while its floating rating is
 * counter-rotated so the number remains horizontal and immediately readable.
 */
export default function TouchlineGoalFacingPitchCard({ children, className }: Props) {
  return (
    <div
      className={[styles.shell, className].filter(Boolean).join(" ")}
      data-touchline-pitch-card-orientation="attack-right"
    >
      {children}
    </div>
  );
}
