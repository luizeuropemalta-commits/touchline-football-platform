import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { formatTouchlinePublicShirtNumber } from "@/lib/touchlineArena/editorial-card-profile";

import styles from "./ClubHubOutsideMatchRoster.module.css";

type ClubHubOutsideMatchRosterProps = {
  clubName: string;
  cards: readonly ClubOwnerSquadCard[];
  locale: string;
};

/**
 * Plain public roster for players outside the displayed matchday group.
 * This intentionally exposes only club roster facts—never card economy,
 * contracts, ranks, scores, or player-profile actions.
 */
export default function ClubHubOutsideMatchRoster({
  clubName,
  cards,
  locale,
}: ClubHubOutsideMatchRosterProps) {
  const portuguese = locale === "pt-BR";
  const title = portuguese ? "Elenco fora da partida" : "Outside the matchday squad";
  const description = portuguese
    ? "Jogadores que não aparecem na escalação nem no banco confirmado."
    : "Players not displayed in the line-up or confirmed bench.";
  const shirtNumberLabel = portuguese ? "Número" : "Shirt number";
  const noShirtNumber = portuguese ? "Sem número de camisa" : "No shirt number";
  const emptyTitle = portuguese
    ? "Nenhum jogador fora da partida"
    : "No players outside the matchday group";
  const emptyDescription = portuguese
    ? "Todos os jogadores disponíveis estão exibidos acima."
    : "All available squad members are shown above.";

  return (
    <section className={styles.shell} aria-label={`${clubName} ${title}`}>
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
        <ul className={styles.list}>
          {cards.map((card) => {
            const displayedShirtNumber = formatTouchlinePublicShirtNumber(card.shirtNumber);
            return <li key={card.id} className={styles.player}>
              <span
                className={styles.shirtNumber}
                aria-label={displayedShirtNumber === null ? noShirtNumber : `${shirtNumberLabel} ${displayedShirtNumber}`}
              >
                {displayedShirtNumber ?? "—"}
              </span>
              <strong>{card.name}</strong>
              <span className={styles.position}>{card.position}</span>
            </li>;
          })}
        </ul>
      ) : (
        <div className={styles.empty} role="status">
          <strong>{emptyTitle}</strong>
          <p>{emptyDescription}</p>
        </div>
      )}
    </section>
  );
}
