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
  // The rail has one job: make the verified fixture readable at a glance.
  // League positions belong in the table immediately below it.
  showPositions = false,
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
      <div className={styles.nextFixtureHeading}>
        <CalendarDays aria-hidden="true" />
        <span>{rail.heading} · {roundName}</span>
      </div>
      <div className={styles.nextFixtureTeams}>
        <span className={styles.nextFixtureClub}>
          <Image alt={`${homeTeam.name} crest`} height={64} src={homeTeam.logoUrl} width={64} />
          <b>{homeTeam.name}</b>
          {showPositions ? <small>{homePosition}</small> : null}
        </span>
        <em data-score={rail.score ? "verified" : undefined}>{rail.score ?? "VS"}</em>
        <span className={styles.nextFixtureClub}>
          <Image alt={`${awayTeam.name} crest`} height={64} src={awayTeam.logoUrl} width={64} />
          <b>{awayTeam.name}</b>
          {showPositions ? <small>{awayPosition}</small> : null}
        </span>
      </div>
      {rail.state !== "finished" ? (
        <div className={styles.nextFixtureKickoff}>
          <time dateTime={startsAt}>{rail.liveMinute ?? `${localKickoff.date} · ${localKickoff.time}`}</time>
          <small>{rail.state === "upcoming"
            ? `${portuguese ? "Seu horário local" : "Your local time"} · ${localKickoff.zoneName}`
            : (portuguese ? "Placar verificado" : "Verified score")}</small>
        </div>
      ) : null}
      <div className={styles.nextFixtureVenue} data-state={venueName ? "verified" : "pending"}>
        {venueImageUrl ? (
          <Image
            alt=""
            aria-hidden="true"
            className={styles.nextFixtureVenueImage}
            height={variant === "hero" ? 112 : 96}
            sizes={variant === "hero" ? "96px" : "80px"}
            src={venueImageUrl}
            width={variant === "hero" ? 112 : 96}
          />
        ) : null}
        <span className={styles.nextFixtureVenueCopy}>
          <MapPin aria-hidden="true" />
          {variant === "hero" ? <small>{portuguese ? "ESTÁDIO" : "STADIUM"}</small> : null}
          <span>{venueName ?? (portuguese ? "Estádio em verificação" : "Venue under verification")}</span>
        </span>
      </div>
      {previewHref ? (
        <Link className={styles.nextFixturePreviewLink} href={previewHref}>
          {portuguese ? "Ver prévia da arte da partida" : "View next-match post preview"}
        </Link>
      ) : null}
    </article>
  );
}
