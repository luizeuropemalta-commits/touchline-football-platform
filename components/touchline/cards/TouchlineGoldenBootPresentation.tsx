import type { ReactNode } from "react";
import styles from "./TouchlineGoldenBootPresentation.module.css";

/** Presentation only: callers must independently establish award authority. */
export default function TouchlineGoldenBootPresentation({ cardWidth, label, children }: {
  cardWidth: number;
  label: string;
  children: ReactNode;
}) {
  if (!Number.isFinite(cardWidth) || cardWidth <= 0) return null;
  return <div className={styles.frame} style={{ width: cardWidth }} data-golden-boot-presentation="only">
    <div className={styles.card}>{children}</div>
    <div className={styles.award} style={{ paddingTop: cardWidth * 0.025 }}>
      <img src="/touchline/awards/golden-boot-v1.png" alt={label} draggable={false}
        style={{ width: cardWidth * 0.30, height: cardWidth * 0.30 }} />
    </div>
  </div>;
}
