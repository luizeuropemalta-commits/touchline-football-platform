import type { ReactNode } from "react";

import styles from "./TouchlineGoalFacingPitchCard.module.css";

type Props = Readonly<{
  children: ReactNode;
  className?: string;
  orientation?: "attack-right" | "attack-up" | "upright";
}>;

/**
 * Compact tactical-field presentation shared by Market and Club Hub line-up.
 * The card's top points into the attacking half while its floating rating is
 * counter-rotated so the number remains horizontal and immediately readable.
 */
export default function TouchlineGoalFacingPitchCard({ children, className, orientation = "attack-right" }: Props) {
  return (
    <div
      className={[
        styles.shell,
        orientation === "attack-up" ? styles.shellAttackUp : null,
        orientation === "upright" ? styles.shellUpright : null,
        className,
      ].filter(Boolean).join(" ")}
      data-touchline-pitch-card-orientation={orientation}
    >
      {children}
    </div>
  );
}
