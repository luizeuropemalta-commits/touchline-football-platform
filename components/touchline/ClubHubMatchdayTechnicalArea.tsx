import type { TouchLineClubMatchdayPresentation } from "@/lib/touchlineArena/club-lineup";

import styles from "./ClubHubMatchdayTechnicalArea.module.css";

type ClubHubMatchdayTechnicalAreaProps = {
  clubName: string;
  technical: TouchLineClubMatchdayPresentation["technical"];
  locale: string;
};

/**
 * Public ClubHub matchday technical area. This is deliberately a presentation
 * of the fail-closed matchday read model: names appear only with a complete,
 * official coach + provider-confirmed technical team sheet for the selected
 * fixture. The provider determines the bench size.
 */
export default function ClubHubMatchdayTechnicalArea({
  clubName,
  technical,
  locale,
}: ClubHubMatchdayTechnicalAreaProps) {
  const portuguese = locale === "pt-BR";
  const confirmed = technical.state === "confirmed"
    && technical.bench.length > 0;
  const benchSize = confirmed ? technical.bench.length : 0;
  const awaitingLabel = portuguese
    ? "Aguardando súmula oficial da partida"
    : "Awaiting official matchday sheet";
  const coachLabel = portuguese ? "Treinador" : "Coach";
  const benchLabel = portuguese ? "Banco" : "Bench";

  return (
    <section
      className={styles.shell}
      data-matchday-sheet={confirmed ? "confirmed" : "awaiting"}
      aria-label={`${clubName} ${portuguese ? "área técnica da partida" : "matchday technical area"}`}
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{portuguese ? "SÚMULA DA PARTIDA" : "MATCHDAY SHEET"}</span>
          <h2>{portuguese ? "Área técnica" : "Technical area"}</h2>
        </div>
        <span className={`${styles.status} ${confirmed ? styles.confirmed : ""}`} aria-live="polite">
          {confirmed ? (portuguese ? "Súmula confirmada" : "Team sheet confirmed") : awaitingLabel}
        </span>
      </header>

      <div className={styles.content}>
        <section className={styles.coach} aria-label={coachLabel}>
          <span className={styles.label}>{coachLabel}</span>
          {confirmed && technical.coach ? (
            <strong>{technical.coach.name}</strong>
          ) : confirmed ? (
            <p>{portuguese ? "Treinador indisponível no feed oficial" : "Coach unavailable from the official feed"}</p>
          ) : (
            <p>{awaitingLabel}</p>
          )}
        </section>

        <section className={styles.bench} aria-label={confirmed ? `${benchLabel} (${benchSize})` : benchLabel}>
          <div className={styles.benchHeader}>
            <span className={styles.label}>{benchLabel}</span>
            <strong>{confirmed ? `${benchSize}/${benchSize}` : "—"}</strong>
          </div>
          <ol className={styles.slots}>
            {(confirmed ? technical.bench : [null]).map((player, index) => {
              const slotNumber = index + 1;
              const awaitingSlotLabel = portuguese
                ? `Vaga ${slotNumber} do banco — aguardando súmula oficial`
                : `Bench slot ${slotNumber} — awaiting official matchday sheet`;

              return (
                <li key={player?.id ?? `awaiting-bench-${slotNumber}`} className={player ? styles.filledSlot : styles.awaitingSlot}>
                  <span className={styles.slotNumber}>{slotNumber}</span>
                  {player ? (
                    <>
                      <strong>{player.name}</strong>
                      <small>{player.position}</small>
                    </>
                  ) : (
                    <span>{awaitingSlotLabel}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </section>
  );
}
