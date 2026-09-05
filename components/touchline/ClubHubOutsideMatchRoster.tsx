import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import ClubHubSquadGrid from "@/components/touchline/ClubHubSquadGrid";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";

import styles from "./ClubHubOutsideMatchRoster.module.css";

type ClubHubOutsideMatchRosterProps = {
  clubName: string;
  cards: readonly ClubOwnerSquadCard[];
  locale: string;
  labels: { nationality: string; points: string; totalPoints: string; cardPrice: string; currentClub: string };
};

/**
 * Premium compact roster for players outside the displayed matchday group.
 * The canonical player cards remain linked and are rendered once, in this
 * surface, rather than duplicated in a second roster below.
 */
export default function ClubHubOutsideMatchRoster({
  clubName,
  cards,
  locale,
  labels,
}: ClubHubOutsideMatchRosterProps) {
  const portuguese = locale === "pt-BR";
  const title = portuguese ? "Elenco fora da partida" : "Outside the matchday squad";
  const description = portuguese
    ? "Jogadores que não aparecem na escalação nem no banco confirmado."
    : "Players not displayed in the line-up or confirmed bench.";
  const emptyTitle = portuguese
    ? "Nenhum jogador fora da partida"
    : "No players outside the matchday group";
  const emptyDescription = portuguese
    ? "Todos os jogadores disponíveis estão exibidos acima."
    : "All available squad members are shown above.";

  return (
    <section className={styles.shell} aria-label={`${clubName} ${title}`}>
      <TouchlineClubPerimeterTrace accent="#a3ff12" className={styles.perimeterTrace} />
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{portuguese ? "ELENCO DO CLUBE" : "CLUB SQUAD"}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={styles.count} aria-label={portuguese ? `${cards.length} jogadores` : `${cards.length} players`}>
          {cards.length}
        </span>
      </header>

      {cards.length ? (
        <div className={styles.cards}>
          <ClubHubSquadGrid
            cards={[...cards]}
            locale={locale as "en-GB" | "pt-BR"}
            labels={labels}
            openProfileLabel={portuguese ? "Abrir card do jogador" : "Open player card"}
            initialCardCount={12}
            cardRenderScale={124 / 430}
            className={styles.cardGrid}
          />
        </div>
      ) : (
        <div className={styles.empty} role="status">
          <strong>{emptyTitle}</strong>
          <p>{emptyDescription}</p>
        </div>
      )}
    </section>
  );
}
