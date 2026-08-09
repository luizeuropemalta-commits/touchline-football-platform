/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";

import { TOUCHLINE_COACH_TIER_GALLERY } from "@/lib/touchlineArena/coach-tier-gallery";
import { touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";

import styles from "./TouchlineCoachCategoryShowcase.module.css";

type Props = Readonly<{
  locale: string;
}>;

const copy = {
  "en-GB": {
    eyebrow: "TouchLine coach cards",
    title: "Coach-card tier framework",
    description: "Coach borders follow an approved final position from a completed season. They do not represent a player market value, a current coach identity or a live ranking.",
    position: "Approved previous-season finish",
    note: "Individual coach classifications remain unavailable until their evidence is published.",
  },
  "pt-BR": {
    eyebrow: "Cards de treinador TouchLine",
    title: "Estrutura de categorias dos cards de treinador",
    description: "As bordas dos treinadores seguem uma posição final aprovada de uma temporada concluída. Elas não representam valor de mercado de jogador, identidade de treinador atual ou ranking ao vivo.",
    position: "Posição aprovada na temporada concluída",
    note: "Classificações individuais de treinadores permanecem indisponíveis até a publicação de suas evidências.",
  },
} as const;

function positionRange(min: number, max: number) {
  return min === max ? String(min) : `${min}–${max}`;
}

/** Static, non-interactive framework: no coach identity or commercial state. */
export default function TouchlineCoachCategoryShowcase({ locale }: Props) {
  const dictionary = locale === "pt-BR" ? copy["pt-BR"] : copy["en-GB"];

  return (
    <section className={styles.surface} aria-labelledby="touchline-coach-category-title">
      <header className={styles.header}>
        <span className={styles.eyebrow}>{dictionary.eyebrow}</span>
        <h2 id="touchline-coach-category-title">{dictionary.title}</h2>
        <p>{dictionary.description}</p>
      </header>

      <ul className={styles.grid}>
        {TOUCHLINE_COACH_TIER_GALLERY.map((item) => {
          const palette = touchlineCardTierPalette(item.tierKey);
          return (
            <li
              key={item.tierKey}
              className={styles.card}
              style={{
                "--tier-accent": palette.accent,
                "--tier-secondary": palette.secondary,
              } as CSSProperties}
            >
              <img src={item.compactArtUrl} alt="" aria-hidden="true" />
              <div>
                <strong>{locale === "pt-BR" ? item.label.pt : item.label.en}</strong>
                <span>{dictionary.position}: {positionRange(item.completedSeasonPosition.min, item.completedSeasonPosition.max)}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className={styles.note}>{dictionary.note}</p>
    </section>
  );
}
