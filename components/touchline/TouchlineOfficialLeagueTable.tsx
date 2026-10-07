/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import type { TouchlineOfficialLeagueTable } from "@/lib/football-data/official-league-table";
import { getTouchlineOfficialLeagueTableCopy, type TouchlineOfficialLeagueTableCopy as TableCopy } from "@/lib/touchlineArena/official-league-table-i18n";

import styles from "./TouchlineOfficialLeagueTable.module.css";

type Props = Readonly<{
  table: TouchlineOfficialLeagueTable;
  locale: string;
  draftLocalesEnabled?: boolean;
  variant: "directory" | "profile" | "clubHubRail";
  currentTeamId?: string | null;
  action?: Readonly<{ href: string; label: string }> | null;
  id?: string;
  className?: string;
}>;


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
  draftLocalesEnabled = false,
  variant,
  currentTeamId = null,
  action = null,
  id,
  className,
}: Props) {
  const dictionary = getTouchlineOfficialLeagueTableCopy(locale, draftLocalesEnabled);
  const status = statusCopy(table.state, dictionary);
  const localeQuery = encodeURIComponent(locale);
  const router = useRouter();
  const hasLiveFixture = table.rows.some((row) => Boolean(row.liveFixture));
  const seasonStatus = variant === "clubHubRail"
    ? null
    : seasonStatusCopy(table.state, hasLiveFixture, dictionary);
  const hasScrollableViewport = variant === "profile" || variant === "clubHubRail";
  const scrollLabel = dictionary.scrollLabel;

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
