"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";

import { formatTouchlineLocalKickoff } from "@/lib/touchlineArena/local-kickoff";
import { normalizeTouchlineMatchCentreTimeZone } from "@/lib/touchlineArena/match-centre";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";

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
  homeTeam: FixtureTeam;
  homePosition: number | null;
  initialTimeZone: string;
  roundName: string;
  startsAt: string;
  locale?: TouchLineLocale;
  previewHref?: string | null;
  className?: string;
}>;

const subscribeToBrowserTimeZone = () => () => undefined;

function readBrowserTimeZone() {
  return normalizeTouchlineMatchCentreTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
}

function positionLabel(position: number | null, locale: TouchLineLocale) {
  if (!position || !Number.isInteger(position) || position < 1) {
    return locale === "pt-BR" ? "Tabela pendente" : "Table pending";
  }
  if (locale === "pt-BR") return `${position}º na liga`;
  const mod100 = position % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? "th"
    : position % 10 === 1 ? "st" : position % 10 === 2 ? "nd" : position % 10 === 3 ? "rd" : "th";
  return `${position}${suffix} in league`;
}

export default function ClubHubNextFixtureCard({
  awayTeam,
  awayPosition,
  homeTeam,
  homePosition,
  initialTimeZone,
  locale = "en-GB",
  previewHref = "/visual-qa/clubhub-next-fixture-post",
  className = "",
  roundName,
  startsAt,
}: Props) {
  const portuguese = locale === "pt-BR";
  const timeZone = useSyncExternalStore(
    subscribeToBrowserTimeZone,
    readBrowserTimeZone,
    () => initialTimeZone,
  );

  const localKickoff = useMemo(
    () => formatTouchlineLocalKickoff(startsAt, timeZone, locale),
    [locale, startsAt, timeZone],
  );

  if (!localKickoff) return null;

  return (
    <article className={`${styles.nextFixtureCard} ${className}`}>
      <div className={styles.nextFixtureHeading}>
        <CalendarDays aria-hidden="true" />
        <span>{portuguese ? "Próximo confronto" : "Next fixture"} · {roundName}</span>
      </div>
      <div className={styles.nextFixtureTeams}>
        <span className={styles.nextFixtureClub}>
          <Image alt={`${homeTeam.name} crest`} height={54} src={homeTeam.logoUrl} width={54} />
          <b>{homeTeam.name}</b>
          <small>{positionLabel(homePosition, locale)}</small>
        </span>
        <em>VS</em>
        <span className={styles.nextFixtureClub}>
          <Image alt={`${awayTeam.name} crest`} height={54} src={awayTeam.logoUrl} width={54} />
          <b>{awayTeam.name}</b>
          <small>{positionLabel(awayPosition, locale)}</small>
        </span>
      </div>
      <div className={styles.nextFixtureKickoff}>
        <time dateTime={startsAt}>{localKickoff.date} · {localKickoff.time}</time>
        <small>{portuguese ? "Seu horário local" : "Your local time"} · {localKickoff.zoneName}</small>
      </div>
      {previewHref ? (
        <Link className={styles.nextFixturePreviewLink} href={previewHref}>
          {portuguese ? "Ver prévia da arte da partida" : "View next-match post preview"}
        </Link>
      ) : null}
    </article>
  );
}
