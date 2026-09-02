"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";

import { formatTouchlineLocalKickoff } from "@/lib/touchlineArena/local-kickoff";
import { normalizeTouchlineMatchCentreTimeZone } from "@/lib/touchlineArena/match-centre";

import styles from "./ClubHubPremiumPrototype.module.css";

type FixtureTeam = Readonly<{
  teamId: string;
  name: string;
  shortCode: string;
  logoUrl: string;
}>;

type Props = Readonly<{
  awayTeam: FixtureTeam;
  awayPosition: number | null;
  currentClubTeamId: string;
  homeTeam: FixtureTeam;
  homePosition: number | null;
  initialTimeZone: string;
  leagueTable: Readonly<{
    state: string;
    rows: readonly Readonly<{
      displayPosition: number | null;
      team: Readonly<{ teamId: string; name: string; logoUrl: string | null }>;
      played: number;
      points: number;
    }>[];
  }>;
  roundName: string;
  startsAt: string;
}>;

const subscribeToBrowserTimeZone = () => () => undefined;

function readBrowserTimeZone() {
  return normalizeTouchlineMatchCentreTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
}

function positionLabel(position: number | null) {
  if (!position || !Number.isInteger(position) || position < 1) return "Table pending";
  const mod100 = position % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? "th"
    : position % 10 === 1 ? "st" : position % 10 === 2 ? "nd" : position % 10 === 3 ? "rd" : "th";
  return `${position}${suffix} in league`;
}

export default function ClubHubNextFixtureCard({ awayTeam, awayPosition, currentClubTeamId, homeTeam, homePosition, initialTimeZone, leagueTable, roundName, startsAt }: Props) {
  const timeZone = useSyncExternalStore(
    subscribeToBrowserTimeZone,
    readBrowserTimeZone,
    () => initialTimeZone,
  );

  const localKickoff = useMemo(
    () => formatTouchlineLocalKickoff(startsAt, timeZone),
    [startsAt, timeZone],
  );

  if (!localKickoff) return null;

  return (
    <article className={styles.nextFixtureCard}>
      <div className={styles.nextFixtureHeading}>
        <CalendarDays aria-hidden="true" />
        <span>Next fixture · {roundName}</span>
      </div>
      <div className={styles.nextFixtureTeams}>
        <span className={styles.nextFixtureClub}>
          <Image alt={`${homeTeam.name} crest`} height={54} src={homeTeam.logoUrl} width={54} />
          <b>{homeTeam.name}</b>
          <small>{positionLabel(homePosition)}</small>
        </span>
        <em>VS</em>
        <span className={styles.nextFixtureClub}>
          <Image alt={`${awayTeam.name} crest`} height={54} src={awayTeam.logoUrl} width={54} />
          <b>{awayTeam.name}</b>
          <small>{positionLabel(awayPosition)}</small>
        </span>
      </div>
      <div className={styles.nextFixtureKickoff}>
        <time dateTime={startsAt}>{localKickoff.date} · {localKickoff.time}</time>
        <small>Your local time · {localKickoff.zoneName}</small>
      </div>
      <section className={styles.nextFixtureTable} aria-label="Premier League table">
        <header>
          <strong>League table</strong>
          <span>{leagueTable.state === "ready" || leagueTable.state === "pending_no_final" ? "TouchLine Verified" : "Awaiting verified table"}</span>
        </header>
        <div className={styles.nextFixtureTableHead} aria-hidden="true">
          <span>Pos</span><span>Club</span><span>P</span><span>Pts</span>
        </div>
        <div
          className={styles.nextFixtureTableScroller}
          tabIndex={0}
          aria-label="Scrollable Premier League table, 20 clubs"
          onKeyDown={(event) => {
            const distances: Readonly<Record<string, number>> = {
              ArrowDown: 30,
              ArrowUp: -30,
              PageDown: 112,
              PageUp: -112,
            };
            if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              event.currentTarget.scrollTo({ top: event.key === "Home" ? 0 : event.currentTarget.scrollHeight, behavior: "smooth" });
              return;
            }
            const top = distances[event.key];
            if (!top) return;
            event.preventDefault();
            event.currentTarget.scrollBy({ top, behavior: "smooth" });
          }}
        >
          {leagueTable.rows.map((row) => {
            const fixtureClub = row.team.teamId === homeTeam.teamId || row.team.teamId === awayTeam.teamId;
            const currentClub = row.team.teamId === currentClubTeamId;
            return (
              <div
                className={`${styles.nextFixtureTableRow}${fixtureClub ? ` ${styles.nextFixtureTableFixtureClub}` : ""}${currentClub ? ` ${styles.nextFixtureTableCurrentClub}` : ""}`}
                key={row.team.teamId}
              >
                <span>{row.displayPosition ?? "—"}</span>
                <span>{row.team.logoUrl ? <Image alt="" height={17} src={row.team.logoUrl} width={17} /> : <i />}<b>{row.team.name}</b></span>
                <span>{row.played}</span>
                <strong>{row.points}</strong>
              </div>
            );
          })}
        </div>
      </section>
      <Link className={styles.nextFixturePreviewLink} href="/visual-qa/clubhub-next-fixture-post">
        View next-match post preview
      </Link>
    </article>
  );
}
