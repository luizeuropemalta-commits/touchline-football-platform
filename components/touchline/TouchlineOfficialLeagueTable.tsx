/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import type { TouchlineOfficialLeagueTable } from "@/lib/football-data/official-league-table";

import styles from "./TouchlineOfficialLeagueTable.module.css";

type Props = Readonly<{
  table: TouchlineOfficialLeagueTable;
  locale: string;
  variant: "directory" | "profile";
  currentTeamId?: string | null;
  action?: Readonly<{ href: string; label: string }> | null;
  id?: string;
  className?: string;
}>;

type TableCopy = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  caption: string;
  position: string;
  club: string;
  played: string;
  won: string;
  drawn: string;
  lost: string;
  difference: string;
  points: string;
  form: string;
  live: string;
  scoreUnavailable: string;
  currentClub: string;
  finalResults: string;
  pendingTitle: string;
  pendingDescription: string;
  partialTitle: string;
  partialDescription: string;
  unavailableTitle: string;
  unavailableDescription: string;
  integrityTitle: string;
  integrityDescription: string;
}>;

const copy: Record<"en-GB" | "pt-BR", TableCopy> = {
  "en-GB": {
    eyebrow: "TouchLine England",
    title: "Official League Table",
    description: "TouchLine Verified final results define the standings. Live matches show their score and highlighted clubs without changing points until full time.",
    caption: "TouchLine England official league table",
    position: "Pos",
    club: "Club",
    played: "P",
    won: "W",
    drawn: "D",
    lost: "L",
    difference: "GD",
    points: "Pts",
    form: "Form",
    live: "LIVE",
    scoreUnavailable: "score unavailable",
    currentClub: "Current club",
    finalResults: "verified final results",
    pendingTitle: "Initial table — all 20 clubs are level.",
    pendingDescription: "Every club is shown with neutral statistics. Positions begin after the first verified final result; no league leader or position is invented.",
    partialTitle: "Verified results are available; official tie-break positions are still being confirmed.",
    partialDescription: "Statistics are shown without invented positions until the canonical ordering is complete.",
    unavailableTitle: "Official standings are temporarily unavailable.",
    unavailableDescription: "No league position is shown until TouchLine can verify the canonical result set again.",
    integrityTitle: "Official standings are being checked.",
    integrityDescription: "TouchLine found an identity or season consistency issue, so no league position is published.",
  },
  "pt-BR": {
    eyebrow: "TouchLine England",
    title: "Tabela Oficial da Liga",
    description: "Resultados finais verificados definem a classificação. Partidas ao vivo exibem placar e destaque sem alterar pontos até o resultado final.",
    caption: "Tabela oficial da liga TouchLine England",
    position: "Pos",
    club: "Clube",
    played: "J",
    won: "V",
    drawn: "E",
    lost: "D",
    difference: "SG",
    points: "Pts",
    form: "Forma",
    live: "AO VIVO",
    scoreUnavailable: "placar indisponível",
    currentClub: "Clube atual",
    finalResults: "resultados finais verificados",
    pendingTitle: "Tabela inicial — os 20 clubes estão empatados.",
    pendingDescription: "Todos os clubes aparecem com estatísticas neutras. As posições começam após o primeiro resultado final verificado; nenhuma liderança ou posição é inventada.",
    partialTitle: "Há resultados verificados; as posições de desempate oficial ainda estão sendo confirmadas.",
    partialDescription: "As estatísticas aparecem sem posições inventadas até a ordenação canônica ser concluída.",
    unavailableTitle: "A tabela oficial está temporariamente indisponível.",
    unavailableDescription: "Nenhuma posição é exibida até a TouchLine verificar novamente o conjunto canônico de resultados.",
    integrityTitle: "A tabela oficial está sendo verificada.",
    integrityDescription: "A TouchLine encontrou uma inconsistência de identidade ou temporada; nenhuma posição é publicada.",
  },
};

function statusCopy(state: TouchlineOfficialLeagueTable["state"], dictionary: TableCopy) {
  if (state === "pending_no_final") return { title: dictionary.pendingTitle, description: dictionary.pendingDescription, role: "status" as const };
  if (state === "partial") return { title: dictionary.partialTitle, description: dictionary.partialDescription, role: "status" as const };
  if (state === "unavailable") return { title: dictionary.unavailableTitle, description: dictionary.unavailableDescription, role: "status" as const };
  if (state === "integrity_error") return { title: dictionary.integrityTitle, description: dictionary.integrityDescription, role: "alert" as const };
  return null;
}

/** Presentational only: all football data arrives in the canonical table DTO. */
export default function TouchlineOfficialLeagueTable({
  table,
  locale,
  variant,
  currentTeamId = null,
  action = null,
  id,
  className,
}: Props) {
  const effectiveLocale = locale === "pt-BR" ? "pt-BR" : "en-GB";
  const dictionary = copy[effectiveLocale];
  const status = statusCopy(table.state, dictionary);
  const localeQuery = encodeURIComponent(locale);
  const router = useRouter();
  const hasLiveFixture = table.rows.some((row) => Boolean(row.liveFixture));

  useEffect(() => {
    if (!hasLiveFixture) return;
    const interval = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [hasLiveFixture, router]);

  return (
    <section
      id={id}
      className={`${styles.surface} ${styles[variant]} ${className ?? ""}`}
      data-state={table.state}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{dictionary.eyebrow}</span>
          <h2 id={id ? `${id}-title` : undefined}>{dictionary.title}</h2>
          <p>{dictionary.description}</p>
        </div>
        <div className={styles.headerActions}>
          {action ? <Link className={styles.action} href={action.href}>{action.label}</Link> : null}
          <small className={styles.source}>
            {table.coverage.completedFixtures} {dictionary.finalResults}
          </small>
        </div>
      </header>

      {status && !table.rows.length ? (
        <div className={styles.status} role={status.role}>
          <strong>{status.title}</strong>
          <p>{status.description}</p>
        </div>
      ) : null}

      {table.rows.length ? (
        <>
          {status ? (
            <div className={styles.notice} role={status.role}>
              <strong>{status.title}</strong>
              <p>{status.description}</p>
            </div>
          ) : null}
          <div className={styles.tableWrap}>
            <table>
              <caption>{dictionary.caption}</caption>
              <thead>
                <tr>
                  <th scope="col">{dictionary.position}</th>
                  <th scope="col">{dictionary.club}</th>
                  <th scope="col">{dictionary.played}</th>
                  <th scope="col" className={styles.optional}>{dictionary.won}</th>
                  <th scope="col" className={styles.optional}>{dictionary.drawn}</th>
                  <th scope="col" className={styles.optional}>{dictionary.lost}</th>
                  <th scope="col">{dictionary.difference}</th>
                  <th scope="col">{dictionary.points}</th>
                  <th scope="col" className={styles.form}>{dictionary.form}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => {
                  const isCurrent = row.team.providerTeamId === currentTeamId;
                  const liveScore = row.liveFixture && row.liveFixture.scoreFor !== null && row.liveFixture.scoreAgainst !== null
                    ? `${row.liveFixture.scoreFor}–${row.liveFixture.scoreAgainst}`
                    : dictionary.scoreUnavailable;
                  return (
                    <tr
                      key={row.team.providerTeamId}
                      data-current={isCurrent || undefined}
                      data-live={row.liveFixture ? "true" : undefined}
                    >
                      <td>{row.position ?? "—"}</td>
                      <th scope="row">
                        <Link href={`/touchline-clubs/${row.team.slug}?lang=${localeQuery}`} aria-current={isCurrent ? "page" : undefined}>
                          {row.team.logoUrl ? <img src={row.team.logoUrl} alt="" /> : null}
                          <span>{row.team.name}</span>
                          {isCurrent ? <span className={styles.srOnly}>{dictionary.currentClub}</span> : null}
                          {row.liveFixture ? <span className={styles.liveScore} aria-label={`${dictionary.live}: ${liveScore}`}>{dictionary.live} · {liveScore}</span> : null}
                        </Link>
                      </th>
                      <td>{row.played}</td>
                      <td className={styles.optional}>{row.won}</td>
                      <td className={styles.optional}>{row.drawn}</td>
                      <td className={styles.optional}>{row.lost}</td>
                      <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                      <td className={styles.points}>{row.points}</td>
                      <td className={styles.form}>{row.form.join(" · ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
