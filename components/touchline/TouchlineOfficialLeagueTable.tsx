/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import type { TouchlineOfficialLeagueTable } from "@/lib/football-data/official-league-table";

import styles from "./TouchlineOfficialLeagueTable.module.css";

type Props = Readonly<{
  table: TouchlineOfficialLeagueTable;
  locale: string;
  variant: "directory" | "profile" | "clubHubRail";
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
  goalsFor: string;
  goalsAgainst: string;
  difference: string;
  points: string;
  form: string;
  live: string;
  stale: string;
  scoreUnavailable: string;
  currentClub: string;
  finalResults: string;
  seasonStatus: string;
  seasonLive: string;
  seasonVerified: string;
  seasonInitial: string;
  seasonChecking: string;
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
    eyebrow: "TouchLine England League",
    title: "Official League Table",
    description: "The one official table combines TouchLine Verified final results with the latest persisted live scores. Live rows and positions are provisional until full time.",
    caption: "TouchLine England official league table",
    position: "Pos",
    club: "Club",
    played: "P",
    won: "W",
    drawn: "D",
    lost: "L",
    goalsFor: "GF",
    goalsAgainst: "GA",
    difference: "GD",
    points: "Pts",
    form: "Form",
    live: "LIVE",
    stale: "STALE",
    scoreUnavailable: "score unavailable",
    currentClub: "Current club",
    finalResults: "verified final results",
    seasonStatus: "Season status",
    seasonLive: "Live · provisional",
    seasonVerified: "Verified through latest final",
    seasonInitial: "Initial standings",
    seasonChecking: "Integrity check",
    pendingTitle: "Initial table — all 20 clubs are level.",
    pendingDescription: "Every club is level on sporting criteria. Continuous positions use alphabetical display order only until a verified result separates them.",
    partialTitle: "Verified results remain visible; league positions are temporarily withheld.",
    partialDescription: "TouchLine detected a duplicated fixture observation. No position is published until table integrity is restored.",
    unavailableTitle: "Official standings are temporarily unavailable.",
    unavailableDescription: "No league position is shown until TouchLine can verify the canonical result set again.",
    integrityTitle: "Official standings are being checked.",
    integrityDescription: "TouchLine found an identity or season consistency issue, so no league position is published.",
  },
  "pt-BR": {
    eyebrow: "TouchLine England League",
    title: "Tabela Oficial da Liga",
    description: "A única tabela oficial combina resultados finais verificados com os últimos placares ao vivo persistidos. Linhas e posições ao vivo são provisórias até o fim.",
    caption: "Tabela oficial da liga TouchLine England",
    position: "Pos",
    club: "Clube",
    played: "J",
    won: "V",
    drawn: "E",
    lost: "D",
    goalsFor: "GF",
    goalsAgainst: "GA",
    difference: "SG",
    points: "Pts",
    form: "Forma",
    live: "AO VIVO",
    stale: "DESATUALIZADO",
    scoreUnavailable: "placar indisponível",
    currentClub: "Clube atual",
    finalResults: "resultados finais verificados",
    seasonStatus: "Status da temporada",
    seasonLive: "Ao vivo · provisória",
    seasonVerified: "Verificada até o último resultado final",
    seasonInitial: "Tabela inicial",
    seasonChecking: "Verificação de integridade",
    pendingTitle: "Tabela inicial — os 20 clubes estão empatados.",
    pendingDescription: "Todos os clubes estão empatados nos critérios esportivos. As posições contínuas usam ordem alfabética apenas para apresentação até que um resultado verificado os separe.",
    partialTitle: "Os resultados verificados continuam visíveis; as posições estão temporariamente suspensas.",
    partialDescription: "A TouchLine detectou uma observação duplicada de fixture. Nenhuma posição é publicada até a integridade da tabela ser restaurada.",
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

function seasonStatusCopy(
  state: TouchlineOfficialLeagueTable["state"],
  hasLiveFixture: boolean,
  dictionary: TableCopy,
) {
  if (hasLiveFixture) return dictionary.seasonLive;
  if (state === "ready") return dictionary.seasonVerified;
  if (state === "pending_no_final") return dictionary.seasonInitial;
  return dictionary.seasonChecking;
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
  const seasonStatus = variant === "clubHubRail"
    ? null
    : seasonStatusCopy(table.state, hasLiveFixture, dictionary);
  const hasScrollableViewport = variant === "profile" || variant === "clubHubRail";
  const scrollLabel = effectiveLocale === "pt-BR"
    ? "Tabela rolável da liga, 20 clubes"
    : "Scrollable league table, 20 clubs";

  useEffect(() => {
    if (!hasLiveFixture) return;
    const interval = window.setInterval(() => router.refresh(), 10_000);
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
          {variant === "directory" ? <p>{dictionary.description}</p> : null}
        </div>
        <div className={styles.headerActions}>
          {action ? <Link className={styles.action} href={action.href}>{action.label}</Link> : null}
          {variant !== "clubHubRail" ? (
            <>
              <span
                className={styles.seasonStatus}
                aria-label={`${dictionary.seasonStatus}: ${seasonStatus}`}
              >
                <span>{dictionary.seasonStatus}</span>
                <strong>{seasonStatus}</strong>
                {table.season?.name ? <small>{table.season.name}</small> : null}
              </span>
              <small className={styles.source}>
                {table.coverage.completedFixtures} {dictionary.finalResults}
              </small>
            </>
          ) : null}
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
          <div className={variant === "clubHubRail" ? styles.clubHubTableFrame : undefined}>
            {variant === "clubHubRail" ? <TouchlineClubPerimeterTrace accent="#a3ff12" className={styles.clubHubTableTrace} /> : null}
            <div
              className={styles.tableWrap}
              aria-label={hasScrollableViewport ? scrollLabel : undefined}
              data-club-table-scroll-region={variant === "clubHubRail" ? "true" : undefined}
              tabIndex={hasScrollableViewport ? 0 : undefined}
            >
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
                  <th scope="col">{dictionary.goalsFor}</th>
                  <th scope="col">{dictionary.goalsAgainst}</th>
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
                  const liveLabel = row.liveFixture?.stale
                    ? `${dictionary.live} · ${dictionary.stale}`
                    : dictionary.live;
                  return (
                    <tr
                      key={row.team.providerTeamId}
                      data-current={isCurrent || undefined}
                      data-live={row.liveFixture ? "true" : undefined}
                      data-live-stale={row.liveFixture?.stale || undefined}
                      data-display-position={row.displayPosition ?? undefined}
                    >
                      <td className={styles.rankCell}>
                        {row.displayPosition ?? "—"}
                      </td>
                      <th scope="row">
                        <Link
                          href={`/touchline-clubs/${row.team.slug}?lang=${localeQuery}`}
                          prefetch={false}
                          aria-current={isCurrent ? "page" : undefined}
                        >
                          {row.team.logoUrl ? <img src={row.team.logoUrl} alt="" loading="lazy" decoding="async" /> : null}
                          <span>{row.team.name}</span>
                          {isCurrent ? <span className={styles.srOnly}>{dictionary.currentClub}</span> : null}
                          {row.liveFixture ? <span className={styles.liveScore} aria-label={`${liveLabel}: ${liveScore}`}>{liveLabel} · {liveScore}</span> : null}
                        </Link>
                      </th>
                      <td>{row.played}</td>
                      <td className={styles.optional}>{row.won}</td>
                      <td className={styles.optional}>{row.drawn}</td>
                      <td className={styles.optional}>{row.lost}</td>
                      <td>{row.goalsFor}</td>
                      <td>{row.goalsAgainst}</td>
                      <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                      <td className={styles.points}>{row.points}</td>
                      <td className={styles.form}>{row.form.join(" · ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
