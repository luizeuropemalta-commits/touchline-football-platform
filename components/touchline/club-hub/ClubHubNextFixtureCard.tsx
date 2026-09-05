"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { formatTouchlineLocalKickoff } from "@/lib/touchlineArena/local-kickoff";
import { normalizeTouchlineMatchCentreTimeZone } from "@/lib/touchlineArena/match-centre";
import { clubHubFixtureRailRefreshMs, resolveClubHubFixtureRail } from "@/lib/touchlineArena/club-hub-fixture-rail";
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
  status?: string;
  homeScore?: number;
  awayScore?: number;
  liveMinute?: number;
  locale?: TouchLineLocale;
  previewHref?: string | null;
  className?: string;
  venueName?: string | null;
  venueImageUrl?: string | null;
  variant?: "rail" | "hero";
  showPositions?: boolean;
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
  status,
  homeScore,
  awayScore,
  liveMinute,
  venueName = null,
  venueImageUrl = null,
  variant = "rail",
  showPositions = true,
}: Props) {
  const portuguese = locale === "pt-BR";
  const router = useRouter();
  const timeZone = useSyncExternalStore(
    subscribeToBrowserTimeZone,
    readBrowserTimeZone,
    () => initialTimeZone,
  );

  const localKickoff = useMemo(
    () => formatTouchlineLocalKickoff(startsAt, timeZone, locale),
    [locale, startsAt, timeZone],
  );
  const rail = useMemo(
    () => resolveClubHubFixtureRail({ startsAt, status, homeScore, awayScore, liveMinute }, locale),
    [awayScore, homeScore, liveMinute, locale, startsAt, status],
  );
  const refreshMs = clubHubFixtureRailRefreshMs(rail, startsAt);

  useEffect(() => {
    if (!refreshMs) return undefined;
    const refresh = window.setTimeout(() => router.refresh(), refreshMs);
    return () => window.clearTimeout(refresh);
  }, [refreshMs, router]);

  if (!localKickoff) return null;

  return (
    <article className={`${styles.nextFixtureCard} ${variant === "hero" ? styles.heroCompact : ""} ${className}`} data-state={rail.state}>
      {venueImageUrl ? (
        <Image
          alt=""
          aria-hidden="true"
          className={styles.nextFixtureVenueBackdrop}
          fill
          sizes="(max-width: 760px) 100vw, 31vw"
          src={venueImageUrl}
        />
      ) : null}
      <div className={styles.nextFixtureHeading}>
        <CalendarDays aria-hidden="true" />
        <span>{rail.heading} · {roundName}</span>
      </div>
      <div className={styles.nextFixtureTeams}>
        <span className={styles.nextFixtureClub}>
          <Image alt={`${homeTeam.name} crest`} height={54} src={homeTeam.logoUrl} width={54} />
          <b>{homeTeam.name}</b>
          {showPositions ? <small>{positionLabel(homePosition, locale)}</small> : null}
        </span>
        <em data-score={rail.score ? "verified" : undefined}>{rail.score ?? "VS"}</em>
        <span className={styles.nextFixtureClub}>
          <Image alt={`${awayTeam.name} crest`} height={54} src={awayTeam.logoUrl} width={54} />
          <b>{awayTeam.name}</b>
          {showPositions ? <small>{positionLabel(awayPosition, locale)}</small> : null}
        </span>
      </div>
      <div className={styles.nextFixtureKickoff}>
        <time dateTime={startsAt}>{rail.liveMinute ?? (rail.state === "finished" ? rail.heading : `${localKickoff.date} · ${localKickoff.time}`)}</time>
        <small>{rail.state === "upcoming"
          ? `${portuguese ? "Seu horário local" : "Your local time"} · ${localKickoff.zoneName}`
          : rail.state === "live"
            ? (portuguese ? "Placar verificado" : "Verified score")
            : (portuguese ? "Resultado verificado" : "Verified result")}</small>
      </div>
      <div className={styles.nextFixtureVenue} data-state={venueName ? "verified" : "pending"}>
        <MapPin aria-hidden="true" />
        <span>{venueName ?? (portuguese ? "Estádio em verificação" : "Venue under verification")}</span>
      </div>
      {previewHref ? (
        <Link className={styles.nextFixturePreviewLink} href={previewHref}>
          {portuguese ? "Ver prévia da arte da partida" : "View next-match post preview"}
        </Link>
      ) : null}
    </article>
  );
}
