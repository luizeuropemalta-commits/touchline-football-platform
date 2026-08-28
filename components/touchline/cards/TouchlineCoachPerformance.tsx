import { BadgeCheck, CalendarClock, History, House, PlaneTakeoff, ShieldCheck, Trophy } from "lucide-react";

import type {
  TouchlineCoachCompetitionSnapshot,
  TouchlineCoachContractSnapshot,
  TouchlineCoachRecord,
} from "@/lib/touchlineArena/coach-scoring";

import styles from "./TouchlineCoachPerformance.module.css";

type TouchlineCoachPerformanceProps = {
  contract: TouchlineCoachContractSnapshot | null;
  contractHistory?: readonly TouchlineCoachContractSnapshot[];
  competition?: TouchlineCoachCompetitionSnapshot | null;
  locale?: string;
  showHistory?: boolean;
};

function formatDate(value: string | null, locale: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parsed);
}

function RecordPanel({
  context,
  record,
  portuguese,
}: {
  context: "home" | "away";
  record: TouchlineCoachRecord | null;
  portuguese: boolean;
}) {
  const home = context === "home";
  const label = home ? (portuguese ? "Casa" : "Home") : (portuguese ? "Fora" : "Away");
  const Icon = home ? House : PlaneTakeoff;
  return (
    <article className={styles.record} data-context={context} aria-label={label}>
      <header className={styles.contextHeading}>
        <span className={styles.contextIcon}><Icon aria-hidden="true" size={20} /></span>
        <div><span>{portuguese ? "Desempenho" : "Performance"}</span><strong>{label}</strong></div>
      </header>
      <dl className={styles.recordStats}>
        <div><dt aria-label={portuguese ? "Vitórias" : "Wins"}>W</dt><dd>{record?.wins ?? "—"}</dd></div>
        <div><dt aria-label={portuguese ? "Empates" : "Draws"}>D</dt><dd>{record?.draws ?? "—"}</dd></div>
        <div><dt aria-label={portuguese ? "Derrotas" : "Losses"}>L</dt><dd>{record?.losses ?? "—"}</dd></div>
        <div className={styles.points}><dt aria-label="TouchLine Points">TP</dt><dd>{record?.touchlinePoints ?? "—"}</dd></div>
      </dl>
    </article>
  );
}

export default function TouchlineCoachPerformance({
  contract,
  contractHistory = [],
  competition = null,
  locale = "en-GB",
  showHistory = false,
}: TouchlineCoachPerformanceProps) {
  const portuguese = locale === "pt-BR";
  const home: TouchlineCoachRecord | null = competition?.home ?? contract?.home ?? null;
  const away: TouchlineCoachRecord | null = competition?.away ?? contract?.away ?? null;
  const total = competition?.totalTouchlinePoints ?? contract?.totalTouchlinePoints ?? null;
  const lifecycle = contractHistory.length
    ? [...contractHistory].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    : contract ? [contract] : [];
  const status = competition
    ? (portuguese ? `Ranking #${competition.rank}` : `Rank #${competition.rank}`)
    : contract
    ? (contract.status === "active" ? (portuguese ? "Contrato ativo" : "Active contract") : (portuguese ? "Contrato encerrado" : "Ended contract"))
    : (portuguese ? "Sem contrato TouchLine" : "No TouchLine contract");

  return (
    <section
      className={styles.panel}
      aria-label={portuguese ? "Desempenho TouchLine do treinador" : "Coach TouchLine performance"}
      data-coach-performance-source={competition ? "competition-ranking" : contract ? "club-owner-contract" : "unavailable"}
    >
      <header className={styles.header}>
        <div className={styles.title}>
          <span className={styles.titleIcon}><ShieldCheck aria-hidden="true" size={22} /></span>
          <div><span>{competition ? (portuguese ? "TEMPORADA TOUCHLINE" : "TOUCHLINE SEASON") : "TOUCHLINE GAME"}</span><strong>{competition ? (portuguese ? "Desempenho oficial" : "Official performance") : "TouchLine Points"}</strong></div>
        </div>
        <span className={styles.status} data-contract-status={competition ? "competition" : contract?.status ?? "none"}>{status}</span>
      </header>

      <div className={styles.records}>
        <RecordPanel context="home" record={home} portuguese={portuguese} />
        <RecordPanel context="away" record={away} portuguese={portuguese} />
      </div>

      <div className={styles.total}>
        <span className={styles.totalIcon}><Trophy aria-hidden="true" size={21} /></span>
        <div className={styles.totalCopy}>
          <span>{portuguese ? "Pontuação total" : "Total score"}</span>
          <strong>Total TouchLine Points</strong>
        </div>
        <b className={styles.totalValue}>{total ?? "—"}<small>TL PTS</small></b>
      </div>

      <div className={styles.discipline} aria-label={portuguese ? "Cartões do treinador" : "Coach cards"}>
        <span className={styles.cardMarks} aria-hidden="true"><i /><i /></span>
        <div>
          <span>{portuguese ? "CARTÕES" : "CARDS"}</span>
          <strong>{portuguese ? "Dados disciplinares pendentes" : "Discipline data pending"}</strong>
        </div>
      </div>

      {competition ? (
        <dl className={styles.contractMeta} data-coach-competition-snapshot={competition.snapshotId}>
          <div><dt>{portuguese ? "Temporada" : "Season"}</dt><dd>{competition.seasonLabel}</dd></div>
          <div><dt>{portuguese ? "Partidas" : "Matches"}</dt><dd>{competition.home.wins + competition.home.draws + competition.home.losses + competition.away.wins + competition.away.draws + competition.away.losses}</dd></div>
        </dl>
      ) : contract ? (
        <dl className={styles.contractMeta}>
          <div><dt>{portuguese ? "Início do contrato" : "Contract start"}</dt><dd>{formatDate(contract.startedAt, locale)}</dd></div>
          <div><dt>{portuguese ? "Fim do contrato" : "Contract end"}</dt><dd>{contract.endedAt ? formatDate(contract.endedAt, locale) : (portuguese ? "Em vigor" : "Active")}</dd></div>
        </dl>
      ) : (
        <p className={styles.empty}>{portuguese ? "Este treinador não possui contrato TouchLine com a conta autenticada. Nenhum ponto foi inventado." : "This coach has no TouchLine contract with the authenticated account. No points have been invented."}</p>
      )}

      {showHistory && contract ? (
        <section className={styles.history} aria-label={portuguese ? "Histórico por partida" : "Fixture history"}>
          <header className={styles.historyTitle}>
            <span className={styles.historyIcon}><CalendarClock aria-hidden="true" size={18} /></span>
            <div><span>{portuguese ? "Histórico verificado" : "Verified history"}</span><strong>{portuguese ? "Partidas do contrato" : "Contract fixtures"}</strong></div>
          </header>
          {contract.fixtureHistory.length ? (
            <ol className={styles.historyList}>
              {contract.fixtureHistory.map((fixture) => {
                const Icon = fixture.context === "home" ? House : PlaneTakeoff;
                const context = fixture.context === "home" ? (portuguese ? "Casa" : "Home") : (portuguese ? "Fora" : "Away");
                return (
                  <li key={`${fixture.fixtureId}-${fixture.context}`}>
                    <Icon aria-hidden="true" size={18} />
                    <span><strong>{context} · {fixture.homeScore}–{fixture.awayScore}</strong><small>{formatDate(fixture.startsAt, locale)} · {fixture.settlementStatus === "final" ? (portuguese ? "Final" : "Final") : (portuguese ? "Provisório" : "Provisional")}</small></span>
                    <b>+{fixture.touchlinePoints} TP</b>
                  </li>
                );
              })}
            </ol>
          ) : <p className={styles.empty}>{portuguese ? "Nenhuma partida elegível foi concluída durante este contrato." : "No eligible fixture has been completed during this contract."}</p>}
        </section>
      ) : null}

      {showHistory && lifecycle.length ? (
        <section className={styles.lifecycle} data-coach-contract-history="true" aria-label={portuguese ? "Histórico de contratos" : "Contract history"}>
          <header className={styles.historyTitle}>
            <span className={styles.historyIcon}><History aria-hidden="true" size={18} /></span>
            <div><span>{portuguese ? "LIFECYCLE PRESERVADO" : "PRESERVED LIFECYCLE"}</span><strong>{portuguese ? "Histórico de contratos" : "Contract history"}</strong></div>
          </header>
          <ol className={styles.lifecycleList}>
            {lifecycle.map((item) => (
              <li key={item.id} data-contract-status={item.status}>
                <span className={styles.lifecycleStatus}><BadgeCheck aria-hidden="true" size={18} /></span>
                <span className={styles.lifecycleCopy}>
                  <strong>{item.status === "active"
                    ? (portuguese ? "Contrato ativo" : "Active contract")
                    : (portuguese ? "Contrato encerrado" : "Ended contract")}</strong>
                  <small>{formatDate(item.startedAt, locale)} — {item.endedAt ? formatDate(item.endedAt, locale) : (portuguese ? "Em vigor" : "Active")}</small>
                  {item.endReason ? <small>{portuguese ? "Motivo preservado" : "Preserved reason"}: {item.endReason}</small> : null}
                </span>
                <span className={styles.lifecyclePoints}>
                  <b>{item.totalTouchlinePoints}</b>
                  <small>TL PTS</small>
                  <em>{portuguese ? "Casa" : "Home"} {item.home.touchlinePoints} · {portuguese ? "Fora" : "Away"} {item.away.touchlinePoints}</em>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
