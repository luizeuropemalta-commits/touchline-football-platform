import type { CSSProperties, ReactNode } from "react";
import styles from "./TouchlineGoldenBootPresentation.module.css";

/** Head award: the shared card supplies exactly the crown's responsive box. */
export function TouchlineGoldenBootHead({ label, style }: { label: string; style: CSSProperties }) {
  return <img src="/touchline/awards/golden-boot-v1.png" alt={label}
    data-touchline-golden-boot="true" draggable={false} decoding="sync" loading="eager"
    style={{ ...style, objectFit: "contain", pointerEvents: "none",
      userSelect: "none", zIndex: 90 }} />;
}

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
