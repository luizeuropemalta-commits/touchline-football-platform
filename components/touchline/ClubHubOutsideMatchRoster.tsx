import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import Link from "next/link";
import ClubHubSquadGrid from "@/components/touchline/ClubHubSquadGrid";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";

import styles from "./ClubHubOutsideMatchRoster.module.css";

type ClubHubOutsideMatchRosterProps = {
  clubName: string;
  cards: readonly ClubOwnerSquadCard[];
  locale: string;
  labels: { nationality: string; points: string; totalPoints: string; cardPrice: string; currentClub: string };
  squadUnavailable?: boolean;
  retryHref?: string;
  selectionState?: "unconfirmed" | "not_listed";
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
  squadUnavailable = false,
  retryHref,
  selectionState = "unconfirmed",
}: ClubHubOutsideMatchRosterProps) {
  const portuguese = locale === "pt-BR";
  const confirmed = selectionState === "not_listed";
  const title = confirmed
    ? (portuguese ? "Não relacionados na escalação disponível" : "Not listed in the available team sheet")
    : (portuguese ? "Demais jogadores do elenco" : "Other squad players");
  const description = confirmed
    ? (portuguese ? "Jogadores que não constam no time titular nem no banco da partida indicada acima. Não indica o motivo da ausência."
      : "Players not listed in the starting XI or bench for the match shown above. No reason for absence is inferred.")
    : (portuguese ? "A escalação e o banco oficiais da partida indicada acima ainda não estão completos. Estar fora da prévia não significa estar fora do jogo."
      : "The official starting XI and bench for the match shown above are not yet complete. Being outside the preview does not mean missing the match.");
  const emptyTitle = squadUnavailable
    ? (portuguese ? "Não foi possível carregar o elenco agora." : "The squad could not be loaded right now.")
    : (portuguese ? "Nenhum outro jogador a exibir" : "No other squad players to display");
  const emptyDescription = squadUnavailable
    ? (portuguese ? "Tente novamente para carregar os dados oficiais do elenco." : "Try again to load the official squad data.")
    : (portuguese ? "Todos os jogadores disponíveis estão exibidos acima." : "All available squad members are shown above.");

  return (
    <section id="club-squad" className={styles.shell} data-selection-state={selectionState} aria-label={`${clubName} ${title}`}>
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
          {squadUnavailable && retryHref ? <Link href={retryHref}>{portuguese ? "Tentar novamente" : "Try again"}</Link> : null}
        </div>
      )}
    </section>
  );
}
