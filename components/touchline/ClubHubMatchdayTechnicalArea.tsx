import type { TouchLineClubMatchdayPresentation } from "@/lib/touchlineArena/club-lineup";

import styles from "./ClubHubMatchdayTechnicalArea.module.css";

type ClubHubMatchdayTechnicalAreaProps = {
  clubName: string;
  technical: TouchLineClubMatchdayPresentation["technical"];
  locale: string;
};

const MATCHDAY_BENCH_SIZE = 9;

/**
 * Public ClubHub matchday technical area. This is deliberately a presentation
 * of the fail-closed matchday read model: names appear only with a complete,
 * official coach + nine-substitute team sheet for the selected fixture.
 */
export default function ClubHubMatchdayTechnicalArea({
  clubName,
  technical,
  locale,
}: ClubHubMatchdayTechnicalAreaProps) {
  const portuguese = locale === "pt-BR";
  const confirmed = technical.state === "confirmed"
    && technical.coach !== null
    && technical.bench.length === MATCHDAY_BENCH_SIZE;
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
          {confirmed ? (
            <strong>{technical.coach?.name}</strong>
          ) : (
            <p>{awaitingLabel}</p>
          )}
        </section>

        <section className={styles.bench} aria-label={`${benchLabel} (${MATCHDAY_BENCH_SIZE})`}>
          <div className={styles.benchHeader}>
            <span className={styles.label}>{benchLabel}</span>
            <strong>{confirmed ? `${MATCHDAY_BENCH_SIZE}/${MATCHDAY_BENCH_SIZE}` : `0/${MATCHDAY_BENCH_SIZE}`}</strong>
          </div>
          <ol className={styles.slots}>
            {Array.from({ length: MATCHDAY_BENCH_SIZE }, (_, index) => {
              const player = confirmed ? technical.bench[index] : null;
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
